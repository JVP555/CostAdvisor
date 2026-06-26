import { useState } from 'react';
import { DriftBar, GroupHeader, useOpenSet } from './wsCharts';

/* Monitor area — re-skin of the mockup's "Monitor" view. Demo data aligned to
 * the Portfolio products. Read-only; action buttons are visual only. */

const FAMILIES = [
  { key: 'surfactants', label: 'Surfactants' },
  { key: 'solvents', label: 'Solvents' },
  { key: 'resins', label: 'Resins & polymers' },
  { key: 'oleo', label: 'Oleochemicals' },
];

// status: alert | watch | ok | draft
const ROWS = [
  { ref: 'CA-SURF-001', product: 'LABS Surfactant', supplier: 'Sasol Europe', family: 'surfactants', status: 'alert',
    shouldCost: '€1,584/t', actual: '€1,840/t', period: 'Q2 2026', gap: '+€256/t', drift: 256, driftMax: 300,
    invoice: 'Q2 received', margin: '18.6%', marginOut: true, bench: '7–11%', benchBadge: 'Above' },
  { ref: 'CA-SOLV-001', product: 'Ethylene oxide', supplier: 'INEOS', family: 'solvents', status: 'watch',
    shouldCost: '€962/t', actual: '€1,010/t', period: 'Q2 2026', gap: '+€48/t', drift: 48, driftMax: 300,
    invoice: 'Q2 received', margin: '12.4%', marginOut: false, bench: '9–13%', benchBadge: 'In range' },
  { ref: 'CA-SOLV-002', product: 'Caustic soda', supplier: 'Olin Europe', family: 'solvents', status: 'ok',
    shouldCost: '€338/t', actual: '€352/t', period: 'Q2 2026', gap: '+€14/t', drift: 14, driftMax: 300,
    invoice: 'Q2 received', margin: '9.8%', marginOut: false, bench: '8–12%', benchBadge: 'In range' },
  { ref: 'CA-RESI-001', product: 'Styrene monomer', supplier: 'LyondellBasell', family: 'resins', status: 'ok',
    shouldCost: '€842/t', actual: '€858/t', period: 'Q2 2026', gap: '+€16/t', drift: 16, driftMax: 300,
    invoice: 'Q2 received', margin: '10.5%', marginOut: false, bench: '8–12%', benchBadge: 'In range' },
  { ref: 'CA-OLEO-001', product: 'Fatty alcohols C12/C14', supplier: 'Cognis', family: 'oleo', status: 'draft',
    shouldCost: '—', actual: '€2,140/t', period: 'Q2 2026', gap: '—', drift: 0, driftMax: 300,
    invoice: 'Formula draft', margin: '—', marginOut: false, bench: '—', benchBadge: null },
  { ref: 'CA-OLEO-002', product: 'Glycerine 99.7%', supplier: 'Emery Oleochemicals', family: 'oleo', status: 'draft',
    shouldCost: '—', actual: '€980/t', period: 'Q2 2026', gap: '—', drift: 0, driftMax: 300,
    invoice: 'Formula draft', margin: '—', marginOut: false, bench: '—', benchBadge: null },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'All products' },
  { key: 'alert', label: 'Alerts only' },
  { key: 'watch', label: 'Watch' },
  { key: 'ok', label: 'On track' },
  { key: 'draft', label: 'Formula draft' },
];

const STATUS_COLOR = { alert: 'var(--accent2)', watch: 'var(--accent3)', ok: 'var(--accent)', draft: 'var(--muted)' };

const TRIGGERS = [
  { tone: 'alert', title: 'LABS Surfactant · Sasol Europe', pct: '92%', detail: 'Index movement −14.5% vs starting point; price barely moved. Renegotiation clause proximity high.', action: 'Open renegotiation this quarter' },
  { tone: 'watch', title: 'Ethylene oxide · INEOS', pct: '64%', detail: 'Gap widening on ethylene softening. Worth a watching brief before next invoice.', action: 'Prepare cheat sheet' },
  { tone: 'ok', title: 'Solvents & resins', pct: '28%', detail: 'Tracking should-cost within tolerance. No action needed.', action: 'Monitor' },
];

function Tag({ children, color, bg }) {
  return <span className="ca-badge" style={{ background: bg, color }}>{children}</span>;
}

export default function MonitorArea() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [familyFilter, setFamilyFilter] = useState('all');
  const [openSet, toggle] = useOpenSet(FAMILIES.map(f => f.key));

  const rows = ROWS.filter(r =>
    (statusFilter === 'all' || r.status === statusFilter) &&
    (familyFilter === 'all' || r.family === familyFilter) &&
    (!search || `${r.product} ${r.supplier} ${r.ref}`.toLowerCase().includes(search.toLowerCase()))
  );

  const stats = [
    { lbl: 'Products in portfolio', val: '6' },
    { lbl: 'Should-costs live', val: '4 / 6' },
    { lbl: 'Estimated drift', val: '€612K', color: 'var(--accent2)' },
    { lbl: 'Awaiting invoice', val: '2' },
  ];

  return (
    <div className="ca-page ca-fade-in">
      <div className="ca-h1">Monitor</div>
      <p className="ca-subtitle">Should-cost is always live, driven by your linked indices — watch where actuals drift away from it.</p>

      <div style={{ display: 'flex', gap: 16, margin: '16px 0', flexWrap: 'wrap' }}>
        {stats.map(s => (
          <div key={s.lbl} className="ca-card ca-metric" style={{ flex: '1 1 180px' }}>
            <div className="ca-metric-val" style={{ color: s.color }}>{s.val}</div>
            <div className="ca-metric-lbl">{s.lbl}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input className="ca-input" style={{ maxWidth: 220 }} placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} />
        {STATUS_FILTERS.map(f => (
          <button key={f.key} className={`ca-btn ca-btn-sm ${statusFilter === f.key ? 'ca-btn-primary' : 'ca-btn-ghost'}`} onClick={() => setStatusFilter(f.key)}>{f.label}</button>
        ))}
        <span style={{ width: 1, height: 20, background: 'var(--border)' }} />
        <button className={`ca-btn ca-btn-sm ${familyFilter === 'all' ? 'ca-btn-primary' : 'ca-btn-ghost'}`} onClick={() => setFamilyFilter('all')}>All families</button>
        {FAMILIES.map(f => (
          <button key={f.key} className={`ca-btn ca-btn-sm ${familyFilter === f.key ? 'ca-btn-primary' : 'ca-btn-ghost'}`} onClick={() => setFamilyFilter(f.key)}>{f.label}</button>
        ))}
      </div>

      <div className="ca-card">
        <div className="ca-scroll-x">
          <table className="ca-table">
            <thead>
              <tr>
                <th></th><th>Ref</th><th>Product</th><th className="right">Should-cost</th>
                <th className="right">Last actual</th><th>Period</th><th className="right">Movement gap</th>
                <th>Drift</th><th>Invoice</th><th className="right">Implied margin</th><th>Benchmark</th><th></th>
              </tr>
            </thead>
            <tbody>
              {FAMILIES.map(fam => {
                const famRows = rows.filter(r => r.family === fam.key);
                if (!famRows.length) return null;
                const open = openSet.has(fam.key);
                const alerts = famRows.filter(r => r.status === 'alert').length;
                return (
                  <>
                    <tr key={fam.key}>
                      <td colSpan={12} style={{ padding: 0 }}>
                        <GroupHeader label={fam.label} count={`${famRows.length}${alerts ? ` · ${alerts} alert` : ''}`} open={open} onToggle={() => toggle(fam.key)} />
                      </td>
                    </tr>
                    {open && famRows.map(r => (
                      <tr key={r.ref} style={{ borderLeft: `3px solid ${STATUS_COLOR[r.status]}` }}>
                        <td style={{ width: 4, padding: 0, background: STATUS_COLOR[r.status] }} />
                        <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{r.ref}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.product}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.supplier}</div>
                        </td>
                        <td className="right" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {r.shouldCost}
                          {r.shouldCost !== '—' && <div><Tag color="var(--accent)" bg="var(--success-bg)">live</Tag></div>}
                        </td>
                        <td className="right" style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{r.actual}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{r.period}</td>
                        <td className="right" style={{ fontFamily: "'JetBrains Mono', monospace", color: r.status === 'alert' ? 'var(--accent2)' : r.status === 'watch' ? 'var(--accent3)' : 'var(--text)' }}>{r.gap}</td>
                        <td><DriftBar value={r.drift} max={r.driftMax} color={STATUS_COLOR[r.status]} /></td>
                        <td>
                          <Tag color={r.invoice.includes('received') ? 'var(--accent)' : r.invoice.includes('draft') ? 'var(--muted)' : 'var(--accent3)'}
                               bg={r.invoice.includes('received') ? 'var(--success-bg)' : r.invoice.includes('draft') ? 'var(--neutral-bg)' : 'var(--warn-bg)'}>{r.invoice}</Tag>
                        </td>
                        <td className="right" style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: r.marginOut ? 'var(--accent2)' : 'var(--text)' }}>{r.margin}</td>
                        <td style={{ fontSize: 11 }}>
                          {r.bench}{' '}
                          {r.benchBadge && <Tag color={r.benchBadge === 'Above' ? 'var(--accent2)' : 'var(--accent)'} bg={r.benchBadge === 'Above' ? 'var(--danger-bg)' : 'var(--success-bg)'}>{r.benchBadge}</Tag>}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="ca-btn ca-btn-ghost ca-btn-sm">Negotiate</button>
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ca-h2" style={{ marginTop: 24 }}>Trigger radar</div>
      <p className="ca-subtitle">Proximity to a renegotiation trigger — how close each position is to being worth acting on.</p>
      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        {TRIGGERS.map((t, i) => (
          <div key={i} className="ca-card" style={{ flex: '1 1 280px', borderTop: `3px solid ${STATUS_COLOR[t.tone]}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontWeight: 600 }}>{t.title}</div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: STATUS_COLOR[t.tone] }}>{t.pct}</div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '8px 0' }}>{t.detail}</p>
            <div style={{ fontSize: 12, color: STATUS_COLOR[t.tone], fontWeight: 600 }}>→ {t.action}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
