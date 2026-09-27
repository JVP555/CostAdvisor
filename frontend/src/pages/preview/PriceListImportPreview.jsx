import { useState } from 'react';
import { PreviewBanner, PreviewBadge, WiringNote } from '../../components/PreviewBadge';

// SCRUM 30 — extract pricing from supplier PDFs, landing as ActualPrice rows.
// Mockup only; see PreviewBanner below.
//
// Worth being precise about what this is NOT, because the repo already has a
// neighbour that looks identical from a distance: /quotes (Scrum 31b) extracts a
// *quote* into QuoteRecordLine, which feeds a negotiation position and is
// deliberately never an ActualPrice. This page is the other half — a periodic
// supplier price LIST landing as the actual prices a gap is measured against.
// Same parser (services/quote_extraction.py, pdfplumber, no LLM), same
// confidence/locator vocabulary, different destination table and a much harder
// matching step, because every row has to resolve to one of the team's own cost
// models before it can be committed.

// `value: null` means the parser did not find the field. It is deliberately not
// an empty string: "absent" and "blank" have to stay distinguishable, the same
// rule the quote extractor already holds.
const ROWS = [
  {
    id: 1,
    product: { value: 'Acrylic Emulsion AE-40', conf: 0.94, snippet: 'AE-40  Acrylic emulsion, 50% solids' },
    price: { value: 1908.0, conf: 0.98, snippet: 'EUR 1 908,00 / MT' },
    currency: { value: 'EUR', conf: 0.98, snippet: 'EUR 1 908,00 / MT' },
    unit: { value: 't', conf: 0.91, snippet: '/ MT' },
    period: { value: '2026 Q3', conf: 0.72, snippet: 'Valid 01.07.2026 – 30.09.2026' },
    incoterm: { value: 'DDP', conf: 0.66, snippet: 'DDP Antwerp' },
    match: { cost_model: 'Acrylic Emulsion AE-40 · Synthomer', confidence: 'exact' },
  },
  {
    id: 2,
    product: { value: 'Styrene-acrylic SA-12', conf: 0.88, snippet: 'SA-12 Styrene acrylic binder' },
    price: { value: 1644.5, conf: 0.97, snippet: 'EUR 1 644,50 / MT' },
    currency: { value: 'EUR', conf: 0.97, snippet: 'EUR 1 644,50 / MT' },
    unit: { value: 't', conf: 0.91, snippet: '/ MT' },
    period: { value: '2026 Q3', conf: 0.72, snippet: 'Valid 01.07.2026 – 30.09.2026' },
    incoterm: { value: 'DDP', conf: 0.66, snippet: 'DDP Antwerp' },
    match: { cost_model: 'Styrene Acrylic SA-12 · Synthomer', confidence: 'fuzzy' },
  },
  {
    id: 3,
    product: { value: 'Vinyl acetate VAE-8', conf: 0.81, snippet: 'VAE-8  (new grade)' },
    price: { value: 1402.0, conf: 0.95, snippet: 'EUR 1 402,00 / MT' },
    currency: { value: 'EUR', conf: 0.95, snippet: 'EUR 1 402,00 / MT' },
    unit: { value: 't', conf: 0.88, snippet: '/ MT' },
    period: { value: null, conf: null, snippet: null },
    incoterm: { value: null, conf: null, snippet: null },
    match: null,
  },
];

const FIELDS = [
  ['product', 'Product'],
  ['price', 'Price'],
  ['currency', 'Cur'],
  ['unit', 'Unit'],
  ['period', 'Period'],
  ['incoterm', 'Incoterm'],
];

function confColor(conf) {
  if (conf == null) return 'var(--muted)';
  if (conf >= 0.9) return 'var(--accent)';
  if (conf >= 0.7) return 'var(--accent3)';
  return 'var(--accent2)';
}

function FieldCell({ field, onEdit }) {
  if (field.value == null) {
    return (
      <td>
        <span style={{ fontSize: 11, color: 'var(--accent2)' }}>not found</span>
        <button className="ca-btn ca-btn-link ca-btn-sm" style={{ marginLeft: 6 }} onClick={onEdit}>
          enter
        </button>
      </td>
    );
  }
  return (
    <td title={field.snippet ? `Found in: "${field.snippet}"` : undefined}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span
          aria-hidden="true"
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: confColor(field.conf), flexShrink: 0,
          }}
        />
        <span>{typeof field.value === 'number' ? field.value.toFixed(2) : field.value}</span>
        <span className="ca-sr-only">confidence {Math.round(field.conf * 100)} percent</span>
      </span>
    </td>
  );
}

export default function PriceListImportPreview() {
  const [stage, setStage] = useState('drop'); // drop | parsed
  const [selected, setSelected] = useState(new Set([1, 2]));

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const committable = ROWS.filter(r => selected.has(r.id) && r.match);
  const blocked = ROWS.filter(r => !r.match);

  return (
    <div className="ca-page ca-fade-in">
      <h1 className="ca-h1">Supplier price list import</h1>
      <p className="ca-subtitle">
        Drop a supplier&apos;s PDF price list, check what was read out of it, commit it as actual prices.
      </p>

      <PreviewBanner
        scrum="Scrum 30"
        title="PDF price-list extraction into ActualPrice"
        summary="Not the same thing as /quotes. That page (Scrum 31b, already shipped) reads a one-off quote into
                 QuoteRecordLine for a negotiation position. This one reads a recurring price list into ActualPrice,
                 which is what every gap in Monitor is measured against — so the hard part here is matching a row
                 to a cost model, not parsing the number."
        needs={[
          'Reuse services/quote_extraction.py (pdfplumber, table mode + full-text fallback) — the parser exists; the destination and the matcher do not',
          'A matching step: supplier price-list line -> CostModel for this team. Exact, fuzzy and unmatched must stay three distinct states; an unmatched row is never committed on a guess',
          'A draft run table, so a parse can be reviewed, left, and come back to — mirroring QuoteExtractionRun rather than committing straight from the upload response',
          'Commit writes ActualPrice rows through the existing prices path, so RLS, audit and the (cost_model, year, quarter) uniqueness all behave exactly as a manual entry would',
          'Unreadable PDF must fall back to the manual entry form, not an error page — the ticket calls this out explicitly',
        ]}
        endpoints={[
          'POST /api/price-lists/extract              -> draft run + rows with per-field confidence and locator',
          'POST /api/price-lists/runs/{id}/commit     -> selected rows become ActualPrice',
          'GET  /api/price-lists/runs/{id}/candidates -> cost-model match candidates for an unmatched row',
        ]}
      />

      {stage === 'drop' ? (
        <div className="ca-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Drop a price list</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 18, maxWidth: 460, margin: '0 auto 18px' }}>
            PDF price lists and quote sheets. Tabular layouts read best; free-text letters still work but come
            back with lower confidence on everything except the price itself.
          </div>
          <button className="ca-btn ca-btn-primary ca-btn-sm" onClick={() => setStage('parsed')}>
            Choose a file
          </button>
          <div style={{ marginTop: 10 }}>
            <WiringNote>loads a fixture instead of opening a file picker</WiringNote>
          </div>
        </div>
      ) : (
        <>
          <div className="ca-card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600 }}>synthomer-pricelist-2026Q3.pdf</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  3 rows read from 1 table on page 2 · parser: table mode
                </div>
              </div>
              <PreviewBadge style={{ marginLeft: 'auto' }} />
              <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => setStage('drop')}>
                Use a different file
              </button>
            </div>
          </div>

          <div className="ca-card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <div className="ca-card-title" style={{ marginBottom: 0 }}>What was read</div>
              <span style={{ fontSize: 10, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                <span><span aria-hidden="true" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', marginRight: 4 }} />labelled</span>
                <span><span aria-hidden="true" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--accent3)', marginRight: 4 }} />contextual</span>
                <span><span aria-hidden="true" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--accent2)', marginRight: 4 }} />weak</span>
              </span>
            </div>
            <div className="ca-scroll-x">
              <table className="ca-table">
                <caption className="ca-sr-only">
                  Rows extracted from the price list, with a confidence indicator per field and the cost model each row matched.
                </caption>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}><span className="ca-sr-only">Include</span></th>
                    {FIELDS.map(([k, label]) => <th key={k}>{label}</th>)}
                    <th>Matched cost model</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map(r => (
                    <tr key={r.id} style={{ opacity: r.match ? 1 : 0.75 }}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          disabled={!r.match}
                          onChange={() => toggle(r.id)}
                          aria-label={`Include ${r.product.value}`}
                        />
                      </td>
                      {FIELDS.map(([k]) => <FieldCell key={k} field={r[k]} onEdit={() => {}} />)}
                      <td>
                        {r.match ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span className="ca-badge" style={
                              r.match.confidence === 'exact'
                                ? { background: 'var(--accent-dim)', color: 'var(--accent)' }
                                : { background: 'var(--accent3-dim)', color: 'var(--accent3)' }
                            }>
                              {r.match.confidence}
                            </span>
                            <span style={{ fontSize: 11 }}>{r.match.cost_model}</span>
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--accent2)' }}>
                            no match — pick one or skip
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ca-card">
            <div className="ca-card-title" style={{ marginBottom: 8 }}>Commit</div>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
              Committing writes ActualPrice rows for the selected products at the read period. Rows that did not
              match a cost model cannot be committed — a price with no product to attach it to would either
              silently vanish or attach to the wrong gap, and both are worse than asking.
            </p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="ca-btn ca-btn-primary ca-btn-sm" disabled={committable.length === 0}>
                Commit {committable.length} row{committable.length === 1 ? '' : 's'}
              </button>
              {blocked.length > 0 && (
                <span style={{ fontSize: 11, color: 'var(--accent3)' }}>
                  {blocked.length} row{blocked.length === 1 ? '' : 's'} held back — unmatched
                </span>
              )}
              <WiringNote>nothing is written</WiringNote>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
