import { useState } from 'react';
import { PreviewBanner, PreviewBadge, WiringNote } from '../../components/PreviewBadge';

// SCRUM 32 — AI cost modeler. Mockup only; see PreviewBanner below.
//
// The product decision this page encodes: an LLM-suggested breakdown is a
// *draft*, never a cost model. Nothing here can price anything until a human
// has edited it and pressed promote, and every line carries a confidence and
// the reasoning behind it so the human has something to disagree with. That
// mirrors the estimator that already shipped (services/formula_estimator.py +
// EstimatorProposal), which proposes into a staging table and only writes real
// FormulaTemplateComponent rows on approve. Scrum 32 should reuse that
// draft-then-approve shape rather than inventing a second one.

const SECTORS = ['Surfactants', 'Polymers', 'Agrochemicals', 'Paper & pulp', 'Water treatment', 'Lubricants'];

// One canned response. A real call goes to Ollama (llama3.1:8b), the same
// service services/narrative.py uses.
const SUGGESTION = {
  model: 'llama3.1:8b',
  elapsed_ms: 4120,
  rationale:
    'SLES is made by ethoxylating lauryl alcohol and sulfating the adduct, so the two feedstocks dominate. '
    + 'Weights below are typical for a 2-mol ethoxylate at European scale; they are a starting point for a '
    + 'buyer to correct, not a measured recipe.',
  lines: [
    { id: 'a', label: 'Lauryl alcohol', weight_pct: 34, index: 'FA-MY', confidence: 'high', why: 'Primary feedstock; C12-14 alcohol price tracks palm kernel oil closely.' },
    { id: 'b', label: 'Ethylene oxide', weight_pct: 28, index: 'EO-EU', confidence: 'high', why: 'Second feedstock, consumed at roughly 2 mol per mol of alcohol.' },
    { id: 'c', label: 'Sulfur trioxide', weight_pct: 8, index: 'SULF-EU', confidence: 'medium', why: 'Sulfonating agent; often produced on site, so the traded price is a proxy.' },
    { id: 'd', label: 'Caustic soda', weight_pct: 5, index: 'NAOH-EU', confidence: 'medium', why: 'Neutralisation step. Small share, but volatile enough to matter.' },
    { id: 'e', label: 'Electricity & steam', weight_pct: 6, index: 'ELEC-EU', confidence: 'low', why: 'Energy intensity varies widely by plant. Treat as a placeholder until you have a site figure.' },
    { id: 'f', label: 'Conversion & labour', weight_pct: 10, index: null, confidence: 'low', why: 'No public index. Modelled as a fixed line.' },
    { id: 'g', label: 'Margin', weight_pct: 9, index: null, confidence: 'low', why: 'Sector-typical converter margin. The most arguable number here.' },
  ],
};

const CONFIDENCE = {
  high: { label: 'HIGH', color: 'var(--accent)', bg: 'var(--accent-dim)' },
  medium: { label: 'MEDIUM', color: 'var(--accent3)', bg: 'var(--accent3-dim)' },
  low: { label: 'LOW — CHECK THIS', color: 'var(--accent2)', bg: 'var(--accent2-dim)' },
};

export default function AiCostModelerPreview() {
  const [form, setForm] = useState({
    product: 'Sodium lauryl ether sulfate (SLES 70%)',
    sector: 'Surfactants',
    price: '1240',
    currency: 'EUR',
    unit: 't',
    region: 'Europe',
  });
  const [state, setState] = useState('idle'); // idle | thinking | done
  const [lines, setLines] = useState([]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const generate = () => {
    setState('thinking');
    // Stands in for POST /api/ai/cost-structure. The delay exists so the
    // pending state is visible; it is not a real request.
    setTimeout(() => {
      setLines(SUGGESTION.lines.map(l => ({ ...l })));
      setState('done');
    }, 700);
  };

  const updateWeight = (id, value) => {
    setLines(ls => ls.map(l => (l.id === id ? { ...l, weight_pct: value === '' ? '' : Number(value) } : l)));
  };
  const removeLine = (id) => setLines(ls => ls.filter(l => l.id !== id));

  const total = lines.reduce((s, l) => s + (Number(l.weight_pct) || 0), 0);
  const balanced = Math.abs(total - 100) < 0.05;
  const price = Number(form.price) || 0;
  const edited = state === 'done'
    && lines.some(l => l.weight_pct !== SUGGESTION.lines.find(s => s.id === l.id)?.weight_pct);

  return (
    <div className="ca-page ca-fade-in">
      <h1 className="ca-h1">AI cost modeler</h1>
      <p className="ca-subtitle">
        A first-draft cost structure for a product nobody has decomposed yet — to be argued with, then saved.
      </p>

      <PreviewBanner
        scrum="Scrum 32"
        title="Retroactive cost estimation"
        summary="The suggestion below is canned. What matters in this mockup is the shape: the draft is labelled
                 as an estimate everywhere it appears, every line states its own confidence and reasoning, and
                 nothing becomes a real formula until a human edits it and promotes it."
        needs={[
          'POST /api/ai/cost-structure — prompt Ollama (llama3.1:8b, the narrative service already talks to it) and parse a structured breakdown back',
          'A draft store, not a direct write: reuse the EstimatorProposal / EstimatorProposalLine pattern from services/formula_estimator.py rather than adding a second staging model',
          'Suggested index names must resolve against real commodity_indexes rows — an unresolvable suggestion has to come back flagged, never silently dropped',
          'Promotion writes a FormulaVersion with provenance = ai_draft (the four-state vocabulary in app/constants/trust.py), so the badge survives the save',
          'Graceful path when llm_enabled is False: in production ollama_generate() returns None on a cache miss, so this page must degrade to manual entry rather than spin',
        ]}
        endpoints={[
          'POST /api/ai/cost-structure          -> { lines[], rationale, model, confidence }',
          'POST /api/ai/cost-structure/{id}/promote -> creates a FormulaVersion, provenance=ai_draft',
        ]}
      />

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div className="ca-card" style={{ flex: '1 1 320px', minWidth: 300 }}>
          <div className="ca-card-title" style={{ marginBottom: 12 }}>What are you buying?</div>

          <label className="ca-label" htmlFor="ai-product">Product</label>
          <input id="ai-product" className="ca-input" value={form.product} onChange={set('product')}
                 style={{ width: '100%', marginBottom: 10 }} />

          <label className="ca-label" htmlFor="ai-sector">Sector</label>
          <select id="ai-sector" className="ca-select" value={form.sector} onChange={set('sector')}
                  style={{ width: '100%', marginBottom: 10 }}>
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 2 }}>
              <label className="ca-label" htmlFor="ai-price">Rough price you pay</label>
              <input id="ai-price" className="ca-input" type="number" value={form.price} onChange={set('price')}
                     style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="ca-label" htmlFor="ai-currency">Currency</label>
              <input id="ai-currency" className="ca-input" value={form.currency} onChange={set('currency')}
                     style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="ca-label" htmlFor="ai-unit">Unit</label>
              <input id="ai-unit" className="ca-input" value={form.unit} onChange={set('unit')}
                     style={{ width: '100%' }} />
            </div>
          </div>

          <label className="ca-label" htmlFor="ai-region">Region</label>
          <input id="ai-region" className="ca-input" value={form.region} onChange={set('region')}
                 style={{ width: '100%', marginBottom: 14 }} />

          <button className="ca-btn ca-btn-primary ca-btn-sm" onClick={generate} disabled={state === 'thinking'}>
            {state === 'thinking' ? 'Estimating…' : 'Suggest a cost structure'}
          </button>
          <div style={{ marginTop: 8 }}>
            <WiringNote>canned response, no model call</WiringNote>
          </div>
        </div>

        <div style={{ flex: '2 1 480px', minWidth: 320 }}>
          {state === 'idle' && (
            <div className="ca-card" style={{ textAlign: 'center', padding: '44px 20px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No estimate yet</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Fill in what you know and ask for a draft. You will get a breakdown to correct, not an answer.
              </div>
            </div>
          )}

          {state === 'thinking' && (
            <div className="ca-card">
              <div className="ca-skeleton" style={{ height: 18, marginBottom: 10 }} />
              <div className="ca-skeleton" style={{ height: 14, width: '80%', marginBottom: 18 }} />
              {[0, 1, 2, 3, 4].map(i => <div key={i} className="ca-skeleton" style={{ height: 28, marginBottom: 8 }} />)}
            </div>
          )}

          {state === 'done' && (
            <>
              <div className="ca-card" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                  <span className="ca-badge" style={{ background: 'var(--accent2-dim)', color: 'var(--accent2)', fontWeight: 600 }}>
                    AI estimate — not measured
                  </span>
                  <span className="ca-tag">{SUGGESTION.model}</span>
                  <span className="ca-tag">{(SUGGESTION.elapsed_ms / 1000).toFixed(1)}s</span>
                  <PreviewBadge style={{ marginLeft: 'auto' }} />
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{SUGGESTION.rationale}</p>
              </div>

              <div className="ca-card" style={{ marginBottom: 16 }}>
                <div className="ca-card-title" style={{ marginBottom: 12 }}>Suggested breakdown — edit before saving</div>
                <div className="ca-scroll-x">
                  <table className="ca-table">
                    <caption className="ca-sr-only">
                      Suggested cost components with editable weights, a confidence rating and the model&apos;s reasoning.
                    </caption>
                    <thead>
                      <tr>
                        <th>Component</th>
                        <th>Suggested index</th>
                        <th style={{ textAlign: 'right' }}>Weight</th>
                        <th style={{ textAlign: 'right' }}>At {form.currency} {price || '—'}</th>
                        <th>Confidence</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map(l => {
                        const c = CONFIDENCE[l.confidence];
                        return (
                          <tr key={l.id}>
                            <td>
                              <div>{l.label}</div>
                              <div style={{ fontSize: 10, color: 'var(--muted)', maxWidth: 360 }}>{l.why}</div>
                            </td>
                            <td style={{ color: l.index ? 'var(--accent4)' : 'var(--muted)' }}>
                              {l.index || 'fixed line'}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <input
                                className="ca-input"
                                type="number"
                                aria-label={`Weight for ${l.label}`}
                                value={l.weight_pct}
                                onChange={(e) => updateWeight(l.id, e.target.value)}
                                style={{ width: 72, textAlign: 'right' }}
                              />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {price ? (price * (Number(l.weight_pct) || 0) / 100).toFixed(2) : '—'}
                            </td>
                            <td>
                              <span className="ca-badge" style={{ background: c.bg, color: c.color, fontWeight: 600 }}>
                                {c.label}
                              </span>
                            </td>
                            <td>
                              <button className="ca-btn ca-btn-ghost ca-btn-sm"
                                      aria-label={`Remove ${l.label}`}
                                      onClick={() => removeLine(l.id)}>×</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2} style={{ fontWeight: 600 }}>Total</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: balanced ? 'var(--text)' : 'var(--accent2)' }}>
                          {total.toFixed(1)}%
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {price ? (price * total / 100).toFixed(2) : '—'}
                        </td>
                        <td colSpan={2} style={{ fontSize: 10, color: balanced ? 'var(--muted)' : 'var(--accent2)' }}>
                          {balanced ? 'Closes at 100%' : 'Must close at 100% before saving'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="ca-card">
                <div className="ca-card-title" style={{ marginBottom: 8 }}>Save as a real formula</div>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
                  Promotion writes a FormulaVersion tagged <code>provenance = ai_draft</code>. Until somebody
                  signs it off, every should-cost built on it keeps the estimate caveat — the trust vocabulary
                  in <code>app/constants/trust.py</code> already has the four states this needs.
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="ca-btn ca-btn-primary ca-btn-sm" disabled={!balanced}>
                    Promote to formula version
                  </button>
                  <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={generate}>Regenerate</button>
                  <WiringNote>neither button sends a request</WiringNote>
                </div>
                {edited && (
                  <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 10 }}>
                    You have edited the draft — that is the intended path. The original suggestion would be kept
                    alongside it so the two can be compared later.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
