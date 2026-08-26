import Anthropic from '@anthropic-ai/sdk';

/**
 * KI-Chatbot für das Dashboard. Beantwortet inhaltsbezogene Fragen anhand der
 * Kennzahlen UND der einzelnen Lead-Datensätze (inkl. Name, E-Mail, Telefon,
 * Fragebogen-Antworten). Rein internes Projekt-Tool.
 */

const MAX_LEAD_ROWS = 400; // so viele Einzel-Leads max. in den Kontext (Token-Budget)

export function isChatConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Ueberschreibbar, damit ein neues Projekt das Modell wechseln kann, ohne den
// Code anzufassen.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

/** Verdichtet das Dashboard-Payload zu einem kompakten, anonymen Kontext. */
export function buildContext(payload, filtered) {
  const round = (n) => (n == null ? null : Math.round(n * 100) / 100);
  const leads = filtered || payload.leads || [];

  const cfg = payload.config || {};
  const features = cfg.features || {};
  const hasTickets = Boolean(features.hasTickets);
  const hasQuality = Boolean(features.hasQuality);
  const funnels = cfg.funnels || [];

  const paid = leads.filter((l) => l.sourceType === 'paid');
  const otherPaid = leads.filter((l) => l.sourceType === 'other-paid');
  const organic = leads.filter((l) => l.sourceType === 'organic');
  const tickets = hasTickets ? leads.filter((l) => l.hasTicket) : [];
  const scored = hasQuality ? tickets.filter((l) => l.quality) : [];
  const qualified = hasQuality ? tickets.filter((l) => ['A', 'B'].includes(l.quality?.tier)) : [];

  // Verteilungen
  const tierDist = {};
  for (const l of scored) tierDist[l.quality.tier] = (tierDist[l.quality.tier] || 0) + 1;

  // Je Dimension verdichten (nur Kennzahlen, keine PII)
  const byDim = (key) => {
    // Leads nach Lead-Dimension, Tickets/Qualität nach Ticket-eigener Herkunft
    const TICKET_DIM = { campaign: 'ticketCampaign', adset: 'ticketAdset', creative: 'ticketCreative' };
    const tKey = TICKET_DIM[key];
    const m = new Map();
    const ensure = (k) => {
      if (!m.has(k)) m.set(k, { name: k, leads: 0, ...(hasTickets ? { tickets: 0, qualified: 0 } : {}) });
      return m.get(k);
    };
    for (const l of leads) ensure(l[key] || '(unbekannt)').leads += 1;
    for (const l of leads) {
      if (!hasTickets || !l.hasTicket) continue;
      const e = ensure((tKey && l[tKey]) ? l[tKey] : (l[key] || '(unbekannt)'));
      e.tickets += 1;
      if (['A', 'B'].includes(l.quality?.tier)) e.qualified += 1;
    }
    return [...m.values()].sort((a, b) => b.leads - a.leads).slice(0, 25);
  };

  const fb = payload.fb || {};
  const ctx = {
    // Wird vom System-Prompt gelesen (Projektname, aktive Features, Funnels).
    projekt: { name: cfg.name || null, features, funnels },
    zeitraum: payload.range || 'Maximum (gesamter Zeitraum)',
    stand: payload.fetchedAt,
    quelle: payload.source,
    summe: {
      leads_gesamt: leads.length,
      leads_bezahlt_meta: paid.length,
      leads_bezahlt_ohne_kostendaten: otherPaid.length,
      leads_organisch: organic.length,
      ...(hasTickets ? {
        vip_tickets: tickets.length,
        ...(hasQuality ? {
          qualifizierte_tickets: qualified.length,
          quali_rate: tickets.length ? round(qualified.length / tickets.length) : null,
        } : {}),
      } : {}),
      ad_spend_gesamt: round(fb.totals?.spend ?? null),
      ad_spend_lead_kampagnen: round(fb.totals?.leadSpend ?? null),
      ad_spend_traffic: round(fb.totals?.nonLeadSpend ?? null),
      impressionen: fb.totals?.impressions ?? null,
      cpl: fb.totals?.leadSpend && paid.length ? round(fb.totals.leadSpend / paid.length) : null,
      ...(hasTickets ? {
        kosten_pro_ticket: fb.totals?.leadSpend && tickets.length ? round(fb.totals.leadSpend / tickets.length) : null,
      } : {}),
    },
    ...(funnels.length ? {
      je_funnel: funnels.map((f) => ({
        funnel: f.label || f.id,
        leads: leads.filter((l) => l.funnel === f.id).length,
        leads_bezahlt_meta: leads.filter((l) => l.funnel === f.id && l.sourceType === 'paid').length,
      })),
    } : {}),
    ...(hasQuality ? { qualitaets_verteilung_tickets: tierDist } : {}),
    je_kampagne: byDim('campaign'),
    je_anzeigengruppe: byDim('adset'),
    je_creative: byDim('creative'),
    je_placement: byDim('placement'),
  };

  // Einzelne Leads inkl. personenbezogener Daten (internes Tool).
  // Auf MAX_LEAD_ROWS begrenzt, damit der Kontext nicht das Token-Budget sprengt.
  ctx.leads = leads.slice(0, MAX_LEAD_ROWS).map((l) => ({
    name: l.name,
    email: l.email,
    telefon: l.phone,
    lead_am: l.wonAt,
    quelle: l.sourceType,
    quelle_kanal: l.sourceLabel || l.sourceBucket || null,
    funnel: l.funnel || null,
    kampagne: l.campaign,
    anzeigengruppe: l.adset,
    creative: l.creative,
    placement: l.placement,
    ...(hasTickets ? { vip_am: l.ticketAt, vip_ticket: l.hasTicket } : {}),
    ...(hasQuality ? {
      quali_score: l.quality?.score ?? null,
      quali_tier: l.quality?.tier ?? null,
      antworten: l.answers || null,
    } : {}),
  }));
  if (leads.length > MAX_LEAD_ROWS) {
    ctx.leads_hinweis = `Nur die ersten ${MAX_LEAD_ROWS} von ${leads.length} Leads sind einzeln enthalten; die Summen oben decken alle ab.`;
  }

  // FB-Hierarchie (Kampagnen-Kennzahlen)
  if (Array.isArray(fb.hierarchy)) {
    ctx.facebook_kampagnen = fb.hierarchy.slice(0, 25).map((c) => ({
      name: c.name, aktiv: c.active, traffic: c.leadCampaign === false,
      spend: round(c.spend), leads: c.leads,
      cpl: round(c.cpl),
      ...(hasTickets ? { tickets: c.tickets, cpt: round(c.cpt) } : {}),
      ...(hasQuality ? { quali_rate: round(c.qualifiedRate) } : {}),
      cpm: round(c.cpm), ausg_ctr: round(c.outboundCtr), ausg_cpc: round(c.cpoc),
    }));
  }
  return ctx;
}

/**
 * Baut den System-Prompt aus der Projekt-Config. Regeln zu Tickets/Qualitaet
 * kommen nur mit, wenn es diese Konzepte im Projekt ueberhaupt gibt - sonst
 * beschreibt der Prompt Kennzahlen, die im Kontext gar nicht existieren.
 */
function buildSystemPrompt(context = {}) {
  const cfg = context.projekt || {};
  const features = cfg.features || {};
  const name = cfg.name || 'dieses Projekt';
  const funnels = cfg.funnels || [];

  const rules = [
    'Antworte kurz, präzise und auf Deutsch. Nutze konkrete Zahlen aus dem Kontext.',
    'Rechne bei Bedarf abgeleitete Werte (z. B. Verhältnisse) sauber aus den vorhandenen Zahlen.',
    'Beträge in Euro mit € und Tausenderpunkt; Raten in Prozent.',
    'Wenn eine Zahl nicht im Kontext steht, sag das klar – erfinde nichts.',
    'Der Kontext bezieht sich auf den aktuell im Dashboard gewählten Zeitraum/Filter.',
    "Quellen: 'paid' = Meta-Ads mit bekannten Kosten (nur diese fließen in CPL ein), 'other-paid' = bezahlt, aber ohne Kostendaten (z. B. Google Ads), 'organic' = alles Übrige. Rechne 'other-paid' NIEMALS in den CPL ein.",
  ];
  if (funnels.length) {
    rules.push(`Es gibt ${funnels.length} Funnels (${funnels.map((f) => f.label || f.id).join(', ')}). Das Hauptdashboard zeigt die Summe; je Funnel gibt es 'je_funnel'.`);
  }
  if (features.hasQuality) {
    rules.push('Lead-Qualität: Tier A/B = qualifiziert; basiert v. a. auf Einkommen (Haushaltsregel: <3.500 € + Partner = schwach).');
  }
  rules.push(
    'Dir liegen auch die einzelnen Leads inkl. Name, E-Mail und Telefon vor (internes Tool). Du darfst daraus konkrete Personen nennen, Listen erstellen und Kontaktdaten ausgeben, wenn danach gefragt wird.',
    "Das Feld 'leads' enthält ggf. nur die ersten N Datensätze (siehe leads_hinweis); für Gesamtzahlen nutze die Summen/Verdichtungen.",
    'Formatiere Vergleiche/Ranglisten/Lead-Listen als kurze Aufzählung oder Tabelle, wenn es hilft.',
  );

  const topic = features.hasQuality ? 'Werbe-Performance und Lead-Qualität' : 'Werbe-Performance und Lead-Entwicklung';
  return `Du bist der Analyse-Assistent im Lead-Dashboard für "${name}".
Du beantwortest Fragen zu ${topic} auf Basis der dir gelieferten, bereits aggregierten Kennzahlen.

Regeln:
${rules.map((r) => `- ${r}`).join('\n')}`;
}

/**
 * Beantwortet eine Chat-Nachricht. messages = [{role, content}], history-fähig.
 * Der aggregierte Kontext wird als cache-fähiger Block vorangestellt.
 */
export async function chat({ messages, context }) {
  if (!isChatConfigured()) {
    throw new Error('Chatbot nicht konfiguriert (ANTHROPIC_API_KEY fehlt).');
  }
  const client = new Anthropic();

  const system = [
    { type: 'text', text: buildSystemPrompt(context) },
    {
      type: 'text',
      // Kontext als eigener Block, gecacht – stabil über die Konversation
      text: `Aktuelle Dashboard-Kennzahlen (aggregiert, anonym) als JSON:\n${JSON.stringify(context)}`,
      cache_control: { type: 'ephemeral' },
    },
  ];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    thinking: { type: 'adaptive' },
    system,
    messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') })),
  });

  const text = (response.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return text || 'Dazu habe ich keine Antwort.';
}
