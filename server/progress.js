/**
 * Fortschritt eines laufenden /api/data-Abrufs.
 *
 * Der Abruf ist ein einzelner langer Request - der Browser sieht bis zur
 * Antwort nichts. Deshalb meldet der Server seine Schritte in eine Registry,
 * die der Client waehrenddessen pollt (/api/progress?job=...).
 *
 * Bewusst echte Schritte statt eines geschaetzten Balkens: gezaehlt wird, was
 * tatsaechlich fertig ist. Die Schritte sind unterschiedlich lang (ein
 * Sheet-Abruf dauert laenger als das Zusammenfuehren), der Balken laeuft also
 * nicht gleichmaessig. Das ist der Preis dafuer, dass die Zahl stimmt.
 */

const jobs = new Map();
const TTL_MS = 5 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (now - (j.finishedAt || j.startedAt) > TTL_MS) jobs.delete(id);
  }
}

/**
 * Legt einen Job an und liefert den Reporter, der durch die Ladekette gereicht
 * wird. Ohne Job-Id (z. B. Aufruf aus dem Chatbot) kommt ein Reporter zurueck,
 * der ins Leere laeuft - die Aufrufer brauchen dadurch keine Sonderfaelle.
 */
export function startJob(id, { label = 'Starte …' } = {}) {
  if (!id) return noopReporter();
  sweep();
  const job = { total: 0, done: 0, label, startedAt: Date.now(), finishedAt: null, error: null };
  jobs.set(id, job);
  return {
    /** Kuendigt n weitere Schritte an. Das Ziel waechst, waehrend klar wird,
     *  wie viel Arbeit ansteht (z. B. ein Abruf je Werbekonto). */
    plan(n) { job.total += Math.max(0, n | 0); },
    /** Ein Schritt ist FERTIG. Das Label beschreibt den naechsten. */
    step(label) {
      job.done += 1;
      if (job.done > job.total) job.total = job.done;
      if (label) job.label = label;
    },
    /** Nur den Text wechseln, ohne zu zaehlen. */
    say(label) { if (label) job.label = label; },
    done() { job.done = job.total || job.done; job.finishedAt = Date.now(); job.label = 'Fertig'; },
    fail(message) { job.error = String(message || 'Fehler'); job.finishedAt = Date.now(); },
  };
}

function noopReporter() {
  return { plan() {}, step() {}, say() {}, done() {}, fail() {} };
}

/** Momentaufnahme fuer den Client. null, wenn der Job unbekannt ist. */
export function getJob(id) {
  sweep();
  const j = jobs.get(id);
  if (!j) return null;
  return {
    done: j.done,
    total: j.total,
    label: j.label,
    elapsedMs: (j.finishedAt || Date.now()) - j.startedAt,
    finished: Boolean(j.finishedAt),
    error: j.error,
  };
}
