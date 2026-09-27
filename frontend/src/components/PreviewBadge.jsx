// Shared chrome for every surface under pages/preview/.
//
// Those pages are design-complete mockups running on hardcoded fixtures — the
// model, migration and endpoint behind each one do not exist yet. These three
// components are the ONLY thing communicating that, so they are deliberately
// loud rather than tasteful: a procurement tool rendering invented numbers that
// read as real is the exact failure mode commit 03e0856 removed a fabricated
// negotiation playbook for. The rule is that the badge and the fixture die in
// the same commit — if you wire a panel to a real endpoint, delete its
// <PreviewBadge /> in that diff, not later.

const AMBER = 'var(--accent3)';
const AMBER_DIM = 'var(--accent3-dim)';

export function PreviewBadge({ label = 'Preview · dummy data', title, style }) {
  return (
    <span
      className="ca-badge"
      title={title || 'This panel renders hardcoded fixtures. No API call is made.'}
      style={{
        background: AMBER_DIM,
        color: AMBER,
        border: `1px solid ${AMBER}`,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {label}
    </span>
  );
}

// Page-level header. `needs` is the backend that has to exist before the page
// can stop lying, and `endpoints` is the API shape this mockup already assumes
// — stating both here is what makes the mockup a specification rather than a
// drawing, so whoever wires it does not have to re-derive the contract.
export function PreviewBanner({ scrum, title, summary, needs = [], endpoints = [] }) {
  return (
    <div
      className="ca-card"
      style={{
        // Flat tint, not a gradient: DESIGN.md's elevation model is
        // flat-by-default and the amber border is already carrying the signal.
        borderColor: AMBER,
        background: AMBER_DIM,
        marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <PreviewBadge label="Not wired" />
        {scrum && <span className="ca-tag">{scrum}</span>}
        <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700 }}>{title}</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: needs.length || endpoints.length ? 14 : 0 }}>
        {summary}
      </p>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {needs.length > 0 && (
          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <div className="ca-card-title" style={{ marginBottom: 6 }}>Still to build</div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              {needs.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}
        {endpoints.length > 0 && (
          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <div className="ca-card-title" style={{ marginBottom: 6 }}>API this mockup assumes</div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: 'var(--muted)', lineHeight: 1.8 }}>
              {endpoints.map((e, i) => <li key={i} style={{ wordBreak: 'break-all' }}>{e}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// Inline marker for one control whose handler is a no-op. Sits next to the
// button rather than inside a tooltip so it survives a screenshot.
export function WiringNote({ children }) {
  return (
    <span style={{ fontSize: 10, color: AMBER, letterSpacing: 0.3 }}>
      ↳ {children}
    </span>
  );
}

export default PreviewBadge;
