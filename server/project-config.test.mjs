/**
 * Tests fuer die Generalisierung: Feature-Flags, konfigurierbare Sheet-Spalten,
 * Funnel-Zuordnung und die Aufteilung der Traffic-Quellen.
 *
 * Gegenprobe zu parser.test.mjs: dort laeuft alles mit den DEFAULTS (Tickets +
 * Fragebogen an), hier mit abgeschalteten Flags und einem anders aufgebauten
 * Sheet. Ausfuehren: node server/project-config.test.mjs
 */
import assert from 'node:assert/strict';
import { parseSheets, funnelForTab, _internal } from './parser.js';
import { buildDataset } from './build.js';
import { combineMetaWithLeads } from './combine.js';
import { DEFAULT_CONFIG, loadProjectConfig, publicConfig } from './project-config.js';

// --- Projekt-Config ohne Tickets/Fragebogen, mit zwei Funnels ---------------
const CFG = {
  ...DEFAULT_CONFIG,
  name: 'Testprojekt',
  features: { hasTickets: false, hasQuality: false },
  funnels: [
    { id: 'CCC', label: 'CCC', sheetTab: 'ccc', match: ['ccc'] },
    { id: 'AKD', label: 'AKD', sheetTab: 'akd', match: ['akd'] },
  ],
  sheet: {
    ...DEFAULT_CONFIG.sheet,
    // Wie in project.config.json: der Webinar-Tab nennt die Spalte
    // "Datum Eintragung", die Lead-Tabs "Datum".
    leadColumns: { ...DEFAULT_CONFIG.sheet.leadColumns, wonAt: ['gewonnen am', 'datum', 'datum eintragung'] },
    // Dieses Sheet legt die Anzeigengruppe in utm_term ab, nicht in utm_source.
    utmMapping: { campaign: 'utmCampaign', adset: 'utmTerm', creative: 'utmContent', placement: null },
    decodePlusAsSpace: true,
  },
  trafficSources: [
    { id: 'meta', label: 'Meta', paid: true, hasSpend: true, match: ['meta', 'facebook', 'instagram'], mediums: ['ppc', 'cpc', 'paid'] },
    { id: 'google', label: 'Google', paid: true, hasSpend: false, match: ['google', 'youtube'], mediums: ['cpc', 'ppc', 'paid'] },
  ],
};

const features = { hasTickets: false, hasQuality: false };

const HEAD = ['Datum', 'Vorname', 'E-Mail', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const sheets = [
  { title: 'Performance', values: [] },
  { title: 'Leads CCC', values: [HEAD,
    // plus-kodiert (wie im echten Sheet)
    ['2026-08-19 21:37:05', 'Dora', 'a@x.de', 'meta', 'ppc', 'CCC+EWeb+|+CBO+|+LeadCon', 'DE+|+40-65', ''],
    // dieselbe Struktur, aber mit echten Leerzeichen
    ['2026-08-20 04:11:02', 'Angela', 'b@x.de', 'meta', 'ppc', 'DP | CCC | ABO | 190826', 'AG1: DP | CCC | Broad', ''],
    // Google Ads: bezahlt, aber ohne Kostendaten
    ['2026-08-24 16:09:03', 'Andreas', 'c@x.de', 'googled', 'cpc', '24098447409', '', '819713222835'],
    // Reoptin-Mail: kein Funnel-Kuerzel in den UTMs -> Funnel MUSS vom Tab kommen
    ['2026-08-24 16:30:09', 'Steff', 'd@x.de', 'reoptin', 'email', 'no-show', '', 'mail 3'],
  ] },
  { title: 'Leads AKD', values: [HEAD,
    ['2026-08-19 23:14:05', 'Anna', 'e@x.de', 'meta', 'ppc', 'DP+|+AKD+|+ABO+Leads', 'AG2:+DP+|+AKD+|+SIT', ''],
    ['2026-08-26 08:57:20', 'Moana', 'f@x.de', 'akd+evergreen', 'email', 'no-show', '', 'mail 3'],
  ] },
];

// --- 1) Spalten-Mapping: "Datum" statt "Gewonnen am" ------------------------
const parsed = parseSheets(sheets, CFG);
assert.equal(parsed.leads.length, 6, 'alle Lead-Zeilen erkannt (Header "Datum")');
assert.equal(parsed.tickets.length, 0, 'ohne hasTickets kein Ticket-Tab');

// Gegenprobe: mit den DEFAULTS (nur "Gewonnen am") wird dieses Sheet NICHT erkannt
assert.equal(parseSheets(sheets, DEFAULT_CONFIG).leads.length, 0,
  'ohne konfigurierten Alias bleibt das Sheet unerkannt');

// --- 2) Plus-Dekodierung ----------------------------------------------------
assert.equal(parsed.leads[0].utm.campaign, 'CCC EWeb | CBO | LeadCon',
  'plus-kodierte UTM wird zu echten Leerzeichen aufgeloest');
assert.equal(parsed.leads[1].utm.campaign, 'DP | CCC | ABO | 190826',
  'bereits korrekte UTM bleibt unveraendert');
assert.equal(_internal.decodePlus('A+|+B'), 'A | B');
// Ohne das Flag bleibt der Rohwert stehen
const noDecode = parseSheets(sheets, { ...CFG, sheet: { ...CFG.sheet, decodePlusAsSpace: false } });
assert.equal(noDecode.leads[0].utm.campaign, 'CCC+EWeb+|+CBO+|+LeadCon');

// --- 3) utm_content ---------------------------------------------------------
assert.equal(parsed.leads[3].utm.content, 'mail 3', 'utm_content wird gelesen');

// --- 4) Funnel kommt vom Tab, nicht vom Kampagnennamen ----------------------
assert.equal(funnelForTab('Leads CCC', CFG), 'CCC');
assert.equal(funnelForTab('Leads AKD', CFG), 'AKD');
assert.equal(funnelForTab('Performance', CFG), null);
assert.deepEqual(parsed.leads.map((l) => l.funnel), ['CCC', 'CCC', 'CCC', 'CCC', 'AKD', 'AKD']);
// Der entscheidende Fall: Leads OHNE Funnel-Kuerzel in den UTMs
const reoptin = parsed.leads[3];
assert.ok(!/ccc/i.test(reoptin.utm.campaign), 'Testfall hat wirklich kein Kuerzel in der UTM');
assert.equal(reoptin.funnel, 'CCC', 'Funnel trotzdem gesetzt (aus dem Tab)');

// --- 5) Traffic-Buckets: Meta / Google / Organisch --------------------------
const ds = buildDataset(parsed, { weights: {}, tiers: [] }, CFG);
assert.deepEqual(ds.leads.map((l) => l.sourceType),
  ['paid', 'paid', 'other-paid', 'organic', 'paid', 'organic']);
assert.deepEqual(ds.leads.map((l) => l.sourceBucket),
  ['meta', 'meta', 'google', 'organic', 'meta', 'organic']);
assert.equal(ds.counts.paidLeads, 3);
assert.equal(ds.counts.otherPaidLeads, 1, 'Google zaehlt NICHT als bezahlt-mit-Kosten');
assert.equal(ds.counts.organicLeads, 2, 'Google zaehlt auch NICHT als organisch');
assert.deepEqual(ds.counts.byFunnel, { CCC: 4, AKD: 2 });

// Google-Leads bekommen ein sprechendes Quellen-Label statt "(direkt)"
const g = ds.leads.find((l) => l.sourceBucket === 'google');
assert.equal(g.organicCampaign, 'Google');

// --- 6) Ticket-/Quali-Felder verschwinden vollstaendig ----------------------
for (const l of ds.leads) {
  for (const k of ['hasTicket', 'ticketAt', 'quality', 'answers', 'ticketCampaign']) {
    assert.ok(!(k in l), `Feld "${k}" darf bei deaktivierten Flags nicht existieren`);
  }
}
assert.ok(!('tickets' in ds.counts));
assert.ok(!('scored' in ds.counts));

// --- 6b) Quellen-Erkennung gegen alle real vorkommenden source/medium-Paare -
// Dieselbe Plattform taucht bezahlt UND organisch auf. Ohne die Medium-Pruefung
// wuerde "instagram/organic" als bezahltes Meta gelten und den CPL verfaelschen.
const PAIRS = [
  ['meta', 'ppc', 'CCC+EWeb+|+CBO', 'paid', 'meta'],
  ['google', 'cpc', '24094816535', 'other-paid', 'google'],
  ['googled', 'cpc', '24098447409', 'other-paid', 'google'],
  ['googleg', 'cpc', '24098447409', 'other-paid', 'google'],
  ['googleytis', 'cpc', '23379366900', 'other-paid', 'google'],
  ['reoptin', 'email', 'no-show', 'organic', 'organic'],
  ['akd+evergreen', 'email', 'no-show', 'organic', 'organic'],
  ['newsletter', 'email', 'FF-Mail_14.08.', 'organic', 'organic'],
  ['youtube.com', 'social', 'FF+Video', 'organic', 'organic'],   // Referral, keine Ads
  ['instagram', 'organic', 'akd-bio', 'organic', 'organic'],     // Bio-Link, keine Ads
  ['', '', '', 'organic', 'organic'],
];
const pairRows = PAIRS.map(([src, med, camp], i) =>
  [`2026-08-2${i % 9} 10:00:00`, `P${i}`, `p${i}@x.de`, src, med, camp, '', '']);
const pairDs = buildDataset(
  parseSheets([{ title: 'Leads CCC', values: [HEAD, ...pairRows] }], CFG),
  { weights: {}, tiers: [] },
  CFG,
);
PAIRS.forEach(([src, med, , expType, expBucket], i) => {
  const l = pairDs.leads[i];
  assert.equal(l.sourceType, expType, `${src || '(leer)'}/${med || '(leer)'} -> sourceType`);
  assert.equal(l.sourceBucket, expBucket, `${src || '(leer)'}/${med || '(leer)'} -> bucket`);
});

// --- 6c) UTM -> Dimension: die Zuordnung ist kontoabhaengig ----------------
// Hier steht die Anzeigengruppe in utm_term und utm_source ist konstant "meta".
// Mit der Standard-Zuordnung (adset = utm_source) bekaeme JEDER Lead die
// Anzeigengruppe "meta" - die matcht keinen Meta-Namen, also 0 Leads auf jeder
// Anzeigengruppe bei vollem Spend.
const DIM_HEAD = HEAD;
const dimRows = [
  ['2026-08-20 04:11:02', 'Angela', 'a@x.de', 'meta', 'ppc', 'DP | CCC | ABO | 190826', 'AG1: DP | CCC | Broad | DE | MW 30-55', ''],
  ['2026-08-20 06:48:08', 'Rene', 'b@x.de', 'meta', 'ppc', 'DP | CCC | ABO | 190826', 'AG2: DP | CCC | Pferde | DE | MW 30-55', 'AG2 CCC DP: Reel'],
];
const dimDs = buildDataset(
  parseSheets([{ title: 'Leads CCC', values: [DIM_HEAD, ...dimRows] }], CFG),
  { weights: {}, tiers: [] },
  CFG,
);
assert.equal(dimDs.leads[0].campaign, 'DP | CCC | ABO | 190826');
assert.equal(dimDs.leads[0].adset, 'AG1: DP | CCC | Broad | DE | MW 30-55',
  'Anzeigengruppe kommt aus utm_term');
assert.equal(dimDs.leads[1].creative, 'AG2 CCC DP: Reel', 'Creative kommt aus utm_content');
assert.equal(dimDs.leads[0].placement, null, 'nicht zugeordnete Dimension bleibt leer');

// Gegenprobe: mit der Standard-Zuordnung bricht genau dieser Fall
const wrongDs = buildDataset(
  parseSheets([{ title: 'Leads CCC', values: [DIM_HEAD, ...dimRows] }], CFG),
  { weights: {}, tiers: [] },
  { ...CFG, sheet: { ...CFG.sheet, utmMapping: DEFAULT_CONFIG.sheet.utmMapping } },
);
assert.equal(wrongDs.leads[0].adset, 'meta',
  'Standard-Zuordnung wuerde utm_source nehmen - hier konstant "meta"');

// Und die Attribution zieht bis auf Anzeigengruppen-Ebene durch
const dimMeta = {
  entities: [
    { campaignId: 'c1', campaign: 'DP | CCC | ABO | 190826', adsetId: 'a1', adset: 'AG1: DP | CCC | Broad | DE | MW 30-55', adId: 'ad1', creative: 'AG1 CCC DP: Video TW 0406', spend: 310, impressions: 20000, clicks: 300, cpm: 15, uniqueOutboundClicks: 200 },
    { campaignId: 'c1', campaign: 'DP | CCC | ABO | 190826', adsetId: 'a2', adset: 'AG2: DP | CCC | Pferde | DE | MW 30-55', adId: 'ad2', creative: 'AG2 CCC DP: Reel', spend: 90, impressions: 9000, clicks: 120, cpm: 10, uniqueOutboundClicks: 80 },
  ],
  daily: [], dailyEntities: [],
  campaignStatus: { 'DP | CCC | ABO | 190826': { status: 'ACTIVE', active: true, objective: 'OUTCOME_LEADS' } },
  adsetStatus: {}, adStatus: {}, adList: [],
};
const dimC = combineMetaWithLeads(dimMeta, dimDs.leads, { features });
const camp = dimC.hierarchy[0];
assert.equal(camp.leads, 2, 'Kampagnen-Ebene');
const ag1 = camp.adsets.find((a) => a.name.startsWith('AG1'));
const ag2 = camp.adsets.find((a) => a.name.startsWith('AG2'));
assert.equal(ag1.leads, 1, 'Anzeigengruppe AG1 bekommt ihren Lead (vorher 0)');
assert.equal(ag2.leads, 1, 'Anzeigengruppe AG2 bekommt ihren Lead (vorher 0)');
assert.ok(ag2.ads.some((ad) => ad.name === 'AG2 CCC DP: Reel' && ad.leads === 1),
  'Ad-Ebene matcht ueber utm_content');

// Gegenprobe auf Hierarchie-Ebene: falsche Zuordnung -> 0 Leads trotz Spend
const wrongC = combineMetaWithLeads(dimMeta, wrongDs.leads, { features });
const wrongAg = wrongC.hierarchy[0].adsets.find((a) => a.name.startsWith('AG1'));
assert.equal(wrongAg.leads, 0, 'genau der gemeldete Fehler: Spend da, Leads 0');
assert.ok(wrongAg.spend > 0);

// --- 6d) HTML-Entities in UTM-Werten ---------------------------------------
// Das Sheet speichert Sonderzeichen escaped ("Finanzen &amp; pers. Finanzen"),
// die Meta-API liefert den echten Namen. Ohne Rueckwandlung matcht die
// Anzeigengruppe nicht -> voller Spend, 0 Leads. Doppelte Kodierung
// ("&amp;amp;") kommt ebenfalls vor.
assert.equal(_internal.decodeEntities('Finanzen &amp; pers.'), 'Finanzen & pers.');
assert.equal(_internal.decodeEntities('Finanzen &amp;amp; pers.'), 'Finanzen & pers.');
assert.equal(_internal.decodeEntities('&unbekannt; bleibt'), '&unbekannt; bleibt');
assert.equal(_internal.decodeEntities('&#65;&#66;'), 'AB');
assert.equal(_internal.decodeEntities('ohne Entities'), 'ohne Entities');

const ENT_ADSET = 'DE | 40-65 J | Finanzen & pers. Finanzen | 23.03.2026';
const entRows = [
  ['2026-08-19 21:37:00', 'A', 'a@x.de', 'meta', 'ppc', 'CCC+EWeb+|+ABO+|+LeadCon+|+23.03.2026', 'DE+|+40-65+J+|+Finanzen+&amp;+pers.+Finanzen+|+23.03.2026', ''],
  ['2026-08-19 22:37:00', 'B', 'b@x.de', 'meta', 'ppc', 'CCC+EWeb+|+ABO+|+LeadCon+|+23.03.2026', 'DE+|+40-65+J+|+Finanzen+&amp;amp;+pers.+Finanzen+|+23.03.2026', ''],
];
const entDs = buildDataset(
  parseSheets([{ title: 'Leads CCC', values: [HEAD, ...entRows] }], CFG),
  { weights: {}, tiers: [] },
  CFG,
);
assert.equal(entDs.leads[0].adset, ENT_ADSET, 'einfach kodiert -> echter Name');
assert.equal(entDs.leads[1].adset, ENT_ADSET, 'doppelt kodiert -> derselbe Name');

const entMeta = {
  entities: [{
    campaignId: 'c1', campaign: 'CCC EWeb | ABO | LeadCon | 23.03.2026',
    adsetId: 'a1', adset: ENT_ADSET, adId: 'ad1', creative: 'Static 1',
    spend: 600, impressions: 40000, clicks: 500, cpm: 15, uniqueOutboundClicks: 400,
  }],
  daily: [], dailyEntities: [],
  campaignStatus: { 'CCC EWeb | ABO | LeadCon | 23.03.2026': { status: 'ACTIVE', active: true, objective: 'OUTCOME_LEADS' } },
  adsetStatus: {}, adStatus: {}, adList: [],
};
const entAg = combineMetaWithLeads(entMeta, entDs.leads, { features }).hierarchy[0].adsets[0];
assert.equal(entAg.leads, 2, 'beide Leads landen auf der Meta-Anzeigengruppe');
assert.equal(entAg.spend, 600);

// --- 6e) "+" im Namen vs. "+" als kodiertes Leerzeichen --------------------
// Die Tracking-Kette kodiert Leerzeichen als "+", laesst ein "+" IM Namen aber
// ebenfalls stehen: "DE+|+40-65+J+|+..." -> der echte Meta-Name ist
// "DE | 40-65+J | ...". Zeichenweise nicht unterscheidbar, also darf "+" beim
// Abgleich nicht ins Gewicht fallen.
const PLUS_ADSET = 'DE | 40-65+J | Finanzen & pers. Finanzen | 23.03.2026';
const PLUS_CAMPAIGN = 'CCC EWeb | ABO | LeadCon | 18.04.2026';
const plusRows = [
  ['2026-09-01 10:00:00', 'A', 'a@x.de', 'meta', 'ppc', 'CCC+EWeb+|+ABO+|+LeadCon+|+18.04.2026', 'DE+|+40-65+J+|+Finanzen+&amp;+pers.+Finanzen+|+23.03.2026', ''],
  ['2026-09-01 11:00:00', 'B', 'b@x.de', 'meta', 'ppc', 'CCC+EWeb+|+ABO+|+LeadCon+|+18.04.2026', 'DE+|+40-65+J+|+Finanzen+&amp;+pers.+Finanzen+|+23.03.2026', ''],
];
const plusDs = buildDataset(
  parseSheets([{ title: 'Leads CCC', values: [HEAD, ...plusRows] }], CFG),
  { weights: {}, tiers: [] },
  CFG,
);
const plusMeta = {
  entities: [{
    campaignId: 'c1', campaign: PLUS_CAMPAIGN, adsetId: 'a1', adset: PLUS_ADSET,
    adId: 'ad1', creative: 'Ad A', spend: 69, impressions: 5000, clicks: 60, cpm: 12, uniqueOutboundClicks: 12,
  }],
  daily: [], dailyEntities: [],
  campaignStatus: { [PLUS_CAMPAIGN]: { status: 'ACTIVE', active: true, objective: 'OUTCOME_LEADS' } },
  adsetStatus: {}, adStatus: {}, adList: [],
};
const plusCamp = combineMetaWithLeads(plusMeta, plusDs.leads, { features }).hierarchy[0];
assert.equal(plusCamp.leads, 2, 'Kampagnen-Ebene');
assert.equal(plusCamp.adsets[0].name, PLUS_ADSET, 'Anzeige nutzt den echten Meta-Namen');
assert.equal(plusCamp.adsets[0].leads, 2,
  'Anzeigengruppe mit "+" im Namen bekommt ihre Leads (vorher 0 bei vollem Spend)');
assert.equal(plusCamp.adsets[0].spend, 69);

// --- 6f) Datumsformate: die Tabs schreiben unterschiedlich -----------------
// Umfrage-Tab: ISO. Webinar-Lead-Tab: Monatsname ("September 29 2026 22:33:00").
// Wird nur ISO akzeptiert, verschwinden die Webinar-Leads stillschweigend -
// ohne Fehlermeldung, die Zeilen fehlen einfach.
const pd = _internal.parseDate;
assert.equal(pd('2026-09-28 23:17:13'), '2026-09-28T23:17:13.000Z');
assert.equal(pd('2026-05-26 18:46:08 +0000'), '2026-05-26T18:46:08.000Z');
assert.equal(pd('September 29 2026 22:33:00'), '2026-09-29T22:33:00.000Z');
assert.equal(pd('Sep 29, 2026'), '2026-09-29T00:00:00.000Z');
assert.equal(pd('29. September 2026 22:33'), '2026-09-29T22:33:00.000Z');
assert.equal(pd('19.09.2026 06:37'), '2026-09-19T06:37:00.000Z');
// Zaehl-/Summenzeilen duerfen weiterhin NICHT als Datum durchgehen
for (const junk of ['0', '161', '', 'Noch gar nicht', 'Angestellt']) {
  assert.equal(pd(junk), null, `"${junk}" ist kein Datum`);
}

// --- 6g) Webinar-Lead-Tab: Monatsname + unvollstaendige UTMs ---------------
const WEB_HEAD = ['Datum Eintragung', 'Vorname', 'Nachname', 'E-Mail',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const WCAMP = 'DP | ccc202610 | ABO Interest Stack | Leads';
const WAG = 'AG1: DP | ccc202610 | Broad | DE | MW 30-55';
const WAD = 'AG1 ccc202610 DP: Video TW 0406';
const webDs = buildDataset(
  parseSheets([{ title: 'Leads CCC Webinar 10.10.26', values: [WEB_HEAD,
    ['0', '', '', '', '', '', '', '', ''],
    // Umstellungsphase: nur utm_campaign gesetzt
    ['September 29 2026 22:33:00', 'Anne', '', 'anne@x.de', 'meta', 'ppc', WCAMP, '', ''],
    // ab 30.09. vollstaendig
    ['September 30 2026 01:16:00', 'Steffen', '', 'steffen@x.de', 'meta', 'ppc', WCAMP, WAG, WAD],
  ] }], CFG),
  { weights: {}, tiers: [] },
  CFG,
);
assert.equal(webDs.leads.length, 2, 'Monatsnamen-Datum wird gelesen (vorher 0 Leads)');
assert.equal(webDs.leads[0].funnel, 'CCC');

// Fehlt die Anzeigengruppe, bleibt die Kampagne trotzdem zugeordnet.
assert.equal(webDs.leads[0].campaign, WCAMP, 'Kampagne bleibt erhalten');
assert.notEqual(webDs.leads[0].adset, WAG);
assert.match(webDs.leads[0].adset, /nicht zuordenbar/);
// Vollstaendige Zeile wird bis auf Creative-Ebene zugeordnet
assert.equal(webDs.leads[1].campaign, WCAMP);
assert.equal(webDs.leads[1].adset, WAG);
assert.equal(webDs.leads[1].creative, WAD);

// --- 6h) Leads ohne Anzeigengruppe duerfen nicht verschwinden --------------
// Waehrend der Tracking-Umstellung tragen Leads nur utm_campaign. Sie zaehlen
// auf Kampagnen-Ebene, passen aber zu keiner Anzeigengruppe. Ohne Auffangzeile
// klafft eine stille Luecke: Kampagne 30 Leads, Summe der Anzeigengruppen 10.
const MIX_C = 'DP | ccc202610 | ABO Interest Stack | Leads';
const MIX_AG = 'AG1: DP | ccc202610 | Broad | DE | MW 30-55';
const mixRows = [];
for (let i = 0; i < 20; i++) {
  mixRows.push([`September 29 2026 1${i % 10}:00:00`, `Alt${i}`, '', `alt${i}@x.de`, 'meta', 'ppc', MIX_C, '', '']);
}
for (let i = 0; i < 10; i++) {
  mixRows.push([`October 1 2026 1${i % 10}:00:00`, `Neu${i}`, '', `neu${i}@x.de`, 'meta', 'ppc', MIX_C, MIX_AG, 'Video TW 0406']);
}
const mixDs = buildDataset(
  parseSheets([{ title: 'Leads CCC Webinar 10.10.26', values: [WEB_HEAD, ...mixRows] }], CFG),
  { weights: {}, tiers: [] },
  CFG,
);
assert.equal(mixDs.leads.length, 30);

const mixMeta = {
  entities: [{
    campaignId: MIX_C, campaign: MIX_C, adsetId: MIX_AG, adset: MIX_AG,
    adId: 'ad1', creative: 'Video TW 0406',
    spend: 1200, impressions: 30000, clicks: 300, cpm: 12, uniqueOutboundClicks: 200,
  }],
  daily: [], dailyEntities: [],
  campaignStatus: { [MIX_C]: { status: 'ACTIVE', active: true, objective: 'OUTCOME_LEADS' } },
  adsetStatus: {}, adStatus: {}, adList: [],
};
const mixCamp = combineMetaWithLeads(mixMeta, mixDs.leads, { features }).hierarchy[0];
assert.equal(mixCamp.leads, 30, 'alle Leads zaehlen auf Kampagnen-Ebene');
const sumAdsets = mixCamp.adsets.reduce((a, x) => a + x.leads, 0);
assert.equal(sumAdsets, mixCamp.leads, 'Summe der Anzeigengruppen == Kampagne (keine stille Luecke)');

const rest = mixCamp.adsets.find((a) => a.unassigned);
assert.ok(rest, 'Auffangzeile vorhanden');
assert.equal(rest.leads, 20);
assert.equal(rest.spend, null, 'Kosten bleiben null - der Spend steckt in den echten Anzeigengruppen');
assert.equal(rest.cpl, null, 'kein erfundener CPL');
assert.notEqual(rest.active, false, 'darf vom "nur aktive"-Filter nicht ausgeblendet werden');
// Zeitraum der betroffenen Leads: beantwortet, WARUM sie nicht zugeordnet sind
assert.equal(rest.firstAt, '2026-09-29');
assert.equal(rest.lastAt, '2026-09-29', 'alle unzugeordneten Leads stammen aus der Zeit vor der UTM-Umstellung');

// --- 6i) Leerzeilen duerfen die Tabelle NICHT beenden ----------------------
// Frueher setzte die erste Leerzeile den Header zurueck: alles darunter wurde
// stillschweigend ignoriert. Eine einzige Luecke mitten im Tab konnte so
// hunderte Zeilen verschlucken - ohne Fehlermeldung.
const gapParsed = parseSheets([{ title: 'Leads CCC Webinar 10.10.26', values: [WEB_HEAD,
  ['0', '', '', '', '', '', '', '', ''],
  ['September 29 2026 22:33:00', 'Anne', '', 'anne@x.de', 'meta', 'ppc', WCAMP, '', ''],
  ['', '', '', '', '', '', '', '', ''],                       // Leerzeile mittendrin
  ['October 1 2026 09:12:00', 'Neu1', '', 'n1@x.de', 'meta', 'ppc', WCAMP, WAG, WAD],
  ['October 1 2026 10:30:00', 'Neu2', '', 'n2@x.de', 'meta', 'ppc', WCAMP, WAG, WAD],
] }], CFG);
assert.equal(gapParsed.leads.length, 3, 'Zeilen NACH der Leerzeile werden weiter gelesen');
assert.equal(gapParsed.leads.filter((l) => l.utm.term).length, 2, 'und behalten ihre UTM-Werte');

// Gestapelte Tabellen bleiben trotzdem getrennt - jede hat ihre eigene Kopfzeile.
const stacked = parseSheets([{ title: 'Leads CCC', values: [
  ['Datum', 'Vorname', 'E-Mail', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'],
  ['2026-09-01 10:00:00', 'A', 'a@x.de', 'meta', 'ppc', WCAMP, WAG, ''],
  [],
  ['Datum', 'Vorname', 'E-Mail', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'],
  ['2026-09-02 10:00:00', 'B', 'b@x.de', 'meta', 'ppc', WCAMP, WAG, ''],
] }], CFG);
assert.equal(stacked.leads.length, 2);

// Nicht lesbare Zeilen werden gemeldet statt verschwiegen
const warned = parseSheets([{ title: 'Leads CCC Webinar 10.10.26', values: [WEB_HEAD,
  ['0', '', '', '', '', '', '', '', ''],                      // Platzhalter -> keine Warnung
  ['kaputtes datum', 'X', '', 'x@x.de', 'meta', 'ppc', WCAMP, WAG, WAD],
] }], CFG);
assert.equal(warned.leads.length, 0);
assert.equal(warned.warnings.length, 1, 'genau eine Warnung');
assert.equal(warned.warnings[0].count, 1, 'die Platzhalterzeile "0" zaehlt NICHT als Datenverlust');
assert.match(warned.warnings[0].message, /nicht gelesen/);

// Google-Serienzahl als Datum (Zelle als Zahl formatiert)
assert.match(_internal.parseDate('46296'), /^2026-10-01/);
assert.equal(_internal.parseDate('161'), null, 'Zaehlzeile bleibt kein Datum');
assert.equal(_internal.parseDate('1030.11'), null, 'Betrag bleibt kein Datum');

// --- 7) Funnel-Ansicht in combine ------------------------------------------
const meta = {
  entities: [
    { campaignId: 'c1', campaign: 'DP | CCC | ABO | 190826', adsetId: 'a1', adset: 'AG1: DP | CCC | Broad', adId: 'ad1', creative: 'S1', spend: 100, impressions: 10000, clicks: 200, cpm: 10, uniqueOutboundClicks: 150 },
    { campaignId: 'c2', campaign: 'DP | AKD | ABO Leads', adsetId: 'a2', adset: 'AG2: DP | AKD | SIT', adId: 'ad2', creative: 'S2', spend: 400, impressions: 20000, clicks: 300, cpm: 20, uniqueOutboundClicks: 250 },
  ],
  daily: [{ date: '2026-08-19', spend: 500, impressions: 30000, clicks: 500 }],
  dailyEntities: [
    { date: '2026-08-19', campaign: 'DP | CCC | ABO | 190826', adset: 'AG1: DP | CCC | Broad', creative: 'S1', spend: 100, impressions: 10000, clicks: 200, uoc: 150 },
    { date: '2026-08-19', campaign: 'DP | AKD | ABO Leads', adset: 'AG2: DP | AKD | SIT', creative: 'S2', spend: 400, impressions: 20000, clicks: 300, uoc: 250 },
  ],
  campaignStatus: {
    'DP | CCC | ABO | 190826': { status: 'ACTIVE', active: true, objective: 'OUTCOME_LEADS' },
    'DP | AKD | ABO Leads': { status: 'ACTIVE', active: true, objective: 'OUTCOME_LEADS' },
  },
  adsetStatus: {}, adStatus: {}, adList: [],
};
const all = combineMetaWithLeads(meta, ds.leads, { features });
assert.equal(all.totals.spend, 500, 'Gesamtsicht summiert beide Funnels');

const ccc = combineMetaWithLeads(meta, ds.leads, { features, funnel: CFG.funnels[0] });
assert.equal(ccc.totals.spend, 100, 'CCC-Sicht enthaelt nur den CCC-Spend');
assert.equal(ccc.daily.spend.reduce((s, d) => s + d.spend, 0), 100,
  'Tagesreihe wird je Funnel neu aggregiert (nicht die Kontosumme)');
assert.equal(ccc.hierarchy.length, 1);
assert.match(ccc.hierarchy[0].name, /CCC/);

const akd = combineMetaWithLeads(meta, ds.leads, { features, funnel: CFG.funnels[1] });
assert.equal(akd.totals.spend, 400);
assert.equal(ccc.totals.spend + akd.totals.spend, all.totals.spend,
  'Summe der Funnels == Hauptdashboard');

// Ticket-Kennzahlen fehlen in der Hierarchie
for (const c of all.hierarchy) {
  for (const k of ['tickets', 'cpt', 'cvrTicket', 'qualifiedRate', 'avgQuality']) {
    assert.ok(!(k in c), `Hierarchie darf "${k}" nicht enthalten`);
  }
  assert.ok('cpl' in c, 'CPL bleibt erhalten');
}

// --- 8) Config-Laden und publicConfig --------------------------------------
const live = loadProjectConfig();
assert.ok(live.name, 'project.config.json wird geladen');
const pub = publicConfig(CFG);
assert.deepEqual(pub.features, { hasTickets: false, hasQuality: false });
assert.deepEqual(pub.funnels.map((f) => f.id), ['CCC', 'AKD']);
assert.ok(!('sheet' in pub), 'Sheet-Interna gehen nicht ans Frontend');

console.log('✓ Alle Projekt-Config-/Flag-/Funnel-Tests bestanden');
console.log(`  Leads: ${ds.counts.leads} (${ds.counts.paidLeads} Meta · ${ds.counts.otherPaidLeads} Google · ${ds.counts.organicLeads} organisch)`);
console.log(`  Funnels: CCC ${ccc.totals.spend} € · AKD ${akd.totals.spend} € · gesamt ${all.totals.spend} €`);
