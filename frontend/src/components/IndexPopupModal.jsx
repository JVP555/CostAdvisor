import { useState, useEffect } from 'react';
import api from '../api';
import SeriesChart from './SeriesChart';
import { computeStats } from '../utils/seriesStats';
import IndexDetailPanel from './IndexDetailPanel';
import EditCellModal from './EditCellModal';

/**
 * Full-screen modal showing index details: trend chart, AI summary,
 * portfolio impact, and source controls.
 */
export default function IndexPopupModal({
  isOpen,
  onClose,
  commodityId,
  commodityName,
  region,
  teamId,
  commodity,       // CommodityIndexOut object (unit, currency, category, source_url)
  periods,         // [{year, quarter, label}, ...]
  cellData,        // array of cell values matching periods (for chart)
  source,          // TeamIndexSource or null
  globalScraper,   // {scraper, scrape_at} or null
  onSourceChanged,
  onRemoved,
}) {
  const [impacts, setImpacts] = useState([]);
  const [loadingImpacts, setLoadingImpacts] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [daily, setDaily] = useState([]);          // FX daily series (FX rows only)
  const [statsSlice, setStatsSlice] = useState(null); // current chart selection/window, for stats
  const [editCell, setEditCell] = useState(null);  // period cell being overridden

  const isFx = commodity?.category === 'FX';

  // FX rows: fetch the daily rate series (name "FROM/TO" → fx-rates/daily).
  useEffect(() => {
    if (!isOpen || !isFx || !commodityName) { setDaily([]); return; }
    const [from, to] = commodityName.split('/');
    api.get('/api/fx-rates/daily', { params: { from_currency: from, to_currency: to, limit: 3000 } })
      .then(res => setDaily(res.data || []))
      .catch(() => setDaily([]));
  }, [isOpen, isFx, commodityName]);

  useEffect(() => {
    if (!isOpen || !commodityId || !teamId) return;
    setLoadingImpacts(true);
    api.get(`/api/indexes/${commodityId}/impact`, { params: { team_id: teamId } })
      .then(res => setImpacts(res.data.impacts || []))
      .catch(() => setImpacts([]))
      .finally(() => setLoadingImpacts(false));
  }, [isOpen, commodityId, teamId]);

  // Fetch AI analysis once impacts are loaded
  useEffect(() => {
    if (!isOpen || !commodityId || loadingImpacts) return;
    setLoadingAi(true);
    setAiAnalysis(null);
    api.post('/api/ai/index-analysis', {
      commodity_id: commodityId,
      commodity_name: commodityName,
      region,
      category: commodity?.category,
      unit: commodity?.unit,
      currency: commodity?.currency,
      periods: cellData?.filter(c => c?.value != null).map(c => ({
        year: c.year, quarter: c.quarter, value: c.value,
      })) || [],
      impacts: impacts.map(i => ({
        product_name: i.product_name,
        supplier_name: i.supplier_name,
        weight: i.weight,
        index_change_pct: i.index_change_pct,
        cost_impact_pct: i.cost_impact_pct,
      })),
    })
      .then(res => setAiAnalysis(res.data))
      .catch(() => setAiAnalysis({ analysis: 'AI analysis unavailable.', source: 'error' }))
      .finally(() => setLoadingAi(false));
  }, [isOpen, commodityId, loadingImpacts]);

  if (!isOpen) return null;

  // Chart points: FX → daily series (newest-first from API → ascending);
  // non-FX → the quarterly cells. SeriesChart handles range windowing + selection.
  const points = isFx
    ? [...daily].reverse().map(d => ({ label: d.date, value: Number(d.rate), date: d.date }))
    : periods.map((p) => {
        const cell = cellData?.find(c => c?.year === p.year && c?.quarter === p.quarter);
        return { label: p.label, value: cell?.value ?? null };
      });
  const rangeOptions = isFx
    ? [['1M', 30], ['3M', 90], ['6M', 180], ['1Y', 365], ['5Y', 1825], ['All', Infinity]]
    : [['1Y', 4], ['2Y', 8], ['3Y', 12], ['5Y', 20], ['All', Infinity]];
  const stats = computeStats(statsSlice && statsSlice.length ? statsSlice : points);
  const fmtStat = v => (v == null ? '—' : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(isFx ? 4 : 2));

  const categoryColors = {
    Metal: 'var(--cat-metal)', Energy: 'var(--cat-energy)', Chemical: 'var(--cat-chemical)',
    Labor: 'var(--cat-labor)', PPI: 'var(--cat-ppi)', Freight: 'var(--cat-freight)', FX: 'var(--cat-fx)',
  };

  return (
    <div className="ca-modal-backdrop" onClick={onClose}>
      <div className="ca-modal" style={{ maxWidth: 740, width: '95vw' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ca-modal-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15 }}>{commodityName}</span>
              {commodity?.category && (
                <span className="ca-badge" style={{
                  background: categoryColors[commodity.category] || 'var(--accent-dim)',
                  color: 'var(--on-danger)', fontSize: 9,
                }}>
                  {commodity.category}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, display: 'flex', gap: 16 }}>
              {commodity?.unit && <span>Unit: <strong>{commodity.unit}</strong></span>}
              {commodity?.currency && <span>Currency: <strong>{commodity.currency}</strong></span>}
              {region && <span>Region: <strong>{region}</strong></span>}
            </div>
            {commodity?.source_url && (
              <a href={commodity.source_url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 10, color: 'var(--accent4)', textDecoration: 'underline', marginTop: 4, display: 'inline-block' }}>
                {commodity.source_url.length > 70 ? commodity.source_url.slice(0, 70) + '...' : commodity.source_url}
              </a>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--muted)',
              cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4,
            }}
          >
            &times;
          </button>
        </div>

        <div className="ca-modal-body">
        {/* Trend Chart */}
        <div className="ca-card" style={{ marginBottom: 16, padding: '12px 8px' }}>
          <div className="ca-card-title" style={{ marginBottom: 8 }}>Price Trend</div>
          <SeriesChart
            points={points}
            rangeOptions={rangeOptions}
            valueDecimals={isFx ? 4 : undefined}
            unit={commodity?.unit}
            onWindowChange={setStatsSlice}
          />
        </div>

        {/* Statistics (computed over the selected span / visible window) */}
        <div className="ca-card" style={{ marginBottom: 16, padding: 16 }}>
          <div className="ca-card-title" style={{ marginBottom: 10 }}>
            Statistics{stats ? <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 11 }}> · {stats.startLabel} → {stats.endLabel} ({stats.n} pts)</span> : null}
          </div>
          {!stats ? (
            <div style={{ color: 'var(--muted)', fontSize: 11 }}>Not enough data for statistics.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 10 }}>
              {[
                { lbl: 'Change', val: stats.changePct == null ? '—' : `${stats.changePct >= 0 ? '+' : ''}${stats.changePct.toFixed(1)}%`,
                  color: stats.changePct == null ? 'var(--text)' : stats.changePct >= 0 ? 'var(--accent2)' : 'var(--danger)' },
                { lbl: 'Annualised', val: stats.cagrPct == null ? '—' : `${stats.cagrPct >= 0 ? '+' : ''}${stats.cagrPct.toFixed(1)}%`,
                  color: stats.cagrPct == null ? 'var(--text)' : stats.cagrPct >= 0 ? 'var(--accent2)' : 'var(--danger)' },
                { lbl: 'Volatility', val: stats.volatilityPct == null ? '—' : `${stats.volatilityPct.toFixed(1)}%`, color: 'var(--text)' },
                { lbl: 'Min', val: fmtStat(stats.min), color: 'var(--text)' },
                { lbl: 'Mean', val: fmtStat(stats.mean), color: 'var(--text)' },
                { lbl: 'Max', val: fmtStat(stats.max), color: 'var(--text)' },
              ].map(s => (
                <div key={s.lbl} className="ca-metric" style={{ padding: '8px 10px' }}>
                  <div className="ca-metric-val" style={{ fontSize: 16, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.val}</div>
                  <div className="ca-metric-lbl">{s.lbl}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Analysis */}
        <div className="ca-card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 14 }}>&#10024;</span>
            <span className="ca-card-title" style={{ margin: 0 }}>AI Analysis</span>
          </div>
          {loadingAi ? (
            <p style={{ color: 'var(--muted)', fontSize: 11, fontStyle: 'italic', margin: 0 }}>
              Generating analysis...
            </p>
          ) : aiAnalysis ? (
            <p style={{ fontSize: 12, lineHeight: 1.8, color: 'var(--text-secondary)', margin: 0 }}>
              {aiAnalysis.analysis}
            </p>
          ) : null}
        </div>

        {/* Portfolio Impact */}
        <div className="ca-card" style={{ marginBottom: 16 }}>
          <div className="ca-card-title" style={{ marginBottom: 8 }}>Portfolio Impact</div>
          {loadingImpacts ? (
            <div style={{ color: 'var(--muted)', fontSize: 11, padding: 8 }}>Loading...</div>
          ) : impacts.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 11, padding: 8 }}>
              No products in your portfolio use this index.
            </div>
          ) : (
            <div className="ca-scroll-x">
              <table className="ca-table" style={{ fontSize: 11 }}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Supplier</th>
                    <th>Component</th>
                    <th className="center">Weight</th>
                    <th className="center">Index Change</th>
                    <th className="center">Cost Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {impacts.map((imp, i) => (
                    <tr key={i}>
                      <td>{imp.product_name}</td>
                      <td>{imp.supplier_name || '\u2014'}</td>
                      <td>{imp.component_label}</td>
                      <td className="center">{(imp.weight * 100).toFixed(1)}%</td>
                      <td className="center" style={{
                        color: imp.index_change_pct > 0 ? 'var(--accent2)' :
                               imp.index_change_pct < 0 ? 'var(--accent)' : 'var(--muted)',
                      }}>
                        {imp.index_change_pct != null ? `${imp.index_change_pct > 0 ? '+' : ''}${imp.index_change_pct.toFixed(1)}%` : '\u2014'}
                      </td>
                      <td className="center" style={{
                        color: imp.cost_impact_pct > 0 ? 'var(--accent2)' :
                               imp.cost_impact_pct < 0 ? 'var(--accent)' : 'var(--muted)',
                        fontWeight: 600,
                      }}>
                        {imp.cost_impact_pct != null ? `${imp.cost_impact_pct > 0 ? '+' : ''}${imp.cost_impact_pct.toFixed(2)}%` : '\u2014'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Team Override — set/reset a custom value per period (non-FX) */}
        <div className="ca-card" style={{ marginBottom: 16 }}>
          <div className="ca-card-title" style={{ marginBottom: 8 }}>Team Override</div>
          {isFx ? (
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              FX rates are managed on the <strong>FX Rates</strong> page (fixed / latest-daily / quarter-reference modes). An override set here would affect this view only, not currency conversion in costing.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                Click a period to set or reset a team override for <strong>{region}</strong>. Overridden periods are marked •.
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {periods.map((p) => {
                  const cell = cellData?.find(c => c?.year === p.year && c?.quarter === p.quarter);
                  const overridden = cell?.source === 'team_override';
                  return (
                    <button key={p.label} className="ca-btn ca-btn-sm ca-btn-ghost"
                      style={overridden ? { borderColor: 'var(--accent4)', color: 'var(--accent4)' } : undefined}
                      onClick={() => setEditCell(cell || { commodity_id: commodityId, region, year: p.year, quarter: p.quarter, value: null, source: 'scraped' })}>
                      {p.label}{overridden ? ' •' : ''}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Source & Controls (reuse IndexDetailPanel) */}
        <div className="ca-card" style={{ marginBottom: 0 }}>
          <div className="ca-card-title" style={{ marginBottom: 8 }}>Source & Controls</div>
          <IndexDetailPanel
            commodity_id={commodityId}
            commodity_name={commodityName}
            region={region}
            teamId={teamId}
            source={source}
            globalScraper={globalScraper}
            onSourceChanged={onSourceChanged}
            onRemoved={onRemoved}
          />
        </div>
        </div>
      </div>

      <EditCellModal
        isOpen={!!editCell}
        onClose={() => setEditCell(null)}
        cell={editCell}
        teamId={teamId}
        teamSource={source}
        periods={periods}
        onSaved={() => { onSourceChanged?.(); }}
      />
    </div>
  );
}
