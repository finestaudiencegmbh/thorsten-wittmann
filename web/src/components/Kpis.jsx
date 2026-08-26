import React from 'react';
import { fmtEur, fmtInt, fmtPct } from '../lib.js';
import { hasTickets, hasQuality, TRAFFIC_SOURCES } from '../config.js';
import TimeChart from './TimeChart.jsx';

function Card({ label, value, sub, accent }) {
  return (
    <div className="kpi-card">
      <span className="kpi-accent" style={accent ? { background: accent, color: accent } : undefined} />
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

// Primaerakzent kommt aus der Projekt-Config (CSS-Variable), die Sekundaertoene
// sind feste Rollenfarben und deshalb bewusst nicht gebrandet.
const ACCENT = 'var(--accent)';
const CYAN = '#5ec8d8';
const GREEN = '#6fcf97';
const AMBER = '#e0a33e';

/** Label der Quelle, die echte Kostendaten liefert (heute: Meta). */
const spendSourceLabel = TRAFFIC_SOURCES.find((s) => s.hasSpend)?.label || 'Ads';
/** Bezahlte Quellen ohne Kostendaten - z. B. Google Ads ohne API-Anbindung. */
const otherPaidLabels = TRAFFIC_SOURCES.filter((s) => s.paid && !s.hasSpend).map((s) => s.label);

export default function Kpis({ kpis, dist, tiers, qualityDaily = [] }) {
  return (
    <div className="kpi-sections">
      {/* Bezahlt - nur Quellen mit bekannten Kosten gehen in CPL ein */}
      <section className="kpi-section">
        <div className="kpi-section-head"><span className="kpi-dot" style={{ background: ACCENT }} />Bezahlt · {spendSourceLabel}</div>
        <div className="kpi-grid">
          <Card label="Adspend" value={fmtEur(kpis.spend)} sub={kpis.nonLeadSpend > 0 ? `davon ${fmtEur(kpis.nonLeadSpend)} Traffic` : 'gesamt'} accent={ACCENT} />
          <Card label="Bezahlte Leads" value={fmtInt(kpis.paid)} sub={`über ${spendSourceLabel}`} accent={ACCENT} />
          <Card label="CPL" value={fmtEur(kpis.cpl)} sub={kpis.nonLeadSpend > 0 ? 'nur Lead-Kampagnen' : 'pro bezahltem Lead'} accent={ACCENT} />
          {hasTickets && <Card label="Tickets (Paid)" value={fmtInt(kpis.paidTickets)} sub={`Rate ${fmtPct(kpis.paidTicketRate)}`} accent={ACCENT} />}
          {hasTickets && <Card label="Kosten / Ticket" value={fmtEur(kpis.cpt)} sub="pro bezahltem Ticket" accent={ACCENT} />}
        </div>
      </section>

      {/* Bezahlt, aber ohne Kostendaten - darf den CPL nicht verwaessern */}
      {otherPaidLabels.length > 0 && kpis.otherPaid > 0 && (
        <section className="kpi-section">
          <div className="kpi-section-head"><span className="kpi-dot" style={{ background: AMBER }} />Bezahlt · {otherPaidLabels.join(' / ')}</div>
          <div className="kpi-grid">
            <Card label={`Leads über ${otherPaidLabels.join(' / ')}`} value={fmtInt(kpis.otherPaid)} sub="Kosten nicht angebunden" accent={AMBER} />
            <Card label="Anteil an allen Leads" value={fmtPct(kpis.total ? kpis.otherPaid / kpis.total : null)} sub="nicht im CPL enthalten" accent={AMBER} />
          </div>
        </section>
      )}

      {/* Organisch */}
      <section className="kpi-section">
        <div className="kpi-section-head"><span className="kpi-dot" style={{ background: CYAN }} />Organisch</div>
        <div className="kpi-grid">
          <Card label="Organische Leads" value={fmtInt(kpis.organic)} sub="ohne Ad-Kosten" accent={CYAN} />
          {hasTickets && <Card label="Tickets (Organisch)" value={fmtInt(kpis.organicTickets)} sub={`Rate ${fmtPct(kpis.organicTicketRate)}`} accent={CYAN} />}
          <Card
            label="Leads gesamt"
            value={fmtInt(kpis.total)}
            sub={[
              `${fmtInt(kpis.paid)} ${spendSourceLabel}`,
              kpis.otherPaid > 0 ? `${fmtInt(kpis.otherPaid)} ${otherPaidLabels.join('/') || 'sonstige'}` : null,
              `${fmtInt(kpis.organic)} organisch`,
            ].filter(Boolean).join(' · ')}
            accent={CYAN}
          />
        </div>
      </section>

      {/* Lead-Qualitaet (quellenuebergreifend) */}
      {hasQuality && (
        <section className="kpi-section">
          <div className="kpi-section-head"><span className="kpi-dot" style={{ background: GREEN }} />Lead-Qualität</div>
          <div className="kpi-grid">
            <Card label="Qualifizierte Leads" value={fmtPct(kpis.qualifiedRate)} sub="Tier A/B der Tickets" accent={GREEN} />
            <Card label="Qualifizierte Leads" value={fmtInt(kpis.qualified)} sub={`von ${fmtInt(kpis.tickets)} Tickets`} accent={GREEN} />
            <div className="kpi-card kpi-dist">
              <div className="kpi-label">Qualitäts-Verteilung (Tickets)</div>
              <div className="dist-bars">
                {tiers.map((t) => (
                  <div key={t.key} className="dist-row">
                    <span className="dist-key" style={{ color: t.color }}>{t.key}</span>
                    <div className="dist-track">
                      <div className="dist-fill" style={{ width: `${kpis.tickets ? (dist[t.key] / kpis.tickets) * 100 : 0}%`, background: t.color }} />
                    </div>
                    <span className="dist-count">{dist[t.key] || 0}</span>
                  </div>
                ))}
                {dist.none > 0 && (
                  <div className="dist-row">
                    <span className="dist-key muted">–</span>
                    <div className="dist-track"><div className="dist-fill" style={{ width: `${kpis.tickets ? (dist.none / kpis.tickets) * 100 : 0}%`, background: '#94a3b8' }} /></div>
                    <span className="dist-count">{dist.none}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          {qualityDaily.length >= 2 && (
            <div className="kpi-quality-chart">
              <TimeChart title="Lead-Qualität pro Tag" height={200}
                formatY={(v) => `${Math.round(v)} %`}
                series={[{ key: 'q', label: 'Qualifizierte Leads', color: GREEN, data: qualityDaily.map((d) => ({ date: d.date, value: d.value == null ? null : d.value * 100 })) }]} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
