const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const newJobId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Pollt /api/progress, solange der eigentliche Abruf laeuft. Der Server zaehlt
 * dort echte Schritte mit; hier wird nichts geschaetzt oder hochgerechnet.
 * Liefert eine Funktion zum Stoppen.
 */
function pollProgress(job, onProgress, intervalMs = 500) {
  let stopped = false;
  let inFlight = false;
  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const res = await fetch(`/api/progress?job=${encodeURIComponent(job)}`, { cache: 'no-store' });
      if (res.ok) {
        const p = await res.json();
        if (!stopped && !p.unknown) onProgress(p);
      }
    } catch {
      // Fortschritt ist Beiwerk - ein Fehler hier darf den Abruf nicht stoeren.
    } finally {
      inFlight = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  tick();
  return () => { stopped = true; clearInterval(timer); };
}

export async function fetchData({ refresh = false, from = '', to = '', retries = 2, onProgress = null } = {}) {
  const params = new URLSearchParams();
  if (refresh) params.set('refresh', '1');
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const job = onProgress ? newJobId() : '';
  if (job) params.set('job', job);
  const qs = params.toString();
  const url = `/api/data${qs ? `?${qs}` : ''}`;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Timeout, damit ein hängender Abruf nicht ewig blockiert
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60000);
      const stopPolling = job ? pollProgress(job, onProgress) : null;
      let res;
      try {
        res = await fetch(url, { signal: ctrl.signal });
      } finally {
        if (stopPolling) stopPolling();
        clearTimeout(timer);
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      // Netzwerkfehler/Abbruch (z. B. Render-Cold-Start) -> kurz warten und erneut
      const isNetwork = e.name === 'AbortError' || e.name === 'TypeError' || /fetch/i.test(e.message || '');
      if (attempt < retries && isNetwork) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      break;
    }
  }
  const msg = lastErr?.name === 'AbortError'
    ? 'Zeitüberschreitung beim Laden (Server evtl. im Standby) – bitte erneut auf Aktualisieren klicken.'
    : (lastErr?.message || 'Verbindung fehlgeschlagen');
  throw new Error(msg);
}
