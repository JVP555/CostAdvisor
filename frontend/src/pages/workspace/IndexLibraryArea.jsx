import { useState } from 'react';
import { Sparkline, GroupHeader, useOpenSet } from './wsCharts';

/*
 * Index library — workspace re-skin of the mockup's "Indexes" view.
 * Demo data transcribed verbatim from sample_idea/costadvisor_mockup.html (#view-indexes).
 *
 * `history` is ordered oldest → newest (Q3 2024 … Q2 2026) so it feeds the Sparkline
 * directly; the table renders Q2 2026 (latest, bold) first then walks back to Q3 2024,
 * matching the mockup's column order.
 */

const HIST_QUARTERS = ['Q2 2026', 'Q1 2026', 'Q4 2025', 'Q3 2025', 'Q2 2025', 'Q1 2025', 'Q4 2024', 'Q3 2024'];

// Type group metadata (label + count + sub-caption) in mockup order.
const GROUPS = [
  { key: 'commodity', label: 'Commodity indexes', count: 7, sub: 'feedstocks & chemicals', badgeLabel: 'Commodity', badgeClass: 'b-blue' },
  { key: 'energy', label: 'Energy indexes', count: 3, sub: 'gas, electricity, industrial', badgeLabel: 'Energy', badgeClass: 'b-amber' },
  { key: 'macro', label: 'CPI / Macro', count: 2, sub: 'inflation, labour', badgeLabel: 'CPI / Macro', badgeClass: 'b-green' },
  { key: 'logistics', label: 'Logistics indexes', count: 2, sub: 'ocean freight, road', badgeLabel: 'Logistics', badgeClass: 'b-gray' },
];

// values[] are the displayed cell strings newest→oldest (Q2 2026 … Q3 2024).
// history[] are the numeric series oldest→newest for the sparkline.
const INDEXES = [
  // ── Commodity ──
  {
    name: 'Benzene', type: 'commodity', provider: 'ICIS', region: 'eu', regionLabel: 'Europe', freq: 'Weekly',
    delta: -6.2, inUse: 'Yes',
    values: ['€892/t', '€904/t', '€918/t', '€931/t', '€944/t', '€956/t', '€1,020/t', '€1,050/t'],
    history: [1050, 1020, 956, 944, 931, 918, 904, 892],
  },
  {
    name: 'Naphtha', type: 'commodity', provider: 'Platts', region: 'eu', regionLabel: 'Europe', freq: 'Daily',
    delta: -3.1, inUse: 'Yes',
    values: ['€624/t', '€632/t', '€638/t', '€645/t', '€648/t', '€651/t', '€638/t', '€630/t'],
    history: [630, 638, 651, 648, 645, 638, 632, 624],
  },
  {
    name: 'Ethylene', type: 'commodity', provider: 'ICIS', region: 'eu', regionLabel: 'Europe', freq: 'Monthly',
    delta: 2.4, inUse: 'Yes',
    values: ['€1,124/t', '€1,108/t', '€1,096/t', '€1,084/t', '€1,072/t', '€1,060/t', '€1,048/t', '€1,096/t'],
    history: [1096, 1048, 1060, 1072, 1084, 1096, 1108, 1124],
  },
  {
    name: 'Sulphur', type: 'commodity', provider: 'Platts', region: 'eu', regionLabel: 'Europe', freq: 'Monthly',
    delta: -4.8, inUse: 'Yes',
    values: ['€148/t', '€152/t', '€156/t', '€158/t', '€160/t', '€162/t', '€154/t', '€155/t'],
    history: [155, 154, 162, 160, 158, 156, 152, 148],
  },
  {
    name: 'Crude palm oil (CPO)', type: 'commodity', provider: 'MPOB', region: 'global', regionLabel: 'Global', freq: 'Daily',
    delta: -8.1, inUse: 'Draft',
    values: ['$842/t', '$864/t', '$882/t', '$894/t', '$906/t', '$918/t', '$910/t', '$915/t'],
    history: [915, 910, 918, 906, 894, 882, 864, 842],
  },
  {
    name: 'Palm kernel oil (PKO)', type: 'commodity', provider: 'MPOB', region: 'global', regionLabel: 'Global', freq: 'Daily',
    delta: -5.3, inUse: 'Draft',
    values: ['$1,024/t', '$1,042/t', '$1,058/t', '$1,072/t', '$1,084/t', '$1,096/t', '$1,080/t', '$1,082/t'],
    history: [1082, 1080, 1096, 1084, 1072, 1058, 1042, 1024],
  },
  {
    name: 'Benzene (US)', type: 'commodity', provider: 'ICIS', region: 'us', regionLabel: 'North America', freq: 'Weekly',
    delta: -4.1, inUse: 'No',
    values: ['$724/t', '$738/t', '$745/t', '$752/t', '$758/t', '$762/t', '$812/t', '$755/t'],
    history: [755, 812, 762, 758, 752, 745, 738, 724],
  },
  // ── Energy ──
  {
    name: 'Industrial energy', type: 'energy', provider: 'Eurostat', region: 'eu', regionLabel: 'Europe', freq: 'Quarterly',
    delta: -3.8, inUse: 'Yes',
    values: ['96.2', '97.4', '98.8', '99.2', '99.8', '100.1', '106.2', '100.0'],
    history: [100.0, 106.2, 100.1, 99.8, 99.2, 98.8, 97.4, 96.2],
  },
  {
    name: 'Natural gas (TTF)', type: 'energy', provider: 'ICE', region: 'eu', regionLabel: 'Europe', freq: 'Daily',
    delta: 12.4, inUse: 'No',
    values: ['€38/MWh', '€36/MWh', '€34/MWh', '€32/MWh', '€30/MWh', '€28/MWh', '€62/MWh', '€33/MWh'],
    history: [33, 62, 28, 30, 32, 34, 36, 38],
  },
  {
    name: 'Natural gas (Henry Hub)', type: 'energy', provider: 'NYMEX', region: 'us', regionLabel: 'North America', freq: 'Daily',
    delta: -18.2, inUse: 'No',
    values: ['$2.84/MMBtu', '$2.92', '$3.04', '$3.12', '$3.18', '$3.22', '$2.98', '$3.38'],
    history: [3.38, 2.98, 3.22, 3.18, 3.12, 3.04, 2.92, 2.84],
  },
  // ── CPI / Macro ──
  {
    name: 'EU CPI', type: 'macro', provider: 'ECB', region: 'eu', regionLabel: 'Europe', freq: 'Monthly',
    delta: 5.4, inUse: 'Yes',
    values: ['105.4', '104.8', '104.2', '103.6', '103.0', '102.4', '101.8', '101.2'],
    history: [101.2, 101.8, 102.4, 103.0, 103.6, 104.2, 104.8, 105.4],
  },
  {
    name: 'US CPI', type: 'macro', provider: 'BLS', region: 'us', regionLabel: 'North America', freq: 'Monthly',
    delta: 6.1, inUse: 'No',
    values: ['314.2', '312.1', '310.4', '308.2', '306.0', '303.8', '301.4', '299.0'],
    history: [299.0, 301.4, 303.8, 306.0, 308.2, 310.4, 312.1, 314.2],
  },
  // ── Logistics ──
  {
    name: 'Freightos Baltic (FBX)', type: 'logistics', provider: 'Freightos', region: 'global', regionLabel: 'Global', freq: 'Weekly',
    delta: -22.1, inUse: 'Draft',
    values: ['$2,840/FEU', '$2,920', '$3,040', '$3,180', '$3,380', '$3,620', '$4,820', '$3,650'],
    history: [3650, 4820, 3620, 3380, 3180, 3040, 2920, 2840],
  },
  {
    name: 'Road freight (EU)', type: 'logistics', provider: 'Transporeon', region: 'eu', regionLabel: 'Europe', freq: 'Monthly',
    delta: -1.6, inUse: 'Yes',
    values: ['98.4', '98.8', '99.1', '99.4', '99.6', '99.8', '100.0', '100.0'],
    history: [100.0, 100.0, 99.8, 99.6, 99.4, 99.1, 98.8, 98.4],
  },
];

const STAT_TILES = [
  { label: 'Commodity indexes', value: '7', sub: 'Linked to portfolio formulas' },
  { label: 'Energy indexes', value: '3', sub: 'Linked to portfolio formulas' },
  { label: 'CPI / Macro', value: '2', sub: 'Linked to portfolio formulas' },
  { label: 'Logistics', value: '2', sub: 'Linked to portfolio formulas' },
];

const TYPE_FILTERS = [
  { key: 'all', label: 'All types' },
  { key: 'commodity', label: 'Commodity' },
  { key: 'energy', label: 'Energy' },
  { key: 'macro', label: 'CPI / Macro' },
  { key: 'logistics', label: 'Logistics' },
];

const REGION_FILTERS = [
  { key: 'all', label: 'All regions' },
  { key: 'eu', label: 'Europe' },
  { key: 'us', label: 'North America' },
  { key: 'global', label: 'Global' },
];

// In-use badge → CostAdvisor badge tone.
function inUseBadge(status) {
  if (status === 'Yes') return { cls: 'ca-badge', style: { background: 'var(--success-bg)', color: 'var(--accent)' } };
  if (status === 'Draft') return { cls: 'ca-badge', style: { background: 'var(--warn-bg)', color: 'var(--accent3)' } };
  return { cls: 'ca-badge', style: { background: 'var(--neutral-bg)', color: 'var(--muted)' } };
}

// Type badge tone per group.
function typeBadgeStyle(badgeClass) {
  switch (badgeClass) {
    case 'b-blue': return { background: 'var(--info-bg)', color: 'var(--accent4)' };
    case 'b-amber': return { background: 'var(--warn-bg)', color: 'var(--accent3)' };
    case 'b-green': return { background: 'var(--success-bg)', color: 'var(--accent)' };
    default: return { background: 'var(--neutral-bg)', color: 'var(--muted)' };
  }
}

function fmtDelta(d) {
  const sign = d > 0 ? '+' : '−'; // unicode minus for negatives
  return `${sign}${Math.abs(d).toFixed(1)}%`;
}

export default function IndexLibraryArea() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  // All type groups open by default (matches the mockup's expanded state).
  const [openSet, toggleGroup] = useOpenSet(GROUPS.map(g => g.key));

  const q = search.trim().toLowerCase();
  const matches = idx =>
    (typeFilter === 'all' || idx.type === typeFilter) &&
    (regionFilter === 'all' || idx.region === regionFilter) &&
    (!q || idx.name.toLowerCase().includes(q) || idx.provider.toLowerCase().includes(q));

  const cellStyle = { fontSize: 11, color: 'var(--muted)' };

  return (
    <div className="ca-page ca-fade-in">
      <div className="ca-h1">Index library</div>
      <p className="ca-subtitle">
        Indexes linked to products in your portfolio &middot; Managed in formula builder &middot; Sparklines: Q3 2024 &rarr; Q2 2026
      </p>

      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          className="ca-input"
          style={{ width: 180 }}
          placeholder="Search indexes..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 4 }}>
          {TYPE_FILTERS.map(f => (
            <button
              key={f.key}
              className={`ca-btn ca-btn-sm ${typeFilter === f.key ? 'ca-btn-primary' : 'ca-btn-ghost'}`}
              onClick={() => setTypeFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {REGION_FILTERS.map(f => (
            <button
              key={f.key}
              className={`ca-btn ca-btn-sm ${regionFilter === f.key ? 'ca-btn-primary' : 'ca-btn-ghost'}`}
              onClick={() => setRegionFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
        {STAT_TILES.map(t => (
          <div key={t.label} className="ca-metric">
            <div className="ca-metric-lbl">{t.label}</div>
            <div className="ca-metric-val">{t.value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{t.sub}</div>
          </div>
        ))}
      </div>

      {/* Big table, collapsible by type */}
      <div className="ca-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="ca-scroll-x">
          <table className="ca-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Index</th>
                <th>Type</th>
                <th>Provider</th>
                <th>Region</th>
                <th>Freq.</th>
                <th>vs Q1 2024</th>
                <th style={{ minWidth: 90 }}>2-yr trend</th>
                <th style={{ background: 'var(--info-bg)', color: 'var(--accent4)' }}>Q2 2026</th>
                {HIST_QUARTERS.slice(1).map(qt => <th key={qt}>{qt}</th>)}
                <th>In use</th>
              </tr>
            </thead>
            <tbody>
              {GROUPS.map(group => {
                const rows = INDEXES.filter(idx => idx.type === group.key && matches(idx));
                const open = openSet.has(group.key);
                // Hide an entire group header when active filters exclude its type.
                if (typeFilter !== 'all' && typeFilter !== group.key) return null;
                return (
                  <GroupSection key={group.key} group={group} open={open} onToggle={() => toggleGroup(group.key)}>
                    {open && rows.map(idx => {
                      const badge = inUseBadge(idx.inUse);
                      const deltaColor = idx.delta > 0 ? 'var(--accent2)' : 'var(--accent)';
                      return (
                        <tr key={idx.name}>
                          <td style={{ fontWeight: 500 }}>{idx.name}</td>
                          <td>
                            <span className="ca-badge" style={typeBadgeStyle(group.badgeClass)}>{group.badgeLabel}</span>
                          </td>
                          <td style={cellStyle}>{idx.provider}</td>
                          <td style={cellStyle}>{idx.regionLabel}</td>
                          <td style={cellStyle}>{idx.freq}</td>
                          <td style={{ fontWeight: 500, color: deltaColor }}>{fmtDelta(idx.delta)}</td>
                          <td><Sparkline data={idx.history} /></td>
                          <td style={{ fontSize: 12, fontWeight: 600, background: 'var(--info-bg)' }}>{idx.values[0]}</td>
                          {idx.values.slice(1).map((v, i) => (
                            <td key={i} style={cellStyle}>{v}</td>
                          ))}
                          <td><span className={badge.cls} style={badge.style}>{idx.inUse}</span></td>
                        </tr>
                      );
                    })}
                  </GroupSection>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/*
 * A collapsible type group: a full-width header row that toggles open/closed,
 * followed by its index rows (passed as children). Kept as a component so the
 * GroupHeader (a div) can live inside a table cell spanning all columns.
 */
function GroupSection({ group, open, onToggle, children }) {
  return (
    <>
      <tr>
        <td colSpan={16} style={{ background: 'var(--surface2)', padding: '7px 14px' }}>
          <GroupHeader
            label={group.label}
            count={`${group.count} · ${group.sub}`}
            open={open}
            onToggle={onToggle}
          />
        </td>
      </tr>
      {children}
    </>
  );
}
