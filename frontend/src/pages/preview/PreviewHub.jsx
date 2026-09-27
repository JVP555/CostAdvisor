import { Link } from 'react-router-dom';
import { PreviewBadge } from '../../components/PreviewBadge';

// Index of everything still outstanding, split by what is actually blocking it.
// The split is the useful part: three of these groups look identical on a TODO
// list and need completely different people to unblock them.
//
// Keep this in step with jvpdocs/remaining-work-plan.md — that doc is the long
// form of this page.

const MOCKED = [
  {
    to: '/preview/nested-formulas',
    scrum: 'Scrum 27',
    title: 'Nested cost models',
    blurb: 'A component that is itself a cost model. Weight flattening, depth cap and cycle detection all have a working precedent in the template resolver.',
    size: 'Large — touches the costing engine',
  },
  {
    to: '/preview/ai-cost-modeler',
    scrum: 'Scrum 32',
    title: 'AI cost modeler',
    blurb: 'Draft a cost structure for a product nobody has decomposed. Draft-then-approve, reusing the estimator proposal tables rather than a second staging model.',
    size: 'Large — needs a review/provenance path',
  },
  {
    to: '/preview/price-list-import',
    scrum: 'Scrum 30',
    title: 'Supplier price-list import',
    blurb: 'PDF price list into ActualPrice. The parser already exists (Scrum 31b); matching a row to a cost model is the new part.',
    size: 'Medium — parser is reusable',
  },
  {
    to: '/preview/negotiation-prep',
    scrum: 'Scrum 29',
    title: 'Negotiation prep',
    blurb: 'Log what the supplier claimed, answer each claim with evidence. Never predicts their counter — it has no supplier-cost data and will not pretend to.',
    size: 'Medium — no new engine',
  },
  {
    to: '/preview/region-proxies',
    scrum: 'Scrum 57 follow-up',
    title: 'Per-region sourcing',
    blurb: 'One representative feed still speaks for every region of a commodity in the UI. The data largely exists on IndexCard already — what is missing is the read and this screen.',
    size: 'Small — re-scoped; do not build the table it was first scoped as',
  },
  {
    to: '/preview/notifications',
    scrum: 'Extras — PWA',
    title: 'Push notifications',
    blurb: 'The installable shell shipped; push did not. Free via VAPID — no paid relay, no Firebase.',
    size: 'Small — well-trodden path',
  },
];

// Backend shipped and tested; nothing in the UI calls it. These must be wired
// to the real endpoint, not mocked — a fixture here would replace working
// software with a drawing.
const UNWIRED = [
  {
    title: 'Index data-quality validation console',
    scrum: 'Scrum 33',
    api: 'GET /api/validation/findings · /runs · /preview',
    blurb: '1,554 stored findings — contradictions, gaps and notes across the index library, each naming the table, key and the two conflicting values. No screen reads any of it.',
  },
  {
    title: 'Real index forecasts on the Forecast tab',
    scrum: 'Scrum 21 follow-up',
    api: 'GET /api/indexes/{id}/projections/latest',
    blurb: 'A real OLS projection engine with stored vintages and confidence bands exists and nothing fetches it. Forecast currently charts history only, which is honest but half a page.',
  },
];

// Not a coding task. Listed because they are the things actually standing
// between the product and a paying customer.
const NON_CODE = [
  ['Sync the deploy repo', 'The Railway-connected repo is far behind this branch. Nothing from Scrum 26 onward, and none of the 12 Index Data Layer units, is live.'],
  ['SMTP credentials', 'No provider account chosen. Until then invites, welcome mails, demo confirmations and every alert email silently fail.'],
  ['Vendor DPAs + incident contacts', 'The last two open items on the security posture doc. Paperwork, and it blocks handing that doc to a prospect.'],
  ['Base-price anchors', '199 of 200 platform combos have no base-period price, so they produce an index level and never a currency figure. Import tooling is built and waiting on data.'],
  ['FD-1 feed mapping', 'Most catalog commodities have no scraper bound to their new short code, which is why the library shows "No data".'],
  ['Search Console + field CWV', 'Both need real production traffic first.'],
];

export default function PreviewHub() {
  return (
    <div className="ca-page ca-fade-in">
      <h1 className="ca-h1">What is still to build</h1>
      <p className="ca-subtitle">
        Six mocked surfaces, two features waiting only on a screen, and the things no amount of code will close.
      </p>

      <div className="ca-card" style={{ marginBottom: 24, borderColor: 'var(--accent3)', background: 'var(--accent3-dim)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
          <PreviewBadge label="Read this first" />
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Every page linked in the first section runs on hardcoded fixtures. They exist so the shape of a
          feature can be argued about before anyone writes a migration for it — each one states the model,
          endpoints and behaviour it assumes. They are specifications you can click, not working software.
          The rule when you wire one: delete its fixtures and its badge in the same commit.
        </p>
      </div>

      <h2 className="ca-h2" style={{ marginBottom: 4 }}>Mocked here</h2>
      <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>
        Unbuilt features. Front end drawn, backend absent.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12, marginBottom: 36 }}>
        {MOCKED.map(m => (
          <Link
            key={m.to}
            to={m.to}
            className="ca-card"
            style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <span className="ca-tag">{m.scrum}</span>
              <PreviewBadge style={{ marginLeft: 'auto' }} />
            </div>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
              {m.title}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>{m.blurb}</p>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{m.size}</div>
          </Link>
        ))}
      </div>

      <h2 className="ca-h2" style={{ marginBottom: 4 }}>Built, but nothing calls it</h2>
      <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>
        Shipped and tested backends with no screen. Wire these to the real endpoint — do not mock them.
      </p>
      <div className="ca-card" style={{ marginBottom: 36, padding: 0 }}>
        {UNWIRED.map((u, i) => (
          <div
            key={u.title}
            style={{
              padding: 18,
              borderTop: i === 0 ? 'none' : '1px solid var(--row-divider)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{u.title}</span>
              <span className="ca-tag">{u.scrum}</span>
              <span className="ca-badge" style={{ background: 'var(--accent4-dim)', color: 'var(--accent4)', marginLeft: 'auto' }}>
                backend ready
              </span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>{u.blurb}</p>
            <code style={{ fontSize: 10, color: 'var(--muted)' }}>{u.api}</code>
          </div>
        ))}
      </div>

      <h2 className="ca-h2" style={{ marginBottom: 4 }}>Not a coding task</h2>
      <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>
        These need an account, a signature, a dashboard or a dataset. No session can close them.
      </p>
      <div className="ca-card">
        {NON_CODE.map(([title, detail], i) => (
          <div
            key={title}
            style={{
              padding: '12px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--row-divider)',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{title}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{detail}</div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 24 }}>
        Long form, with the reasoning and the ordering: <code>jvpdocs/remaining-work-plan.md</code>.
        Authoritative per-scrum status: <code>CLAUDE.md</code>.
      </p>
    </div>
  );
}
