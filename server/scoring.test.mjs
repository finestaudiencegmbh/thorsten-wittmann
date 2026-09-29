/**
 * Tests fuer das Bewertungsmodell der Lead-Qualitaet (Umfrage CCC Webinar)
 * sowie das Einlesen des Umfrage-Tabs.
 * Ausfuehren: node server/scoring.test.mjs
 */
import assert from 'node:assert/strict';
import { computeQuality, loadScoringConfig, classifyAnswer, optionKey } from './scoring.js';
import { parseSheets } from './parser.js';
import { buildDataset } from './build.js';
import { DEFAULT_CONFIG } from './project-config.js';

const cfg = loadScoringConfig();
const q = (a) => computeQuality(a, cfg);
const tier = (a) => q(a)?.tier ?? null;

// --- 1) Normalisierung der Antwort-Optionen --------------------------------
// Das Sheet schreibt Betraege uneinheitlich ("5.000 - 10.000 €" neben
// "5.000€ - 30.000€"). Teilstring-Vergleiche waeren hier falsch.
assert.equal(optionKey('Über 10.000€'), optionKey('Über 10.000 €'));
assert.equal(optionKey('5.000€ - 30.000€'), '5000-30000');
assert.notEqual(optionKey('30.000€ - 100.000€'), optionKey('100.000€ - 500.000€'));

// Die Falle: "30.000€ - 100.000€" ENTHAELT "100.000", ist aber KEIN High.
assert.equal(classifyAnswer('30.000€ - 100.000€', cfg.criteria.wealth), 'low');
assert.equal(classifyAnswer('100.000€ - 500.000€', cfg.criteria.wealth), 'high');
assert.equal(classifyAnswer('500 - 2.000 €', cfg.criteria.invest), 'low');
assert.equal(classifyAnswer('2.000 - 5.000 €', cfg.criteria.invest), 'high');
assert.equal(classifyAnswer('Möchte ich nicht angeben', cfg.criteria.wealth), 'unknown');
assert.equal(classifyAnswer('', cfg.criteria.wealth), null);
assert.equal(classifyAnswer('Fantasiewert', cfg.criteria.wealth), null, 'unbekannte Antwort wird nicht bewertet');

// --- 2) Tier-Regeln ---------------------------------------------------------
const OK = { occupation: 'Angestellt' };
assert.equal(tier({ ...OK, invest: '2.000 - 5.000 €', wealth: '100.000€ - 500.000€' }), 'A', 'beide High = A');
assert.equal(tier({ ...OK, invest: 'Über 10.000€', wealth: 'Über 1.000.000€' }), 'A');
assert.equal(tier({ ...OK, invest: 'Bis zu 500 €', wealth: 'Über 1.000.000€' }), 'B', 'ein High = B');
assert.equal(tier({ ...OK, invest: 'Über 10.000€', wealth: '30.000€ - 100.000€' }), 'B');
assert.equal(tier({ ...OK, invest: '500 - 2.000 €', wealth: '30.000€ - 100.000€', investments: 'ETFs' }), 'C');
assert.equal(tier({ ...OK, invest: 'Bis zu 500 €', wealth: '0 - 5.000€', investments: 'Noch gar nicht' }), 'D');

// Alter fliesst bewusst NICHT ein
const young = tier({ ...OK, age: '18-24', invest: 'Über 10.000€', wealth: 'Über 1.000.000€' });
const old = tier({ ...OK, age: '65+', invest: 'Über 10.000€', wealth: 'Über 1.000.000€' });
assert.equal(young, 'A');
assert.equal(old, 'A', '65+ wird nicht abgewertet');

// Rentner und Privatier bleiben voll wertig
for (const beruf of ['Rentner', 'Privatier', 'Unternehmer', 'Selbstständig', 'Angestellt']) {
  assert.equal(
    tier({ occupation: beruf, invest: 'Über 10.000€', wealth: 'Über 1.000.000€' }), 'A',
    `${beruf} darf A erreichen`,
  );
}
// Nur Schueler/Student/Azubi wertet ab
assert.equal(tier({ occupation: 'Schüler / Student / Azubi', invest: 'Über 10.000€', wealth: 'Über 1.000.000€' }), 'B');
assert.equal(tier({ occupation: 'Schüler / Student / Azubi', invest: 'Bis zu 500 €', wealth: 'Über 1.000.000€' }), 'C');

// --- 3) "Moechte ich nicht angeben" wirkt neutral ---------------------------
// Blockiert A, verhindert aber kein B - und zieht NIE nach D.
assert.equal(tier({ ...OK, invest: 'Über 10.000€', wealth: 'Möchte ich nicht angeben' }), 'B');
assert.equal(tier({ ...OK, invest: 'Möchte ich nicht angeben', wealth: 'Möchte ich nicht angeben' }), 'B', 'alles offen = B');
assert.equal(
  tier({ ...OK, invest: 'Bis zu 500 €', wealth: 'Möchte ich nicht angeben', investments: 'Noch gar nicht' }), 'C',
  'keine Angabe darf nicht nach D durchschlagen',
);
// Gegenprobe: ohne die fehlende Angabe waere es D
assert.equal(
  tier({ ...OK, invest: 'Bis zu 500 €', wealth: '0 - 5.000€', investments: 'Noch gar nicht' }), 'D',
);

// --- 4) Score-Reihenfolge passt zu den Tiers --------------------------------
const sc = (a) => q(a).score;
const aScore = sc({ ...OK, invest: 'Über 10.000€', wealth: 'Über 1.000.000€' });
const bScore = sc({ ...OK, invest: 'Bis zu 500 €', wealth: 'Über 1.000.000€' });
const cScore = sc({ ...OK, invest: '500 - 2.000 €', wealth: '0 - 5.000€', investments: 'ETFs' });
const dScore = sc({ ...OK, invest: 'Bis zu 500 €', wealth: '0 - 5.000€', investments: 'Noch gar nicht' });
assert.ok(aScore > bScore && bScore > cScore && cScore > dScore,
  `Score muss der Tier-Reihenfolge folgen (A${aScore} > B${bScore} > C${cScore} > D${dScore})`);

// Ohne verwertbare Antworten wird NICHT bewertet
assert.equal(q({ occupation: 'Angestellt' }), null);
assert.equal(q(null), null);

// --- 5) Umfrage-Tab einlesen ------------------------------------------------
const PCFG = {
  ...DEFAULT_CONFIG,
  features: { hasTickets: false, hasQuality: true },
  funnels: [{ id: 'CCC', label: 'CCC', sheetTab: 'ccc', match: ['ccc'] }],
  sheet: {
    ...DEFAULT_CONFIG.sheet,
    leadColumns: { ...DEFAULT_CONFIG.sheet.leadColumns, wonAt: ['datum', 'datum eintragung'] },
    utmMapping: { campaign: 'utmCampaign', adset: 'utmTerm', creative: 'utmContent', placement: null },
    decodePlusAsSpace: true,
  },
  trafficSources: [{ id: 'meta', label: 'Meta', paid: true, hasSpend: true, match: ['meta'], mediums: ['ppc'] }],
};

const CAMP = 'DP | ccc202610 | ABO Interest Stack | Leads';
const AG = 'AG5: DP | ccc202610 | Investment | DE | MW 30-55';
const UM_HEAD = ['Datum Eintragung', 'Vorname', 'Nachname', 'E-Mail', 'Handynummer', 'Alter', 'Beruf',
  'Aktuelle Investments', 'Höhe Investments', 'Nettovermögen', 'Frage an Thorsten', 'Herausforderung',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const LEAD_HEAD = ['Datum Eintragung', 'Vorname', 'Nachname', 'E-Mail',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

const sheets = [
  { title: 'Leads CCC Webinar 10.10.26', values: [LEAD_HEAD,
    ['0', '', '', '', '', '', '', '', ''],
    ['2026-09-28 23:10:00', 'Ilja', 'K', 'ilja@x.de', 'meta', 'ppc', CAMP, AG, 'Video 1'],
  ] },
  { title: 'Umfrage CCC Webinar 10.10.26', values: [UM_HEAD,
    ['0', ...Array(16).fill('')],
    ['2026-09-28 23:17:13', 'Ilja', 'K', 'ilja@x.de', '4917', '45-54', 'Angestellt', 'Aktien', 'Bis zu 500 €', '0 - 5.000€', 'Wie?', '', 'meta', 'ppc', CAMP, AG, 'Video 1'],
    ['2026-09-29 00:06:40', 'Franz', 'L', 'franz@x.de', '4917', '45-54', 'Selbstständig', 'Noch gar nicht', '5.000 - 10.000 €', 'Über 1.000.000€', '', '', 'meta', 'ppc', CAMP, AG, 'Video 1'],
  ] },
];

const parsed = parseSheets(sheets, PCFG);
// Der Umfrage-Tab traegt dieselben Basis-Spalten wie ein Lead-Tab. Wird er als
// Lead-Tabelle erkannt, zaehlt jede Antwort zusaetzlich als Lead.
assert.equal(parsed.leads.length, 1, 'Umfrage-Zeilen duerfen KEINE Leads sein');
assert.equal(parsed.surveys.length, 2, 'beide Umfrage-Antworten erkannt');
assert.equal(parsed.surveys[0].answers.wealth, '0 - 5.000€');
assert.equal(parsed.surveys[0].funnel, 'CCC', 'Funnel kommt vom Tab');

const ds = buildDataset(parsed, cfg, PCFG);
assert.equal(ds.leads.length, 1);
assert.equal(ds.surveys.length, 2);
assert.deepEqual(ds.surveys.map((s) => s.quality.tier), ['C', 'A']);
// Attribution ueber die UTM-Werte der Umfrage selbst
assert.equal(ds.surveys[0].campaign, CAMP);
assert.equal(ds.surveys[0].adset, AG);
assert.equal(ds.surveys[0].matchedLead, true, 'Ilja steht auch im Lead-Tab');
assert.equal(ds.surveys[1].matchedLead, false, 'Franz noch nicht');
// Lead wird per E-Mail angereichert, die Lead-Anzahl bleibt gleich
assert.equal(ds.leads[0].quality.tier, 'C');
assert.equal(ds.leads[0].hasSurvey, true);
assert.equal(ds.counts.leads, 1, 'Umfragen erhoehen die Lead-Anzahl nicht');
assert.deepEqual(ds.counts.byTier, { C: 1, A: 1 });

console.log('✓ Alle Scoring-/Umfrage-Tests bestanden');
console.log(`  Tiers: A=${aScore} B=${bScore} C=${cScore} D=${dScore} | Umfragen: ${ds.surveys.length}, Leads: ${ds.counts.leads}`);
