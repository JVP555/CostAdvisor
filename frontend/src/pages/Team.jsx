import { useState, useEffect, Fragment, useRef } from 'react';
import FileUpload from '../components/FileUpload';
import api, { formatApiError } from '../api';
import { useAuth } from '../AuthContext';
import exportCsv from '../utils/exportCsv';
import { useConfirm } from '../components/ConfirmDialog';

export default function Team() {
  const { pendingInviteCount } = useAuth();
  const [tab, setTab] = useState('teams');

  const TAB_LABELS = {
    teams: 'Teams',
    requests: pendingInviteCount > 0 ? `Requests (${pendingInviteCount})` : 'Requests',
    activity: 'Activity Log',
    settings: 'Settings',
  };

  return (
    <div className="ca-page ca-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div className="ca-h1">Team</div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['teams', 'requests', 'activity', 'settings'].map(t => (
          <button key={t} className={`ca-btn ${tab === t ? 'ca-btn-primary' : 'ca-btn-ghost'}`}
            onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'teams' && <TeamsTab />}
      {tab === 'requests' && <RequestsTab />}
      {tab === 'activity' && <ActivityTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}

const ROLE_COLORS = {
  owner:  { bg: 'var(--accent-dim)',  color: 'var(--accent)' },
  admin:  { bg: 'var(--info-bg)',     color: 'var(--accent3)' },
  member: { bg: 'var(--neutral-bg)',  color: 'var(--muted)' },
};

function RoleBadge({ role }) {
  const s = ROLE_COLORS[role] || ROLE_COLORS.member;
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: 4,
      fontSize: 10, fontWeight: 600, background: s.bg, color: s.color,
    }}>{role}</span>
  );
}

// ─── Create Team Modal ────────────────────────────────────────────────────────

function CreateTeamModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [members, setMembers] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('member');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const nameRef = useRef(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const addMember = () => {
    const email = newEmail.trim();
    if (!email) return;
    if (members.some(m => m.email === email)) return;
    setMembers(prev => [...prev, { email, role: newRole }]);
    setNewEmail('');
    setNewRole('member');
  };

  const removeMember = (i) => setMembers(prev => prev.filter((_, j) => j !== i));

  const handleCreate = async () => {
    if (!name.trim()) { setError('Team name is required.'); return; }
    setLoading(true);
    setError(null);
    try {
      const { data: team } = await api.post('/api/teams', { name: name.trim() });
      const inviteErrors = [];
      for (const m of members) {
        try {
          await api.post(`/api/teams/${team.id}/invite`, { email: m.email, role: m.role });
        } catch (e) {
          inviteErrors.push(`${m.email}: ${e.response?.data?.detail || 'invite failed'}`);
        }
      }
      onCreated(inviteErrors.length ? inviteErrors.join('; ') : null);
    } catch (err) {
      setError(formatApiError(err));
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ca-card" style={{ width: 480, maxWidth: '92vw', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Create New Team</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}>×</button>
        </div>

        <label className="ca-label">Team Name <span style={{ color: 'var(--accent2)' }}>*</span></label>
        <input
          ref={nameRef}
          className="ca-input"
          placeholder="e.g. Acme Packaging Team"
          value={name}
          onChange={e => { setName(e.target.value); setError(null); }}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          style={{ marginBottom: 20 }}
        />

        <label className="ca-label" style={{ marginBottom: 6, display: 'block' }}>Add Members <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, marginTop: 0 }}>
          You are the owner by default. Add others now or later from the Manage panel.
        </p>

        {members.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {members.map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ flex: 1, fontSize: 12 }}>{m.email}</span>
                <RoleBadge role={m.role} />
                <button onClick={() => removeMember(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <input className="ca-input" placeholder="email@example.com" value={newEmail}
            onChange={e => setNewEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && addMember()}
            style={{ flex: 1 }} />
          <select className="ca-input" value={newRole} onChange={e => setNewRole(e.target.value)} style={{ width: 'auto', minWidth: 80 }}>
            <option value="admin">admin</option>
            <option value="member">member</option>
          </select>
          <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={addMember}>+ Add</button>
        </div>

        {error && (
          <div style={{ marginTop: 14, padding: '8px 12px', borderRadius: 6, fontSize: 11, background: 'var(--accent2-dim)', color: 'var(--accent2)' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
          <button className="ca-btn ca-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="ca-btn ca-btn-primary" onClick={handleCreate} disabled={loading}>
            {loading ? 'Creating…' : 'Create Team'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Members Modal ────────────────────────────────────────────────────────

function AddMembersModal({ teamId, onClose, onDone }) {
  const [entries, setEntries] = useState([{ email: '', role: 'member' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const firstRef = useRef(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  const addRow = () => setEntries(prev => [...prev, { email: '', role: 'member' }]);
  const updateRow = (i, field, val) => setEntries(prev => prev.map((e, j) => j === i ? { ...e, [field]: val } : e));
  const removeRow = (i) => setEntries(prev => prev.filter((_, j) => j !== i));

  const handleSubmit = async () => {
    const valid = entries.filter(e => e.email.trim());
    if (valid.length === 0) { setError('Enter at least one email address.'); return; }
    setLoading(true);
    setError(null);
    const errors = [];
    for (const e of valid) {
      try { await api.post(`/api/teams/${teamId}/invite`, { email: e.email.trim(), role: e.role }); }
      catch (err) { errors.push(`${e.email}: ${err.response?.data?.detail || 'failed'}`); }
    }
    setLoading(false);
    onDone(errors.length ? errors.join('; ') : null);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ca-card" style={{ width: 480, maxWidth: '92vw', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Add Members</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}>×</button>
        </div>

        {entries.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              ref={i === 0 ? firstRef : null}
              className="ca-input"
              placeholder="email@example.com"
              value={e.email}
              onChange={ev => updateRow(i, 'email', ev.target.value)}
              onKeyDown={ev => ev.key === 'Enter' && addRow()}
              style={{ flex: 1 }}
            />
            <select className="ca-input" value={e.role} onChange={ev => updateRow(i, 'role', ev.target.value)} style={{ width: 'auto', minWidth: 80 }}>
              <option value="admin">admin</option>
              <option value="member">member</option>
            </select>
            {entries.length > 1 && (
              <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, lineHeight: 1, padding: '0 4px' }}>×</button>
            )}
          </div>
        ))}

        <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={addRow} style={{ marginBottom: 16, fontSize: 11 }}>
          + Add another
        </button>

        {error && (
          <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, fontSize: 11, background: 'var(--accent2-dim)', color: 'var(--accent2)' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button className="ca-btn ca-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="ca-btn ca-btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Adding…' : `Add ${entries.filter(e => e.email.trim()).length || ''} Member${entries.filter(e => e.email.trim()).length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Teams Tab ────────────────────────────────────────────────────────────────

function TeamsTab() {
  const { teams, refreshUser, user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState(null);
  const [message, setMessage] = useState(null);

  const handleCreated = async (inviteError) => {
    setShowModal(false);
    await refreshUser();
    setMessage(inviteError
      ? { type: 'error', text: `Team created, but some invites failed: ${inviteError}` }
      : { type: 'success', text: 'Team created.' }
    );
  };

  const toggleExpand = (teamId) => setExpandedTeamId(prev => prev === teamId ? null : teamId);

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString();
  };

  return (
    <>
      {showModal && <CreateTeamModal onClose={() => setShowModal(false)} onCreated={handleCreated} />}

      {message && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 12,
          background: message.type === 'success' ? 'var(--accent-dim)' : 'var(--accent2-dim)',
          color: message.type === 'success' ? 'var(--accent)' : 'var(--accent2)',
          border: `1px solid ${message.type === 'success' ? 'var(--success-bg-strong)' : 'var(--danger-bg-strong)'}`,
          display: 'flex', justifyContent: 'space-between',
        }}>
          {message.text}
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700 }}>×</button>
        </div>
      )}

      <div className="ca-card">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
          <button className="ca-btn ca-btn-primary ca-btn-sm" onClick={() => setShowModal(true)}>
            + Create Team
          </button>
        </div>

        <div className="ca-scroll-x">
          <table className="ca-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Your Role</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: 36, color: 'var(--muted)', fontSize: 12 }}>
                    No teams yet. Create one above.
                  </td>
                </tr>
              ) : teams.map(t => (
                <Fragment key={t.id}>
                  <tr style={{ background: expandedTeamId === t.id ? 'var(--surface2)' : undefined }}>
                    <td style={{ fontWeight: 500, fontSize: 13 }}>{t.name}</td>
                    <td><RoleBadge role={t.role} /></td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDate(t.created_at)}</td>
                    <td>
                      <button
                        className={`ca-btn ca-btn-sm ${expandedTeamId === t.id ? 'ca-btn-primary' : 'ca-btn-ghost'}`}
                        onClick={() => toggleExpand(t.id)}
                      >
                        {expandedTeamId === t.id ? 'Close' : 'Manage'}
                      </button>
                    </td>
                  </tr>
                  {expandedTeamId === t.id && (
                    <tr>
                      <td colSpan={4} style={{ padding: 0, background: 'var(--surface2)', borderBottom: '2px solid var(--border)' }}>
                        <TeamManagePanel
                          teamId={t.id}
                          teamName={t.name}
                          userRole={t.role}
                          currentUserId={user?.id}
                          onRefresh={refreshUser}
                          onClose={() => setExpandedTeamId(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ─── Team Manage Panel ────────────────────────────────────────────────────────

function TeamManagePanel({ teamId, teamName, userRole, currentUserId, onRefresh, onClose }) {
  const { activeTeamId } = useAuth();
  const confirm = useConfirm();
  const [members, setMembers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [message, setMessage] = useState(null);

  const isOwner = userRole === 'owner';
  const isAdmin = userRole === 'admin';
  const canManage = isOwner || isAdmin;

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const [membersRes, invitesRes] = await Promise.all([
        api.get(`/api/teams/${teamId}/members`),
        canManage ? api.get(`/api/teams/${teamId}/invites`) : Promise.resolve({ data: [] }),
      ]);
      setMembers(membersRes.data);
      setPendingInvites(invitesRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMembers(); }, [teamId]);

  const handleRoleChange = async (userId, newRole) => {
    const m = members.find(m => m.user_id === userId);
    const ok = await confirm({
      title: 'Change role?',
      message: `Change ${m?.display_name || m?.email}'s role to ${newRole}?`,
      confirmLabel: 'Change Role',
    });
    if (!ok) return;
    try {
      await api.patch(`/api/teams/${teamId}/members/${userId}`, { role: newRole });
      await fetchMembers();
    } catch (err) {
      setMessage({ type: 'error', text: formatApiError(err) });
    }
  };

  const handleRemove = async (userId) => {
    const m = members.find(m => m.user_id === userId);
    const ok = await confirm({
      title: 'Remove member?',
      message: `Remove ${m?.display_name || m?.email} from ${teamName}?`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/teams/${teamId}/members/${userId}`);
      await fetchMembers();
      await onRefresh();
    } catch (err) {
      setMessage({ type: 'error', text: formatApiError(err) });
    }
  };

  const handleLeave = async () => {
    const ok = await confirm({
      title: `Leave ${teamName}?`,
      message: 'You will be removed from this team. This cannot be undone.',
      confirmLabel: 'Leave Team',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/teams/${teamId}/members/${currentUserId}`);
      await onRefresh();
      onClose();
    } catch (err) {
      setMessage({ type: 'error', text: formatApiError(err) });
    }
  };

  const handleMembersAdded = async (error) => {
    setShowAddModal(false);
    await fetchMembers();
    setMessage(error
      ? { type: 'error', text: `Some invites failed: ${error}` }
      : { type: 'success', text: 'Invite sent.' }
    );
  };

  const handleRevoke = async (inviteId, email) => {
    const ok = await confirm({
      title: 'Revoke invite?',
      message: `Revoke the pending invite for ${email}?`,
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/teams/${teamId}/invites/${inviteId}`);
      setPendingInvites(prev => prev.filter(i => i.id !== inviteId));
    } catch (err) {
      setMessage({ type: 'error', text: formatApiError(err) });
    }
  };

  const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString() : '—';

  if (loading) {
    return <div style={{ padding: '16px 24px', color: 'var(--muted)', fontSize: 12 }}>Loading members…</div>;
  }

  return (
    <div style={{ padding: '16px 24px' }}>
      {showAddModal && (
        <AddMembersModal teamId={teamId} onClose={() => setShowAddModal(false)} onDone={handleMembersAdded} />
      )}

      {message && (
        <div style={{
          padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 11,
          background: message.type === 'success' ? 'var(--accent-dim)' : 'var(--accent2-dim)',
          color: message.type === 'success' ? 'var(--accent)' : 'var(--accent2)',
          display: 'flex', justifyContent: 'space-between',
        }}>
          {message.text}
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700 }}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{members.length} member{members.length !== 1 ? 's' : ''}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isOwner && teamId !== activeTeamId && (
            <button className="ca-btn ca-btn-ghost ca-btn-sm"
              style={{ color: 'var(--accent2)', borderColor: 'var(--accent2)', fontSize: 11 }}
              onClick={handleLeave}>Leave Team</button>
          )}
          {canManage && (
            <button className="ca-btn ca-btn-primary ca-btn-sm" onClick={() => setShowAddModal(true)}>
              + Add Members
            </button>
          )}
        </div>
      </div>

      <table className="ca-table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Role</th>
            <th>Added On</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {members.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)', fontSize: 12 }}>
                No members yet.
              </td>
            </tr>
          ) : members.map(m => {
            const isOwnerRow = m.role === 'owner';
            const isSelf = m.user_id === currentUserId;
            const canEditRole = canManage && !isSelf && !(isOwnerRow && !isOwner);
            const canRemove = canManage && !isSelf && !isOwnerRow;
            return (
              <tr key={m.user_id}>
                <td style={{ fontSize: 12 }}>
                  {m.display_name ? `${m.display_name} (${m.email})` : m.email}
                  {isSelf && <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--muted)' }}>you</span>}
                </td>
                <td>
                  {canEditRole ? (
                    <select
                      value={m.role}
                      className="ca-input"
                      style={{ fontSize: 11, padding: '3px 6px', width: 'auto' }}
                      onChange={e => handleRoleChange(m.user_id, e.target.value)}
                    >
                      {isOwner && <option value="owner">owner</option>}
                      <option value="admin">admin</option>
                      <option value="member">member</option>
                    </select>
                  ) : (
                    <RoleBadge role={m.role} />
                  )}
                </td>
                <td style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDate(m.joined_at)}</td>
                <td style={{ textAlign: 'right' }}>
                  {canRemove && (
                    <button
                      className="ca-btn ca-btn-ghost ca-btn-sm"
                      style={{ color: 'var(--accent2)', borderColor: 'var(--accent2)', fontSize: 11 }}
                      onClick={() => handleRemove(m.user_id)}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {canManage && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            Pending Invites
            {pendingInvites.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400, color: 'var(--muted)' }}>
                {pendingInvites.length} waiting
              </span>
            )}
          </div>
          {pendingInvites.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--muted)', padding: '8px 0' }}>No pending invites.</div>
          ) : (
            <table className="ca-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Invited</th>
                  <th>Expires</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map(inv => {
                  const daysLeft = Math.ceil((new Date(inv.expires_at) - Date.now()) / 86400000);
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontSize: 12 }}>{inv.invited_email}</td>
                      <td><RoleBadge role={inv.role} /></td>
                      <td style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDate(inv.created_at)}</td>
                      <td style={{ fontSize: 11, color: daysLeft <= 2 ? 'var(--accent2)' : 'var(--muted)' }}>
                        {daysLeft}d left
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="ca-btn ca-btn-ghost ca-btn-sm"
                          style={{ color: 'var(--accent2)', borderColor: 'var(--accent2)', fontSize: 11 }}
                          onClick={() => handleRevoke(inv.id, inv.invited_email)}
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Requests Tab ─────────────────────────────────────────────────────────────

function RelativeTime({ iso }) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return <span>{mins < 2 ? 'just now' : `${mins}m ago`}</span>;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return <span>{hrs}h ago</span>;
  return <span>{Math.floor(hrs / 24)}d ago</span>;
}

const STATUS_STYLE = {
  accepted: { bg: 'var(--success-bg)', color: 'var(--accent)', label: 'Accepted' },
  declined: { bg: 'var(--danger-bg)', color: 'var(--accent2)', label: 'Declined' },
  revoked:  { bg: 'var(--neutral-bg)', color: 'var(--muted)', label: 'Revoked' },
  expired:  { bg: 'var(--neutral-bg)', color: 'var(--muted)', label: 'Expired' },
};

function RequestsTab() {
  const { refreshUser } = useAuth();
  const confirm = useConfirm();
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);
  const [error, setError] = useState(null);

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      api.get('/api/invites/pending'),
      api.get('/api/invites/history'),
    ])
      .then(([pendingRes, historyRes]) => {
        setPending(pendingRes.data);
        setHistory(historyRes.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const handleAccept = async (invite) => {
    const ok = await confirm({
      title: `Join ${invite.team_name}?`,
      message: `You'll be added as ${invite.role}. You can leave the team at any time.`,
      confirmLabel: 'Accept Invite',
    });
    if (!ok) return;
    setActing(invite.id);
    setError(null);
    try {
      await api.post(`/api/invites/${invite.token}/accept`);
      await refreshUser();
      fetchAll();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setActing(null);
    }
  };

  const handleDecline = async (invite) => {
    const ok = await confirm({
      title: 'Decline invitation?',
      message: `Decline the invite to join ${invite.team_name} as ${invite.role}? This cannot be undone.`,
      confirmLabel: 'Decline',
      danger: true,
    });
    if (!ok) return;
    setActing(invite.id);
    setError(null);
    try {
      await api.post(`/api/invites/${invite.token}/decline`);
      fetchAll();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setActing(null);
    }
  };

  if (loading) return <div style={{ padding: 20, color: 'var(--muted)' }}>Loading...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 6, fontSize: 12, background: 'var(--accent2-dim)', color: 'var(--accent2)', display: 'flex', justifyContent: 'space-between' }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700 }}>×</button>
        </div>
      )}

      {/* Pending invitations */}
      {pending.length === 0 ? (
        <div className="ca-card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 26, marginBottom: 10 }}>✉</div>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>No pending invitations</div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>When someone invites you to a team, it will appear here.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pending.map(invite => {
            const isBusy = acting === invite.id;
            const daysLeft = Math.ceil((new Date(invite.expires_at) - Date.now()) / 86400000);
            return (
              <div key={invite.id} className="ca-card" style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{invite.team_name}</span>
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
                  <button className="ca-btn ca-btn-primary ca-btn-sm" onClick={() => handleAccept(invite)} disabled={isBusy}>
                    {isBusy ? '...' : 'Accept'}
                  </button>
                  <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => handleDecline(invite)} disabled={isBusy}>
                    Decline
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
            History
          </div>
          <div className="ca-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="ca-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Role</th>
                  <th>Invited by</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map(inv => {
                  const now = Date.now();
                  const effectiveStatus = inv.status === 'pending' && new Date(inv.expires_at) <= now
                    ? 'expired'
                    : inv.status;
                  const s = STATUS_STYLE[effectiveStatus] || STATUS_STYLE.expired;
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontSize: 12, fontWeight: 500 }}>{inv.team_name}</td>
                      <td><RoleBadge role={inv.role} /></td>
                      <td style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {inv.invited_by_name || inv.invited_by_email}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {inv.accepted_at
                          ? new Date(inv.accepted_at).toLocaleDateString()
                          : new Date(inv.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-block', padding: '1px 8px', borderRadius: 4,
                          fontSize: 10, fontWeight: 600, background: s.bg, color: s.color,
                        }}>{s.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Activity helpers ─────────────────────────────────────────────────────────

function formatActivityDetail(log) {
  const nv = log.new_value || {};
  const pv = log.previous_value || {};
  const { _impersonated_by, by, ...data } = nv;
  const label = (k) => k.replace(/_/g, ' ');

  switch (log.event_type) {
    case 'create':
      return nv.name ? `Created: ${nv.name}` : `Created ${log.entity_type}`;
    case 'update': {
      const parts = Object.entries(data).map(([k, v]) => {
        if (v && typeof v === 'object' && 'from' in v && 'to' in v)
          return `${label(k)}: ${v.from} → ${v.to}`;
        return `${label(k)}: ${v}`;
      });
      return parts.length ? parts.join(' · ') : 'Updated';
    }
    case 'delete':
      return pv.name ? `Deleted: ${pv.name}` : nv.name ? `Deleted: ${nv.name}` : `Deleted ${log.entity_type}`;
    case 'clone':
      return nv.cloned_from ? `Cloned from "${nv.cloned_from}"` : 'Cloned';
    case 'invite':
      return `Invited ${nv.email || '?'} as ${nv.role || 'member'}`;
    case 'invite_accepted':
      return `Accepted invite as ${nv.role || 'member'}`;
    case 'invite_revoked':
      return `Revoked invite for ${nv.email || '?'}${nv.role ? ` (${nv.role})` : ''}`;
    case 'update_role': {
      const from = pv.role || '?';
      const to = nv.role || '?';
      return `Role: ${from} → ${to}`;
    }
    case 'remove':
      return `Removed from team${pv.role ? ` (was ${pv.role})` : ''}`;
    case 'upload':
      return `Uploaded: ${nv.filename || nv.name || 'file'}`;
    case 'override':
      return nv.index || nv.commodity ? `Index override: ${nv.index || nv.commodity}` : 'Index value overridden';
    case 'scrape':
      return `Index source scraped${nv.url ? `: ${nv.url}` : ''}`;
    default: {
      const parts = Object.entries(data)
        .filter(([k]) => !k.startsWith('_'))
        .map(([k, v]) => {
          if (v && typeof v === 'object' && 'from' in v && 'to' in v)
            return `${label(k)}: ${v.from} → ${v.to}`;
          if (typeof v === 'object') return `${label(k)}: ${JSON.stringify(v)}`;
          return `${label(k)}: ${v}`;
        });
      return parts.length ? parts.join(' · ') : '—';
    }
  }
}

function userLabel(log, membersMap) {
  const m = membersMap[log.user_id];
  const name = m?.display_name ? `${m.display_name} (${log.user_email})` : (log.user_email || '—');
  if (log.new_value?._impersonated_by) {
    return (
      <span>
        <span style={{
          fontSize: 9, fontWeight: 700, background: 'var(--accent2-dim)', color: 'var(--accent2)',
          borderRadius: 3, padding: '1px 4px', marginRight: 5, textTransform: 'uppercase', letterSpacing: 0.5,
        }}>Impersonated</span>
        {name}
      </span>
    );
  }
  return name;
}

const EVENT_TYPES = [
  { value: '', label: 'All Events' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'clone', label: 'Clone' },
  { value: 'invite', label: 'Invite' },
  { value: 'update_role', label: 'Role Change' },
  { value: 'remove', label: 'Remove Member' },
  { value: 'upload', label: 'Upload' },
  { value: 'override', label: 'Index Override' },
  { value: 'scrape', label: 'Scrape' },
  { value: 'invite_accepted', label: 'Invite Accepted' },
  { value: 'invite_revoked', label: 'Invite Revoked' },
];

const ENTITY_TYPES = [
  { value: '', label: 'All Entities' },
  { value: 'cost_model', label: 'Cost Model' },
  { value: 'formula_version', label: 'Formula Version' },
  { value: 'price_data', label: 'Price Data' },
  { value: 'actual_volume', label: 'Volume' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'product', label: 'Product' },
  { value: 'index_override', label: 'Index Override' },
  { value: 'index_overrides', label: 'Index Override File' },
  { value: 'index_cell', label: 'Index Cell' },
  { value: 'index_bulk', label: 'Index Bulk' },
  { value: 'team_member', label: 'Team Member' },
  { value: 'team_index_source', label: 'Index Source' },
  { value: 'scenario', label: 'Scenario' },
];

// ─── Activity Tab ─────────────────────────────────────────────────────────────

function ActivityTab() {
  const { activeTeamId } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [entityType, setEntityType] = useState('');
  const [eventType, setEventType] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [membersMap, setMembersMap] = useState({});
  const PAGE_SIZE = 50;

  useEffect(() => {
    if (!activeTeamId) return;
    api.get(`/api/teams/${activeTeamId}/members`)
      .then(r => setMembersMap(Object.fromEntries(r.data.map(m => [m.user_id, m]))))
      .catch(() => {});
  }, [activeTeamId]);

  const fetchLogs = (reset = false) => {
    if (!activeTeamId) return;
    const p = reset ? 0 : page;
    if (reset) setPage(0);
    setLoading(true);
    const params = { team_id: activeTeamId, skip: p * PAGE_SIZE, limit: PAGE_SIZE };
    if (entityType) params.entity_type = entityType;
    if (eventType) params.event_type = eventType;
    if (search) params.search = search;
    api.get('/api/audit', { params })
      .then(res => {
        const rows = res.data;
        if (reset) setLogs(rows);
        else setLogs(prev => [...prev, ...rows]);
        setHasMore(rows.length === PAGE_SIZE);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLogs(true); }, [activeTeamId, entityType, eventType, search]);

  const loadMore = () => setPage(p => p + 1);
  useEffect(() => { if (page > 0) fetchLogs(); }, [page]);

  const commitSearch = () => setSearch(searchInput.trim());
  const formatDate = (iso) => iso ? new Date(iso).toLocaleString() : '—';

  const EVENT_BADGE_STYLE = {
    create:      { bg: 'var(--success-bg)',  color: 'var(--accent)' },
    delete:      { bg: 'var(--danger-bg)',   color: 'var(--accent2)' },
    update:      { bg: 'var(--info-bg)',     color: 'var(--accent3)' },
    clone:       { bg: 'var(--info-bg)',     color: 'var(--accent3)' },
    invite:      { bg: 'var(--success-bg)',  color: 'var(--accent)' },
    update_role: { bg: 'var(--neutral-bg)',  color: 'var(--muted)' },
    remove:      { bg: 'var(--danger-bg)',   color: 'var(--accent2)' },
    upload:      { bg: 'var(--info-bg)',     color: 'var(--accent3)' },
    override:    { bg: 'var(--neutral-bg)',  color: 'var(--muted)' },
    scrape:      { bg: 'var(--neutral-bg)',  color: 'var(--muted)' },
  };

  return (
    <>
      <div className="ca-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label className="ca-label">Search</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="ca-input"
                placeholder="User, event type, entity…"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && commitSearch()}
                style={{ flex: 1 }}
              />
              <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={commitSearch}>Search</button>
              {search && <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => { setSearch(''); setSearchInput(''); }}>✕</button>}
            </div>
          </div>
          <div>
            <label className="ca-label">Event</label>
            <select className="ca-select" value={eventType} onChange={e => setEventType(e.target.value)}>
              {EVENT_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="ca-label">Entity</label>
            <select className="ca-select" value={entityType} onChange={e => setEntityType(e.target.value)}>
              {ENTITY_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {(search || eventType || entityType) && (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => {
                setSearch(''); setSearchInput(''); setEventType(''); setEntityType('');
              }}>Clear All</button>
            </div>
          )}
        </div>
      </div>

      {loading && logs.length === 0 ? (
        <div style={{ padding: 20, color: 'var(--muted)' }}>Loading…</div>
      ) : logs.length === 0 ? (
        <div className="ca-card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>
          No activity found.
        </div>
      ) : (
        <div className="ca-card">
          <div className="ca-scroll-x">
            <table className="ca-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Event</th>
                  <th>Entity</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const bs = EVENT_BADGE_STYLE[log.event_type] || { bg: 'var(--neutral-bg)', color: 'var(--muted)' };
                  return (
                    <tr key={log.id}>
                      <td style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(log.timestamp)}
                      </td>
                      <td style={{ fontSize: 11 }}>{userLabel(log, membersMap)}</td>
                      <td>
                        <span style={{
                          display: 'inline-block', padding: '1px 8px', borderRadius: 4,
                          fontSize: 10, fontWeight: 600, background: bs.bg, color: bs.color,
                        }}>
                          {EVENT_TYPES.find(e => e.value === log.event_type)?.label || log.event_type}
                        </span>
                      </td>
                      <td style={{ fontSize: 11 }}>
                        <span style={{ color: 'var(--text)' }}>
                          {ENTITY_TYPES.find(e => e.value === log.entity_type)?.label || log.entity_type}
                        </span>
                        <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 9 }}>{log.entity_id?.slice(0, 8)}</span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {formatActivityDetail(log)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button className="ca-btn ca-btn-ghost" onClick={loadMore} disabled={loading}>
                {loading ? 'Loading…' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const { user } = useAuth();
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const fetchRates = () => {
    setLoading(true);
    const params = {};
    if (filterFrom) params.from_currency = filterFrom;
    if (filterTo) params.to_currency = filterTo;
    api.get('/api/fx-rates', { params })
      .then(({ data }) => setRates(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(fetchRates, [filterFrom, filterTo]);

  const currencies = [...new Set(rates.flatMap(r => [r.from_currency, r.to_currency]))].sort();

  const pairs = {};
  for (const r of rates) {
    const key = `${r.from_currency}/${r.to_currency}`;
    if (!pairs[key]) pairs[key] = [];
    pairs[key].push(r);
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => rates.length > 0 && exportCsv(
          'fx_rates.csv',
          ['From', 'To', 'Year', 'Quarter', 'Rate'],
          rates.map(r => [r.from_currency, r.to_currency, r.year, r.quarter, r.rate])
        )}>Export CSV</button>
      </div>

      <div className="ca-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div>
            <label className="ca-label">From Currency</label>
            <select className="ca-select" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}>
              <option value="">All</option>
              {currencies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="ca-label">To Currency</label>
            <select className="ca-select" value={filterTo} onChange={e => setFilterTo(e.target.value)}>
              <option value="">All</option>
              {currencies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="ca-btn ca-btn-ghost" onClick={() => { setFilterFrom(''); setFilterTo(''); }}>Clear</button>
          </div>
        </div>
      </div>

      {user?.is_super_admin && (
        <div style={{ marginBottom: 16 }}>
          <FileUpload endpoint="/api/fx-rates/upload" onSuccess={fetchRates} />
        </div>
      )}

      {loading ? (
        <div style={{ padding: 20, color: 'var(--muted)' }}>Loading...</div>
      ) : rates.length === 0 ? (
        <div className="ca-card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>
          No FX rates found. {user?.is_super_admin ? 'Upload a CSV to get started.' : 'Ask a super admin to upload rates.'}
        </div>
      ) : (
        Object.entries(pairs).map(([pair, pairRates]) => (
          <div key={pair} className="ca-card" style={{ marginBottom: 12 }}>
            <div className="ca-card-title">{pair}</div>
            <div className="ca-scroll-x">
              <table className="ca-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th className="center">Q1</th>
                    <th className="center">Q2</th>
                    <th className="center">Q3</th>
                    <th className="center">Q4</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const years = [...new Set(pairRates.map(r => r.year))].sort();
                    return years.map(y => (
                      <tr key={y}>
                        <td style={{ fontWeight: 600 }}>{y}</td>
                        {[1, 2, 3, 4].map(q => {
                          const val = pairRates.find(r => r.year === y && r.quarter === q);
                          return (
                            <td key={q} className="center" style={{ fontFamily: "'JetBrains Mono', monospace", color: val ? 'var(--text)' : 'var(--muted)' }}>
                              {val ? val.rate.toFixed(4) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </>
  );
}
