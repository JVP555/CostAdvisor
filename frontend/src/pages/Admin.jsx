import { useState, useEffect, useRef } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';

export default function Admin() {
  const { user, refreshUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('users');
  const [impersonating, setImpersonating] = useState(false);
  const [search, setSearch] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [auditEventType, setAuditEventType] = useState('');

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      api.get('/api/admin/users', { params: { include_deleted: showDeleted } }),
      api.get('/api/admin/teams'),
    ])
      .then(([uRes, tRes]) => {
        setUsers(uRes.data);
        setTeams(tRes.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const fetchAuditLogs = () => {
    setLoading(true);
    api.get('/api/admin/audit-logs', {
      params: { limit: 200, event_type: auditEventType || undefined },
    })
      .then(r => setAuditLogs(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (tab === 'audit') fetchAuditLogs();
    else fetchData();
  }, [tab, showDeleted]);

  useEffect(() => {
    setImpersonating(document.cookie.split(';').some(c => c.trim().startsWith('ca_impersonating=')));
  }, []);

  const toggleSuperAdmin = async (userId, current) => {
    await api.put(`/api/admin/users/${userId}`, { is_super_admin: !current });
    fetchData();
  };

  const deleteUser = async (u) => {
    if (!window.confirm(`Delete ${u.email}? They will be soft-deleted and can be restored.`)) return;
    await api.delete(`/api/admin/users/${u.id}`);
    fetchData();
  };

  const restoreUser = async (u) => {
    await api.post(`/api/admin/users/${u.id}/restore`);
    fetchData();
  };

  const impersonate = async (userId) => {
    try {
      await api.post(`/api/admin/impersonate/${userId}`);
      setImpersonating(true);
      await refreshUser();
      window.location.href = '/';
    } catch (err) {
      alert('Failed to impersonate: ' + (err.response?.data?.detail || err.message));
    }
  };

  const filtered = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.email?.toLowerCase().includes(q) ||
      u.display_name?.toLowerCase().includes(q)
    );
  });

  if (!user?.is_super_admin && !impersonating) {
    return (
      <div className="ca-page ca-fade-in">
        <div className="ca-h1">Access Denied</div>
        <p className="ca-subtitle">You need super admin privileges to view this page.</p>
      </div>
    );
  }

  return (
    <div className="ca-page ca-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div className="ca-h1">Admin Console</div>
      </div>
      <p className="ca-subtitle">Manage users, teams, and platform activity.</p>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {[
          { key: 'users', label: `Users (${users.length})` },
          { key: 'teams', label: `Teams (${teams.length})` },
          { key: 'audit', label: 'Audit Log' },
        ].map(t => (
          <button
            key={t.key}
            className={`ca-btn ${tab === t.key ? 'ca-btn-primary' : 'ca-btn-ghost'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 20, color: 'var(--muted)' }}>Loading…</div>
      ) : tab === 'users' ? (
        <UsersTab
          users={filtered}
          allTeams={teams}
          search={search}
          setSearch={setSearch}
          showDeleted={showDeleted}
          setShowDeleted={setShowDeleted}
          currentUser={user}
          onToggleSuperAdmin={toggleSuperAdmin}
          onImpersonate={impersonate}
          onDelete={deleteUser}
          onRestore={restoreUser}
          onChanged={fetchData}
        />
      ) : tab === 'teams' ? (
        <TeamsTab teams={teams} allUsers={users} onRefresh={fetchData} />
      ) : (
        <AuditTab
          logs={auditLogs}
          eventType={auditEventType}
          setEventType={setAuditEventType}
          onRefresh={fetchAuditLogs}
        />
      )}
    </div>
  );
}


function UsersTab({ users, allTeams, search, setSearch, showDeleted, setShowDeleted,
  currentUser, onToggleSuperAdmin, onImpersonate, onDelete, onRestore, onChanged }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input
          className="ca-input"
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={e => setShowDeleted(e.target.checked)}
          />
          Show deleted
        </label>
      </div>

      <div className="ca-card">
        <div className="ca-scroll-x">
          <table className="ca-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th className="center">Role</th>
                <th>Teams</th>
                <th className="center">Last Login</th>
                <th className="center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>No users found.</td></tr>
              )}
              {users.map(u => (
                <tr key={u.id} style={{ opacity: u.deleted_at ? 0.5 : 1 }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {u.avatar_url && <img src={u.avatar_url} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />}
                      <span style={{ fontWeight: 600 }}>{u.display_name || 'No name'}</span>
                      {u.deleted_at && <span style={{ fontSize: 9, color: 'var(--accent2)', fontWeight: 700 }}>DELETED</span>}
                    </div>
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{u.email}</td>
                  <td className="center">
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                      fontSize: 10, fontWeight: 600,
                      background: u.is_super_admin ? 'var(--success-bg)' : 'var(--neutral-bg)',
                      color: u.is_super_admin ? 'var(--accent)' : 'var(--muted)',
                    }}>
                      {u.is_super_admin ? 'SUPER ADMIN' : 'USER'}
                    </span>
                  </td>
                  <td>
                    <TeamCell userId={u.id} userTeams={u.teams} allTeams={allTeams} onChanged={onChanged} />
                  </td>
                  <td className="center" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="center">
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      {!u.deleted_at && u.id !== currentUser?.id && (
                        <>
                          <button className="ca-btn ca-btn-ghost ca-btn-sm"
                            onClick={() => onToggleSuperAdmin(u.id, u.is_super_admin)}>
                            {u.is_super_admin ? 'Revoke Admin' : 'Make Admin'}
                          </button>
                          <button className="ca-btn ca-btn-ghost ca-btn-sm"
                            style={{ color: 'var(--accent3)', borderColor: 'var(--accent3)' }}
                            onClick={() => onImpersonate(u.id)}>
                            Impersonate
                          </button>
                          <button className="ca-btn ca-btn-ghost ca-btn-sm"
                            style={{ color: 'var(--accent2)', borderColor: 'var(--accent2)' }}
                            onClick={() => onDelete(u)}>
                            Delete
                          </button>
                        </>
                      )}
                      {u.deleted_at && (
                        <button className="ca-btn ca-btn-ghost ca-btn-sm"
                          style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
                          onClick={() => onRestore(u)}>
                          Restore
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}


function TeamsTab({ teams, allUsers, onRefresh }) {
  const [expanded, setExpanded] = useState(null);
  const [error, setError] = useState(null);

  const err = (e) => setError(e.response?.data?.detail || e.message || 'Error');

  const deleteTeam = async (t) => {
    if (!confirm(`Delete team "${t.name}"? All data will be lost.`)) return;
    try { await api.delete(`/api/admin/teams/${t.id}`); onRefresh(); }
    catch (e) { err(e); }
  };

  const updateRole = async (teamId, userId, role) => {
    try { await api.patch(`/api/admin/teams/${teamId}/members/${userId}`, { role }); onRefresh(); }
    catch (e) { err(e); }
  };

  const removeMember = async (teamId, userId, role) => {
    if (role === 'owner') { setError('Transfer ownership before removing the owner.'); return; }
    if (!confirm('Remove this member?')) return;
    try { await api.delete(`/api/admin/teams/${teamId}/members/${userId}`); onRefresh(); }
    catch (e) { err(e); }
  };

  const addMember = async (teamId, userId) => {
    try { await api.post(`/api/admin/users/${userId}/add-team`, { team_id: teamId, role: 'member' }); onRefresh(); }
    catch (e) { err(e); }
  };

  return (
    <>
      {error && (
        <div style={{
          padding: '10px 16px', marginBottom: 12, borderRadius: 8, fontSize: 12,
          background: 'var(--accent2-dim)', color: 'var(--accent2)',
          border: '1px solid var(--danger-bg-strong)', display: 'flex', justifyContent: 'space-between',
        }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent2)', fontWeight: 700 }}>×</button>
        </div>
      )}

      {teams.length === 0 && (
        <div className="ca-card" style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>No teams yet.</div>
      )}

      {teams.map(t => {
        const isOpen = expanded === t.id;
        const memberIds = new Set(t.members.map(m => m.user_id));
        const addable = allUsers.filter(u => !memberIds.has(u.id) && !u.deleted_at);

        return (
          <div key={t.id} className="ca-card" style={{ marginBottom: 10 }}>
            {/* ── Header row ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</span>
                <span style={{ marginLeft: 10, fontSize: 11, color: 'var(--muted)' }}>
                  {t.member_count} member{t.member_count !== 1 ? 's' : ''} · created {t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}
                </span>
              </div>
              <button className="ca-btn ca-btn-ghost ca-btn-sm"
                onClick={() => setExpanded(isOpen ? null : t.id)}>
                {isOpen ? 'Close' : 'Manage'}
              </button>
              <button className="ca-btn ca-btn-ghost ca-btn-sm"
                style={{ color: 'var(--accent2)', borderColor: 'var(--accent2)' }}
                onClick={() => deleteTeam(t)}>
                Delete Team
              </button>
            </div>

            {/* ── Expanded member management ── */}
            {isOpen && (
              <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <table className="ca-table" style={{ marginBottom: 14 }}>
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th className="center">Role</th>
                      <th className="center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.members.map(m => (
                      <tr key={m.user_id}>
                        <td style={{ fontSize: 12 }}>{m.email || m.user_id.slice(0, 8)}</td>
                        <td className="center">
                          <select
                            value={m.role}
                            className="ca-input"
                            style={{ fontSize: 11, padding: '3px 6px', width: 'auto' }}
                            onChange={e => updateRole(t.id, m.user_id, e.target.value)}
                          >
                            <option value="owner">owner</option>
                            <option value="admin">admin</option>
                            <option value="member">member</option>
                          </select>
                        </td>
                        <td className="center">
                          {m.role !== 'owner' ? (
                            <button className="ca-btn ca-btn-ghost ca-btn-sm"
                              style={{ color: 'var(--accent2)', borderColor: 'var(--accent2)' }}
                              onClick={() => removeMember(t.id, m.user_id, m.role)}>
                              Remove
                            </button>
                          ) : (
                            <span style={{ fontSize: 10, color: 'var(--muted)' }}>transfer to remove</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* ── Add member ── */}
                {addable.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>Add:</span>
                    <select
                      className="ca-input"
                      style={{ fontSize: 11, padding: '4px 8px' }}
                      defaultValue=""
                      onChange={e => { if (e.target.value) { addMember(t.id, e.target.value); e.target.value = ''; } }}
                    >
                      <option value="" disabled>Select user…</option>
                      {addable.map(u => (
                        <option key={u.id} value={u.id}>{u.email} {u.display_name ? `(${u.display_name})` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}
                {addable.length === 0 && (
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>All platform users are already on this team.</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}


const AUDIT_EVENT_TYPES = [
  '', 'admin_impersonate_start', 'admin_impersonate_stop',
  'admin_update_user', 'admin_delete_user', 'admin_restore_user',
  'admin_set_team', 'admin_add_team', 'admin_remove_team',
  'create', 'update', 'delete',
];

function AuditTab({ logs, eventType, setEventType, onRefresh }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <select
          className="ca-input"
          value={eventType}
          onChange={e => setEventType(e.target.value)}
          style={{ maxWidth: 240 }}
        >
          {AUDIT_EVENT_TYPES.map(t => (
            <option key={t} value={t}>{t || 'All event types'}</option>
          ))}
        </select>
        <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={onRefresh}>Refresh</button>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{logs.length} entries</span>
      </div>

      <div className="ca-card">
        <div className="ca-scroll-x">
          <table className="ca-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Event</th>
                <th>Entity</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>No log entries.</td></tr>
              )}
              {logs.map(log => (
                <tr key={log.id}>
                  <td style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td style={{ fontSize: 11 }}>{log.user_email || log.user_id?.slice(0, 8)}</td>
                  <td>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                      fontSize: 10, fontWeight: 600,
                      background: log.event_type.startsWith('admin') ? 'var(--neutral-bg)' : 'var(--surface2)',
                      color: log.event_type.includes('delete') ? 'var(--accent2)'
                        : log.event_type.includes('impersonate') ? 'var(--accent3)'
                          : 'var(--muted)',
                    }}>
                      {log.event_type}
                    </span>
                  </td>
                  <td style={{ fontSize: 11 }}>
                    <span style={{ color: 'var(--muted)' }}>{log.entity_type}/</span>{log.entity_id?.slice(0, 12)}…
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 300 }}>
                    {log.new_value ? (
                      <span title={JSON.stringify(log.new_value, null, 2)}>
                        {Object.entries(log.new_value).map(([k, v]) =>
                          `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`
                        ).join(' · ')}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}


function TeamCell({ userId, userTeams, allTeams, onChanged }) {
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (picking && inputRef.current) inputRef.current.focus();
  }, [picking]);

  useEffect(() => {
    if (!picking) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setPicking(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [picking]);

  const filtered = allTeams.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const addToTeam = async (teamId) => {
    await api.post(`/api/admin/users/${userId}/add-team`, { team_id: teamId, role: 'member' });
    setPicking(false);
    setSearch('');
    onChanged();
  };

  const removeFromTeam = async (teamId) => {
    await api.delete(`/api/admin/users/${userId}/teams/${teamId}`);
    onChanged();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', position: 'relative' }} ref={wrapRef}>
      {userTeams.map((t, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 10, background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 4, padding: '2px 6px 2px 8px', color: 'var(--text)',
        }}>
          {t.team_name}
          <span style={{ color: 'var(--accent3)', fontSize: 9 }}>{t.role}</span>
          <button
            onClick={() => removeFromTeam(t.team_id)}
            style={{
              background: 'none', border: 'none', color: 'var(--accent2)', cursor: 'pointer',
              fontSize: 11, padding: '0 2px', lineHeight: 1, opacity: 0.6,
            }}
            title="Remove from team"
          >×</button>
        </span>
      ))}
      {!picking ? (
        <button
          onClick={() => setPicking(true)}
          style={{
            background: 'none', border: '1px dashed var(--border)', borderRadius: 4,
            color: 'var(--muted)', cursor: 'pointer', fontSize: 10, padding: '2px 8px',
            transition: 'border-color .15s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >+ team</button>
      ) : (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: 4,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: 6, minWidth: 220, boxShadow: 'var(--shadow-popover)',
        }}>
          <input
            ref={inputRef}
            className="ca-input"
            placeholder="Search teams…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ fontSize: 11, padding: '6px 8px', marginBottom: 4 }}
          />
          <div style={{ maxHeight: 150, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '6px 8px', fontSize: 11, color: 'var(--muted)' }}>No teams found</div>
            ) : (
              filtered.map(t => {
                const alreadyIn = userTeams.some(ut => ut.team_id === t.id);
                return (
                  <div
                    key={t.id}
                    onClick={() => !alreadyIn && addToTeam(t.id)}
                    style={{
                      padding: '5px 8px', fontSize: 11, borderRadius: 4,
                      cursor: alreadyIn ? 'default' : 'pointer',
                      color: alreadyIn ? 'var(--muted)' : 'var(--text)',
                    }}
                    onMouseEnter={e => { if (!alreadyIn) e.currentTarget.style.background = 'var(--surface2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {t.name}
                    {alreadyIn && <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--accent)' }}>joined</span>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
