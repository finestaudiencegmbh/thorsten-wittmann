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

const norm = (s) =>
  String(s ?? '')
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

function parseDate(s) {
  const v = norm(s);
  if (!v) return null;
  // Nur echte Datumsangaben akzeptieren (Format im Sheet:
  // "2026-05-26 18:46:08 +0000"). Verhindert, dass Zähl-/Summenzeilen
  // wie "161" fälschlich als Datum (Jahr 161) interpretiert werden.
  if (!/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
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
 * Hauptfunktion: bekommt die Tabs als [{title, values}] und liefert
 * { leads, tickets, overview, warnings }.
 */
export function parseSheets(sheets, cfg = DEFAULT_CONFIG) {
  const leads = [];
  const tickets = [];
  const overview = [];
  const warnings = [];
  const seenTickets = new Set();
  const hasTickets = Boolean(cfg.features?.hasTickets);
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

  return { leads, tickets, overview, warnings };
}

export const _internal = { classifyHeader, key, num, parseDate, iterateTables, decodePlus, pick };
