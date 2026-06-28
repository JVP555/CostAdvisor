import { useState, useEffect, useMemo } from 'react';
import api from '../../api';
import { useAuth } from '../../AuthContext';
import IndexPopupModal from '../../components/IndexPopupModal';
import AddIndexModal from '../../components/AddIndexModal';
import EditCellModal from '../../components/EditCellModal';
import FxCustomEditModal from '../../components/FxCustomEditModal';
import exportCsv from '../../utils/exportCsv';
import { Sparkline, GroupHeader, useOpenSet } from './wsCharts';

/* Index Library — mockup layout, REAL data. Mirrors the fetch/reshape of
 * pages/Indexes.jsx and opens IndexPopupModal (trend graph + AI + portfolio
 * impact + source) on row click. Theme-safe: colours via var(--…) only. */

const CAT_COLOR = {
  Metal: 'var(--cat-metal)', Energy: 'var(--cat-energy)', Chemical: 'var(--cat-chemical)',
  Labor: 'var(--cat-labor)', PPI: 'var(--cat-ppi)', Freight: 'var(--cat-freight)', FX: 'var(--cat-fx)',
};

function fmtVal(v, unit) {
  if (v == null) return '—';
  const n = Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
  return unit ? `${n}/${unit}` : `${n}`;
}

export default function IndexLibraryArea() {
  const { activeTeamId } = useAuth();
  const [data, setData] = useState([]);
  const [commodities, setCommodities] = useState([]);
  const [sources, setSources] = useState([]);
  const [regionsOpt, setRegionsOpt] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [popupRow, setPopupRow] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [collapsed, toggleCollapsed] = useOpenSet([]); // keys present = collapsed group
  const [pairsLive, setPairsLive] = useState({}); // FX pair name -> live daily rate
  const [fxCustomAll, setFxCustomAll] = useState([]);   // team FX custom overrides
  const [fxPlatformAll, setFxPlatformAll] = useState([]); // platform quarterly FX rates
  const [editCell, setEditCell] = useState(null);  // non-FX cell being overridden
  const [fxEdit, setFxEdit] = useState(null);       // FX cell override context

  const fetchData = async () => {
    if (!activeTeamId) return;
    setLoading(true);
    try {
      const now = new Date();
      const toY = now.getFullYear(), toQ = Math.ceil((now.getMonth() + 1) / 3);
      const params = { team_id: activeTeamId, from_year: toY - 2, from_quarter: toQ, to_year: toY, to_quarter: toQ };
      const [valRes, comRes, srcRes] = await Promise.all([
        api.get('/api/indexes/values', { params }),
        api.get('/api/indexes'),
        api.get('/api/indexes/sources', { params: { team_id: activeTeamId } }),
      ]);
      setData(valRes.data); setCommodities(comRes.data); setSources(srcRes.data);
      try {
        const f = await api.get('/api/indexes/filter-options', { params: { team_id: activeTeamId } });
        setRegionsOpt(f.data.regions || []);
      } catch { /* non-critical */ }
      try {
        // FX: live rate per pair (Latest column) + team custom overrides + platform quarterly (for the 3-mode editor).
        const [pr, cu, pl] = await Promise.all([
          api.get('/api/fx-rates/pairs'),
          api.get('/api/fx-rates/custom', { params: { team_id: activeTeamId } }),
          api.get('/api/fx-rates/'),
        ]);
        const m = {};
        (pr.data || []).forEach(p => { if (p.live_rate != null) m[p.name] = Number(p.live_rate); });
        setPairsLive(m);
        setFxCustomAll(cu.data || []);
        setFxPlatformAll(pl.data || []);
      } catch { /* non-critical */ }
    } catch (err) {
      console.error('Failed to load indexes:', err);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [activeTeamId]);

  const commodityMap = useMemo(() => {
    const m = new Map();
    commodities.forEach(c => m.set(c.id, c));
    return m;
  }, [commodities]);

  const periods = useMemo(() => {
    const set = new Set();
    data.forEach(d => set.add(`${d.year}-${d.quarter}`));
    return [...set].map(p => { const [y, q] = p.split('-'); return { year: +y, quarter: +q }; })
      .sort((a, b) => a.year - b.year || a.quarter - b.quarter)
      .map(p => ({ ...p, label: `Q${p.quarter}-${String(p.year).slice(2)}` }));
  }, [data]);
  const periodsDesc = useMemo(() => [...periods].reverse(), [periods]);

  const findSource = (cid, region) => sources.find(s => s.commodity_id === cid && s.region === region) || null;
  const getGlobalScraperInfo = (cid) => {
    const cell = data.find(d => d.commodity_id === cid && d.global_scraper);
    return cell ? { scraper: cell.global_scraper, scrape_at: cell.global_scrape_at } : null;
  };

  // Click a quarter cell in a row → edit its team override (FX = 3-mode editor, else fixed value).
  const openCellEdit = (e, r, p, cell) => {
    e.stopPropagation(); // don't open the view popup
    if (r.meta.category === 'FX') {
      const [from, to] = r.mat.split('/');
      const current = fxCustomAll.find(c => c.from_currency === from && c.to_currency === to && c.year === p.year && c.quarter === p.quarter) || null;
      const availableQuarters = fxPlatformAll
        .filter(x => x.from_currency === from && x.to_currency === to)
        .map(x => ({ year: x.year, quarter: x.quarter, rate: x.rate }));
      setFxEdit({ pair: { from, to }, period: { year: p.year, quarter: p.quarter, label: p.label }, current, availableQuarters, liveRate: pairsLive[r.mat] ?? null });
    } else {
      setEditCell(cell || { commodity_id: r.commodity_id, region: r.reg, year: p.year, quarter: p.quarter, value: null, source: 'scraped' });
    }
  };

  const rows = useMemo(() => {
    const grouped = {};
    data.forEach(d => {
      const key = `${d.commodity_name}__${d.region}`;
      if (!grouped[key]) grouped[key] = { mat: d.commodity_name, reg: d.region, commodity_id: d.commodity_id, valMap: {} };
      grouped[key].valMap[`Q${d.quarter}-${String(d.year).slice(2)}`] = d;
    });
    return Object.values(grouped).map(r => {
      const cells = periods.map(p => r.valMap[p.label] || null);
      const nums = cells.map(c => c?.value).filter(v => v != null);
      const base = nums[0] ?? null;
      const latest = nums[nums.length - 1] ?? null;
      const meta = commodityMap.get(r.commodity_id) || {};
      const delta = (base != null && latest != null && base !== 0) ? (latest / base - 1) * 100 : null;
      return { ...r, cells, base, latest, meta, delta, hist: nums };
    }).sort((a, b) => a.mat.localeCompare(b.mat));
  }, [data, periods, commodityMap]);

  const categories = useMemo(() => {
    const counts = {};
    rows.forEach(r => { const c = r.meta.category || 'Other'; counts[c] = (counts[c] || 0) + 1; });
    return Object.entries(counts).map(([key, count]) => ({ key, count })).sort((a, b) => a.key.localeCompare(b.key));
  }, [rows]);
  const regionList = useMemo(() => regionsOpt.length ? regionsOpt : [...new Set(rows.map(r => r.reg))].sort(), [regionsOpt, rows]);

  const matches = (r) =>
    (regionFilter === 'all' || r.reg === regionFilter) &&
    (!search || `${r.mat} ${r.meta.provider || ''}`.toLowerCase().includes(search.toLowerCase()));

  // Export the currently-visible rows (respects type/region/search filters), in display order.
  const handleExport = () => {
    const headers = ['In use', 'Index', 'Type', 'Provider', 'Region', 'Frequency', 'Latest price', 'vs base %', ...periodsDesc.map(p => p.label)];
    const out = [];
    categories.forEach(cat => {
      if (typeFilter !== 'all' && typeFilter !== cat.key) return;
      rows.filter(r => (r.meta.category || 'Other') === cat.key && matches(r)).forEach(r => {
        out.push([
          findSource(r.commodity_id, r.reg) ? 'Yes' : 'No',
          r.mat,
          r.meta.category || '',
          r.meta.provider || '',
          r.reg,
          r.meta.frequency || '',
          r.latest != null ? r.latest : '',
          r.delta != null ? `${r.delta.toFixed(1)}%` : '',
          ...periodsDesc.map(p => { const c = r.valMap[p.label]; return c?.value != null ? c.value : ''; }),
        ]);
      });
    });
    exportCsv('index-library.csv', headers, out);
  };

  if (!activeTeamId) {
    return <div className="ca-page ca-fade-in"><div className="ca-h1">Index library</div>
      <div className="ca-card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>Select a team to view indices.</div></div>;
  }

  const colCount = 9 + periodsDesc.length;

  return (
    <div className="ca-page ca-fade-in">
      <div>
        <div className="ca-h1">Index library</div>
        <p className="ca-subtitle">Every tracked index linked to your portfolio formulas — live values, provider, frequency and a 2-yr trend. FX pairs are included; click any row for its chart, statistics and portfolio impact.</p>
      </div>

      <div style={{ display: 'flex', gap: 16, margin: '16px 0', flexWrap: 'wrap' }}>
        {categories.map(c => (
          <div key={c.key} className="ca-card ca-metric" style={{ flex: '1 1 150px' }}>
            <div className="ca-metric-val" style={{ color: CAT_COLOR[c.key] || 'var(--accent)' }}>{c.count}</div>
            <div className="ca-metric-lbl">{c.key} indexes</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input className="ca-input" style={{ maxWidth: 220 }} placeholder="Search index or provider…" value={search} onChange={e => setSearch(e.target.value)} />
        <button className={`ca-btn ca-btn-sm ${typeFilter === 'all' ? 'ca-btn-primary' : 'ca-btn-ghost'}`} onClick={() => setTypeFilter('all')}>All types</button>
        {categories.map(c => (
          <button key={c.key} className={`ca-btn ca-btn-sm ${typeFilter === c.key ? 'ca-btn-primary' : 'ca-btn-ghost'}`} onClick={() => setTypeFilter(c.key)}>{c.key}</button>
        ))}
        <span style={{ width: 1, height: 20, background: 'var(--border)' }} />
        <button className={`ca-btn ca-btn-sm ${regionFilter === 'all' ? 'ca-btn-primary' : 'ca-btn-ghost'}`} onClick={() => setRegionFilter('all')}>All regions</button>
        {regionList.map(rg => (
          <button key={rg} className={`ca-btn ca-btn-sm ${regionFilter === rg ? 'ca-btn-primary' : 'ca-btn-ghost'}`} onClick={() => setRegionFilter(rg)}>{rg}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="ca-btn ca-btn-sm ca-btn-ghost" onClick={handleExport} disabled={!rows.length}>Export CSV</button>
          <button className="ca-btn ca-btn-sm ca-btn-primary" onClick={() => setShowAddModal(true)}>+ Add Index</button>
        </div>
      </div>

      {loading ? (
        <div className="ca-card" style={{ padding: 20, color: 'var(--muted)' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div className="ca-card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>No index data for this team yet. Add sources or scrape from the Indexes page.</div>
      ) : (
        <div className="ca-card">
          <div className="ca-scroll-x">
            <table className="ca-table">
              <thead>
                <tr>
                  <th>In use</th><th>Index</th><th>Type</th><th>Provider</th><th>Region</th><th>Freq.</th>
                  <th className="right">Latest price</th><th className="right">vs base</th><th style={{ minWidth: 90 }}>2-yr trend</th>
                  {periodsDesc.map((p, i) => (
                    <th key={p.label} className="right" style={i === 0 ? { background: 'var(--info-bg)', color: 'var(--accent4)' } : undefined}>{p.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => {
                  if (typeFilter !== 'all' && typeFilter !== cat.key) return null;
                  const catRows = rows.filter(r => (r.meta.category || 'Other') === cat.key && matches(r));
                  if (!catRows.length) return null;
                  const open = !collapsed.has(cat.key);
                  return (
                    <>
                      <tr key={cat.key}><td colSpan={colCount} style={{ padding: 0 }}>
                        <GroupHeader label={`${cat.key} indexes`} count={catRows.length} open={open} onToggle={() => toggleCollapsed(cat.key)} />
                      </td></tr>
                      {open && catRows.map(r => {
                        const up = r.delta != null && r.delta >= 0;
                        // In use — MOCK placeholder for now (TODO: wire to /api/indexes/{id}/impact)
                        const inUse = findSource(r.commodity_id, r.reg) ? 'Yes' : '—';
                        return (
                          <tr key={`${r.commodity_id}-${r.reg}`} style={{ cursor: 'pointer' }} onClick={() => setPopupRow(r)}>
                            <td><span className="ca-badge" style={{ background: inUse === 'Yes' ? 'var(--success-bg)' : 'var(--neutral-bg)', color: inUse === 'Yes' ? 'var(--accent)' : 'var(--muted)' }}>{inUse}</span></td>
                            <td style={{ fontWeight: 600, color: 'var(--accent4)' }}>{r.mat}</td>
                            <td><span className="ca-badge" style={{ background: 'var(--neutral-bg)', color: CAT_COLOR[r.meta.category] || 'var(--text-secondary)' }}>{r.meta.category || '—'}</span></td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.meta.provider || '—'}</td>
                            <td style={{ fontSize: 12 }}>{r.reg}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.meta.frequency || '—'}</td>
                            <td className="right" title={r.meta.category === 'FX' && pairsLive[r.mat] != null ? 'Live daily rate' : undefined} style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: 'var(--text)' }}>{fmtVal(r.meta.category === 'FX' && pairsLive[r.mat] != null ? pairsLive[r.mat] : r.latest, r.meta.unit)}</td>
                            <td className="right" style={{ fontFamily: "'JetBrains Mono', monospace", color: r.delta == null ? 'var(--muted)' : up ? 'var(--accent2)' : 'var(--accent)' }}>
                              {r.delta == null ? '—' : `${up ? '+' : ''}${r.delta.toFixed(1)}%`}
                            </td>
                            <td><Sparkline data={r.hist} /></td>
                            {periodsDesc.map((p, i) => {
                              const cell = r.valMap[p.label];
                              const ov = cell?.source === 'team_override';
                              return <td key={p.label} className="right" title="Click to set a team override"
                                onClick={(e) => openCellEdit(e, r, p, cell)}
                                style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: i === 0 ? 700 : 400, color: ov ? 'var(--accent4)' : undefined, cursor: 'cell' }}>{fmtVal(cell?.value, r.meta.unit)}{ov ? ' •' : ''}</td>;
                            })}
                          </tr>
                        );
                      })}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <IndexPopupModal
        isOpen={!!popupRow}
        onClose={() => setPopupRow(null)}
        commodityId={popupRow?.commodity_id}
        commodityName={popupRow?.mat}
        region={popupRow?.reg}
        teamId={activeTeamId}
        commodity={popupRow ? commodityMap.get(popupRow.commodity_id) : null}
        periods={periods}
        cellData={popupRow?.cells || []}
        source={popupRow ? findSource(popupRow.commodity_id, popupRow.reg) : null}
        globalScraper={popupRow ? getGlobalScraperInfo(popupRow.commodity_id) : null}
        onSourceChanged={fetchData}
        onRemoved={() => { setPopupRow(null); fetchData(); }}
      />

      <AddIndexModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        commodities={commodities}
        teamId={activeTeamId}
        onAdded={fetchData}
      />

      <EditCellModal
        isOpen={!!editCell}
        onClose={() => setEditCell(null)}
        cell={editCell}
        teamId={activeTeamId}
        teamSource={editCell ? findSource(editCell.commodity_id, editCell.region) : null}
        periods={periods}
        onSaved={() => fetchData()}
      />

      {fxEdit && (
        <FxCustomEditModal
          pair={fxEdit.pair}
          period={fxEdit.period}
          current={fxEdit.current}
          liveRate={fxEdit.liveRate}
          availableQuarters={fxEdit.availableQuarters}
          teamId={activeTeamId}
          onSaved={() => fetchData()}
          onClose={() => setFxEdit(null)}
        />
      )}
    </div>
  );
}
