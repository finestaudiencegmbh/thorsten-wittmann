/**
 * Tests fuer den Ladefortschritt: die Registry selbst und die Schritte, die
 * der Meta-Abruf meldet. Ausfuehren: node server/progress.test.mjs
 *
 * Worum es hier geht: der Balken im Dashboard behauptet, echt zu sein. Dann
 * muss die Schrittzahl auch zur tatsaechlich geleisteten Arbeit passen - und
 * am Ende bei 100 % ankommen, nicht bei 94 %.
 */
import assert from 'node:assert/strict';
import { startJob, getJob } from './progress.js';

// --- 1) Registry ------------------------------------------------------------
assert.equal(getJob('gibtsnicht'), null, 'Unbekannter Job -> null');

const r = startJob('j1', { label: 'Sheet laden' });
let j = getJob('j1');
assert.equal(j.done, 0);
assert.equal(j.total, 0);
assert.equal(j.label, 'Sheet laden');
assert.equal(j.finished, false);

r.plan(3);
r.step('Zeilen lesen');
j = getJob('j1');
assert.equal(j.done, 1);
assert.equal(j.total, 3);
assert.equal(j.label, 'Zeilen lesen', 'Das Label beschreibt den naechsten Schritt');

// Das Ziel darf wachsen: wie viel Meta beitraegt, steht erst spaeter fest.
r.plan(4);
assert.equal(getJob('j1').total, 7);

// Mehr Schritte als geplant duerfen nie ueber 100 % hinauslaufen.
for (let i = 0; i < 20; i++) r.step('egal');
j = getJob('j1');
assert.equal(j.done, j.total, 'done waechst notfalls das Ziel mit, statt es zu ueberschreiten');

// done() schliesst sauber ab - auch wenn ein Schritt nie gemeldet wurde
// (z. B. ein Werbekonto, das in den Fehler laeuft).
const r2 = startJob('j2');
r2.plan(10);
r2.step('eins');
r2.done();
j = getJob('j2');
assert.equal(j.done, 10, 'Am Ende steht der Balken auf 100 %');
assert.equal(j.finished, true);
assert.equal(j.label, 'Fertig');

const r3 = startJob('j3');
r3.plan(5);
r3.fail('Token abgelaufen');
assert.equal(getJob('j3').error, 'Token abgelaufen');

// Ohne Job-Id laeuft der Reporter ins Leere, statt zu werfen.
const noop = startJob('');
noop.plan(2); noop.step('x'); noop.say('y'); noop.done(); noop.fail('z');

// --- 2) Schritte des Meta-Abrufs -------------------------------------------
// Graph-API durch eine Attrappe ersetzen, damit der echte Abrufweg laeuft -
// inklusive der Stellen, an denen er Fortschritt meldet.
process.env.META_ACCESS_TOKEN = 'testtoken';
process.env.META_AD_ACCOUNT_ID = 'act_111,act_222';

const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url);
  const body = u.includes('/act_') && !u.includes('/insights') && !u.includes('fields=name')
    ? { data: [] }
    : u.includes('fields=name') ? { name: 'Testkonto' } : { data: [] };
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
};

const { fetchMetaAll, metaStepCount } = await import('./meta.js');

// Die Schrittzahl steht VOR dem Abruf fest - sonst waechst das Ziel mitten im
// Laden und der Balken springt zurueck.
assert.equal(metaStepCount(), 13, '2 Konten x 6 Abrufe + Zusammenfuehren');

const rm = startJob('meta');
rm.plan(metaStepCount());
await fetchMetaAll({ since: '2026-10-01', until: '2026-10-29' }, rm);
globalThis.fetch = realFetch;

j = getJob('meta');
// 2 Konten x 6 Abrufe + 1x zusammenfuehren
assert.equal(j.total, 13, 'Das Ziel bleibt, was vorher angemeldet wurde');
assert.equal(j.done, 13, 'Jeder angemeldete Schritt wird auch gemeldet - der Balken kommt bei 100 % an');
assert.equal(j.label, 'Meta-Daten zusammenführen');

console.log('✓ Alle Fortschritts-Tests bestanden');
console.log(`  Meta-Abruf: ${j.done}/${j.total} Schritte gemeldet`);
