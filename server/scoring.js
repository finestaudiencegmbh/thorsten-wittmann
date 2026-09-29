/**
 * Lead-Qualität aus den Umfrage-Antworten.
 *
 * Regelbasiert statt gewichtet: der Tier ergibt sich aus den beiden
 * Geld-Kriterien (Investitionssumme und Nettovermögen), nicht aus einer
 * Punktsumme. Das ist nachvollziehbar ("warum ist der ein B?") und lässt sich
 * ohne Code-Änderung in config/scoring.json verschieben.
 *
 *   A  beide Kriterien auf High
 *   B  genau eines auf High – oder beide ohne Angabe
 *   C  keines auf High, investiert aber grundsätzlich
 *   D  investiert noch gar nicht
 *
 * Ein Beruf aus occupation.downgrade zieht zusätzlich eine Stufe ab.
 * Das Alter fließt bewusst nicht ein.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'scoring.json');

export function loadScoringConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

/**
 * Vergleichsschlüssel für Antwort-Optionen.
 *
 * Das Sheet schreibt Beträge uneinheitlich ("5.000 - 10.000 €" neben
 * "5.000€ - 30.000€"). Tausenderpunkte, Währungszeichen und Leerzeichen
 * fliegen deshalb raus – "Über 10.000€" und "Über 10.000 €" werden gleich.
 * Teilstring-Vergleiche wären hier falsch: "30.000€ - 100.000€" enthält
 * "100.000" und würde sonst als High durchgehen.
 */
export const optionKey = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[€\s ]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(/[–—]/g, '-')
    .trim();

/**
 * Stuft eine Antwort ein: 'high' | 'low' | 'unknown' | null (keine Antwort).
 * Die Rangfolge kommt aus der Reihenfolge in options; highFrom ist die erste
 * Stufe, die als High zählt.
 */
export function classifyAnswer(value, criterion) {
  const v = optionKey(value);
  if (!v) return null;
  const unknown = (criterion.unknown || []).map(optionKey);
  if (unknown.includes(v)) return 'unknown';
  const options = (criterion.options || []).map(optionKey);
  const idx = options.indexOf(v);
  if (idx === -1) return null; // unbekannte Antwort -> nicht bewerten
  const highIdx = options.indexOf(optionKey(criterion.highFrom));
  if (highIdx === -1) return 'low';
  return idx >= highIdx ? 'high' : 'low';
}

const TIER_ORDER = ['A', 'B', 'C', 'D'];

/** Eine Stufe abwerten (A -> B -> C -> D, D bleibt D). */
function downgrade(tierKey) {
  const i = TIER_ORDER.indexOf(tierKey);
  if (i === -1) return tierKey;
  return TIER_ORDER[Math.min(i + 1, TIER_ORDER.length - 1)];
}

const matchesAny = (value, list) => {
  const v = optionKey(value);
  if (!v) return false;
  return (list || []).map(optionKey).some((x) => x && v.includes(x));
};

/**
 * @param {object} answers  { invest, wealth, occupation, investments, age, ... }
 * @param {object} cfg      config/scoring.json
 */
export function computeQuality(answers, cfg) {
  if (!answers) return null;
  const criteria = cfg.criteria || {};
  const pts = cfg.points || {};

  const invest = classifyAnswer(answers.invest, criteria.invest || {});
  const wealth = classifyAnswer(answers.wealth, criteria.wealth || {});

  // Ohne beide Geldangaben gibt es nichts zu bewerten.
  if (invest == null && wealth == null) return null;

  const states = [invest, wealth];
  const highs = states.filter((s) => s === 'high').length;
  const unknowns = states.filter((s) => s === 'unknown').length;
  const investsNothing = matchesAny(answers.investments, (cfg.investments || {}).noneValues);

  let tierKey;
  if (highs === 2) tierKey = 'A';
  else if (highs === 1) tierKey = 'B';
  else if (unknowns === states.filter((s) => s != null).length) tierKey = 'B'; // alles ohne Angabe
  else if (investsNothing && unknowns === 0) tierKey = 'D';
  // "Möchte ich nicht angeben" wirkt neutral: es blockiert A, darf aber nicht
  // nach unten durchschlagen. Wer eine Geldangabe offenlässt, faellt deshalb
  // nicht nach D - dahinter kann sich genauso gut ein A verbergen.
  else tierKey = 'C';

  // Beruf wertet ab (Alter bewusst nicht).
  const downgraded = matchesAny(answers.occupation, (cfg.occupation || {}).downgrade);
  if (downgraded) tierKey = downgrade(tierKey);

  // Score nur als Sortier-/Mittelwert-Hilfe – der Tier steht bereits fest.
  const pointFor = (state) => {
    if (state === 'high') return pts.high ?? 50;
    if (state === 'unknown') return pts.unknown ?? 25;
    if (state === 'low') return investsNothing ? (pts.none ?? 5) : (pts.low ?? 10);
    return 0;
  };
  let score = pointFor(invest) + pointFor(wealth);
  if (downgraded) score -= pts.downgradePenalty ?? 15;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const tier = (cfg.tiers || []).find((t) => t.key === tierKey) || null;
  return {
    score,
    tier: tierKey,
    tierLabel: tier?.label ?? tierKey,
    breakdown: {
      invest: invest,
      wealth: wealth,
      occupation: downgraded ? 'abgewertet' : 'ok',
    },
    capped: downgraded,
  };
}

export const _internal = { downgrade, matchesAny, TIER_ORDER };
