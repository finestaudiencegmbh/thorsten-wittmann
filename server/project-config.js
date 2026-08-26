/**
 * Zentrale Projekt-Konfiguration.
 *
 * Eine einzige Datei (project.config.json in der Repo-Wurzel) beschreibt, wofür
 * dieses Dashboard gebaut ist: Name, Branding, welche Features aktiv sind, wie
 * die Sheet-Spalten heißen und welche Funnels es gibt. Damit lässt sich die
 * Codebasis für ein neues Projekt neu konfigurieren, statt sie zu forken.
 *
 * Die DEFAULTS bilden das Verhalten des Ursprungsprojekts ab (Workshop mit
 * VIP-Tickets und Fragebogen). Wer nichts konfiguriert, bekommt genau das —
 * deshalb können die bestehenden Tests unverändert dagegen laufen.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'project.config.json');

export const DEFAULT_CONFIG = {
  name: 'Dashboard',
  subtitle: 'Lead-Dashboard',
  branding: {
    accent: '#d0bb5a',
    surface: '',
    logo: '/logo.svg',
  },
  features: {
    hasTickets: true,
    hasQuality: true,
  },
  // Leere Liste = Single-Funnel-Projekt (kein Funnel-Umschalter im Frontend).
  funnels: [],
  sheet: {
    leadColumns: {
      wonAt: ['gewonnen am'],
      firstName: ['vorname'],
      lastName: ['nachname'],
      email: ['e-mail'],
      utmSource: ['utm_source'],
      utmMedium: ['utm_medium'],
      utmCampaign: ['utm_campaign'],
      utmTerm: ['utm_term'],
      utmContent: ['utm_content'],
      ticketAt: ['vip-ticket geholt am'],
    },
    ticketColumns: {
      at: ['teilgenommen am'],
      firstName: ['vorname'],
      lastName: ['nachname'],
      email: ['e-mail (funnelcockpit)', 'e-mail (typeform)', 'e-mail'],
      emailAlt: ['e-mail (typeform)'],
      phone: ['handynummer'],
    },
    // Fragebogen-Spalten -> logische Antwortfelder (Basis fürs Scoring).
    questionnaireColumns: {
      employment: ['angestellt selbstständig oder unternehmer'],
      challenge: ['größte herausforderung im vermögensaufbau'],
      income: ['monatliches einkommen'],
      realEstate: ['immobilien im besitz'],
      invested: ['geld investiert in den vermögensaufbau wenn ja wie viel'],
      relationship: ['beziehungsstand'],
      expectation: ['was erhoffst du dir von den 4 abenden'],
    },
    // Anzeige-Beschriftung der Antwortfelder (Lead-Detailansicht, CSV-Export).
    questionnaireLabels: {
      employment: 'Beschäftigung',
      challenge: 'Größte Herausforderung',
      income: 'Monatliches Einkommen',
      realEstate: 'Immobilien im Besitz',
      invested: 'Investiertes Kapital',
      relationship: 'Beziehungsstand',
      expectation: 'Erwartung',
    },
    overviewColumns: {
      status: ['status'],
      adset: ['anzeigengruppe'],
      adspend: ['adspend'],
      clicks: ['ausg klicks', 'klicks'],
      cpc: ['cpc'],
      cvrOptin: ['cvr optin'],
      cvrTicket: ['cvr ticket'],
      cpl: ['cpl'],
      leads: ['leads'],
      tickets: ['vip ticket'],
      ticketsQualified: ['ticket qualifiziert'],
      ticketsUnqualified: ['ticket nicht qualifiziert'],
    },
    // Manche Sheets speichern UTM-Werte URL-kodiert ("A+|+B" statt "A | B").
    // Ohne Rückwandlung matchen sie nicht gegen die Meta-Kampagnennamen.
    decodePlusAsSpace: false,
  },
  // Zusätzliche Aufschlüsselung bezahlter Quellen (z. B. Meta vs. Google).
  // Leer = altes Verhalten (nur bezahlt/organisch).
  trafficSources: [],
};

/** Flache Merge-Strategie pro Ebene: Objekte werden vertieft, Arrays ersetzt. */
function merge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    return override === undefined ? base : override;
  }
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = k in base ? merge(base[k], v) : v;
  }
  return out;
}

let cached = null;

export function loadProjectConfig({ reload = false } = {}) {
  if (cached && !reload) return cached;
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    // Keine project.config.json -> Defaults. Das Dashboard läuft trotzdem.
  }
  cached = merge(DEFAULT_CONFIG, raw);
  return cached;
}

/**
 * Nur die Felder, die das Frontend braucht. Der Server schickt sie im
 * /api/data-Payload mit, damit Build und Laufzeit nicht auseinanderlaufen
 * können.
 */
export function publicConfig(cfg) {
  return {
    name: cfg.name,
    subtitle: cfg.subtitle,
    branding: cfg.branding,
    features: cfg.features,
    funnels: (cfg.funnels || []).map((f) => ({ id: f.id, label: f.label || f.id })),
    trafficSources: (cfg.trafficSources || []).map((s) => ({ id: s.id, label: s.label || s.id, paid: s.paid !== false, hasSpend: Boolean(s.hasSpend) })),
  };
}
