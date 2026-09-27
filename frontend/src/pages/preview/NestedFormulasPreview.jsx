import { useMemo, useState } from 'react';
import { PreviewBanner, PreviewBadge, WiringNote } from '../../components/PreviewBadge';

// SCRUM 27 — multi-tiered "Lego" formulas. Mockup only; see PreviewBanner below.
//
// The shape here is deliberately the one the engine already uses for chained
// *templates* (services/formula_resolver.flatten_components): a line of kind
// 'model' carries a weight, and the child's own lines fold into the parent with
// their weights multiplied. Scrum 27 is that same idea one layer down, where the
// child is a CostModel rather than a FormulaTemplate — so the flattening maths,
// the depth cap and the cycle detection all have a solved precedent in this
// repo. Drawn against that precedent on purpose: the tree and the flattened
// table below are two renderings of one set of numbers, exactly as they would
// be if a real resolver produced them.

const ROOT = {
  name: 'Acrylic Emulsion AE-40',
  supplier: 'Synthomer',
  region: 'Europe',
  period: '2026 Q3',
  currency: 'EUR',
  unit: 't',
  should_cost: 1842.0,
  lines: [
    { id: 'l1', label: 'Butyl acrylate', kind: 'index', source: 'BA-EU', weight_pct: 34 },
    {
      id: 'l2',
      label: 'Monomer blend MB-2',
      kind: 'model',
      source: 'internal cost model',
      weight_pct: 28,
      child: {
        name: 'Monomer blend MB-2',
        region: 'Europe',
        lines: [
          { id: 'l2a', label: 'Acrylonitrile', kind: 'index', source: 'ACN-EU', weight_pct: 46 },
          {
            id: 'l2b',
            label: 'Ammonia — captive plant',
            kind: 'model',
            source: 'internal cost model',
            weight_pct: 22,
            child: {
              name: 'Ammonia — captive plant',
              region: 'NWE',
              lines: [
                { id: 'l2b1', label: 'Natural gas TTF', kind: 'index', source: 'NATGAS-EU', weight_pct: 68 },
                { id: 'l2b2', label: 'CO2 allowance', kind: 'index', source: 'EUA', weight_pct: 12, proxy: true },
                { id: 'l2b3', label: 'Plant conversion', kind: 'fixed', source: 'fixed line', weight_pct: 20 },
              ],
            },
          },
          { id: 'l2c', label: 'Propylene', kind: 'index', source: 'C3-EU', weight_pct: 18 },
          { id: 'l2d', label: 'Site conversion', kind: 'fixed', source: 'fixed line', weight_pct: 14 },
        ],
      },
    },
    { id: 'l3', label: 'Styrene', kind: 'index', source: 'SM-EU', weight_pct: 14 },
    { id: 'l4', label: 'Electricity — EU', kind: 'index', source: 'ELEC-EU', weight_pct: 6, proxy: true },
    { id: 'l5', label: 'Conversion & labour', kind: 'fixed', source: 'fixed line', weight_pct: 9 },
    { id: 'l6', label: 'Margin', kind: 'fixed', source: 'fixed line', weight_pct: 9 },
  ],
};

// Candidates for the "add a sub-model" picker. `cycle` marks the one that would
// make the graph circular — AE-40 is already an input to Latex Binder LB-9, so
// nesting LB-9 under AE-40 closes a loop.
const CANDIDATES = [
  { id: 'cm-71', name: 'Monomer blend MB-2', depth: 1 },
  { id: 'cm-88', name: 'Ammonia — captive plant', depth: 2 },
  { id: 'cm-12', name: 'Latex binder LB-9', cycle: 'LB-9 already consumes AE-40, so adding it here closes a cycle' },
  { id: 'cm-40', name: 'Surfactant pack SP-3', depth: 1 },
];

const KIND_STYLE = {
  index: { label: 'INDEX', color: 'var(--accent4)', bg: 'var(--accent4-dim)' },
  fixed: { label: 'FIXED', color: 'var(--muted)', bg: 'var(--neutral-bg)' },
  model: { label: 'SUB-MODEL', color: 'var(--accent)', bg: 'var(--accent-dim)' },
};

const money = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Every leaf with its sub-model weights multiplied through — 22% of a 28% line
// is 6.16% of the root. Derived, never hardcoded, so the tree and the flattened
// table cannot disagree.
function flatten(lines, parentFactor = 1, depth = 0, via = null, out = []) {
  for (const line of lines) {
    const effective = parentFactor * (line.weight_pct / 100);
    if (line.kind === 'model' && line.child) {
      flatten(line.child.lines, effective, depth + 1, line.label, out);
    } else {
      out.push({ ...line, effective_pct: effective * 100, depth, via });
    }
  }
  return out;
}

function LineRow({ line, depth, parentFactor, expanded, toggle }) {
  const effective = parentFactor * (line.weight_pct / 100);
  const contribution = ROOT.should_cost * effective;
  const kind = KIND_STYLE[line.kind];
  const isModel = line.kind === 'model';
  const open = expanded.has(line.id);

  return (
    <>
      <tr onClick={isModel ? () => toggle(line.id) : undefined} style={{ cursor: isModel ? 'pointer' : 'default' }}>
        <td>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, paddingLeft: depth * 22 }}>
            {isModel ? (
              <button
                type="button"
                className="ca-btn ca-btn-ghost ca-btn-sm"
                aria-expanded={open}
                aria-label={`${open ? 'Collapse' : 'Expand'} ${line.label}`}
                onClick={(e) => { e.stopPropagation(); toggle(line.id); }}
                style={{ padding: '0 6px', minWidth: 22 }}
              >
                {open ? '-' : '+'}
              </button>
            ) : (
              <span style={{ width: 22, display: 'inline-block' }} />
            )}
            <span style={{ fontWeight: isModel ? 600 : 400 }}>{line.label}</span>
            {line.proxy && (
              <span className="ca-badge" style={{ background: 'var(--warn-bg)', color: 'var(--accent3)' }}>proxy</span>
            )}
          </span>
        </td>
        <td>
          <span className="ca-badge" style={{ background: kind.bg, color: kind.color }}>{kind.label}</span>
        </td>
        <td style={{ color: 'var(--muted)' }}>{line.source}</td>
        <td style={{ textAlign: 'right' }}>{line.weight_pct.toFixed(1)}%</td>
        <td style={{ textAlign: 'right', color: depth > 0 ? 'var(--text-secondary)' : 'var(--text)' }}>
          {(effective * 100).toFixed(2)}%
        </td>
        <td style={{ textAlign: 'right', fontWeight: depth === 0 ? 600 : 400 }}>{money(contribution)}</td>
      </tr>
      {isModel && open && line.child.lines.map(child => (
        <LineRow
          key={child.id}
          line={child}
          depth={depth + 1}
          parentFactor={effective}
          expanded={expanded}
          toggle={toggle}
        />
      ))}
      {isModel && open && (
        <tr>
          <td colSpan={6} style={{ paddingLeft: (depth + 1) * 22 + 30, fontSize: 10, color: 'var(--muted)' }}>
            Resolved from cost model &ldquo;{line.child.name}&rdquo; at {line.child.region} — its own weights
            renormalised over {line.weight_pct}% of the parent.
          </td>
        </tr>
      )}
    </>
  );
}

export default function NestedFormulasPreview() {
  const [expanded, setExpanded] = useState(new Set(['l2']));
  const [view, setView] = useState('tree');
  const [picked, setPicked] = useState(null);

  const toggle = (id) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const flat = useMemo(() => flatten(ROOT.lines), []);
  const flatTotal = flat.reduce((s, l) => s + ROOT.should_cost * (l.effective_pct / 100), 0);
  const maxDepth = Math.max(...flat.map(l => l.depth));
  const chosen = picked ? CANDIDATES.find(c => c.id === picked) : null;

  return (
    <div className="ca-page ca-fade-in">
      <h1 className="ca-h1">Nested cost models</h1>
      <p className="ca-subtitle">
        A component that is itself a cost model — &ldquo;Lego&rdquo; formulas, one should-cost feeding another.
      </p>

      <PreviewBanner
        scrum="Scrum 27"
        title="Multi-tiered Lego formulas"
        summary="Every number on this page is a fixture. The tree, the flattened view and the cycle guard are
                 drawn against the chaining rules the template resolver already implements, so wiring this is
                 mostly teaching the CostModel path what the FormulaTemplate path already knows."
        needs={[
          'FormulaComponent gains a nullable child_cost_model_id (component_type "model"), alongside the existing commodity_id / type_code_id',
          'formula_resolver.get_effective_lines recurses into a child CostModel and multiplies weights through, reusing MAX_CHAIN_DEPTH and the existing cycle walk',
          'Write-time guard: a child that transitively consumes the parent must 400 at save, not blow the stack at calculation time',
          'The six costing entry points inherit it once get_effective_lines recurses — but Brief/Evolution/Squeeze exports must render depth, not silently flatten it away',
          'clone_cost_model must copy the child link, the way it already copies source_coverage_id / link_mode',
        ]}
        endpoints={[
          'GET  /api/cost-models/{id}/resolve?depth=full  -> the tree below',
          'POST /api/cost-models/{id}/formula-versions    -> accepts child_cost_model_id on a line',
          'GET  /api/cost-models/{id}/nestable            -> candidates, cycle-excluded (the picker below)',
        ]}
      />

      <div className="ca-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap', marginBottom: 18 }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div className="ca-card-title" style={{ marginBottom: 4 }}>Cost model</div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700 }}>{ROOT.name}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              {ROOT.supplier} · {ROOT.region} · {ROOT.period}
            </div>
          </div>
          <div className="ca-metric" style={{ minWidth: 170 }}>
            <div className="ca-metric-val">{money(ROOT.should_cost)}</div>
            <div className="ca-metric-lbl">Should-cost {ROOT.currency}/{ROOT.unit}</div>
          </div>
          <div className="ca-metric" style={{ minWidth: 130 }}>
            <div className="ca-metric-val">{maxDepth + 1}</div>
            <div className="ca-metric-lbl">Tiers deep</div>
          </div>
          <div className="ca-metric" style={{ minWidth: 130 }}>
            <div className="ca-metric-val">{flat.length}</div>
            <div className="ca-metric-lbl">Effective lines</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {['tree', 'flat'].map(v => (
            <button
              key={v}
              className={`ca-btn ca-btn-sm ${view === v ? 'ca-btn-primary' : 'ca-btn-ghost'}`}
              onClick={() => setView(v)}
              aria-pressed={view === v}
            >
              {v === 'tree' ? 'Nested view' : 'Flattened lines'}
            </button>
          ))}
          <PreviewBadge style={{ marginLeft: 'auto' }} />
        </div>

        <div className="ca-scroll-x">
          {view === 'tree' ? (
            <table className="ca-table">
              <caption className="ca-sr-only">
                Nested formula breakdown. Sub-model rows expand to reveal their own components.
              </caption>
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Type</th>
                  <th>Resolved from</th>
                  <th style={{ textAlign: 'right' }}>Weight in parent</th>
                  <th style={{ textAlign: 'right' }}>Effective</th>
                  <th style={{ textAlign: 'right' }}>Contribution</th>
                </tr>
              </thead>
              <tbody>
                {ROOT.lines.map(line => (
                  <LineRow key={line.id} line={line} depth={0} parentFactor={1} expanded={expanded} toggle={toggle} />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ fontWeight: 600 }}>Should-cost</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(ROOT.should_cost)}</td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <table className="ca-table">
              <caption className="ca-sr-only">Every leaf line with its sub-model weights multiplied through.</caption>
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Type</th>
                  <th>Via</th>
                  <th style={{ textAlign: 'right' }}>Depth</th>
                  <th style={{ textAlign: 'right' }}>Effective</th>
                  <th style={{ textAlign: 'right' }}>Contribution</th>
                </tr>
              </thead>
              <tbody>
                {flat.map(l => (
                  <tr key={l.id}>
                    <td>{l.label}</td>
                    <td>
                      <span className="ca-badge" style={{ background: KIND_STYLE[l.kind].bg, color: KIND_STYLE[l.kind].color }}>
                        {KIND_STYLE[l.kind].label}
                      </span>
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{l.via || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{l.depth}</td>
                    <td style={{ textAlign: 'right' }}>{l.effective_pct.toFixed(2)}%</td>
                    <td style={{ textAlign: 'right' }}>{money(ROOT.should_cost * (l.effective_pct / 100))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ fontWeight: 600 }}>Sum of effective lines</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {flat.reduce((s, l) => s + l.effective_pct, 0).toFixed(2)}%
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(flatTotal)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 10 }}>
          Both views render from one fixture, so the flattened total closes on the tree total by construction —
          the same invariant the real resolver has to hold.
        </div>
      </div>

      <div className="ca-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <div className="ca-card-title" style={{ marginBottom: 0 }}>Add a sub-model</div>
          <PreviewBadge />
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
          Cycle detection is the part worth getting right before anything else: a loop here is an infinite
          recursion inside the costing engine, not a wrong number. The guard belongs at save time, where
          somebody can still fix it.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {CANDIDATES.map(c => (
            <button
              key={c.id}
              className={`ca-btn ca-btn-sm ${picked === c.id ? 'ca-btn-primary' : 'ca-btn-ghost'}`}
              onClick={() => setPicked(c.id)}
              style={c.cycle && picked !== c.id ? { borderColor: 'var(--accent2)', color: 'var(--accent2)' } : undefined}
            >
              {c.name}
            </button>
          ))}
        </div>
        {chosen && (chosen.cycle ? (
          <div style={{
            fontSize: 11, color: 'var(--accent2)', background: 'var(--danger-bg)',
            border: '1px solid var(--accent2)', borderRadius: 'var(--radius)', padding: '10px 12px',
          }}>
            <strong>Rejected — circular reference.</strong> {chosen.cycle}. The real guard walks the chain at
            save time and returns 400, the way assert_valid_chain_input already does for templates.
          </div>
        ) : (
          <div style={{
            fontSize: 11, color: 'var(--accent)', background: 'var(--success-bg)',
            border: '1px solid var(--accent)', borderRadius: 'var(--radius)', padding: '10px 12px',
          }}>
            <strong>Accepted.</strong> &ldquo;{chosen.name}&rdquo; would attach at depth {chosen.depth}. The chain
            cap is 3 hops, matching MAX_CHAIN_DEPTH in the template resolver. <WiringNote>no request is sent</WiringNote>
          </div>
        ))}
      </div>
    </div>
  );
}
