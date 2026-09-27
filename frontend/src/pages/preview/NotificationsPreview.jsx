import { useEffect, useState } from 'react';
import { PreviewBanner, PreviewBadge, WiringNote } from '../../components/PreviewBadge';

// PWA web push — the half that is still 🔴. Mockup for everything that needs a
// backend; the capability probe at the top is genuinely live, because it reads
// the browser rather than the server and a fake answer there would be useless.
//
// The PWA shell itself already shipped (manifest.json + a hand-written sw.js,
// no Workbox). What is missing is: the push/notificationclick listeners in the
// service worker, a subscribe flow, a PushSubscription table, a pywebpush
// sender, and the VAPID key pair. Deliberately free — browser push relays need
// no paid service and no Firebase project.

const TRIGGERS = [
  { key: 'index_move', label: 'Index moves past my threshold', email: true, slack: false, push: true },
  { key: 'gap', label: 'A new gap opens on a product', email: true, slack: true, push: true },
  { key: 'buy_window', label: 'A buy window opens or closes', email: false, slack: false, push: true },
  { key: 'radar', label: 'A negotiation window opens', email: true, slack: false, push: true },
  { key: 'support', label: 'Support replies to my thread', email: true, slack: false, push: true },
];

const DEVICES = [
  { id: 'd1', label: 'Chrome · Windows', added: '2026-09-02', last_seen: '2026-09-26', current: true },
  { id: 'd2', label: 'Safari · iPhone (installed)', added: '2026-08-14', last_seen: '2026-09-25', current: false },
  { id: 'd3', label: 'Firefox · Ubuntu', added: '2026-06-30', last_seen: '2026-07-11', current: false, stale: true },
];

function Check({ on, onToggle, label }) {
  return (
    <input
      type="checkbox"
      checked={on}
      onChange={onToggle}
      aria-label={label}
      style={{ cursor: 'pointer' }}
    />
  );
}

export default function NotificationsPreview() {
  // Real browser state. Not a fixture — a mocked answer here would tell you
  // nothing about whether push could work on this device at all.
  const [caps, setCaps] = useState({ sw: false, push: false, permission: 'default', standalone: false });
  const [channels, setChannels] = useState(TRIGGERS);

  useEffect(() => {
    setCaps({
      sw: 'serviceWorker' in navigator,
      push: 'PushManager' in window,
      permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
      standalone: window.matchMedia?.('(display-mode: standalone)')?.matches || false,
    });
  }, []);

  const toggle = (key, channel) => setChannels(cs =>
    cs.map(c => (c.key === key ? { ...c, [channel]: !c[channel] } : c)));

  const capRow = (label, ok, detail) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--row-divider)' }}>
      <span
        aria-hidden="true"
        style={{ width: 8, height: 8, borderRadius: '50%', background: ok ? 'var(--accent)' : 'var(--accent2)', flexShrink: 0 }}
      />
      <span style={{ fontSize: 12 }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{detail}</span>
    </div>
  );

  return (
    <div className="ca-page ca-fade-in">
      <h1 className="ca-h1">Push notifications</h1>
      <p className="ca-subtitle">
        Alerts on the device instead of only in an inbox — no paid push service, no Firebase project.
      </p>

      <PreviewBanner
        scrum="Extras — PWA"
        title="Web push (VAPID)"
        summary="The installable shell already ships. This page mocks everything that still needs a backend:
                 subscribing, storing the subscription, and sending. The capability panel below is the one
                 genuinely live thing here — it reads this browser, not the server."
        needs={[
          'sw.js gains a push listener (showNotification) and a notificationclick handler that focuses-or-opens the page the alert came from',
          'A usePushSubscription hook: requestPermission -> pushManager.subscribe -> POST the endpoint + p256dh + auth keys',
          'PushSubscription model keyed on the USER, not the team — subscriptions are per device. Follow the app-layer ownership check SupportThread and AlertSubscription already use, not a new RLS shape',
          'services/push.py wrapping pywebpush; a 404/410 from the relay means the subscription is dead and the row is deleted, not retried',
          'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY generated and set; the public one also reaches the frontend build as VITE_VAPID_PUBLIC_KEY',
          'iOS only delivers push to an installed PWA on 16.4+, never a plain tab — the UI has to say so rather than silently never arriving',
        ]}
        endpoints={[
          'POST   /api/push/subscriptions        -> register this device',
          'DELETE /api/push/subscriptions/{id}   -> unregister',
          'PUT    /api/alerts/subscriptions/{id} -> already exists; needs "push" as a channel value',
        ]}
      />

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div className="ca-card" style={{ flex: '1 1 300px', minWidth: 280 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <div className="ca-card-title" style={{ marginBottom: 0 }}>This browser</div>
            <span className="ca-badge" style={{ background: 'var(--accent-dim)', color: 'var(--accent)', marginLeft: 'auto' }}>
              live
            </span>
          </div>
          {capRow('Service worker support', caps.sw, caps.sw ? 'available' : 'missing')}
          {capRow('Push API support', caps.push, caps.push ? 'available' : 'missing')}
          {capRow('Notification permission', caps.permission === 'granted', caps.permission)}
          {capRow('Installed as an app', caps.standalone, caps.standalone ? 'standalone' : 'browser tab')}
          <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 12 }}>
            On iOS the last row is not cosmetic: Safari delivers push only to a PWA added to the home screen,
            so a subscribe button in a plain tab would appear to work and then never deliver anything.
          </p>
          <button className="ca-btn ca-btn-primary ca-btn-sm" style={{ marginTop: 12 }} disabled>
            Enable push on this device
          </button>
          <div style={{ marginTop: 8 }}>
            <WiringNote>disabled until a VAPID public key exists to subscribe with</WiringNote>
          </div>
        </div>

        <div style={{ flex: '2 1 420px', minWidth: 320 }}>
          <div className="ca-card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <div className="ca-card-title" style={{ marginBottom: 0 }}>Where each alert goes</div>
              <PreviewBadge style={{ marginLeft: 'auto' }} />
            </div>
            <div className="ca-scroll-x">
              <table className="ca-table">
                <caption className="ca-sr-only">Delivery channel per alert trigger.</caption>
                <thead>
                  <tr>
                    <th>Trigger</th>
                    <th style={{ textAlign: 'center' }}>Email</th>
                    <th style={{ textAlign: 'center' }}>Slack</th>
                    <th style={{ textAlign: 'center' }}>Push</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map(t => (
                    <tr key={t.key}>
                      <td>{t.label}</td>
                      <td style={{ textAlign: 'center' }}>
                        <Check on={t.email} onToggle={() => toggle(t.key, 'email')} label={`Email for ${t.label}`} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <Check on={t.slack} onToggle={() => toggle(t.key, 'slack')} label={`Slack for ${t.label}`} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <Check on={t.push} onToggle={() => toggle(t.key, 'push')} label={`Push for ${t.label}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 10 }}>
              Email and Slack are real channels on AlertSubscription today. Push would be a third value on the
              same column rather than a parallel system — and note that email currently sends nowhere at all,
              because no SMTP credentials are configured.
            </div>
          </div>

          <div className="ca-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <div className="ca-card-title" style={{ marginBottom: 0 }}>Registered devices</div>
              <PreviewBadge style={{ marginLeft: 'auto' }} />
            </div>
            {DEVICES.map(d => (
              <div
                key={d.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 0', borderBottom: '1px solid var(--row-divider)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12 }}>
                    {d.label}
                    {d.current && (
                      <span className="ca-badge" style={{ background: 'var(--accent-dim)', color: 'var(--accent)', marginLeft: 8 }}>
                        this device
                      </span>
                    )}
                    {d.stale && (
                      <span className="ca-badge" style={{ background: 'var(--warn-bg)', color: 'var(--accent3)', marginLeft: 8 }}>
                        likely expired
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                    added {d.added} · last delivered {d.last_seen}
                  </div>
                </div>
                <button className="ca-btn ca-btn-ghost ca-btn-sm" style={{ marginLeft: 'auto' }}>Remove</button>
              </div>
            ))}
            <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 12 }}>
              A dead subscription answers the relay with 404 or 410. The sender deletes that row on the spot
              rather than retrying — otherwise every uninstalled browser stays in the table forever.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
