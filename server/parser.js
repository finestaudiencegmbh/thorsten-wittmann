/**
 * Wandelt die Roh-Zellen aus dem Google Sheet in strukturierte Datensätze um.
 *
 * Das Sheet besteht aus mehreren Tabs/Tabellen. Statt fixe Tab-Namen
 * vorauszusetzen, erkennt der Parser jede Tabelle an ihrer Kopfzeile.
 * Dadurch bleibt er stabil, auch wenn Tabs umbenannt oder verschoben werden.
 *
 * Welche Spaltennamen zu welchem Feld gehören, steht in project.config.json
 * (sheet.leadColumns / ticketColumns / questionnaireColumns / overviewColumns).
 * Jedes Feld akzeptiert mehrere Schreibweisen – so liest derselbe Parser
 * Sheets verschiedener Projekte.
 */
import { DEFAULT_CONFIG } from './project-config.js';

/**
 * HTML-Entities zurueckwandeln. Manche Tracking-Ketten schreiben Sonderzeichen
 * escaped ins Sheet ("Finanzen &amp; pers. Finanzen"), waehrend die Meta-API den
 * echten Namen liefert ("Finanzen & pers. Finanzen"). Ohne Rueckwandlung matcht
 * die Anzeigengruppe nicht und zeigt 0 Leads bei vollem Spend.
 *
 * Mehrfach durchlaufen, weil auch doppelt kodierte Werte vorkommen
 * ("&amp;amp;"). Die Schleife ist auf 3 Durchlaeufe begrenzt, damit unbekannte
 * Entities nicht endlos wiederholt werden.
 */
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};
const ENTITY_RE = /&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g;

function decodeEntities(input) {
  let out = String(input ?? '');
  for (let i = 0; i < 3; i++) {
    const next = out.replace(ENTITY_RE, (match, ent) => {
      if (ent[0] === '#') {
        const code = ent[1] === 'x' || ent[1] === 'X'
          ? parseInt(ent.slice(2), 16)
          : parseInt(ent.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      const key = ent.toLowerCase();
      return key in NAMED_ENTITIES ? NAMED_ENTITIES[key] : match;
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

const norm = (s) =>
  decodeEntities(s)
    .replace(/ /g, ' ')
    .trim();

const key = (s) =>
  norm(s)
    .toLowerCase()
    .replace(/[?:.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Manche Sheets speichern UTM-Werte URL-kodiert: "CCC+EWeb+|+CBO" statt
 * "CCC EWeb | CBO". Die Meta-API liefert echte Leerzeichen – ohne Rückwandlung
 * matcht die Attribution nicht und die Zahlen wären still falsch.
 */
const decodePlus = (s) => norm(s).replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();

/** Liest den ersten belegten Wert aus allen konfigurierten Spalten-Aliassen. */
function pick(obj, aliases) {
  for (const a of aliases || []) {
    const v = obj[key(a)];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}

/** Erkennt anhand einer Kopfzeile, um welchen Tabellentyp es sich handelt. */
function classifyHeader(cells, cfg = DEFAULT_CONFIG) {
  const set = new Set(cells.map(key));
  const sheet = cfg.sheet || DEFAULT_CONFIG.sheet;
  const features = cfg.features || DEFAULT_CONFIG.features;
  // Trifft mindestens einer der konfigurierten Aliasse dieses Feldes?
  const hasField = (aliases) => (aliases || []).some((a) => set.has(key(a)));

  const ov = sheet.overviewColumns || {};
  if (hasField(ov.adset) && hasField(ov.adspend)) return 'overview';

  // WICHTIG: vor den Leads pruefen. Der Umfrage-Tab traegt dieselben
  // Basis-Spalten (Datum, E-Mail, UTMs) wie ein Lead-Tab - wuerde er als
  // Lead-Tabelle durchgehen, zaehlte jede Antwort zusaetzlich als Lead.
  if (features.hasQuality) {
    const qc = sheet.questionnaireColumns || {};
    const answerCols = Object.values(qc).filter((aliases) => hasField(aliases)).length;
    if (answerCols >= 2) return 'survey';
  }

  if (features.hasTickets) {
    const tc = sheet.ticketColumns || {};
    const qc = sheet.questionnaireColumns || {};
    // Ein Fragebogen-Tab erkennt man an den Antwortspalten oder an
    // "Teilgenommen am" + Vorname.
    const hasAnswerCol = Object.values(qc).some((aliases) => hasField(aliases));
    if (hasAnswerCol || (hasField(tc.at) && hasField(tc.firstName))) return 'tickets';
  }

  const lc = sheet.leadColumns || {};
  if (hasField(lc.wonAt) && (hasField(lc.utmSource) || hasField(lc.email))) return 'leads';
  return null;
}

function rowToObj(headerCells, row) {
  const obj = {};
  headerCells.forEach((h, i) => {
    const k = key(h);
    if (!k) return;
    obj[k] = norm(row[i]);
  });
  return obj;
}

function isEmptyRow(row) {
  return !row || row.every((c) => norm(c) === '');
}

// Monatsnamen deutsch und englisch, jeweils auch als uebliche Abkuerzung.
// Die Tabs desselben Sheets schreiben Datumswerte unterschiedlich: der
// Umfrage-Tab ISO ("2026-09-28 23:17:13"), der Webinar-Lead-Tab mit
// Monatsnamen ("September 29 2026 22:33:00").
const MONTH_NAMES = {
  januar: 1, january: 1, jan: 1,
  februar: 2, february: 2, feb: 2,
  'märz': 3, maerz: 3, march: 3, mar: 3, mrz: 3,
  april: 4, apr: 4,
  mai: 5, may: 5,
  juni: 6, june: 6, jun: 6,
  juli: 7, july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  oktober: 10, october: 10, okt: 10, oct: 10,
  november: 11, nov: 11,
  dezember: 12, december: 12, dez: 12, dec: 12,
};

const pad2 = (n) => String(Number(n) || 0).padStart(2, '0');
const monthNum = (name) => MONTH_NAMES[String(name || '').toLowerCase()];

/**
 * Bringt verbreitete Schreibweisen auf ISO-Text. Liefert null, wenn der Wert
 * kein Datum ist - das haelt Zaehl-/Summenzeilen wie "161" oder "0" draussen,
 * die sonst als Jahr 161 durchgingen.
 */
function toIsoText(v) {
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v;

  // "September 29 2026 22:33:00" / "Sep 29, 2026"
  let m = v.match(/^([A-Za-zÄÖÜäöüß]+)\.?\s+(\d{1,2})\.?,?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m && monthNum(m[1])) {
    return `${m[3]}-${pad2(monthNum(m[1]))}-${pad2(m[2])} ${pad2(m[4])}:${pad2(m[5])}:${pad2(m[6])}`;
  }
  // "29. September 2026 22:33"
  m = v.match(/^(\d{1,2})\.?\s+([A-Za-zÄÖÜäöüß]+)\.?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m && monthNum(m[2])) {
    return `${m[3]}-${pad2(monthNum(m[2]))}-${pad2(m[1])} ${pad2(m[4])}:${pad2(m[5])}:${pad2(m[6])}`;
  }
  // "19.09.2026 06:37"
  m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    return `${m[3]}-${pad2(m[2])}-${pad2(m[1])} ${pad2(m[4])}:${pad2(m[5])}:${pad2(m[6])}`;
  }
  return null;
}

function parseDate(s) {
  const raw = norm(s);
  if (!raw) return null;
  const v = toIsoText(raw);
  if (!v) return null;
  const d = new Date(v.replace(' +0000', 'Z').replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const normEmail = (s) => norm(s).toLowerCase();

/**
 * Zerlegt ein Tab (2D-Array) in einzelne Tabellen. Ein Tab kann mehrere
 * untereinander gestapelte Tabellen enthalten (z. B. die Anzeigengruppen-
 * Übersicht mit mehreren Kampagnen).
 */
function* iterateTables(rows, cfg = DEFAULT_CONFIG) {
  let header = null;
  let type = null;
  let body = [];
  const flush = () => {
    if (header && body.length) return { header, type, body };
    return null;
  };
  for (const row of rows) {
    const t = classifyHeader(row.map(norm).filter(Boolean).length >= 2 ? row : [], cfg);
    if (t) {
      const prev = flush();
      if (prev) yield prev;
      header = row;
      type = t;
      body = [];
      continue;
    }
    if (header) {
      if (isEmptyRow(row)) {
        const prev = flush();
        if (prev) yield prev;
        header = null;
        type = null;
        body = [];
      } else {
        body.push(row);
      }
    }
  }
  const last = flush();
  if (last) yield last;
}

const num = (s) => {
  const v = norm(s).replace(/[^\d,.-]/g, '');
  if (!v) return null;
  // deutsches Format: 1.030,11 -> 1030.11
  const n = parseFloat(v.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * Ordnet einen Tab-Titel einem Funnel zu (z. B. Tab "Leads CCC" -> Funnel CCC).
 * Der Tab ist die verlässlichste Quelle: Leads aus Reoptin-Mails, Newslettern
 * oder Google Ads tragen oft gar kein Funnel-Kürzel in den UTM-Werten.
 */
export function funnelForTab(title, cfg = DEFAULT_CONFIG) {
  const t = key(title);
  if (!t) return null;
  for (const f of cfg.funnels || []) {
    const needle = key(f.sheetTab || f.id);
    if (needle && t.includes(needle)) return f.id;
  }
  return null;
}

function parseOverviewRow(o, cols) {
  const adset = norm(pick(o, cols.adset));
  if (!adset) return null;
  return {
    status: norm(pick(o, cols.status)),
    adset,
    adspend: num(pick(o, cols.adspend)),
    clicks: num(pick(o, cols.clicks)),
    cpc: num(pick(o, cols.cpc)),
    cvrOptin: num(pick(o, cols.cvrOptin)),
    cvrTicket: num(pick(o, cols.cvrTicket)),
    cpl: num(pick(o, cols.cpl)),
    leads: num(pick(o, cols.leads)),
    tickets: num(pick(o, cols.tickets)),
    ticketsQualified: num(pick(o, cols.ticketsQualified)),
    ticketsUnqualified: num(pick(o, cols.ticketsUnqualified)),
  };
}

function parseLeadRow(o, cfg) {
  const sheet = cfg.sheet || DEFAULT_CONFIG.sheet;
  const cols = sheet.leadColumns || {};
  const utmVal = sheet.decodePlusAsSpace ? decodePlus : norm;
  const wonAt = parseDate(pick(o, cols.wonAt));
  if (!wonAt) return null; // Zähl-/Summenzeilen ohne gültiges Datum überspringen
  return {
    wonAt,
    firstName: norm(pick(o, cols.firstName)),
    lastName: norm(pick(o, cols.lastName)),
    email: normEmail(pick(o, cols.email)),
    utm: {
      source: utmVal(pick(o, cols.utmSource)),
      medium: utmVal(pick(o, cols.utmMedium)),
      campaign: utmVal(pick(o, cols.utmCampaign)),
      term: utmVal(pick(o, cols.utmTerm)),
      content: utmVal(pick(o, cols.utmContent)),
    },
    ticketAt: cfg.features?.hasTickets ? parseDate(pick(o, cols.ticketAt)) : null,
  };
}

function parseTicketRow(o, cfg) {
  const sheet = cfg.sheet || DEFAULT_CONFIG.sheet;
  const cols = sheet.ticketColumns || {};
  const lead = sheet.leadColumns || {};
  const utmVal = sheet.decodePlusAsSpace ? decodePlus : norm;
  const at = parseDate(pick(o, cols.at));
  const email = normEmail(pick(o, cols.email));
  if (!at && !email) return null;

  // Fragebogen-Antworten: logischer Name -> konfigurierte Sheet-Spalte.
  // Nur befüllen, wenn das Scoring überhaupt aktiv ist.
  const answers = {};
  if (cfg.features?.hasQuality) {
    for (const [field, aliases] of Object.entries(sheet.questionnaireColumns || {})) {
      answers[field] = norm(pick(o, aliases));
    }
  }

  return {
    at,
    firstName: norm(pick(o, cols.firstName)),
    lastName: norm(pick(o, cols.lastName)),
    email,
    emailTypeform: normEmail(pick(o, cols.emailAlt)),
    phone: norm(pick(o, cols.phone)),
    answers,
    utm: {
      source: utmVal(pick(o, lead.utmSource)),
      medium: utmVal(pick(o, lead.utmMedium)),
      campaign: utmVal(pick(o, lead.utmCampaign)),
      term: utmVal(pick(o, lead.utmTerm)),
      content: utmVal(pick(o, lead.utmContent)),
    },
  };
}

/**
 * Eine Zeile aus dem Umfrage-Tab. Traegt eigene UTM-Werte, die Qualitaet
 * laesst sich dadurch direkt an Kampagne/Anzeigengruppe/Creative haengen -
 * unabhaengig davon, ob die Person im Lead-Tab wiedergefunden wird.
 */
function parseSurveyRow(o, cfg) {
  const sheet = cfg.sheet || DEFAULT_CONFIG.sheet;
  const cols = sheet.surveyColumns || {};
  const lead = sheet.leadColumns || {};
  const utmVal = sheet.decodePlusAsSpace ? decodePlus : norm;
  const at = parseDate(pick(o, cols.at));
  const email = normEmail(pick(o, cols.email));
  if (!at && !email) return null;

  const answers = {};
  for (const [field, aliases] of Object.entries(sheet.questionnaireColumns || {})) {
    answers[field] = norm(pick(o, aliases));
  }

  return {
    at,
    firstName: norm(pick(o, cols.firstName)),
    lastName: norm(pick(o, cols.lastName)),
    email,
    phone: norm(pick(o, cols.phone)),
    answers,
    utm: {
      source: utmVal(pick(o, lead.utmSource)),
      medium: utmVal(pick(o, lead.utmMedium)),
      campaign: utmVal(pick(o, lead.utmCampaign)),
      term: utmVal(pick(o, lead.utmTerm)),
      content: utmVal(pick(o, lead.utmContent)),
    },
  };
}

/**
 * Hauptfunktion: bekommt die Tabs als [{title, values}] und liefert
 * { leads, tickets, surveys, overview, warnings }.
 */
export function parseSheets(sheets, cfg = DEFAULT_CONFIG) {
  const leads = [];
  const tickets = [];
  const surveys = [];
  const overview = [];
  const warnings = [];
  const seenTickets = new Set();
  const seenSurveys = new Set();
  const hasTickets = Boolean(cfg.features?.hasTickets);
  const hasQuality = Boolean(cfg.features?.hasQuality);
  const overviewCols = (cfg.sheet || DEFAULT_CONFIG.sheet).overviewColumns || {};

  for (const sheet of sheets) {
    const rows = sheet.values || [];
    // Der Tab bestimmt den Funnel – nicht der Kampagnenname.
    const funnel = funnelForTab(sheet.title, cfg);
    for (const table of iterateTables(rows, cfg)) {
      for (const row of table.body) {
        const o = rowToObj(table.header, row);
        if (table.type === 'overview') {
          const r = parseOverviewRow(o, overviewCols);
          if (r) overview.push({ ...r, funnel });
        } else if (table.type === 'survey') {
          if (!hasQuality) continue;
          const r = parseSurveyRow(o, cfg);
          if (!r) continue;
          // Dedupe ueber E-Mail + Zeitpunkt (Formulare liefern gelegentlich
          // doppelte Zeilen).
          const dk = `${r.email}|${r.at || ''}`;
          if (seenSurveys.has(dk)) continue;
          seenSurveys.add(dk);
          surveys.push({ ...r, funnel });
        } else if (table.type === 'leads') {
          const r = parseLeadRow(o, cfg);
          if (r) leads.push({ ...r, funnel });
        } else if (table.type === 'tickets') {
          if (!hasTickets) continue;
          const r = parseTicketRow(o, cfg);
          if (!r) continue;
          // Dedupe (das Sheet enthält teils zwei Ticket-Tabs)
          const dk = `${r.email}|${r.at || ''}`;
          if (seenTickets.has(dk)) continue;
          seenTickets.add(dk);
          tickets.push({ ...r, funnel });
        }
      }
    }
  }

  return { leads, tickets, surveys, overview, warnings };
}

export const _internal = { classifyHeader, key, num, parseDate, toIsoText, iterateTables, decodePlus, decodeEntities, pick, parseSurveyRow };
