import { useMemo, useState } from 'react';
import { PreviewBanner, PreviewBadge, WiringNote } from '../../components/PreviewBadge';

// SCRUM 29 — the remaining half of the negotiation aid: a guided prep flow.
// Mockup only; see PreviewBanner below.
//
// The design decision that shapes this whole page: the app does NOT predict the
// supplier's counter. It cannot — it holds no supplier-cost data, and a prior
// fabricated counter-proposal playbook was deleted for exactly that reason
// (commit 03e0856). So the supplier's position is an INPUT here: the buyer
// types in what the supplier actually said, and the app answers each claim with
// evidence it really has.
//
// The second thing worth stating, because it is counter-intuitive and it is the
// arithmetic the whole output rests on: the should-cost has already consumed
// 100% of every verified index movement (Scrum 30b). So a driver the supplier
// cites cannot justify anything ON TOP of the should-cost — it is already in
// there. Everything above should-cost is unexplained by construction, and that
// is the strongest honest thing a buyer can walk in with.

const CONTEXT = {
  product: 'Acrylic Emulsion AE-40',
  supplier: 'Synthomer',
  region: 'Europe',
  period: '2026 Q3',
  currency: 'EUR',
  unit: 't',
  floor: 1676.22,        // indexed cost before margin — BriefResult.current_floor, already real
  should_cost: 1842.0,   // the defensible target
  their_ask: 2040.0,
};

// Claims the buyer logged from the call, each already checked against the data.
const CLAIMS = [
  {
    id: 'c1',
    said: 'Acrylate feedstock is up 30% on the year',
    driver: 'Butyl acrylate (BA-EU)',
    weight_pct: 34,
    actual_move_pct: 11.4,
    verdict: 'overstated',
    note: 'BA-EU moved +11.4% year on year, not +30%. At 34% of the recipe that is +3.9% of product cost — and the should-cost already carries it.',
  },
  {
    id: 'c2',
    said: 'Energy costs have doubled',
    driver: 'Electricity EU (ELEC-EU)',
    weight_pct: 6,
    actual_move_pct: -4.2,
    verdict: 'contradicted',
    note: 'ELEC-EU is down 4.2% year on year. This claim argues for a lower price, not a higher one.',
  },
  {
    id: 'c3',
    said: 'Labour inflation across the site',
    driver: 'Labour cost index EU (LCI-EU)',
    weight_pct: 9,
    actual_move_pct: 3.1,
    verdict: 'already_priced',
    note: 'Real, and already inside the conversion line. Worth conceding out loud — it costs nothing and buys credibility on the other two.',
  },
  {
    id: 'c4',
    said: 'Freight and logistics pressure',
    driver: null,
    weight_pct: 0,
    actual_move_pct: null,
    verdict: 'out_of_scope',
    note: 'The quote is DDP Antwerp, so freight is already inside their delivered price. It cannot be charged twice.',
  },
];

const VERDICT = {
  overstated: { label: 'Overstated', color: 'var(--accent2)', bg: 'var(--accent2-dim)' },
  contradicted: { label: 'Contradicted', color: 'var(--accent2)', bg: 'var(--accent2-dim)' },
  already_priced: { label: 'Already priced in', color: 'var(--accent3)', bg: 'var(--accent3-dim)' },
  out_of_scope: { label: 'Not a cost line', color: 'var(--muted)', bg: 'var(--neutral-bg)' },
};

const money = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Ladder() {
  const { floor, should_cost, their_ask } = CONTEXT;
  const span = their_ask - floor;
  const rows = [
    { key: 'ask', label: 'Their ask', value: their_ask, color: 'var(--accent2)' },
    { key: 'target', label: 'Your target — should-cost', value: should_cost, color: 'var(--accent)' },
    { key: 'floor', label: 'Floor — indexed cost before margin', value: floor, color: 'var(--accent4)' },
  ];
  return (
    <div>
      {rows.map(r => (
        <div key={r.key} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: 'var(--text-secondary)' }}>{r.label}</span>
            <span style={{ fontWeight: 700 }}>{money(r.value)}</span>
          </div>
          <div className="bar-wrap" style={{ background: 'var(--surface3)', height: 6, borderRadius: 3 }}>
            <div
              className="bar-fill"
              style={{
                width: `${((r.value - floor) / span) * 100 || 2}%`,
                background: r.color, height: '100%', borderRadius: 3, minWidth: 4,
              }}
            />
          </div>
        </div>
      ))}
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 14 }}>
        Unexplained portion of their ask:{' '}
        <strong style={{ color: 'var(--accent2)' }}>
          {money(CONTEXT.their_ask - CONTEXT.should_cost)} {CONTEXT.currency}/{CONTEXT.unit}
        </strong>{' '}
        ({(((CONTEXT.their_ask - CONTEXT.should_cost) / CONTEXT.should_cost) * 100).toFixed(1)}%)
      </div>
    </div>
  );
}

export default function NegotiationPrepPreview() {
  const [draft, setDraft] = useState('');
  const [logged, setLogged] = useState(CLAIMS.map(c => c.id));

  const active = useMemo(() => CLAIMS.filter(c => logged.includes(c.id)), [logged]);

  const script = useMemo(() => {
    const lines = [
      `Opening — we have modelled AE-40 bottom-up from published indices. At ${CONTEXT.period} the `
      + `defensible number is ${money(CONTEXT.should_cost)} ${CONTEXT.currency}/${CONTEXT.unit}. `
      + `Your ask sits ${money(CONTEXT.their_ask - CONTEXT.should_cost)} above that.`,
    ];
    for (const c of active) {
      if (c.verdict === 'overstated') {
        lines.push(`On "${c.said}" — our reading of ${c.driver} is +${c.actual_move_pct}%, not what you quoted. `
          + `At ${c.weight_pct}% of the recipe that is already inside our number.`);
      } else if (c.verdict === 'contradicted') {
        lines.push(`On "${c.said}" — ${c.driver} is ${c.actual_move_pct}% over the same window. `
          + `That moves the number down, not up.`);
      } else if (c.verdict === 'already_priced') {
        lines.push(`On "${c.said}" — agreed, and it is already carried in our conversion line. No argument there.`);
      } else {
        lines.push(`On "${c.said}" — the quote is DDP, so that sits inside the delivered price already.`);
      }
    }
    lines.push(`Close — we are ready to settle at ${money(CONTEXT.should_cost)}. `
      + `Below ${money(CONTEXT.floor)} there is no margin left in the chain, so that is not a number we expect you to accept.`);
    return lines;
  }, [active]);

  const toggle = (id) => setLogged(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]));

  return (
    <div className="ca-page ca-fade-in">
      <h1 className="ca-h1">Prepare a negotiation</h1>
      <p className="ca-subtitle">
        Log what the supplier claimed, see what the data says about each claim, walk in with a script.
      </p>

      <PreviewBanner
        scrum="Scrum 29"
        title="Guided negotiation prep"
        summary="The app never guesses the supplier's counter — it has no supplier-cost data and a fabricated
                 counter-proposal playbook was already deleted once for pretending otherwise. Their position is
                 an input you type in; the output is the evidence answering it. The floor/target/ask ladder is
                 the one part backed by something real today (BriefResult.current_floor already ships)."
        needs={[
          'A place to store a claim: a SupplierClaim row against a cost model and period, so prep survives the call and can be reviewed after',
          'A checker that maps a free-text claim onto a driver in the recipe — start with picking from the resolved lines, not NLP',
          'Reuse calculate_brief: current_floor, drivers and index movement are all already in BriefResult; no new engine',
          'Script assembly is deterministic template text over those numbers first. The LLM (services/narrative.py) can smooth it, but must never be the source of a figure',
          'Export reuses the existing window.print() + .ca-print-page path from Brief.jsx — no second export mechanism',
        ]}
        endpoints={[
          'POST /api/cost-models/{id}/claims        -> log a claim, get it checked against the drivers',
          'GET  /api/cost-models/{id}/prep?period=  -> ladder + checked claims + assembled script',
        ]}
      />

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 16 }}>
        <div className="ca-card" style={{ flex: '1 1 300px', minWidth: 280 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <div className="ca-card-title" style={{ marginBottom: 0 }}>Your position</div>
            <PreviewBadge style={{ marginLeft: 'auto' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>
            {CONTEXT.product} · {CONTEXT.supplier} · {CONTEXT.period}
          </div>
          <Ladder />
        </div>

        <div className="ca-card" style={{ flex: '1 1 380px', minWidth: 300 }}>
          <div className="ca-card-title" style={{ marginBottom: 8 }}>What did they claim?</div>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
            Type what the supplier actually told you. Each claim gets checked against the indices in this
            product&apos;s own recipe.
          </p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input
              className="ca-input"
              placeholder='e.g. "Ammonia contracts reset 18% higher"'
              value={draft}
              onChange={e => setDraft(e.target.value)}
              aria-label="New supplier claim"
              style={{ flex: 1 }}
            />
            <button className="ca-btn ca-btn-primary ca-btn-sm" disabled={!draft.trim()}>Check</button>
          </div>
          <WiringNote>claims below are fixtures; the input does not submit</WiringNote>

          <div style={{ marginTop: 16 }}>
            {CLAIMS.map(c => {
              const v = VERDICT[c.verdict];
              const on = logged.includes(c.id);
              return (
                <div
                  key={c.id}
                  className="ca-card"
                  style={{
                    padding: 12, marginBottom: 8, background: 'var(--bg)',
                    opacity: on ? 1 : 0.5,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span className="ca-badge" style={{ background: v.bg, color: v.color, fontWeight: 600 }}>
                      {v.label}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>&ldquo;{c.said}&rdquo;</span>
                    <button
                      className="ca-btn ca-btn-ghost ca-btn-sm"
                      style={{ marginLeft: 'auto' }}
                      aria-pressed={on}
                      onClick={() => toggle(c.id)}
                    >
                      {on ? 'In script' : 'Excluded'}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.note}</div>
                  {c.driver && (
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
                      {c.driver} · {c.weight_pct}% of recipe · actual move{' '}
                      <span style={{ color: c.actual_move_pct >= 0 ? 'var(--accent2)' : 'var(--accent)' }}>
                        {c.actual_move_pct > 0 ? '+' : ''}{c.actual_move_pct}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="ca-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div className="ca-card-title" style={{ marginBottom: 0 }}>Call script</div>
          <span className="ca-tag">{active.length} of {CLAIMS.length} claims included</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="ca-btn ca-btn-ghost ca-btn-sm">Export PDF</button>
            <WiringNote>disabled on purpose — printing fixtures would look like a real brief</WiringNote>
          </div>
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, lineHeight: 1.9, color: 'var(--text-secondary)' }}>
          {script.map((line, i) => <li key={i} style={{ marginBottom: 6 }}>{line}</li>)}
        </ol>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 14 }}>
          Every figure in this script comes from the ladder above, not from a language model. That ordering is
          the point: template first, numbers from the engine, an LLM only ever smoothing the prose around them.
        </div>
      </div>
    </div>
  );
}
