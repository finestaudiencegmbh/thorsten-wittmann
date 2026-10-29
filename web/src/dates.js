/**
 * Datums-Helfer fuer den Zeitraum-Filter (lokale Zeit, ohne Bibliothek).
 *
 * Liegt bewusst in einem eigenen Modul und nicht im DateRangePicker: den
 * voreingestellten Zeitraum braucht auch App.jsx beim ersten Render. Zwei
 * Definitionen von "Dieser Monat" wuerden frueher oder spaeter auseinander
 * laufen - dann waere der Preset im Kalender nicht markiert, obwohl genau
 * dieser Zeitraum geladen ist.
 */
const pad = (n) => String(n).padStart(2, '0');

export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const startOfWeek = (d) => { const x = new Date(d); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd); }; // Mo
export const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
export const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

/** Liefert [from,to] als Date-Objekte fuer ein Preset, relativ zu heute. */
export function presetRange(key) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const y = addDays(today, -1);
  switch (key) {
    case 'today': return [today, today];
    case 'yesterday': return [y, y];
    case 'last7': return [addDays(today, -6), today];
    case 'last14': return [addDays(today, -13), today];
    case 'last28': return [addDays(today, -27), today];
    case 'last30': return [addDays(today, -29), today];
    case 'thisWeek': return [startOfWeek(today), today];
    case 'lastWeek': { const s = addDays(startOfWeek(today), -7); return [s, addDays(s, 6)]; }
    case 'thisMonth': return [startOfMonth(today), today];
    case 'lastMonth': { const s = startOfMonth(addDays(startOfMonth(today), -1)); return [s, endOfMonth(s)]; }
    case 'maximum': return [null, null];
    default: return [null, null];
  }
}

/** Dasselbe als {from,to} in YYYY-MM-DD - die Form, die Filter und API nutzen. */
export function presetYmd(key) {
  const [a, b] = presetRange(key);
  return a && b ? { from: ymd(a), to: ymd(b) } : { from: '', to: '' };
}
