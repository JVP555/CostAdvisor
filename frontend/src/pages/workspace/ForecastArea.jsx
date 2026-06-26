import { useState } from 'react';
import { MultiLineChart, GroupHeader, useOpenSet } from './wsCharts';

/* Forecast area — re-skin of the mockup's "Cost forecast" view. Demo data;
 * the forecast engine itself is net-new (Wave 2), so values are illustrative. */

const X = ['Q1 24', 'Q2 24', 'Q3 24', 'Q4 24', 'Q1 25', 'Q2 25', 'Q3 25', 'Q4 25', 'Q1 26', 'Q2 26', 'Q3 26', 'Q4 26', 'Q1 27', 'Q2 27'];
const SPLIT = 9; // Q2 26 = end of history

// €M annual-spend-equivalent series
const ACTUAL =   [30.1, 30.4, 29.8, 29.2, 28.9, 28.7, 28.6, 28.5, 28.4, 28.4, null, null, null, null];
const BASE =     [30.1, 30.4, 29.8, 29.2, 28.9, 28.7, 28.6, 28.5, 28.4, 28.4, 27.9, 27.4, 27.0, 26.8];
const BEAR =     [null, null, null, null, null, null, null, null, null, 28.4, 28.7, 28.9, 29.1, 29.2];
const BULL =     [null, null, null, null, null, null, null, null, null, 28.4, 27.1, 26.0, 24.9, 24.1];

const CASES = [
  { key: 'base', label: 'Base case' },
  { key: 'bear', label: 'Bear case' },
  { key: 'bull', label: 'Bull case' },
];

const FAMILIES = [
  { key: 'surfactants', label: 'Surfactants' },
  { key: 'solvents', label: 'Solvents' },
  { key: 'resins', label: 'Resins & polymers' },
];

const PROJECTIONS = [
  { ref: 'CA-SURF-001', product: 'LABS Surfactant', family: 'surfactants', vol: '1,200 t', now: '€1,584', q3: '€1,548', q4: '€1,515', q1: '€1,489', q2: '€1,470', change: '−7.2%', changeUp: false, impact: '−€137K', driver: 'Benzene & naphtha softening' },
  { ref: 'CA-SOLV-001', product: 'Ethylene oxide', family: 'solvents', vol: '480 t', now: '€962', q3: '€974', q4: '€982', q1: '€988', q2: '€995', change: '+3.4%', changeUp: true, impact: '+€16K', driver: 'Ethylene mild recovery' },
  { ref: 'CA-SOLV-002', product: 'Caustic soda', family: 'solvents', vol: '2,100 t', now: '€338', q3: '€333', q4: '€330', q1: '€328', q2: '€326', change: '−3.6%', changeUp: false, impact: '−€25K', driver: 'Energy softening' },
  { ref: 'CA-RESI-001', product: 'Styrene monomer', family: 'resins', vol: '900 t', now: '€842', q3: '€828', q4: '€818', q1: '€810', q2: '€805', change: '−4.4%', changeUp: false, impact: '−€33K', driver: 'Benzene softening' },
];

const ASSUMPTIONS = [
  { name: 'Benzene (ICIS EU)', val: '−3% / qtr', note: 'continued softening', color: 'var(--accent)' },
  { name: 'Naphtha (Platts)', val: '−1% / qtr', note: 'tracking crude', color: 'var(--accent)' },
  { name: 'Ethylene (ICIS EU)', val: '+1% / qtr', note: 'mild recovery', color: 'var(--accent3)' },
  { name: 'Energy (Eurostat)', val: '−1% / qtr', note: 'easing', color: 'var(--accent)' },
  { name: 'EU CPI', val: '+1.2% / qtr', note: 'persistent inflation', color: 'var(--accent3)' },
];

export default function ForecastArea() {
  const [activeCase, setActiveCase] = useState('base');
  const [horizon, setHorizon] = useState('8q');
  const [openSet, toggle] = useOpenSet(FAMILIES.map(f => f.key));

  const series = [
    { name: 'Actual spend', color: 'var(--accent2)', values: ACTUAL, dashed: false },
    { name: 'Should-cost (base)', color: 'var(--accent)', values: BASE, dashed: false },
    { name: 'Bear', color: 'var(--accent3)', values: BEAR, dashed: true },
    { name: 'Bull', color: 'var(--accent4)', values: BULL, dashed: true },
  ];

  const stats = [
    { lbl: 'Current annual spend', val: '€28.4M', color: 'var(--text)', bg: 'var(--neutral-bg)' },
    { lbl: 'Projected (base)', val: '€26.8M', sub: '−5.6%', color: 'var(--accent)', bg: 'var(--success-bg)', case: 'base' },
    { lbl: 'Projected (bear)', val: '€29.2M', sub: '+2.8%', color: 'var(--accent3)', bg: 'var(--warn-bg)', case: 'bear' },
    { lbl: 'Projected (bull)', val: '€24.1M', sub: '−15.1%', color: 'var(--accent4)', bg: 'var(--info-bg)', case: 'bull' },
  ];

  return (
    <div className="ca-page ca-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="ca-h1">Cost forecast</div>
          <p className="ca-subtitle">Forward should-cost under Base / Bear / Bull index assumptions. Illustrative — the forecast engine is a Wave-2 build.</p>
        </div>
        <button className="ca-btn ca-btn-ghost">↓ Export report</button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '14px 0' }}>
        {CASES.map(c => (
          <button key={c.key} className={`ca-btn ca-btn-sm ${activeCase === c.key ? 'ca-btn-primary' : 'ca-btn-ghost'}`} onClick={() => setActiveCase(c.key)}>{c.label}</button>
        ))}
        <span style={{ width: 1, height: 20, background: 'var(--border)' }} />
        {[['4q', '4 quarters'], ['8q', '8 quarters']].map(([k, l]) => (
          <button key={k} className={`ca-btn ca-btn-sm ${horizon === k ? 'ca-btn-primary' : 'ca-btn-ghost'}`} onClick={() => setHorizon(k)}>{l}</button>
        ))}
        <button className="ca-btn ca-btn-sm ca-btn-ghost" style={{ marginLeft: 'auto' }}>↓ Excel</button>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        {stats.map(s => (
          <div key={s.lbl} className="ca-card ca-metric" style={{ flex: '1 1 180px', background: s.bg, outline: s.case === activeCase ? `1px solid ${s.color}` : 'none' }}>
            <div className="ca-metric-val" style={{ color: s.color }}>{s.val}</div>
            <div className="ca-metric-lbl">{s.lbl}{s.sub ? ` · ${s.sub}` : ''}</div>
          </div>
        ))}
      </div>

      <div className="ca-card" style={{ marginBottom: 20 }}>
        <div className="ca-card-title">Annual spend — actual vs forecast scenarios</div>
        <MultiLineChart series={series} xLabels={X} splitIndex={SPLIT} splitLabel="Forecast" height={220} />
      </div>

      <div className="ca-card" style={{ marginBottom: 20 }}>
        <div className="ca-scroll-x">
          <table className="ca-table">
            <thead>
              <tr>
                <th></th><th>Ref</th><th>Product</th><th className="right">Vol/yr</th><th className="right">Now</th>
                <th className="right">Q3 26</th><th className="right">Q4 26</th><th className="right">Q1 27</th><th className="right">Q2 27</th>
                <th className="right">12M change</th><th className="right">12M impact</th><th>Key driver</th>
              </tr>
            </thead>
            <tbody>
              {FAMILIES.map(fam => {
                const fr = PROJECTIONS.filter(p => p.family === fam.key);
                if (!fr.length) return null;
                const open = openSet.has(fam.key);
                return (
                  <>
                    <tr key={fam.key}><td colSpan={12} style={{ padding: 0 }}><GroupHeader label={fam.label} count={fr.length} open={open} onToggle={() => toggle(fam.key)} /></td></tr>
                    {open && fr.map(p => (
                      <tr key={p.ref}>
                        <td></td>
                        <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{p.ref}</td>
                        <td style={{ fontWeight: 600 }}>{p.product}</td>
                        <td className="right" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{p.vol}</td>
                        <td className="right" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{p.now}</td>
                        <td className="right" style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, background: 'var(--neutral-bg)' }}>{p.q3}</td>
                        <td className="right" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{p.q4}</td>
                        <td className="right" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{p.q1}</td>
                        <td className="right" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{p.q2}</td>
                        <td className="right" style={{ fontFamily: "'JetBrains Mono', monospace", color: p.changeUp ? 'var(--accent3)' : 'var(--accent)' }}>{p.change}</td>
                        <td className="right" style={{ fontFamily: "'JetBrains Mono', monospace", color: p.changeUp ? 'var(--accent3)' : 'var(--accent)' }}>{p.impact}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.driver}</td>
                      </tr>
                    ))}
                  </>
                );
              })}
              <tr style={{ background: 'var(--success-bg)' }}>
                <td></td><td></td><td style={{ fontWeight: 700 }}>Portfolio total</td>
                <td colSpan={6}></td>
                <td className="right" style={{ fontWeight: 700, color: 'var(--accent)' }}>−5.6%</td>
                <td className="right" style={{ fontWeight: 700, color: 'var(--accent)' }}>−€1.6M</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="ca-h2">Index assumptions <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>(base case)</span></div>
      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        {ASSUMPTIONS.map(a => (
          <div key={a.name} className="ca-card" style={{ flex: '1 1 160px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.name}</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: a.color, margin: '4px 0' }}>{a.val}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.note}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12 }}>Bear / Bull scenarios apply ±15% to commodity-index trajectories.</p>
    </div>
  );
}
