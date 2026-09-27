import { useState } from 'react';
import { PreviewBanner, PreviewBadge, WiringNote } from '../../components/PreviewBadge';

// Scrum 57's known limitation, given a surface. Mockup only.
//
// Read the scope note before planning work off this page, because the obvious
// plan is the wrong one. The original framing was "index metadata is
// region-agnostic, so add a (commodity, region) table". That was **superseded**:
// Unit 2 of the data-layer drop already put region on IndexCard rather than on
// the series, so for every drop-loaded series (commodity_key IS NOT NULL) the
// per-region facts are already stored. And the one real consumer named in that
// note, formula_estimator._has_usable_series, got a narrower fix that shipped.
//
// What is genuinely still missing is smaller and is mostly this screen: nothing
// anywhere reads the per-region view. The Index Library status chip still shows
// the series-level representative, so on a commodity whose regions disagree it
// describes a different region's feed than the number beside it. The row header
// below is that inherited representative; the cells are what each region
// actually is. Where they differ, that is what a buyer is being mis-told.

const REGIONS = ['GLOBAL', 'EU', 'NA', 'APAC', 'CN', 'IN', 'LA', 'MEA'];

const STATUS = {
  free: { label: 'Direct', short: 'D', color: 'var(--accent)', bg: 'var(--accent-dim)' },
  good_proxy: { label: 'Good proxy', short: 'A', color: 'var(--accent4)', bg: 'var(--accent4-dim)' },
  weak_proxy: { label: 'Weak proxy', short: 'B', color: 'var(--accent3)', bg: 'var(--accent3-dim)' },
  blocked: { label: 'Blocked', short: '×', color: 'var(--accent2)', bg: 'var(--accent2-dim)' },
  none: { label: 'No feed', short: '–', color: 'var(--muted)', bg: 'var(--neutral-bg)' },
};

// `rep` is what the index row carries today for every region.
const COMMODITIES = [
  {
    id: 'fe-scrap', name: 'Iron scrap', rep: 'weak_proxy', rep_from: 'GLOBAL',
    cells: { GLOBAL: 'weak_proxy', EU: 'good_proxy', NA: 'free', APAC: 'weak_proxy', CN: 'weak_proxy', IN: 'none', LA: 'none', MEA: 'none' },
  },
  {
    id: 'nh3', name: 'Ammonia', rep: 'free', rep_from: 'EU',
    cells: { GLOBAL: 'none', EU: 'free', NA: 'free', APAC: 'good_proxy', CN: 'weak_proxy', IN: 'weak_proxy', LA: 'none', MEA: 'good_proxy' },
  },
  {
    id: 'naoh', name: 'Caustic soda', rep: 'good_proxy', rep_from: 'GLOBAL',
    cells: { GLOBAL: 'good_proxy', EU: 'good_proxy', NA: 'good_proxy', APAC: 'good_proxy', CN: 'free', IN: 'none', LA: 'none', MEA: 'none' },
  },
  {
    id: 'elec', name: 'Electricity', rep: 'weak_proxy', rep_from: 'EU',
    cells: { GLOBAL: 'none', EU: 'weak_proxy', NA: 'free', APAC: 'none', CN: 'weak_proxy', IN: 'none', LA: 'none', MEA: 'none' },
  },
  {
    id: 'cpo', name: 'Palm kernel oil', rep: 'good_proxy', rep_from: 'APAC',
    cells: { GLOBAL: 'good_proxy', EU: 'none', NA: 'none', APAC: 'good_proxy', CN: 'good_proxy', IN: 'weak_proxy', LA: 'none', MEA: 'none' },
  },
  {
    id: 'ilm', name: 'Ilmenite ore', rep: 'blocked', rep_from: 'GLOBAL',
    cells: { GLOBAL: 'blocked', EU: 'blocked', NA: 'blocked', APAC: 'blocked', CN: 'blocked', IN: 'none', LA: 'none', MEA: 'none' },
  },
];

function divergence(c) {
  return REGIONS.filter(r => c.cells[r] !== 'none' && c.cells[r] !== c.rep).length;
}

export default function RegionProxyPreview() {
  const [sel, setSel] = useState(null); // { commodity, region }

  const diverging = COMMODITIES.filter(c => divergence(c) > 0).length;
  const cell = sel ? COMMODITIES.find(c => c.id === sel.commodity) : null;
  const cellStatus = cell ? cell.cells[sel.region] : null;

  return (
    <div className="ca-page ca-fade-in">
      <h1 className="ca-h1">Per-region proxy fidelity</h1>
      <p className="ca-subtitle">
        How well each commodity is actually sourced in each region — instead of one badge standing in for all of them.
      </p>

      <PreviewBanner
        scrum="Scrum 57 follow-up — re-scoped"
        title="Per-region sourcing, as a read"
        summary="Do not build the (commodity, region) table this was originally scoped as. That plan is superseded:
                 IndexCard already carries region for every drop-loaded series, so the data mostly exists and
                 nothing reads it. What is missing is this screen and an endpoint behind it. Cells that disagree
                 with the row's inherited badge are ringed — those are the ones currently telling a buyer
                 something about the wrong region."
        needs={[
          'GET /api/indexes/region-coverage — derivable from index_cards today for any drop-loaded series; the read is what is absent, not the data',
          'The Index Library status chip reads the card’s region instead of the series-level representative. That single change is most of the user-facing value here',
          'seed_index_metadata.py (the pre-drop workbook path) still collapses 158 feeds onto one representative. It is marked SUPERSEDED but still runs, so that residue is the real remaining gap',
          'proxy_derivation.derive_value takes a region, so a proxy that is good in NA and weak in CN stops producing equally-trusted numbers',
          'If a per-region spec needs to be editable, extend IndexDossier — it is already region-aware and already shipped. A second region-nullable table duplicating it was explicitly declined',
        ]}
        endpoints={[
          'GET /api/indexes/region-coverage                      -> the matrix below',
          'PUT /api/dossiers/series/{id}/regions/{region}        -> per-region spec, on the shipped dossier model',
        ]}
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="ca-metric" style={{ flex: '1 1 160px' }}>
          <div className="ca-metric-val">{COMMODITIES.length}</div>
          <div className="ca-metric-lbl">Multi-region commodities</div>
        </div>
        <div className="ca-metric" style={{ flex: '1 1 160px' }}>
          <div className="ca-metric-val" style={{ color: 'var(--accent3)' }}>{diverging}</div>
          <div className="ca-metric-lbl">With a region that disagrees</div>
        </div>
        <div className="ca-metric" style={{ flex: '1 1 160px' }}>
          <div className="ca-metric-val">
            {COMMODITIES.reduce((s, c) => s + divergence(c), 0)}
          </div>
          <div className="ca-metric-lbl">Mislabelled region cells</div>
        </div>
      </div>

      <div className="ca-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div className="ca-card-title" style={{ marginBottom: 0 }}>Coverage matrix</div>
          <span style={{ fontSize: 10, color: 'var(--muted)', display: 'inline-flex', gap: 10, flexWrap: 'wrap' }}>
            {Object.entries(STATUS).map(([k, s]) => (
              <span key={k}>
                <span className="ca-badge" style={{ background: s.bg, color: s.color, marginRight: 4 }}>{s.short}</span>
                {s.label}
              </span>
            ))}
          </span>
          <PreviewBadge style={{ marginLeft: 'auto' }} />
        </div>

        <div className="ca-scroll-x">
          <table className="ca-table">
            <caption className="ca-sr-only">
              Retrieval status per commodity and region. A ringed cell disagrees with the status the index row
              currently reports for every region.
            </caption>
            <thead>
              <tr>
                <th>Commodity</th>
                <th>Index row says</th>
                {REGIONS.map(r => <th key={r} style={{ textAlign: 'center' }}>{r}</th>)}
              </tr>
            </thead>
            <tbody>
              {COMMODITIES.map(c => {
                const rep = STATUS[c.rep];
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td>
                      <span className="ca-badge" style={{ background: rep.bg, color: rep.color }}>{rep.label}</span>
                      <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 6 }}>from {c.rep_from}</span>
                    </td>
                    {REGIONS.map(r => {
                      const st = STATUS[c.cells[r]];
                      const differs = c.cells[r] !== 'none' && c.cells[r] !== c.rep;
                      const active = sel && sel.commodity === c.id && sel.region === r;
                      return (
                        <td key={r} style={{ textAlign: 'center', padding: 4 }}>
                          <button
                            type="button"
                            onClick={() => setSel({ commodity: c.id, region: r })}
                            aria-label={`${c.name} in ${r}: ${st.label}${differs ? ', disagrees with the index row' : ''}`}
                            title={`${st.label}${differs ? ' — disagrees with the index row' : ''}`}
                            style={{
                              width: 30, height: 26, borderRadius: 6, cursor: 'pointer',
                              background: st.bg, color: st.color,
                              fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
                              border: differs ? '1px solid var(--accent3)' : '1px solid transparent',
                              outline: active ? '2px solid var(--accent)' : 'none',
                            }}
                          >
                            {st.short}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ca-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div className="ca-card-title" style={{ marginBottom: 0 }}>Per-region sourcing spec</div>
          <PreviewBadge />
        </div>
        {!cell ? (
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Pick a cell above to see how that one region is sourced.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700 }}>
                {cell.name} · {sel.region}
              </span>
              <span className="ca-badge" style={{ background: STATUS[cellStatus].bg, color: STATUS[cellStatus].color }}>
                {STATUS[cellStatus].label}
              </span>
              {cellStatus !== 'none' && cellStatus !== cell.rep && (
                <span className="ca-badge" style={{ background: 'var(--warn-bg)', color: 'var(--accent3)' }}>
                  index row reports {STATUS[cell.rep].label}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ flex: '1 1 200px' }}>
                <label className="ca-label" htmlFor="rp-status">Retrieval status</label>
                <select id="rp-status" className="ca-select" defaultValue={cellStatus} style={{ width: '100%' }}>
                  {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                </select>
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <label className="ca-label" htmlFor="rp-base">Base series</label>
                <input id="rp-base" className="ca-input" defaultValue="" placeholder="e.g. FE-MB" style={{ width: '100%' }} />
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <label className="ca-label" htmlFor="rp-spread">Spread</label>
                <input id="rp-spread" className="ca-input" type="number" placeholder="0" style={{ width: '100%' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="ca-btn ca-btn-primary ca-btn-sm">Save this region</button>
              <WiringNote>no endpoint yet — decide where a per-region spec lives before building this half</WiringNote>
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 12 }}>
              A spec saved here would be executed by proxy_derivation.derive_value, which already runs and has
              nothing to run on: all 128 series carrying proxy_logic today have a null operation and a null
              base_index, so the executor is live and idle. That is a configuration gap, not a code gap — worth
              knowing before anyone plans an engine change here.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
