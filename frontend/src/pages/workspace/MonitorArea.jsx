import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { formatApiError } from '../../api';
import { useAuth } from '../../AuthContext';
import exportCsv from '../../utils/exportCsv';
import { DriftBar } from './wsCharts';

/* Monitor area — new-IA home for portfolio should-cost-vs-actual gaps. REAL data:
 * fetches GET /api/portfolio/summary (the same live source pages/Dashboard.jsx uses),
 * shown as a flat table ranked by exposure (biggest money at stake first). This is a
 * re-platform, not new brains — the trigger radar / priority matrix / alerts that turn
 * "here's a gap" into "fix this one first" are Wave 3, deliberately not built here. */

const STATUS = {
  alert: { label: 'Alert', color: 'var(--accent2)' },
  watch: { label: 'Watch', color: 'var(--accent3)' },
  ok: { label: 'On track', color: 'var(--accent)' },
};

// Status is derived on the frontend from the endpoint's existing flags — no new backend logic.
const statusOf = (m) => (m.flag_price_drift ? 'alert' : m.flag_index_moved ? 'watch' : 'ok');

const STATUS_FILTERS = [
  { key: 'all', label: 'All products' },
  { key: 'alert', label: 'Alerts' },
  { key: 'watch', label: 'Watch' },
  { key: 'ok', label: 'On track' },
];

const curSym = (c) => (c === 'EUR' ? '€' : c === 'USD' ? '$' : c === 'GBP' ? '£' : c ? `${c} ` : '');

export default function MonitorArea() {
  const { activeTeamId } = useAuth();
  const navigate = useNavigate();
  const [portfolio, setPortfolio] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('exposure');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    if (!activeTeamId) return;
    setLoading(true);
    setError(null);
    api.get('/api/portfolio/summary', { params: { team_id: activeTeamId } })
      .then(res => setPortfolio(res.data))
      .catch(err => setError(formatApiError(err)))
      .finally(() => setLoading(false));
  }, [activeTeamId]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const models = portfolio?.models || [];
  const kpis = portfolio?.kpis;
  const dispCur = models[0]?.currency;                      // team's dominant currency for aggregate KPIs
  const exposureOf = (m) => Math.abs(m.cumulative_impact || m.gap || 0);
  // Severity bars share one scale; floor at 25% so small gaps don't render near-full.
  const maxAbsGap = Math.max(25, ...models.map(m => Math.abs(m.gap_pct || 0)));

  const visible = models
    .map(m => ({ ...m, _status: statusOf(m) }))
    .filter(m => statusFilter === 'all' || m._status === statusFilter)
    .filter(m => {
      if (!search) return true;
      const hay = `${m.product_name} ${m.supplier_name || ''} ${m.product_reference || ''}`.toLowerCase();
      return hay.includes(search.toLowerCase());
    })
    .sort((a, b) => {
      if (sortKey === 'product') {
        const va = a.product_name.toLowerCase(), vb = b.product_name.toLowerCase();
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      let va, vb;
      if (sortKey === 'exposure') { va = exposureOf(a); vb = exposureOf(b); }
      else if (sortKey === 'gap_pct') { va = Math.abs(a.gap_pct || 0); vb = Math.abs(b.gap_pct || 0); }
      else if (sortKey === 'should_cost') { va = a.current_should_cost; vb = b.current_should_cost; }
      else { va = 0; vb = 0; }
      return sortDir === 'asc' ? va - vb : vb - va;
    });

  const stats = kpis ? [
    { lbl: 'Products tracked', val: models.length },
    { lbl: 'Needs attention', val: kpis.models_flagged, color: kpis.models_flagged > 0 ? 'var(--accent2)' : undefined },
    { lbl: 'Total exposure', val: `${curSym(dispCur)}${Math.round(kpis.total_exposure).toLocaleString()}` },
    { lbl: 'Largest single exposure', val: `${curSym(dispCur)}${Math.round(kpis.largest_single_exposure).toLocaleString()}` },
  ] : [];

  const SortHeader = ({ label, field, center = true }) => (
    <th className={center ? 'center' : ''} style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(field)}>
      {label} {sortKey === field ? (sortDir === 'asc' ? '▲' : '▼') : ''}
    </th>
  );

  return (
    <div className="ca-page ca-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div className="ca-h1">Monitor</div>
        {visible.length > 0 && (
          <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => exportCsv(
            'monitor.csv',
            ['Product', 'Supplier', 'Reference', 'Region', 'Currency', 'Should-Cost', 'Actual', 'Gap %', 'Exposure', 'Status', 'Index Flag', 'Drift Flag'],
            visible.map(m => [
              m.product_name, m.supplier_name || '', m.product_reference || '', m.region, m.currency,
              m.current_should_cost, m.latest_actual_price, m.gap_pct, exposureOf(m),
              STATUS[m._status].label, m.flag_index_moved, m.flag_price_drift,
            ])
          )}>Export CSV</button>
        )}
      </div>
      <p className="ca-subtitle">Should-cost is always live, driven by your linked indices — every product ranked by the money at stake where actuals drift away from it.</p>

      {loading ? (
        <div style={{ padding: 20, color: 'var(--muted)' }}>Loading&hellip;</div>
      ) : error ? (
        <div className="ca-card" style={{ color: 'var(--accent2)' }}>Error: {error}</div>
      ) : models.length === 0 ? (
        <div className="ca-card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
            No cost models yet &mdash; build one to see where you're overpaying against should-cost.
          </div>
          <button className="ca-btn ca-btn-primary" onClick={() => navigate('/cost-models/new')}>New Cost Model</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 16, margin: '16px 0', flexWrap: 'wrap' }}>
            {stats.map(s => (
              <div key={s.lbl} className="ca-card ca-metric" style={{ flex: '1 1 180px' }}>
                <div className="ca-metric-val" style={{ color: s.color }}>{s.val}</div>
                <div className="ca-metric-lbl">{s.lbl}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <input className="ca-input" style={{ maxWidth: 220 }} placeholder="Search products&hellip;" value={search} onChange={e => setSearch(e.target.value)} />
            {STATUS_FILTERS.map(f => (
              <button key={f.key} className={`ca-btn ca-btn-sm ${statusFilter === f.key ? 'ca-btn-primary' : 'ca-btn-ghost'}`} onClick={() => setStatusFilter(f.key)}>{f.label}</button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div className="ca-card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>
              No products match these filters.
            </div>
          ) : (
            <div className="ca-card">
              <div className="ca-scroll-x">
                <table className="ca-table">
                  <thead>
                    <tr>
                      <th style={{ width: 4, padding: 0 }}></th>
                      <SortHeader label="Product" field="product" center={false} />
                      <th>Reference</th>
                      <th className="center">Region</th>
                      <SortHeader label="Should-cost" field="should_cost" />
                      <th className="center">Actual</th>
                      <SortHeader label="Gap %" field="gap_pct" />
                      <th>Severity</th>
                      <SortHeader label="Exposure" field="exposure" />
                      <th className="center">Flags</th>
                      <th className="center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(m => {
                      const st = STATUS[m._status];
                      const cs = curSym(m.currency);
                      return (
                        <tr key={m.cost_model_id}>
                          <td style={{ width: 4, padding: 0, background: st.color }} />
                          <td>
                            <div style={{ fontWeight: 600 }}>{m.product_name}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.supplier_name || 'No supplier'}</div>
                          </td>
                          <td style={{ color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{m.product_reference || '—'}</td>
                          <td className="center">{m.region}</td>
                          <td className="center" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--accent)' }}>{cs}{m.current_should_cost.toFixed(3)}</td>
                          <td className="center" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--accent4)' }}>
                            {m.latest_actual_price !== null ? `${cs}${m.latest_actual_price.toFixed(3)}` : '—'}
                          </td>
                          <td className="center" style={{ color: m.gap_pct > 0 ? 'var(--accent2)' : m.gap_pct < 0 ? 'var(--accent)' : 'var(--muted)' }}>
                            {m.gap_pct !== null ? `${m.gap_pct > 0 ? '+' : ''}${m.gap_pct.toFixed(1)}%` : '—'}
                          </td>
                          <td><DriftBar value={Math.abs(m.gap_pct || 0)} max={maxAbsGap} color={st.color} /></td>
                          <td className="center" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{cs}{exposureOf(m).toLocaleString()}</td>
                          <td className="center">
                            {m.flag_index_moved && <span title="Index moved >5%" style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 9, background: 'var(--info-bg)', color: 'var(--accent3)', marginRight: 4 }}>IDX</span>}
                            {m.flag_price_drift && <span title="Price drift >10%" style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 9, background: 'var(--danger-bg)', color: 'var(--accent2)' }}>DRIFT</span>}
                          </td>
                          <td className="center">
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                              <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => navigate(`/cost-models/${m.cost_model_id}`)}>View</button>
                              <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => navigate(`/cost-models/${m.cost_model_id}/evolution`)}>Evo</button>
                              <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => navigate(`/cost-models/${m.cost_model_id}/brief`)}>Brief</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
