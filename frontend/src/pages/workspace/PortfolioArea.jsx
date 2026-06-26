import { useState } from 'react';
import { GroupHeader, useOpenSet } from './wsCharts';

/* ──────────────────────────────────────────────────────────────────────
 * Portfolio area — re-skin of the mockup's "Product portfolio" view.
 * Demo data transcribed verbatim from sample_idea/costadvisor_mockup.html
 * (view-portfolio). Read-only presentation; actions are visual only.
 * ──────────────────────────────────────────────────────────────────── */

const FAMILIES = [
  { key: 'oleo', label: 'Oleochemicals' },
  { key: 'resins', label: 'Resins & polymers' },
  { key: 'solvents', label: 'Solvents' },
  { key: 'surfactants', label: 'Surfactants' },
];

const PRODUCTS = [
  { ref: 'CA-OLEO-001', name: 'Fatty alcohols C12/C14', supplier: 'Cognis', shipFrom: 'Malaysia', shipTo: 'Lyon, FR', family: 'oleo', status: 'draft', shouldCost: null },
  { ref: 'CA-OLEO-002', name: 'Glycerine 99.7%', supplier: 'Emery Oleochemicals', shipFrom: 'Malaysia', shipTo: 'Lyon, FR', family: 'oleo', status: 'draft', shouldCost: null },
  { ref: 'CA-RESI-001', name: 'Styrene monomer', supplier: 'LyondellBasell', shipFrom: 'Netherlands', shipTo: 'Lyon, FR', family: 'resins', status: 'complete', shouldCost: '€842/t' },
  { ref: 'CA-SOLV-001', name: 'Ethylene oxide', supplier: 'INEOS', shipFrom: 'Belgium', shipTo: 'Hamburg, DE', family: 'solvents', status: 'complete', shouldCost: '€962/t' },
  { ref: 'CA-SOLV-002', name: 'Caustic soda', supplier: 'Olin Europe', shipFrom: 'Netherlands', shipTo: 'Lyon, FR', family: 'solvents', status: 'complete', shouldCost: '€338/t' },
  { ref: 'CA-SURF-001', name: 'LABS Surfactant', supplier: 'Sasol Europe', shipFrom: 'Germany', shipTo: 'Lyon, FR', family: 'surfactants', status: 'complete', shouldCost: '€1,584/t' },
];

const FAMILY_FILTERS = [
  { key: 'all', label: 'All families' },
  ...FAMILIES,
];

const STATUS_FILTERS = [
  { key: 'all', label: 'All statuses' },
  { key: 'complete', label: '● Complete' },
  { key: 'draft', label: '◯ Draft' },
];

const GROUP_BY = [
  { key: 'family', label: 'Family' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'region', label: 'Region' },
];

function StatusBadge({ status }) {
  const complete = status === 'complete';
  return (
    <span
      className="ca-badge"
      style={{
        background: complete ? 'var(--success-bg)' : 'var(--warn-bg)',
        color: complete ? 'var(--accent)' : 'var(--accent3)',
      }}
    >
      {complete ? '● Complete' : '◯ Draft'}
    </span>
  );
}

export default function PortfolioArea() {
  const [search, setSearch] = useState('');
  const [familyFilter, setFamilyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupBy, setGroupBy] = useState('family');

  // All groups start open (matches mockup's expanded ▼ default).
  const [openSet, toggleOpen] = useOpenSet(
    FAMILIES.map(f => f.key).concat(
      PRODUCTS.map(p => p.supplier),
      PRODUCTS.map(p => p.shipFrom),
    ),
  );

  const q = search.trim().toLowerCase();
  const filtered = PRODUCTS.filter(p => {
    if (familyFilter !== 'all' && p.family !== familyFilter) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (q && !p.name.toLowerCase().includes(q) && !p.ref.toLowerCase().includes(q)) return false;
    return true;
  });

  // Build groups according to the active group-by dimension.
  const groups = (() => {
    if (groupBy === 'supplier') {
      const keys = [...new Set(filtered.map(p => p.supplier))];
      return keys.map(k => ({ key: k, label: k, rows: filtered.filter(p => p.supplier === k) }));
    }
    if (groupBy === 'region') {
      const keys = [...new Set(filtered.map(p => p.shipFrom))];
      return keys.map(k => ({ key: k, label: k, rows: filtered.filter(p => p.shipFrom === k) }));
    }
    return FAMILIES
      .map(f => ({ key: f.key, label: f.label, rows: filtered.filter(p => p.family === f.key) }))
      .filter(g => g.rows.length > 0);
  })();

  const stats = [
    { val: '6', lbl: 'Total products', sub: 'Across 4 families' },
    { val: '4', lbl: 'Formulas complete', sub: 'Should-cost live' },
    { val: '2', lbl: 'Draft formulas', sub: 'Action needed' },
    { val: '5', lbl: 'Suppliers', sub: 'Across 4 regions' },
  ];

  const filterBtn = (active) => (active ? 'ca-btn ca-btn-primary ca-btn-sm' : 'ca-btn ca-btn-ghost ca-btn-sm');

  return (
    <div className="ca-page ca-fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="ca-h1">Product portfolio</div>
          <p className="ca-subtitle">
            Every product, its supplier and route, and whether its should-cost formula is live.
          </p>
        </div>
        <button className="ca-btn ca-btn-primary">+ Add product</button>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0', flexWrap: 'wrap' }}>
        <input
          className="ca-select"
          style={{ width: 200 }}
          placeholder="Search products or ref..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {FAMILY_FILTERS.map(f => (
            <button key={f.key} className={filterBtn(familyFilter === f.key)} onClick={() => setFamilyFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 2px' }} />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map(s => (
            <button key={s.key} className={filterBtn(statusFilter === s.key)} onClick={() => setStatusFilter(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Group by</span>
          {GROUP_BY.map(g => (
            <button key={g.key} className={filterBtn(groupBy === g.key)} onClick={() => setGroupBy(g.key)}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
        {stats.map(s => (
          <div key={s.lbl} className="ca-metric">
            <div className="ca-metric-lbl">{s.lbl}</div>
            <div className="ca-metric-val">{s.val}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Grouped table */}
      <div className="ca-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="ca-scroll-x">
          <table className="ca-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 20 }} />
                <th>Ref</th>
                <th>Product</th>
                <th>Supplier</th>
                <th>Ship-from</th>
                <th>Ship-to</th>
                <th>Formula</th>
                <th>Should-cost today</th>
                <th style={{ width: 130 }} />
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
                    No products match these filters.
                  </td>
                </tr>
              )}
              {groups.map(group => {
                const open = openSet.has(group.key);
                const completeCount = group.rows.filter(r => r.status === 'complete').length;
                return (
                  <FragmentGroup key={group.key}>
                    <tr style={{ cursor: 'pointer' }} onClick={() => toggleOpen(group.key)}>
                      <td colSpan={9} style={{ background: 'var(--surface2)', padding: '7px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                          <span style={{ fontSize: 11, display: 'inline-block', transition: 'transform .15s', transform: open ? 'none' : 'rotate(-90deg)' }}>▾</span>
                          {group.label}
                          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}>
                            {group.rows.length} {group.rows.length === 1 ? 'product' : 'products'} · {completeCount} {completeCount === 1 ? 'formula' : 'formulas'} complete
                          </span>
                        </div>
                      </td>
                    </tr>
                    {open && group.rows.map(p => (
                      <tr key={p.ref}>
                        <td />
                        <td style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: 'var(--muted)' }}>{p.ref}</td>
                        <td><div style={{ fontWeight: 500 }}>{p.name}</div></td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.supplier}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.shipFrom}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.shipTo}</td>
                        <td><StatusBadge status={p.status} /></td>
                        <td>
                          {p.shouldCost ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 500, color: 'var(--accent)' }}>{p.shouldCost}</span>
                              <span className="ca-badge" style={{ background: 'var(--success-bg)', color: 'var(--accent)' }}>live</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>—</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {p.status === 'draft' ? (
                              <button className="ca-btn ca-btn-primary ca-btn-sm">Complete formula</button>
                            ) : (
                              <>
                                <button className="ca-btn ca-btn-ghost ca-btn-sm">Monitor</button>
                                {p.ref !== 'CA-SOLV-002' && (
                                  <button className="ca-btn ca-btn-primary ca-btn-sm">Negotiate</button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </FragmentGroup>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* Thin wrapper so a group's header + rows share one keyed parent without
 * inserting an invalid element inside <tbody>. */
function FragmentGroup({ children }) {
  return <>{children}</>;
}
