import { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';
import { formatApiError } from '../api';

const ROLE_COLORS = {
  owner: { bg: 'var(--accent-dim)', text: 'var(--accent)' },
  admin: { bg: 'var(--warning-bg)', text: 'var(--warning)' },
  member: { bg: 'var(--success-bg)', text: 'var(--accent)' },
};

function RoleBadge({ role }) {
  const c = ROLE_COLORS[role] || { bg: 'var(--surface2)', text: 'var(--text)' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 4,
      fontSize: 11, fontWeight: 600, background: c.bg, color: c.text,
    }}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  );
}

function RelativeTime({ iso }) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return <span>{mins < 2 ? 'just now' : `${mins}m ago`}</span>;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return <span>{hrs}h ago</span>;
  const days = Math.floor(hrs / 24);
  return <span>{days}d ago</span>;
}

export default function Requests() {
  const { refreshUser } = useAuth();
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null); // invite id being acted on

  const fetchInvites = () => {
    setLoading(true);
    api.get('/api/invites/pending')
      .then(r => setInvites(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchInvites(); }, []);

  const handleAccept = async (invite) => {
    setActing(invite.id);
    try {
      await api.post(`/api/invites/${invite.token}/accept`);
      await refreshUser();
      setInvites(prev => prev.filter(i => i.id !== invite.id));
    } catch (err) {
      alert(formatApiError(err));
    } finally {
      setActing(null);
    }
  };

  const handleDecline = async (invite) => {
    if (!confirm(`Decline invitation to join ${invite.team_name}?`)) return;
    setActing(invite.id);
    try {
      await api.post(`/api/invites/${invite.token}/decline`);
      setInvites(prev => prev.filter(i => i.id !== invite.id));
    } catch (err) {
      alert(formatApiError(err));
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="ca-page ca-fade-in">
      <div className="ca-h1" style={{ marginBottom: 4 }}>Requests</div>
      <p className="ca-subtitle">Team invitations sent to you.</p>

      {loading ? (
        <div style={{ padding: 20, color: 'var(--muted)' }}>Loading...</div>
      ) : invites.length === 0 ? (
        <div className="ca-card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✉</div>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>No pending invitations</div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            When someone invites you to a team, it will appear here.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {invites.map(invite => {
            const isBusy = acting === invite.id;
            const expires = new Date(invite.expires_at);
            const daysLeft = Math.ceil((expires - Date.now()) / 86400000);
            return (
              <div key={invite.id} className="ca-card" style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                      {invite.team_name}
                    </span>
                    <RoleBadge role={invite.role} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Invited by{' '}
                    <span style={{ color: 'var(--text)' }}>
                      {invite.invited_by_name
                        ? `${invite.invited_by_name} (${invite.invited_by_email})`
                        : invite.invited_by_email}
                    </span>
                    {' · '}
                    <RelativeTime iso={invite.created_at} />
                    {' · '}
                    <span style={{ color: daysLeft <= 2 ? 'var(--accent2)' : 'var(--muted)' }}>
                      Expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="ca-btn ca-btn-primary ca-btn-sm"
                    onClick={() => handleAccept(invite)}
                    disabled={isBusy}
                  >
                    {isBusy ? '...' : 'Accept'}
                  </button>
                  <button
                    className="ca-btn ca-btn-ghost ca-btn-sm"
                    onClick={() => handleDecline(invite)}
                    disabled={isBusy}
                  >
                    Decline
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
