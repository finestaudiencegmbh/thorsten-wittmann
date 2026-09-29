import React, { useEffect, useMemo, useState } from 'react';
import { fetchData } from './api.js';
import { applyFilters, aggregate, computeKpis, tierDistribution, leadsByDay, leadsByTime, cplByDay, qualityByDay, DIMENSIONS, fmtDate } from './lib.js';
import Kpis from './components/Kpis.jsx';
import Filters from './components/Filters.jsx';
import BreakdownTable from './components/BreakdownTable.jsx';
import LeadsTable from './components/LeadsTable.jsx';
import TimeChart from './components/TimeChart.jsx';
import IntradayChart from './components/IntradayChart.jsx';
import CampaignCards from './components/CampaignCards.jsx';
import DateRangePicker from './components/DateRangePicker.jsx';
import SourcesView from './components/SourcesView.jsx';
import QualityView from './components/QualityView.jsx';
import ChatBot from './components/ChatBot.jsx';
import { fmtEur, fmtInt } from './lib.js';
import { PROJECT, BRANDING, FUNNELS, TRAFFIC_SOURCES, hasFunnels, hasTickets, hasQuality, applyBranding } from './config.js';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
  { key: 'campaigns', label: 'Kampagnen', icon: 'M3 3v18h18M7 15l4-4 3 3 5-6' },
  { key: 'leads', label: 'Leadliste', icon: 'M3 5h18M3 12h18M3 19h18' },
  ...(hasQuality ? [{ key: 'quality', label: 'Leadqualität', icon: 'M12 2l2.9 6.3 6.8.7-5.1 4.6 1.5 6.7L12 16.9 5.9 20.3l1.5-6.7L2.3 9l6.8-.7L12 2z' }] : []),
  { key: 'sources', label: 'Quellen', icon: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 0v10l7 3' },
];

const EMPTY_FILTERS = {
  search: '', sourceType: 'all', campaign: '', adset: '', creative: '', placement: '',
  income: '', realEstate: '', employment: '', from: '', to: '', onlyTickets: false, tiers: [],
  funnel: '',
};

// Beschriftung der Quellen-Aufteilung auf den Funnel-Reitern.
const SPEND_SOURCE_LABEL = TRAFFIC_SOURCES.find((s) => s.hasSpend)?.label || 'Ads';
const OTHER_PAID_LABEL = TRAFFIC_SOURCES.filter((s) => s.paid && !s.hasSpend).map((s) => s.label).join('/');

// Hauptdashboard = alle Funnels zusammen, danach je ein Unterreiter.
const FUNNEL_TABS = hasFunnels
  ? [{ id: '', label: 'Gesamt' }, ...FUNNELS.map((f) => ({ id: f.id, label: f.label || f.id }))]
  : [];

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [range, setRange] = useState({ from: '', to: '' });
  const [tab, setTab] = useState('campaign');
  const [view, setView] = useState('dashboard');
  const [funnel, setFunnel] = useState('');

  // Akzentfarbe/Flaechenton aus project.config.json in die CSS-Variablen.
  useEffect(() => { applyBranding(BRANDING); }, []);
  useEffect(() => { document.title = `${PROJECT.name || 'Dashboard'} · ${PROJECT.subtitle || 'Dashboard'}`; }, []);

  const load = async (refresh = false, r = range) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchData({ refresh, from: r.from, to: r.to }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(false); }, []);

  const applyRange = (r) => {
    setRange(r);
    // Zeitraum steuert Server (FB) UND die clientseitige Lead-Filterung
    setFilters((f) => ({ ...f, from: r.from, to: r.to }));
    load(false, r);
  };

  const tiers = data?.scoring?.tiers || [];
  // Bei aktivem Funnel die je Funnel vorberechnete Meta-Auswertung nutzen -
  // sonst waeren Spend und Hierarchie die des gesamten Kontos.
  const fb = useMemo(() => {
    const base = data?.fb || null;
    if (!base || !funnel) return base;
    const fv = base.funnels?.[funnel];
    return fv ? { ...base, ...fv } : base;
  }, [data, funnel]);
  const hasFb = Boolean(fb?.byDim);
  // Alle aktiven Filter AUSSER dem Funnel. Basis fuer die Zahlen auf den
  // Funnel-Reitern: jeder Reiter zeigt seinen eigenen Stand, aber immer im
  // gewaehlten Zeitraum. (Vorher wurde hier der ungefilterte Gesamtbestand
  // gezaehlt - die Reiter widersprachen dadurch den Charts darunter.)
  const filteredNoFunnel = useMemo(
    () => (data ? applyFilters(data.leads, { ...filters, funnel: '' }) : []),
    [data, filters],
  );
  const filtered = useMemo(
    () => (funnel ? filteredNoFunnel.filter((l) => l.funnel === funnel) : filteredNoFunnel),
    [filteredNoFunnel, funnel],
  );
  const kpis = useMemo(() => (data ? computeKpis(filtered, data.overviewByAdset, fb) : null), [data, filtered, fb]);
  const dist = useMemo(() => (data ? tierDistribution(filtered, tiers) : {}), [data, filtered, tiers]);
  // Stunden-Raster, wenn der gewählte Zeitraum genau EIN Tag ist (0–24 Uhr).
  const hourlyDay = (range.from && range.to && range.from === range.to) ? range.from : null;
  const leadDaily = useMemo(() => (data ? leadsByTime(filtered, hourlyDay) : []), [data, filtered, hourlyDay]);
  const cplDaily = useMemo(() => ((hasFb && fb.daily) ? cplByDay(fb.daily.spend, filtered) : []), [hasFb, fb, filtered]);
  const qualityDaily = useMemo(() => (data ? qualityByDay(filtered) : []), [data, filtered]);

  // Umfrage-Antworten: gleiche Zeitraum-/Funnel-Logik wie die Leads, damit der
  // Qualitaets-Reiter zur uebrigen Ansicht passt.
  const surveysFiltered = useMemo(() => {
    const all = data?.surveys || [];
    return all.filter((s) => {
      if (funnel && s.funnel !== funnel) return false;
      const day = (s.at || '').slice(0, 10);
      if (filters.from && (!day || day < filters.from)) return false;
      if (filters.to && (!day || day > filters.to)) return false;
      return true;
    });
  }, [data, funnel, filters.from, filters.to]);

  // Aufteilung nach Quelle je Tag - erscheint in der Hover-Box des Verlaufs.
  const splitByDay = useMemo(() => {
    const m = new Map();
    for (const d of leadDaily) m.set(d.date, d);
    return (date) => {
      const d = m.get(date);
      if (!d) return [];
      return [
        { key: 'paid', label: SPEND_SOURCE_LABEL, value: fmtInt(d.paid || 0), color: 'var(--accent)' },
        ...(OTHER_PAID_LABEL ? [{ key: 'other', label: OTHER_PAID_LABEL, value: fmtInt(d.otherPaid || 0), color: '#a78bfa' }] : []),
        { key: 'organic', label: 'Organisch', value: fmtInt(d.organic || 0), color: '#5ec8d8' },
      ];
    };
  }, [leadDaily]);

  // Drill-Pfad NUR für "Performance nach Ebene" – getrennt von den globalen
  // Filtern. Klick = reinzoomen, ohne dauerhaften globalen Filter zu setzen.
  const [drill, setDrill] = useState({ campaign: '', adset: '', creative: '' });
  const [orgDrill, setOrgDrill] = useState(''); // organische Kampagne, in die reingezoomt wurde

  // Leads zusätzlich nach dem Drill-Pfad einschränken (lokal, nicht global)
  const drillLeads = useMemo(() => {
    if (!data) return [];
    const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    return filtered.filter((l) =>
      (!drill.campaign || norm(l.campaign) === norm(drill.campaign)) &&
      (!drill.adset || norm(l.adset) === norm(drill.adset)) &&
      (!drill.creative || norm(l.creative) === norm(drill.creative))
    );
  }, [data, filtered, drill]);

  const UNATTRIB = '(Paid · nicht zuordenbar)';
  const ORGANIC = '(organisch)';

  // Zwei getrennte Container: bezahlt (Meta) und organisch. Nicht zuordenbare
  // Paid-Leads werden ausgeblendet (verwirren in der Aufschlüsselung).
  const paidRows = useMemo(() => {
    if (!data) return [];
    const leads = drillLeads.filter((l) => l.sourceType === 'paid' && l.campaign !== UNATTRIB);
    return aggregate(leads, tab, data.overviewByAdset, fb, drill);
  }, [data, drillLeads, tab, fb, drill]);

  const organicRows = useMemo(() => {
    if (!data) return [];
    // Organisch zweistufig: organicCampaign (ManyChat, Bio, …) -> organicAdset
    // (Live Automation, Facebook Bio, …). Keine Meta-Daten (addFbRows:false).
    const base = filtered.filter((l) => l.sourceType !== 'paid');
    const leads = orgDrill
      ? base.filter((l) => (l.organicCampaign || '(direkt)') === orgDrill)
      : base;
    const dim = orgDrill ? 'organicAdset' : 'organicCampaign';
    const rows = aggregate(
      leads.map((l) => ({ ...l, organicCampaign: l.organicCampaign || '(direkt)', organicAdset: l.organicAdset || '(direkt)' })),
      dim, data.overviewByAdset, fb, {}, { addFbRows: false }
    );
    return rows;
  }, [data, filtered, fb, orgDrill]);

  // Drill-Down: Klick auf eine Zeile zoomt eine Ebene tiefer (lokaler Pfad).
  const DRILL_ORDER = DIMENSIONS.map((d) => d.key);
  const selectDim = (key) => {
    if (tab === DRILL_ORDER[DRILL_ORDER.length - 1]) return; // unterste Ebene
    setDrill((d) => ({ ...d, [tab]: key }));
    const idx = DRILL_ORDER.indexOf(tab);
    if (idx >= 0 && idx < DRILL_ORDER.length - 1) setTab(DRILL_ORDER[idx + 1]);
  };

  if (loading && !data) return <div className="loader">Lade Daten…</div>;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          {/* Logo nur, wenn branding.logo gesetzt ist ("" = ohne Bild). */}
          {BRANDING.logo && <img className="brand-logo" src={BRANDING.logo} alt={PROJECT.name || ''} width="40" height="40" />}
          <div className="brand-text">
            <div className="brand-title">{PROJECT.name}</div>
            {PROJECT.subtitle && <div className="brand-sub">{PROJECT.subtitle}</div>}
          </div>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <button key={n.key} className={`nav-item ${view === n.key ? 'active' : ''}`} onClick={() => setView(n.key)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={n.icon} /></svg>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          {data && <span className="updated">Stand: {fmtDate(data.fetchedAt)}</span>}
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="topbar-title">
            {BRANDING.logo && <img className="topbar-logo" src={BRANDING.logo} alt="" width="34" height="34" />}
            <div>
              <h1>{NAV.find((n) => n.key === view)?.label}</h1>
              <p className="subtitle">{PROJECT.subtitle}</p>
            </div>
            <div className="topbar-badges">
              {data?.source === 'demo' && <span className="demo-badge" title="Es werden synthetische Beispieldaten angezeigt.">DEMO</span>}
              {hasFb && <span className="fb-badge" title={`Facebook-Daten via ${fb.provider === 'meta' ? 'Meta' : 'Supermetrics'} · ${fb.rows} Zeilen`}>FB live</span>}
            </div>
          </div>
          <div className="topbar-right">
            <DateRangePicker from={range.from} to={range.to} onApply={applyRange} />
            <button className="refresh-btn" onClick={() => load(true)} disabled={loading}>
              <svg className={`btn-icon ${loading ? 'spin' : ''}`} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
              </svg>
              {loading ? 'Lädt…' : 'Aktualisieren'}
            </button>
          </div>
        </header>

        {/* Funnel-Unterreiter: "Gesamt" summiert alle Funnels, danach je Funnel
            eine gefilterte Sicht (Leads ueber den Sheet-Tab, Meta-Spend ueber
            den Kampagnennamen). */}
        {FUNNEL_TABS.length > 1 && (
          <div className="funnel-tabs" role="tablist" aria-label="Funnel">
            {FUNNEL_TABS.map((f) => {
              const set = f.id ? filteredNoFunnel.filter((l) => l.funnel === f.id) : filteredNoFunnel;
              return (
                <button
                  key={f.id || 'all'}
                  role="tab"
                  aria-selected={funnel === f.id}
                  className={`funnel-tab ${funnel === f.id ? 'active' : ''}`}
                  onClick={() => setFunnel(f.id)}
                >
                  {f.label}
                  <span className="funnel-count">{fmtInt(set.length)}</span>
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <div className="error-banner">
            <strong>Fehler:</strong> {error}
            <div className="hint">Prüfe Service-Account, SPREADSHEET_ID und Sheet-Freigabe (siehe README).</div>
          </div>
        )}
        {fb?.configured && fb?.error && (
          <div className="error-banner warn">
            <strong>Facebook{fb.provider === 'meta' ? ' (Meta API)' : ' (Supermetrics)'}:</strong> {fb.error}
            <div className="hint">{fb.provider === 'meta'
              ? 'Das Dashboard funktioniert weiter. Prüfe META_ACCESS_TOKEN (ads_read, nicht abgelaufen) und META_AD_ACCOUNT_ID.'
              : 'Das Dashboard funktioniert weiter. Prüfe SUPERMETRICS_API_KEY und die Query.'}</div>
          </div>
        )}
        {fb?.configured && !fb?.error && fb?.accountErrors?.length > 0 && (
          <div className="error-banner warn">
            <strong>Facebook (Meta API):</strong> Nur {fb.accounts?.length ?? 0} von {fb.accountsRequested ?? '?'} Werbekonten geladen – die Zahlen sind unvollständig.
            <div className="hint">Nicht geladen: {fb.accountErrors.join(' · ')}. Meist transient (Rate-Limit/Netzwerk nach Meta-Störung) – in 1–2 Min nochmal „Aktualisieren".</div>
          </div>
        )}

        {data && (
          <>
            {/* Die Lead-Filter greifen nicht auf die Umfrage-Datensaetze -
                im Qualitaets-Reiter blenden wir sie deshalb aus, statt eine
                Leiste zu zeigen, die dort nichts bewirkt. Zeitraum und Funnel
                gelten weiterhin, die kommen von oben. */}
            {view !== 'quality' && (
              <Filters leads={data.leads} filters={filters} setFilters={setFilters} tiers={tiers} onReset={() => setFilters({ ...EMPTY_FILTERS, from: range.from, to: range.to })} />
            )}

            {view === 'dashboard' && (
              <>
                {/* Graphen oben: Leads & Tickets breit, darunter Spend + CPL nebeneinander */}
                <section className="panel">
                  <div className="panel-head"><div><h2>Verlauf</h2><span className="panel-sub">{hourlyDay ? `Leads${hasTickets ? '/Tickets' : ''} im Tagesverlauf (0–24 Uhr, minutengenau) · Maus zum Anzeigen` : `Leads${hasTickets ? '/Tickets' : ''} (Sheet) & Ad-Spend/CPL (Facebook) pro Tag · Maus zum Anzeigen`}</span></div></div>
                  <div className="charts-stack">
                    {hourlyDay ? (
                      <>
                        <IntradayChart title={hasTickets ? 'Leads & Tickets im Tagesverlauf' : 'Leads im Tagesverlauf'} formatY={(v) => fmtInt(Math.round(v))}
                          series={[
                            { key: 'leads', label: 'Leads', color: '#5ec8d8', data: leadDaily.map((d) => ({ date: d.date, value: d.leads })) },
                            ...(hasTickets ? [{ key: 'tickets', label: 'Tickets', color: '#6fcf97', data: leadDaily.map((d) => ({ date: d.date, value: d.tickets })) }] : []),
                          ]} />
                        <div className="info-note">Ad-Spend &amp; CPL sind aktuell nur pro Tag verfügbar – die Stundenwerte dafür folgen. Leads siehst du oben minutengenau.</div>
                      </>
                    ) : (
                      <>
                        <TimeChart title={hasTickets ? 'Leads & Tickets pro Tag' : 'Leads pro Tag'} formatY={(v) => fmtInt(Math.round(v))}
                          tooltipExtra={splitByDay}
                          series={[
                            { key: 'leads', label: 'Leads', color: '#5ec8d8', data: leadDaily.map((d) => ({ date: d.date, value: d.leads })) },
                            ...(hasTickets ? [{ key: 'tickets', label: 'Tickets', color: '#6fcf97', data: leadDaily.map((d) => ({ date: d.date, value: d.tickets })) }] : []),
                          ]} />
                        <div className="charts-grid">
                          <TimeChart title="Ad-Spend pro Tag" formatY={(v) => fmtEur(Math.round(v))}
                            series={[{ key: 'spend', label: 'Ad-Spend', color: 'var(--accent)', data: (hasFb && fb.daily ? fb.daily.spend : []).map((d) => ({ date: d.date, value: d.spend })) }]} />
                          <TimeChart title="CPL pro Tag" formatY={(v) => fmtEur(Math.round(v))}
                            series={[{ key: 'cpl', label: 'CPL (Ads)', color: '#a78bfa', data: cplDaily.map((d) => ({ date: d.date, value: d.value })) }]} />
                        </div>
                      </>
                    )}
                  </div>
                </section>

                {/* KPI-Boxen darunter */}
                <Kpis kpis={kpis} dist={dist} tiers={tiers} qualityDaily={qualityDaily} />

                <section className="panel">
                  <div className="panel-head"><div><h2>Bezahlt · Meta</h2><span className="panel-sub">Performance nach Kampagne, Anzeigengruppe, Creative und Placement</span></div></div>
                  <div className="tabs-row">
                    <div className="tabs">
                      {DIMENSIONS.map((d) => (
                        <button key={d.key} className={`tab ${tab === d.key ? 'active' : ''}`} onClick={() => setTab(d.key)}>{d.label}</button>
                      ))}
                    </div>
                    <span className="tabs-hint">Zeile anklicken = eine Ebene tiefer</span>
                  </div>
                  {DIMENSIONS.some((d) => drill[d.key]) && (
                    <div className="drill-crumbs">
                      <span className="crumb-label">Aufgeschlüsselt nach:</span>
                      {DIMENSIONS.filter((d) => drill[d.key]).map((d) => (
                        <span key={d.key} className="crumb">
                          <span className="crumb-dim">{d.label}:</span> {drill[d.key].length > 38 ? drill[d.key].slice(0, 35) + '…' : drill[d.key]}
                          <button className="crumb-x" title="Diese Ebene verlassen" onClick={() => { setDrill((dd) => ({ ...dd, [d.key]: '' })); setTab(d.key); }}>×</button>
                        </span>
                      ))}
                      <button className="crumb-clear" onClick={() => { setDrill({ campaign: '', adset: '', creative: '' }); setTab('campaign'); }}>zurücksetzen</button>
                    </div>
                  )}
                  {!hasFb && (tab === 'creative' || tab === 'placement') && (
                    <div className="info-note">Adspend ist je Anzeigengruppe im Sheet hinterlegt – auf Creative-/Placement-Ebene über die Facebook-Anbindung.</div>
                  )}
                  <BreakdownTable rows={paidRows} dimLabel={DIMENSIONS.find((d) => d.key === tab).label} onSelect={selectDim} tiers={tiers} />
                </section>

                {organicRows.length > 0 && (
                  <section className="panel">
                    <div className="panel-head"><div><h2>Organisch</h2><span className="panel-sub">Leads ohne Ad-Kosten · ManyChat-Flows, Bios, Direkt …</span></div></div>
                    {orgDrill && (
                      <div className="drill-crumbs">
                        <span className="crumb-label">Aufgeschlüsselt nach:</span>
                        <span className="crumb"><span className="crumb-dim">Quelle:</span> {orgDrill}
                          <button className="crumb-x" title="zurück" onClick={() => setOrgDrill('')}>×</button>
                        </span>
                      </div>
                    )}
                    <BreakdownTable rows={organicRows} dimLabel={orgDrill ? 'Unterquelle' : 'Quelle'} onSelect={orgDrill ? undefined : (k) => setOrgDrill(k)} tiers={tiers} showActiveToggle={false} />
                  </section>
                )}
              </>
            )}

            {view === 'campaigns' && (
              hasFb && fb.hierarchy ? (
                <section className="panel">
                  <div className="panel-head"><div><h2>Kampagnen-Aufschlüsselung</h2><span className="panel-sub">Kampagne → Anzeigengruppe → Creative · Facebook-Kennzahlen + Lead-Attribution</span></div></div>
                  <CampaignCards hierarchy={fb.hierarchy} dailyByEntity={fb.dailyByEntity} intradayByEntity={fb.intradayByEntity} intradayDay={fb.intradayDay} accounts={fb.accounts} />
                </section>
              ) : (
                <section className="panel">
                  <div className="panel-head"><div><h2>Kampagnen-Aufschlüsselung</h2></div></div>
                  <div className="info-note">Keine Facebook-Daten verfügbar. Prüfe die Meta-Anbindung (META_ACCESS_TOKEN, META_AD_ACCOUNT_ID).</div>
                </section>
              )
            )}

            {view === 'leads' && (
              <section className="panel">
                <div className="panel-head"><div><h2>Alle Leads</h2><span className="panel-sub">Zeile anklicken für Details &amp; Fragebogen-Antworten</span></div></div>
                <LeadsTable leads={filtered} tiers={tiers} />
              </section>
            )}

            {view === 'quality' && hasQuality && (
              <QualityView surveys={surveysFiltered} tiers={tiers} leads={filtered} />
            )}

            {view === 'sources' && <SourcesView leads={filtered} />}

            <footer className="footer">
              {[
                `${data.counts.leads} Leads`,
                `${data.counts.paidLeads} bezahlt`,
                data.counts.otherPaidLeads ? `${data.counts.otherPaidLeads} ohne Kostendaten` : null,
                hasTickets ? `${data.counts.tickets} Tickets` : null,
                hasQuality ? `${data.counts.scored} bewertet` : null,
              ].filter(Boolean).join(' · ')}
              {' · '}Quelle: {data.source === 'google' ? 'Google Sheet (live)' : 'Demo'}
            </footer>
          </>
        )}
      </main>
      <ChatBot range={range} />
    </div>
  );
}
