import React, { useState, useMemo } from 'react';
import { fmtDate } from '../lib.js';
import { hasTickets, hasQuality, hasFunnels, PROJECT } from '../config.js';
import QualityBadge from './QualityBadge.jsx';

const QUESTION_LABELS = PROJECT.sheet?.questionnaireLabels || {};

/** Lesbares Label fuer ein Antwortfeld; faellt auf den Feldnamen zurueck. */
const answerLabel = (k) => QUESTION_LABELS[k] || k;

const COLS = [
  { key: 'name', label: 'Name', sort: (l) => l.name },
  { key: 'wonAt', label: 'Lead am', sort: (l) => l.wonAt || '' },
  ...(hasFunnels ? [{ key: 'funnel', label: 'Funnel', sort: (l) => l.funnel || '' }] : []),
  { key: 'sourceType', label: 'Quelle', sort: (l) => l.sourceType },
  { key: 'campaign', label: 'Kampagne', sort: (l) => l.campaign },
  { key: 'adset', label: 'Anzeigengruppe', sort: (l) => l.adset },
  { key: 'creative', label: 'Creative', sort: (l) => l.creative },
  { key: 'placement', label: 'Placement', sort: (l) => l.placement },
  ...(hasTickets ? [{ key: 'ticket', label: 'Ticket', sort: (l) => (l.hasTicket ? 1 : 0) }] : []),
  ...(hasQuality ? [{ key: 'quality', label: 'Qualität', sort: (l) => l.quality?.score ?? -1 }] : []),
];

/** Beschriftung der Quelle: Meta / Google / Organisch statt nur Ads/Organisch. */
function sourceText(l) {
  if (l.sourceLabel) return l.sourceLabel;
  if (l.sourceType === 'paid') return 'Ads';
  if (l.sourceType === 'other-paid') return 'Bezahlt';
  return 'Organisch';
}

function exportCsv(leads) {
  // Spalten folgen den aktiven Features, damit der Export keine leeren
  // Ticket-/Fragebogen-Spalten enthaelt.
  const answerKeys = hasQuality
    ? [...new Set(leads.flatMap((l) => Object.keys(l.answers || {})))]
    : [];
  const cols = [
    ['Name', (l) => l.name],
    ['E-Mail', (l) => l.email],
    ['Telefon', (l) => l.phone],
    ['Lead am', (l) => l.wonAt],
    ...(hasFunnels ? [['Funnel', (l) => l.funnel || '']] : []),
    ['Quelle', (l) => sourceText(l)],
    ['Quellen-Typ', (l) => l.sourceType],
    ['Kampagne', (l) => l.campaign],
    ['Anzeigengruppe', (l) => l.adset],
    ['Creative', (l) => l.creative],
    ['Placement', (l) => l.placement],
    ...(hasTickets ? [['Ticket am', (l) => l.ticketAt || '']] : []),
    ...(hasQuality ? [['Quality-Score', (l) => l.quality?.score ?? ''], ['Tier', (l) => l.quality?.tier ?? '']] : []),
    ...answerKeys.map((k) => [answerLabel(k), (l) => l.answers?.[k] ?? '']),
  ];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = leads.map((l) => cols.map(([, get]) => esc(get(l))).join(';'));
  const csv = [cols.map(([h]) => esc(h)).join(';'), ...lines].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = String(PROJECT.name || 'leads').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  a.href = url;
  a.download = `${slug}-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LeadsTable({ leads, tiers }) {
  const [sort, setSort] = useState({ col: 'wonAt', dir: 'desc' });
  const [open, setOpen] = useState(null);

  const sorted = useMemo(() => {
    const def = COLS.find((c) => c.key === sort.col) || COLS[1];
    const arr = [...leads].sort((a, b) => {
      const av = def.sort(a);
      const bv = def.sort(b);
      const cmp = typeof av === 'string' ? av.localeCompare(bv, 'de') : av - bv;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [leads, sort]);

  const onSort = (col) => setSort((s) => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));

  return (
    <div>
      <div className="table-toolbar">
        <span>{leads.length} Leads</span>
        <button className="ghost-btn" onClick={() => exportCsv(sorted)}>
          <svg className="btn-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
          CSV exportieren
        </button>
      </div>
      <div className="table-wrap">
        <table className="data-table leads">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className={sort.col === c.key ? 'sorted' : ''} onClick={() => onSort(c.key)}>
                  {c.label}{sort.col === c.key && <span className="sort-arrow">{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((l, i) => {
              const isOpen = open === l.email + i;
              return (
              <React.Fragment key={l.email + i}>
                <tr className={`clickable ${isOpen ? 'expanded' : ''}`} onClick={() => setOpen(isOpen ? null : l.email + i)}>
                  <td className="left lead-main" data-label="Lead">
                    <div className="lead-name">{l.name}</div>
                    <div className="lead-email">{l.email}</div>
                  </td>
                  <td className="nowrap sec" data-label="Lead am">{fmtDate(l.wonAt)}</td>
                  {hasFunnels && <td className="sec" data-label="Funnel">{l.funnel ? <span className="pill funnel">{l.funnel}</span> : <span className="muted">–</span>}</td>}
                  <td data-label="Quelle"><span className={`pill ${l.sourceType}`}>{sourceText(l)}</span></td>
                  <td className="trunc sec" data-label="Kampagne" title={l.campaign}>{l.campaign}</td>
                  <td className="trunc sec" data-label="Anzeigengruppe" title={l.adset}>{l.adset}</td>
                  <td className="trunc sec" data-label="Creative" title={l.creative}>{l.creative}</td>
                  <td className="trunc sec" data-label="Placement" title={l.placement}>{l.placement}</td>
                  {hasTickets && <td className="sec" data-label="Ticket">{l.hasTicket ? <span className="pill vip">Ticket</span> : <span className="muted">–</span>}</td>}
                  {hasQuality && <td data-label="Qualität"><QualityBadge quality={l.quality} tiers={tiers} /></td>}
                </tr>
                {open === l.email + i && l.answers && (
                  <tr className="detail-row">
                    <td colSpan={COLS.length}>
                      <div className="answers">
                        {Object.entries(l.answers)
                          .filter(([, v]) => v)
                          .map(([k, v]) => (
                            <Answer key={k} label={answerLabel(k)} value={v} wide={String(v).length > 60} />
                          ))}
                        <Answer label="Telefon" value={l.phone} />
                        {l.quality && (
                          <div className="answer wide">
                            <div className="answer-label">Quality-Breakdown</div>
                            <div className="breakdown">
                              {Object.entries(l.quality.breakdown).map(([k, v]) => (
                                <span key={k} className="bd-item">{k}: <strong>{v ?? '–'}</strong></span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
              );
            })}
            {sorted.length === 0 && <tr><td colSpan={COLS.length} className="empty">Keine Leads für die aktuelle Auswahl.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Answer({ label, value, wide }) {
  return (
    <div className={`answer ${wide ? 'wide' : ''}`}>
      <div className="answer-label">{label}</div>
      <div className="answer-value">{value || <span className="muted">–</span>}</div>
    </div>
  );
}
