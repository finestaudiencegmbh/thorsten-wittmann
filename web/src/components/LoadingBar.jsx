import React, { useEffect, useState } from 'react';

/**
 * Ladeanzeige mit echtem Fortschritt.
 *
 * Der Balken zeigt abgeschlossene Schritte / geplante Schritte, gemeldet vom
 * Server (/api/progress). Nichts davon ist geschaetzt oder hochgerechnet.
 *
 * Zwei Dinge, die man dem Balken ansieht und die so gewollt sind:
 * - Er laeuft ungleichmaessig. Ein Sheet-Abruf dauert laenger als das
 *   Zusammenfuehren, zaehlt aber genauso einen Schritt. Gleichmaessig waere
 *   nur zu haben, indem man die Zeit schaetzt - dann stimmt die Zahl nicht.
 * - Das Ziel kann wachsen. Wie viele Schritte Meta beitraegt, steht erst fest,
 *   wenn bekannt ist, wie viele Werbekonten konfiguriert sind.
 *
 * Die Sekunden laufen lokal weiter, damit die Anzeige zwischen zwei Abfragen
 * nicht stehenbleibt - gemessen ab dem Moment, in dem der Abruf startete.
 */
export default function LoadingBar({ progress, startedAt }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const total = progress?.total || 0;
  const done = Math.min(progress?.done || 0, total || Infinity);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const secs = Math.max(0, Math.round((now - startedAt) / 1000));

  return (
    <div className="loader">
      <div className="lb">
        <div className="lb-head">
          <span className="lb-title">Lade Daten</span>
          {/* Vor dem ersten Lebenszeichen gibt es noch keine Schritte - dann
              bleibt die Prozentzahl weg statt bei 0 % zu stehen. */}
          <span className="lb-pct">{total > 0 ? `${pct} %` : '…'}</span>
        </div>
        <div
          className="lb-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total || undefined}
          aria-valuenow={total > 0 ? done : undefined}
          aria-valuetext={progress?.label || 'Lade Daten'}
        >
          <div className={`lb-fill ${total > 0 ? '' : 'indeterminate'}`} style={total > 0 ? { width: `${pct}%` } : undefined} />
        </div>
        <div className="lb-meta">
          <span className="lb-label">{progress?.label || 'Verbinde …'}</span>
          <span className="lb-steps">
            {total > 0 ? `${done}/${total} Schritte · ` : ''}{secs} s
          </span>
        </div>
      </div>
    </div>
  );
}
