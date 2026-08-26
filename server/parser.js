/**
 * Wandelt die Roh-Zellen aus dem Google Sheet in strukturierte Datensätze um.
 *
 * Das Sheet besteht aus mehreren Tabs/Tabellen. Statt fixe Tab-Namen
 * vorauszusetzen, erkennt der Parser jede Tabelle an ihrer Kopfzeile.
 * Dadurch bleibt er stabil, auch wenn Tabs umbenannt oder verschoben werden.
 */

const norm = (s) =>
  String(s ?? '')
    .replace(/ /g, ' ')
    .trim();

const key = (s) =>
  norm(s)
    .toLowerCase()
    .replace(/[?:.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Erkennt anhand einer Kopfzeile, um welchen Tabellentyp es sich handelt. */
function classifyHeader(cells) {
  const set = new Set(cells.map(key));
  const has = (...keys) => keys.every((k) => set.has(k));
  const some = (...keys) => keys.some((k) => set.has(k));

  if (has('anzeigengruppe', 'adspend')) return 'overview';
  if (some('monatliches einkommen', 'immobilien im besitz') || has('teilgenommen am', 'vorname')) {
    return 'tickets';
  }
  if (has('gewonnen am') && some('utm_source', 'e-mail')) return 'leads';
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
function* iterateTables(rows) {
  let header = null;
  let type = null;
  let body = [];
  const flush = () => {
    if (header && body.length) return { header, type, body };
    return null;
  };
  for (const row of rows) {
    const t = classifyHeader(row.map(norm).filter(Boolean).length >= 2 ? row : []);
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

function parseOverviewRow(o) {
  const adset = norm(o['anzeigengruppe']);
  if (!adset) return null;
  return {
    status: norm(o['status']),
    adset,
    adspend: num(o['adspend']),
    clicks: num(o['ausg klicks'] ?? o['klicks']),
    cpc: num(o['cpc']),
    cvrOptin: num(o['cvr optin']),
    cvrTicket: num(o['cvr ticket']),
    cpl: num(o['cpl']),
    leads: num(o['leads']),
    tickets: num(o['vip ticket']),
    ticketsQualified: num(o['ticket qualifiziert']),
    ticketsUnqualified: num(o['ticket nicht qualifiziert']),
  };
}

function parseLeadRow(o) {
  const wonAt = parseDate(o['gewonnen am']);
  if (!wonAt) return null; // Zähl-/Summenzeilen ohne gültiges Datum überspringen
  return {
    wonAt,
    firstName: norm(o['vorname']),
    lastName: norm(o['nachname']),
    email: normEmail(o['e-mail']),
    utm: {
      source: norm(o['utm_source']),
      medium: norm(o['utm_medium']),
      campaign: norm(o['utm_campaign']),
      term: norm(o['utm_term']),
    },
    ticketAt: parseDate(o['vip-ticket geholt am']),
  };
}

function parseTicketRow(o) {
  const at = parseDate(o['teilgenommen am']);
  const email = normEmail(o['e-mail (funnelcockpit)'] || o['e-mail (typeform)'] || o['e-mail']);
  if (!at && !email) return null;
  return {
    at,
    firstName: norm(o['vorname']),
    lastName: norm(o['nachname']),
    email,
    emailTypeform: normEmail(o['e-mail (typeform)']),
    phone: norm(o['handynummer']),
    answers: {
      employment: norm(o['angestellt selbstständig oder unternehmer']),
      challenge: norm(o['größte herausforderung im vermögensaufbau']),
      income: norm(o['monatliches einkommen']),
      realEstate: norm(o['immobilien im besitz']),
      invested: norm(o['geld investiert in den vermögensaufbau wenn ja wie viel']),
      relationship: norm(o['beziehungsstand']),
      expectation: norm(o['was erhoffst du dir von den 4 abenden']),
    },
    utm: {
      source: norm(o['utm_source']),
      medium: norm(o['utm_medium']),
      campaign: norm(o['utm_campaign']),
      term: norm(o['utm_term']),
    },
  };
}

/**
 * Hauptfunktion: bekommt die Tabs als [{title, values}] und liefert
 * { leads, tickets, overview, warnings }.
 */
export function parseSheets(sheets) {
  const leads = [];
  const tickets = [];
  const overview = [];
  const warnings = [];
  const seenTickets = new Set();

  for (const sheet of sheets) {
    const rows = sheet.values || [];
    for (const table of iterateTables(rows)) {
      for (const row of table.body) {
        const o = rowToObj(table.header, row);
        if (table.type === 'overview') {
          const r = parseOverviewRow(o);
          if (r) overview.push(r);
        } else if (table.type === 'leads') {
          const r = parseLeadRow(o);
          if (r) leads.push(r);
        } else if (table.type === 'tickets') {
          const r = parseTicketRow(o);
          if (!r) continue;
          // Dedupe (das Sheet enthält teils zwei Ticket-Tabs)
          const dk = `${r.email}|${r.at || ''}`;
          if (seenTickets.has(dk)) continue;
          seenTickets.add(dk);
          tickets.push(r);
        }
      }
    }
  }

  return { leads, tickets, overview, warnings };
}

export const _internal = { classifyHeader, key, num, parseDate, iterateTables };
