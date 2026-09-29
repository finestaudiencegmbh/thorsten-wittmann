import React, { useMemo, useState } from 'react';
import {
  fmtInt, fmtPct, surveyTiers, surveyQualityByDay, aggregateSurveys, answerDistribution, fmtDate,
} from '../lib.js';
import { PROJECT } from '../config.js';
import TimeChart from './TimeChart.jsx';

const QUESTION_LABELS = PROJECT.sheet?.questionnaireLabels || {};
const label = (k) => QUESTION_LABELS[k] || k;

/** Waagerechter Tier-Balken: eine Zeile, Anteile proportional. */
function TierBar({ counts, total }) {
  if (!total) return <span className="muted">–</span>;
  return (
    <div className="tierbar" role="img" aria-label={counts.map((c) => `${c.key}: ${c.n}`).join(', ')}>
      {counts.filter((c) => c.n > 0).map((c) => (
        <span
          key={c.key}
          className="tierbar-seg"
          style={{ width: `${(c.n / total) * 100}%`, background: c.color }}
          title={`${c.key}: ${c.n} von ${total}`}
        />
      ))}
    </div>
  );
}

function Card({ label: lbl, value, sub, accent }) {
  return (
    <div className="kpi-card">
      <span className="kpi-accent" style={accent ? { background: accent, color: accent } : undefined} />
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{lbl}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

const DIMS = [
  { key: 'campaign', label: 'Kampagne' },
  { key: 'adset', label: 'Anzeigengruppe' },
  { key: 'creative', label: 'Creative' },
];

export default function QualityView({ surveys, tiers, leads = [] }) {
  const [dim, setDim] = useState('campaign');
  const [tierFilter, setTierFilter] = useState('');
  const [open, setOpen] = useState(null);

  const shown = useMemo(
    () => (tierFilter ? surveys.filter((s) => s.quality?.tier === tierFilter) : surveys),
    [surveys, tierFilter],
  );

  const dist = useMemo(() => surveyTiers(surveys, tiers), [surveys, tiers]);
  const rows = useMemo(() => aggregateSurveys(shown, dim, tiers), [shown, dim, tiers]);
  const daily = useMemo(() => surveyQualityByDay(surveys), [surveys]);

  const total = surveys.length;
  const nA = dist.A || 0;
  const nAB = (dist.A || 0) + (dist.B || 0);
  const tierColor = (k) => tiers.find((t) => t.key === k)?.color || '#888';

  // Wie viele Leads aus den Umfrage-Kampagnen haben tatsächlich geantwortet?
  const campaigns = useMemo(() => new Set(surveys.map((s) => s.campaign)), [surveys]);
  const leadsInCampaigns = useMemo(
    () => leads.filter((l) => campaigns.has(l.campaign)).length,
    [leads, campaigns],
  );

  if (!total) {
    return (
      <section className="panel">
        <div className="panel-head"><div><h2>Lead-Qualität</h2></div></div>
        <div className="empty-note">
          Noch keine Umfrage-Antworten im gewählten Zeitraum. Sobald Antworten im
          Sheet stehen, erscheinen hier Tier-Verteilung und Auswertung je Kampagne.
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="kpi-section">
        <div className="kpi-section-head">
          <span className="kpi-dot" style={{ background: tierColor('A') }} />Lead-Qualität
        </div>
        <div className="kpi-grid">
          <Card label="Umfrage-Antworten" value={fmtInt(total)} sub={leadsInCampaigns ? `Rücklauf ${fmtPct(total / leadsInCampaigns)} von ${fmtInt(leadsInCampaigns)} Leads` : 'im gewählten Zeitraum'} accent={tierColor('A')} />
          <Card label="A-Leads" value={fmtInt(nA)} sub={`${fmtPct(total ? nA / total : null)} aller Antworten`} accent={tierColor('A')} />
          <Card label="A + B" value={fmtInt(nAB)} sub={`${fmtPct(total ? nAB / total : null)} qualifiziert`} accent={tierColor('B')} />
          <div className="kpi-card kpi-dist">
            <div className="kpi-label">Verteilung</div>
            <div className="dist-bars">
              {tiers.map((t) => (
                <div key={t.key} className="dist-row">
                  <span className="dist-key" style={{ color: t.color }}>{t.key}</span>
                  <div className="dist-track">
                    <div className="dist-fill" style={{ width: `${total ? (dist[t.key] / total) * 100 : 0}%`, background: t.color }} />
                  </div>
                  <span className="dist-count">{dist[t.key] || 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {daily.length >= 2 && (
        <section className="panel">
          <div className="panel-head"><div><h2>Qualität im Verlauf</h2><span className="panel-sub">Anteil A+B je Tag</span></div></div>
          <TimeChart
            title="Anteil A + B pro Tag"
            height={200}
            formatY={(v) => `${Math.round(v)} %`}
            tooltipExtra={(d) => {
              const e = daily.find((x) => x.date === d);
              return e ? [{ key: 'n', label: 'Antworten', value: fmtInt(e.total), color: '#5ec8d8' }] : [];
            }}
            series={[{ key: 'ab', label: 'A + B', color: tierColor('B'), data: daily.map((d) => ({ date: d.date, value: d.value == null ? null : d.value * 100 })) }]}
          />
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <div><h2>Qualität je Ebene</h2><span className="panel-sub">Wo kommen die guten Leads her?</span></div>
          <div className="tabs">
            {DIMS.map((d) => (
              <button key={d.key} className={`tab ${dim === d.key ? 'active' : ''}`} onClick={() => setDim(d.key)}>{d.label}</button>
            ))}
          </div>
        </div>
        <div className="filters-row tier-row">
          <span className="tier-label">Nur Tier:</span>
          {tiers.map((t) => (
            <button
              key={t.key}
              className={`tier-chip ${tierFilter === t.key ? 'active' : ''}`}
              style={tierFilter === t.key ? { background: t.color, borderColor: t.color } : { borderColor: t.color, color: t.color }}
              onClick={() => setTierFilter(tierFilter === t.key ? '' : t.key)}
            >{t.key}</button>
          ))}
          {tierFilter && <button className="tier-chip" onClick={() => setTierFilter('')}>alle</button>}
        </div>
        <div className="table-wrap">
          <table className="table quality-table">
            <thead>
              <tr>
                <th className="left">{DIMS.find((d) => d.key === dim)?.label}</th>
                <th>Antworten</th>
                <th>A</th>
                <th>A-Quote</th>
                <th>A+B</th>
                <th>Ø Score</th>
                <th className="left">Verteilung</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="left trunc" title={r.key}>{r.key}</td>
                  <td>{fmtInt(r.total)}</td>
                  <td>{fmtInt(r.tiers.A || 0)}</td>
                  <td>{fmtPct(r.aRate)}</td>
                  <td>{fmtPct(r.abRate)}</td>
                  <td>{r.avgScore ?? '–'}</td>
                  <td className="left"><TierBar counts={r.counts} total={r.total} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Antworten im Überblick</h2><span className="panel-sub">Verteilung je Frage</span></div></div>
        <div className="answer-grid">
          {['invest', 'wealth', 'occupation', 'age', 'investments'].map((field) => {
            const d = answerDistribution(shown, field);
            if (!d.length) return null;
            return (
              <div key={field} className="answer-block">
                <div className="answer-block-title">{label(field)}</div>
                {d.slice(0, 8).map((x) => (
                  <div key={x.key} className="dist-row">
                    <span className="dist-answer trunc" title={x.key}>{x.key}</span>
                    <div className="dist-track"><div className="dist-fill" style={{ width: `${x.share * 100}%` }} /></div>
                    <span className="dist-count">{x.n}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div><h2>Antworten einzeln</h2><span className="panel-sub">{fmtInt(shown.length)} Einträge · Zeile anklicken für Details</span></div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="left">Name</th>
                <th className="left">Tier</th>
                <th className="left">Investitionssumme</th>
                <th className="left">Nettovermögen</th>
                <th className="left">Beruf</th>
                <th className="left">Kampagne</th>
                <th>Eingetragen</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 300).map((s, i) => (
                <React.Fragment key={`${s.email}${i}`}>
                  <tr className="row-click" onClick={() => setOpen(open === i ? null : i)}>
                    <td className="left lead-main">
                      <div className="lead-name">{s.name}</div>
                      <div className="lead-email">{s.email}</div>
                    </td>
                    <td className="left">
                      <span className="quality-badge" style={{ background: `${tierColor(s.quality?.tier)}22`, color: tierColor(s.quality?.tier), borderColor: `${tierColor(s.quality?.tier)}55` }}>
                        <strong>{s.quality?.score ?? '–'}</strong>
                        <span className="quality-tier">{s.quality?.tier ?? '–'}</span>
                      </span>
                    </td>
                    <td className="left sec">{s.answers?.invest || '–'}</td>
                    <td className="left sec">{s.answers?.wealth || '–'}</td>
                    <td className="left sec">{s.answers?.occupation || '–'}</td>
                    <td className="left trunc sec" title={s.campaign}>{s.campaign}</td>
                    <td className="nowrap sec">{fmtDate(s.at)}</td>
                  </tr>
                  {open === i && (
                    <tr className="detail-row">
                      <td colSpan={7}>
                        <div className="answers">
                          {Object.entries(s.answers || {})
                            .filter(([, v]) => v)
                            .map(([k, v]) => (
                              <Answer key={k} label={label(k)} value={v} wide={String(v).length > 60} />
                            ))}
                          <Answer label="Telefon" value={s.phone} />
                          <Answer label="Anzeigengruppe" value={s.adset} wide />
                          <Answer label="Creative" value={s.creative} wide />
                          <Answer label="Im Lead-Tab gefunden" value={s.matchedLead ? 'ja' : 'nein'} />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Answer({ label: lbl, value, wide }) {
  if (!value) return null;
  return (
    <div className={`answer ${wide ? 'wide' : ''}`}>
      <div className="answer-label">{lbl}</div>
      <div className="answer-value">{value}</div>
    </div>
  );
}
