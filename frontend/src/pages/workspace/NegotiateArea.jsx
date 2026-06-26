import { useState } from 'react';
import { MultiLineChart, TornadoChart, StackedBar, PriceLadder } from './wsCharts';

/* Negotiate area — re-skin of the mockup's Negotiate workspace (LABS Surfactant
 * · Sasol Europe). Two modes: Quick cheat-sheet and Full analysis (8 phases).
 * Demo data; the analytical engines behind phases 3–7 are net-new (Wave 2/3). */

const CTX = { product: 'LABS Surfactant', supplier: 'Sasol Europe', start: '€1,840/t · Q1 2024' };

const LADDER = [
  { label: 'Open with', value: '€1,584/t', sub: 'shadow formula today', tone: 'open' },
  { label: 'Target close', value: '€1,610/t', sub: 'realistic settlement', tone: 'target' },
  { label: 'Walk away', value: '€1,640/t', sub: 'hard ceiling', tone: 'walk' },
];
const LADDER_BASIS = 'ICIS Benzene 42% · Platts Naphtha 20% · Eurostat Energy 10% · EU CPI 12%';

const ARGUMENTS = [
  { arg: 'Index movements not passed through', data: 'Weighted indices fell −14.5% since Q1 2024; price barely moved', stance: 'HOLD' },
  { arg: 'CAPEX is not a variable cost', data: 'Fixed conversion is CPI-indexed, not a pass-through line', stance: 'HOLD' },
  { arg: 'Energy weight can flex', data: 'Open to 10%→12% in exchange for benzene reduction', stance: 'CAN FLEX' },
  { arg: 'Base period', data: 'Q1 2024 starting point is agreed; movement is the argument', stance: 'CAN FLEX' },
];

const MOVEMENT = [
  { name: 'Benzene (ICIS EU)', val: '−6%', tone: 'good', note: 'should have reduced price' },
  { name: 'Naphtha (Platts)', val: '−3%', tone: 'good', note: '' },
  { name: 'Energy (Eurostat)', val: '−4%', tone: 'good', note: '' },
  { name: 'CPI (EU)', val: '+5.4%', tone: 'warn', note: 'legitimately increased' },
];

const PHASES = [
  'Historical data', 'Formula builder', 'Index intelligence', 'Sensitivity',
  'Margin benchmark', 'Negotiation strategy', 'Risk register', 'Forward outlook',
];
const PHASE_STATE = ['done', 'done', 'done', 'done', 'done', 'current', 'todo', 'todo'];

const FORMULA = [
  { c: 'Benzene', w: 42, idx: 'ICIS EU Benzene', status: 'Key lever', tone: 'var(--accent2)' },
  { c: 'n-Paraffins', w: 20, idx: 'Platts Naphtha', status: 'Agreed', tone: 'var(--accent)' },
  { c: 'Sulphuric acid', w: 16, idx: 'Sulphur EU', status: 'Agreed', tone: 'var(--accent)' },
  { c: 'Energy', w: 10, idx: 'Eurostat Energy', status: 'Contested', tone: 'var(--accent3)' },
  { c: 'Fixed / CPI', w: 12, idx: 'EU CPI', status: 'Agreed', tone: 'var(--accent)' },
];

const TORNADO = [
  { label: 'Benzene (42%)', value: 129, suffix: '/t' },
  { label: 'n-Paraffins (20%)', value: 61, suffix: '/t' },
  { label: 'Sulphuric acid (16%)', value: 49, suffix: '/t' },
  { label: 'Fixed/CPI (12%)', value: 39, suffix: '/t' },
  { label: 'Energy (10%)', value: 31, suffix: '/t' },
];

const MARGIN_BRACKETS = [
  { label: '< 10 t/qtr', range: '18–26%', pct: 85, color: 'var(--accent2)' },
  { label: '10–50 t', range: '13–18%', pct: 65, color: 'var(--accent3)' },
  { label: '50–200 t', range: '9–13%', pct: 45, color: 'var(--accent4)' },
  { label: '200 t+ (you)', range: '7–11%', pct: 28, color: 'var(--accent)' },
];

const PLAYBOOK = [
  { counter: 'Your benzene weight too high', resp: 'Request SDS; ICIS supports 40–45%', stance: 'HOLD' },
  { counter: 'Energy needs higher weight', resp: 'Will raise to 12% for a benzene reduction', stance: 'CAN FLEX' },
  { counter: 'We have CAPEX to recover', resp: 'Fixed costs are CPI-indexed, not pass-through', stance: 'HOLD' },
  { counter: 'ICIS is not our index', resp: 'EU standard; Platts acceptable as alternative', stance: 'HOLD' },
  { counter: 'Q1 2024 was abnormally low', resp: 'Agreed starting point; change requires mutual agreement', stance: 'HOLD' },
];

const RISKS = [
  { id: 'R1', risk: 'Benzene spike post-agreement', sev: 'High', lik: 'Medium', mit: 'Price collar: >15% index move triggers review in 30 days' },
  { id: 'R2', risk: 'Starting point disputed', sev: 'High', lik: 'Low', mit: 'Starting point locked in Portfolio; mutual written agreement required' },
  { id: 'R3', risk: 'Index discontinuation', sev: 'Medium', lik: 'Low', mit: 'Fallback: ICIS → Platts → mutual agreement in 60 days' },
];

const OUTLOOK = [
  { case: 'Bear', val: '€180K', note: 'indexes rise (+10% benzene, +8% energy)', color: 'var(--accent3)', bg: 'var(--warn-bg)', pct: 53 },
  { case: 'Base', val: '€276K', note: 'indexes flat', color: 'var(--accent)', bg: 'var(--success-bg)', pct: 81 },
  { case: 'Bull', val: '€340K', note: 'indexes fall further', color: 'var(--accent4)', bg: 'var(--info-bg)', pct: 100 },
];

function Stance({ s }) {
  const flex = s === 'CAN FLEX';
  return <span className="ca-badge" style={{ background: flex ? 'var(--warn-bg)' : 'var(--success-bg)', color: flex ? 'var(--accent3)' : 'var(--accent)' }}>{s}</span>;
}
function Stat({ lbl, val, color, sub }) {
  return (
    <div className="ca-card ca-metric" style={{ flex: '1 1 160px' }}>
      <div className="ca-metric-val" style={{ color }}>{val}</div>
      <div className="ca-metric-lbl">{lbl}{sub ? ` · ${sub}` : ''}</div>
    </div>
  );
}
function Principle({ children, tone = 'info' }) {
  const bg = { info: 'var(--info-bg)', warn: 'var(--warn-bg)', danger: 'var(--danger-bg)' }[tone];
  const bd = { info: 'var(--accent4)', warn: 'var(--accent3)', danger: 'var(--accent2)' }[tone];
  return <div style={{ background: bg, borderLeft: `3px solid ${bd}`, borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>{children}</div>;
}

export default function NegotiateArea() {
  const [mode, setMode] = useState('cheat'); // cheat | full
  const [phase, setPhase] = useState(5);

  return (
    <div className="ca-page ca-fade-in">
      <div className="ca-h1">Negotiate</div>
      <p className="ca-subtitle">Your should-cost is live — this turns it into a defensible negotiation position. {CTX.product} · {CTX.supplier}.</p>

      <div style={{ display: 'flex', gap: 20, marginTop: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Sidebar */}
        <div className="ca-card" style={{ width: 220, flexShrink: 0 }}>
          <div className="ca-metric-lbl" style={{ marginBottom: 8 }}>Mode</div>
          {[['cheat', 'Quick cheat sheet'], ['full', 'Full analysis']].map(([k, l]) => (
            <button key={k} className={`ca-btn ca-btn-sm ${mode === k ? 'ca-btn-primary' : 'ca-btn-ghost'}`} style={{ width: '100%', justifyContent: 'flex-start', marginBottom: 6 }} onClick={() => setMode(k)}>{l}</button>
          ))}
          {mode === 'full' && (
            <>
              <div className="ca-metric-lbl" style={{ margin: '14px 0 8px' }}>Analysis phases</div>
              {PHASES.map((p, i) => {
                const st = PHASE_STATE[i];
                const dot = st === 'done' ? '●' : st === 'current' ? '◉' : '○';
                const col = st === 'done' ? 'var(--accent)' : st === 'current' ? 'var(--accent4)' : 'var(--muted)';
                return (
                  <div key={i} onClick={() => setPhase(i)} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', borderRadius: 6, cursor: 'pointer', background: phase === i ? 'var(--neutral-bg)' : 'transparent', fontSize: 12, color: phase === i ? 'var(--text)' : 'var(--text-secondary)' }}>
                    <span style={{ color: col }}>{dot}</span><span>{i}. {p}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Main panel */}
        <div style={{ flex: '1 1 520px', minWidth: 0 }}>
          {mode === 'cheat' ? <CheatSheet /> : <FullPhase phase={phase} />}
        </div>
      </div>

      {/* Export bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, padding: '12px 16px', borderRadius: 'var(--radius)', background: 'var(--surface2)', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{CTX.product} · {CTX.supplier} · {mode === 'cheat' ? 'Quick cheat sheet' : `Phase ${phase} of 8`}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ca-btn ca-btn-ghost ca-btn-sm">Excel model</button>
          <button className="ca-btn ca-btn-ghost ca-btn-sm">Executive deck</button>
          <button className="ca-btn ca-btn-primary ca-btn-sm">Negotiation brief</button>
        </div>
      </div>
    </div>
  );
}

function CheatSheet() {
  return (
    <>
      <Principle>Shadow formula is already in Portfolio — should-cost is live. This is your negotiation position in ~5 minutes.</Principle>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['Product', CTX.product], ['Supplier', CTX.supplier], ['Starting point', CTX.start]].map(([l, v]) => (
          <div key={l} style={{ flex: '1 1 160px' }}>
            <label className="ca-label">{l}</label>
            <input className="ca-input" value={v} readOnly />
          </div>
        ))}
      </div>
      <div className="ca-card" style={{ marginBottom: 16 }}>
        <div className="ca-card-title">Price ladder</div>
        <PriceLadder rungs={LADDER} />
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>Basis: {LADDER_BASIS}</p>
      </div>
      <div className="ca-card" style={{ marginBottom: 16 }}>
        <div className="ca-card-title">Key arguments</div>
        <table className="ca-table">
          <thead><tr><th>Your argument</th><th>Supporting data</th><th>Stance</th></tr></thead>
          <tbody>{ARGUMENTS.map((a, i) => (
            <tr key={i}><td style={{ fontWeight: 600 }}>{a.arg}</td><td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.data}</td><td><Stance s={a.stance} /></td></tr>
          ))}</tbody>
        </table>
      </div>
      <div className="ca-card">
        <div className="ca-card-title">Movement summary</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {MOVEMENT.map(m => (
            <div key={m.name} className="ca-metric" style={{ flex: '1 1 130px' }}>
              <div className="ca-metric-val" style={{ color: m.tone === 'good' ? 'var(--accent)' : 'var(--accent3)' }}>{m.val}</div>
              <div className="ca-metric-lbl">{m.name}{m.note ? ` — ${m.note}` : ''}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function FullPhase({ phase }) {
  if (phase === 0) return (
    <div className="ca-card">
      <div className="ca-card-title">Phase 0 · Historical data</div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <Stat lbl="Starting point" val="€1,840/t" />
        <Stat lbl="Should-cost today" val="€1,584/t" color="var(--accent)" />
        <Stat lbl="Projected gap" val="€256/t" sub="+13.9%" color="var(--accent2)" />
        <Stat lbl="Annual exposure" val="€307K" sub="1,200 t/yr" color="var(--accent2)" />
      </div>
      <MultiLineChart height={200}
        xLabels={['Q1 24', 'Q2 24', 'Q3 24', 'Q4 24', 'Q1 25', 'Q2 25', 'Q3 25', 'Q4 25', 'Q1 26', 'Q2 26']}
        series={[
          { name: 'Actual price paid', color: 'var(--accent2)', values: [1840, 1842, 1838, 1840, 1841, 1839, 1840, 1840, 1841, 1840] },
          { name: 'Shadow should-cost', color: 'var(--accent)', dashed: true, values: [1840, 1812, 1770, 1730, 1700, 1670, 1645, 1620, 1600, 1584] },
        ]} />
    </div>
  );
  if (phase === 1) return (
    <div className="ca-card">
      <div className="ca-card-title">Phase 1 · Formula builder</div>
      <table className="ca-table" style={{ marginBottom: 16 }}>
        <thead><tr><th>Component</th><th className="right">Weight</th><th>Range</th><th>Index</th><th>Status</th></tr></thead>
        <tbody>{FORMULA.map((f, i) => (
          <tr key={i}>
            <td style={{ fontWeight: 600 }}>{f.c}</td>
            <td className="right" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{f.w}%</td>
            <td style={{ width: 140 }}><StackedBar segments={[{ pct: f.w * 2, color: f.tone }, { pct: 100 - f.w * 2, color: 'var(--surface3)' }]} /></td>
            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f.idx}</td>
            <td><span className="ca-badge" style={{ background: 'var(--neutral-bg)', color: f.tone }}>{f.status}</span></td>
          </tr>
        ))}</tbody>
      </table>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div className="ca-card" style={{ flex: '1 1 240px', background: 'var(--surface2)' }}>
          <div className="ca-metric-lbl">Formula</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, margin: '8px 0' }}>P(t) = P₀ × Σ(wᵢ × Iᵢ(t) / Iᵢ(t₀))</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Platform formula · user formula runs in parallel</div>
        </div>
        <div className="ca-card" style={{ flex: '1 1 240px', background: 'var(--surface2)' }}>
          <div className="ca-metric-lbl">FOB build → landed should-cost</div>
          {[['Variable cost (formula)', '€1,310/t', 'var(--accent)'], ['Fixed cost (CPI-indexed)', '€186/t', 'var(--text)'], ['FOB total', '€1,496/t', 'var(--text)'], ['Logistics (EU→FR)', '€88/t', 'var(--text)'], ['Landed should-cost', '€1,584/t', 'var(--accent)']].map(([l, v, c], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', fontWeight: i === 4 ? 700 : 400, borderTop: i === 4 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{l}</span><span style={{ fontFamily: "'JetBrains Mono', monospace", color: c }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  if (phase === 2) return (
    <div className="ca-card">
      <div className="ca-card-title">Phase 2 · Index intelligence</div>
      <MultiLineChart height={200} refValue={100} refLabel="baseline 100"
        xLabels={['Q1 24', 'Q2 24', 'Q3 24', 'Q4 24', 'Q1 25', 'Q2 25', 'Q3 25', 'Q4 25', 'Q1 26', 'Q2 26']}
        series={[
          { name: 'Benzene −6%', color: 'var(--accent2)', values: [100, 99, 98, 97, 96, 95, 95, 94, 94, 94] },
          { name: 'Naphtha −3%', color: 'var(--accent3)', values: [100, 100, 99, 99, 98, 98, 98, 97, 97, 97] },
          { name: 'Energy −4%', color: 'var(--accent4)', values: [100, 99, 99, 98, 98, 97, 97, 96, 96, 96] },
          { name: 'CPI +5.4%', color: 'var(--accent)', dashed: true, values: [100, 101, 102, 103, 103, 104, 104, 105, 105, 105.4] },
        ]} />
      <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
        <div className="ca-card" style={{ flex: '1 1 200px', borderLeft: '3px solid var(--accent)' }}><div className="ca-metric-lbl">Net index movement</div><p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>Weighted change −14.5%; should-cost fell €256/t while price barely moved.</p></div>
        <div className="ca-card" style={{ flex: '1 1 200px', borderLeft: '3px solid var(--accent2)' }}><div className="ca-metric-lbl">The movement argument</div><p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>Not a margin debate — indices fell, so price should have followed.</p></div>
        <div className="ca-card" style={{ flex: '1 1 200px', borderLeft: '3px solid var(--accent3)' }}><div className="ca-metric-lbl">CPI legitimately rose</div><p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>+5.4% on the 12% component = +€12/t, already factored in.</p></div>
      </div>
    </div>
  );
  if (phase === 3) return (
    <div className="ca-card">
      <div className="ca-card-title">Phase 3 · Sensitivity (±20% index move)</div>
      <TornadoChart rows={TORNADO} />
      <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
        <div className="ca-card" style={{ flex: '1 1 240px', background: 'var(--surface2)' }}>
          <div className="ca-metric-lbl">Forward scenarios</div>
          {[['Benzene +20%', '€1,713/t', 'var(--accent2)'], ['Base (flat)', '€1,584/t', 'var(--accent)'], ['Benzene −20%', '€1,455/t', 'var(--accent)']].map(([l, v, c], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}><span style={{ color: 'var(--text-secondary)' }}>{l}</span><span style={{ fontFamily: "'JetBrains Mono', monospace", color: c }}>{v}</span></div>
          ))}
        </div>
        <div className="ca-card" style={{ flex: '1 1 240px', background: 'var(--surface2)' }}>
          <div className="ca-metric-lbl">Annual impact (1,200 t/yr)</div>
          {[['@ €1,584', 'save €307K/yr'], ['@ €1,610', 'save €276K/yr'], ['@ €1,640', 'save €240K/yr']].map(([l, v], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}><span style={{ color: 'var(--text-secondary)' }}>{l}</span><span style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--accent)' }}>{v}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
  if (phase === 4) return (
    <div className="ca-card">
      <div className="ca-card-title">Phase 4 · Margin benchmark</div>
      <Principle tone="warn">Margin benchmark answers "is the starting point fair?"; the movement check answers "has it moved fairly since?" — two separate questions.</Principle>
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <Stat lbl="Implied margin (current)" val="18.6%" color="var(--accent2)" />
        <Stat lbl="Sector benchmark" val="7–11%" sub="direct EU, 200t+" />
        <Stat lbl="Confidence" val="◐ Medium" sub="8 sources, 12 validations" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {MARGIN_BRACKETS.map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 110, fontSize: 12, color: 'var(--text-secondary)' }}>{b.label}</div>
            <div style={{ flex: 1 }}><StackedBar segments={[{ pct: b.pct, color: b.color }, { pct: 100 - b.pct, color: 'var(--surface3)' }]} /></div>
            <div style={{ width: 64, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{b.range}</div>
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--danger-bg)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)', marginTop: 16 }}>
        Your volume bracket benchmark is 7–11%, but implied margin is <b style={{ color: 'var(--accent2)' }}>18.6%</b> — significantly above range. Strong case.
      </div>
    </div>
  );
  if (phase === 5) return (
    <div className="ca-card">
      <div className="ca-card-title">Phase 5 · Negotiation strategy</div>
      <PriceLadder rungs={LADDER} />
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '10px 0 16px' }}>Basis: {LADDER_BASIS}</p>
      <div className="ca-card-title">Counter-proposal playbook</div>
      <table className="ca-table">
        <thead><tr><th>Supplier counter</th><th>Your response</th><th>Stance</th></tr></thead>
        <tbody>{PLAYBOOK.map((p, i) => (
          <tr key={i}><td style={{ fontWeight: 600 }}>{p.counter}</td><td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.resp}</td><td><Stance s={p.stance} /></td></tr>
        ))}</tbody>
      </table>
    </div>
  );
  if (phase === 6) return (
    <div className="ca-card">
      <div className="ca-card-title">Phase 6 · Risk register</div>
      <table className="ca-table">
        <thead><tr><th>ID</th><th>Risk</th><th>Severity</th><th>Likelihood</th><th>Mitigation</th></tr></thead>
        <tbody>{RISKS.map(r => (
          <tr key={r.id}>
            <td style={{ fontFamily: "'JetBrains Mono', monospace" }}>{r.id}</td>
            <td style={{ fontWeight: 600 }}>{r.risk}</td>
            <td><span className="ca-badge" style={{ background: r.sev === 'High' ? 'var(--danger-bg)' : 'var(--warn-bg)', color: r.sev === 'High' ? 'var(--accent2)' : 'var(--accent3)' }}>{r.sev}</span></td>
            <td style={{ color: 'var(--text-secondary)' }}>{r.lik}</td>
            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.mit}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
  // phase 7
  return (
    <div className="ca-card">
      <div className="ca-card-title">Phase 7 · Forward outlook</div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        {OUTLOOK.map(o => (
          <div key={o.case} className="ca-card ca-metric" style={{ flex: '1 1 150px', background: o.bg }}>
            <div className="ca-metric-val" style={{ color: o.color }}>{o.val}</div>
            <div className="ca-metric-lbl">{o.case} · {o.note}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {OUTLOOK.map(o => (
          <div key={o.case} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 50, fontSize: 12, color: 'var(--text-secondary)' }}>{o.case}</div>
            <div style={{ flex: 1 }}><StackedBar segments={[{ pct: o.pct, color: o.color }, { pct: 100 - o.pct, color: 'var(--surface3)' }]} height={16} /></div>
            <div style={{ width: 64, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{o.val}</div>
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--success-bg)', borderLeft: '3px solid var(--accent)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
        <b style={{ color: 'var(--text)' }}>Recommendation:</b> open renegotiation this quarter. Indices fell −14.5% since the starting point; price barely moved. Expected value <b style={{ color: 'var(--accent)' }}>€276K</b> over 12 months — the starting point is written back to Portfolio on close.
      </div>
    </div>
  );
}
