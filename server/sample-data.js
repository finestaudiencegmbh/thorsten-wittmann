/**
 * Synthetische Demo-Daten – KEINE echten Personendaten.
 * Dienen nur dazu, das Dashboard ohne Google-Anbindung sofort ansehbar zu
 * machen. Struktur identisch zu den geparsten Sheet-Daten, fließt also durch
 * dieselbe buildDataset-Pipeline.
 */

// Demo-Kampagnen. Die letzte traegt bewusst das Umfrage-Kuerzel, damit der
// Demo-Modus zeigt, wie sich der Qualitaets-Scope auswirkt (siehe
// quality.campaignMatch in project.config.json).
const campaigns = [
  'DP | Demo | ABO | 260526',
  'DP | Demo | ABO LP3 | 260526',
  'DP | ccc202610 | ABO Interest Stack | Leads',
];
const adsets = [
  'J&P | LP 1 | Broad | DACH | W | 30-55',
  'J&P | LP 2 | Broad | DACH | W | 30-55',
  'J&P | LP 1 | LaL 1% Kunden und Absolventen MP + TM | DACH | W | 30-55',
  'AG1: J&P | LP 3 | Broad | DACH | W | 30-55',
  'AG2: J&P | LP 3 | LaL 1% Kunden und Absolventen MP + TM | DACH | W | 30-55',
];
const creatives = ['Static 5', 'Static 10', 'Static 16', 'Static 19', 'Reel 3'];
const placements = ['Instagram_Feed', 'Facebook_Mobile_Feed', 'Instagram_Reels', 'Instagram_Stories'];

const incomes = [
  '1.000-1.500 € im Monat',
  '1.500-2.500 € im Monat',
  '2.500-3.500 im Monat',
  '3.500-5.000 im Monat',
  '5.000-7.500 im Monat',
];
const employments = ['Angestellt', 'Selbstständig', 'Unternehmer', 'Arbeitssuchend', 'In Elternzeit'];
const realEstate = ['Nein', 'Ja, eine', 'Ja, mehrere', 'Noch nicht'];
const investedOptions = ['Nein', '4000', '10000', 'Ja, monatlich mindestens 300-400€', 'Noch nicht', '25000'];

function rand(arr, i) {
  return arr[i % arr.length];
}

/**
 * Verteilt die Demo-Datensaetze auf die konfigurierten Funnels, damit der
 * Demo-Modus dieselbe Struktur zeigt wie der Echtbetrieb. Ohne Funnels in der
 * Config bleibt das Feld null und das Dashboard zeigt keine Unterreiter.
 */
function funnelFor(cfg, i) {
  const fs = cfg?.funnels || [];
  return fs.length ? fs[i % fs.length].id : null;
}

// Antwort-Optionen der CCC-Webinar-Umfrage (fuer den Demo-Modus).
const investOptions = ['Bis zu 500 €', '500 - 2.000 €', '2.000 - 5.000 €', '5.000 - 10.000 €', 'Über 10.000€', 'Möchte ich nicht angeben'];
const wealthOptions = ['0 - 5.000€', '5.000€ - 30.000€', '30.000€ - 100.000€', '100.000€ - 500.000€', '500.000€ - 1.000.000€', 'Über 1.000.000€', 'Möchte ich nicht angeben'];
const occupations = ['Unternehmer', 'Selbstständig', 'Angestellt', 'Schüler / Student / Azubi', 'Privatier', 'Rentner'];
const ages = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
const investmentKinds = ['Aktien', 'ETFs', 'Krypto', 'Edelmetalle', 'Noch gar nicht'];

export function getSampleParsed(cfg = {}) {
  const hasTickets = Boolean(cfg?.features?.hasTickets);
  const hasQuality = Boolean(cfg?.features?.hasQuality);
  const leads = [];
  const tickets = [];
  const surveys = [];
  let seed = 7;
  const next = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;

  for (let i = 0; i < 48; i++) {
    const campaign = i % 3 === 0 ? campaigns[2] : (i % 5 < 3 ? campaigns[0] : campaigns[1]);
    const adset = i % 5 < 3 ? rand(adsets.slice(0, 3), i) : rand(adsets.slice(3), i);
    const creative = rand(creatives, i + (i % 3));
    const placement = rand(placements, i * 2 + 1);
    const email = `demo.lead${i}@example.com`;
    const day = 24 + (i % 4);
    const wonAt = new Date(Date.UTC(2026, 4, day, 10 + (i % 12), (i * 7) % 60, 0)).toISOString();
    const gotTicket = hasTickets && next() < 0.45;
    leads.push({
      funnel: funnelFor(cfg, i),
      wonAt,
      firstName: `Demo${i}`,
      lastName: 'Person',
      email,
      utm: {
        source: adset,
        medium: `${adset.includes('LP 3') ? 'AG1 LP 3' : adset.match(/LP \d/)?.[0] || 'LP 2'} - ${creative}`,
        campaign,
        term: placement,
      },
      ticketAt: gotTicket ? wonAt : null,
    });
    if (gotTicket) {
      tickets.push({
        funnel: funnelFor(cfg, i),
        at: wonAt,
        firstName: `Demo${i}`,
        lastName: 'Person',
        email,
        emailTypeform: email,
        phone: `+49150${String(1000000 + i)}`,
        answers: {
          employment: rand(employments, Math.floor(next() * 5)),
          challenge: 'Demo-Antwort',
          income: rand(incomes, Math.floor(next() * 5)),
          realEstate: rand(realEstate, Math.floor(next() * 4)),
          invested: rand(investedOptions, Math.floor(next() * 6)),
          relationship: 'Ledig',
          expectation: 'Klarer Plan',
        },
        utm: { source: adset, medium: '', campaign, term: placement },
      });
    }
  }

  // Umfrage-Antworten fuer einen Teil der Leads (Demo)
  if (hasQuality) {
    for (let i = 0; i < 48; i += 2) {
      // Nur die Webinar-Kampagne hat eine Umfrage.
      const campaign = campaigns[2];
      const adset = rand(adsets, i);
      const day = 24 + (i % 4);
      surveys.push({
        funnel: funnelFor(cfg, i),
        at: new Date(Date.UTC(2026, 4, day, 12 + (i % 8), (i * 11) % 60, 0)).toISOString(),
        firstName: `Demo${i}`,
        lastName: 'Person',
        email: `demo.lead${i}@example.com`,
        phone: `+49150${String(2000000 + i)}`,
        answers: {
          age: rand(ages, Math.floor(next() * ages.length)),
          occupation: rand(occupations, Math.floor(next() * occupations.length)),
          investments: rand(investmentKinds, Math.floor(next() * investmentKinds.length)),
          invest: rand(investOptions, Math.floor(next() * investOptions.length)),
          wealth: rand(wealthOptions, Math.floor(next() * wealthOptions.length)),
          question: 'Demo-Frage',
          challenge: 'Demo-Herausforderung',
        },
        utm: { source: adset, medium: '', campaign, term: adset, content: rand(creatives, i) },
      });
    }
  }

  // ein paar organische Leads
  for (let i = 0; i < 6; i++) {
    leads.push({
      funnel: funnelFor(cfg, i),
      wonAt: new Date(`2026-05-2${5 + (i % 3)}T12:00:00Z`).toISOString(),
      firstName: `Organic${i}`,
      lastName: 'Person',
      email: `demo.organic${i}@example.com`,
      utm: { source: rand(['instagram', 'fb-bio', 'yt-bio'], i), medium: 'bio', campaign: 'organic-referral', term: 'direktanmeldung' },
      ticketAt: null,
    });
  }

  const overview = adsets.map((adset, i) => ({
    funnel: funnelFor(cfg, i),
    status: i % 3 === 0 ? 'AUS' : 'AN',
    adset,
    adspend: 800 + i * 350,
    clicks: 90 + i * 20,
    cpc: 6 + i,
    cvrOptin: 9 + i,
    cvrTicket: 20 + i,
    cpl: 50 + i * 8,
    leads: 12 + i,
    tickets: 3 + (i % 4),
    ticketsQualified: i % 3,
    ticketsUnqualified: 2,
  }));

  return { leads, tickets, surveys, overview };
}
