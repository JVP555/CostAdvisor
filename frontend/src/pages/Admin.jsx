import { useState, useEffect, useRef, Fragment, useMemo } from 'react';
import api, { formatApiError } from '../api';
import { useAuth } from '../AuthContext';
import { useConfirm, useAlert } from '../components/ConfirmDialog';
import Tooltip from '../components/Tooltip';

export default function Admin() {
  const { user, refreshUser } = useAuth();
  const confirm = useConfirm();
  const showAlert = useAlert();
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('users');
  const [impersonating, setImpersonating] = useState(false);
  const [search, setSearch] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [auditEventType, setAuditEventType] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [targetTeamId, setTargetTeamId] = useState(null);
  const [roleFilter, setRoleFilter] = useState('all');

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
    const targetUser = users.find(u => u.id === userId);
    const action = current ? 'Revoke Admin' : 'Make Admin';
    const ok = await confirm({
      title: `${action} — ${targetUser?.display_name || targetUser?.email}?`,
      message: current
        ? 'This user will lose super-admin privileges immediately.'
        : 'This user will gain full super-admin access to all platform data.',
      confirmLabel: action,
      danger: current,
    });
    if (!ok) return;
    await api.put(`/api/admin/users/${userId}`, { is_super_admin: !current });
    fetchData();
  };

  const deleteUser = async (u) => {
    const ok = await confirm({
      title: `Delete ${u.email}?`,
      message: 'They will be soft-deleted and can be restored.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await api.delete(`/api/admin/users/${u.id}`);
    fetchData();
  };

  const restoreUser = async (u) => {
    await api.post(`/api/admin/users/${u.id}/restore`);
    fetchData();
  };

  const impersonate = async (userId) => {
    const targetUser = users.find(u => u.id === userId);
    const ok = await confirm({
      title: `Impersonate ${targetUser?.display_name || targetUser?.email}?`,
      message: 'You will be logged in as this user. All actions will be performed on their behalf until you stop impersonation.',
      confirmLabel: 'Impersonate',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/api/admin/impersonate/${userId}`);
      setImpersonating(true);
      await refreshUser();
      window.location.href = '/';
    } catch (err) {
      showAlert({ title: 'Impersonation failed', message: formatApiError(err) });
    }
  };

  const filtered = users.filter(u => {
    if (roleFilter === 'super_admin' && !u.is_super_admin) return false;
    if (roleFilter === 'regular' && u.is_super_admin) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.email?.toLowerCase().includes(q) ||
      u.display_name?.toLowerCase().includes(q) ||
      u.teams?.some(t => t.team_name?.toLowerCase().includes(q))
    );
  });

  const handleNavigateToTeam = (teamId) => {
    setSelectedUser(null);
    setTab('teams');
    setTargetTeamId(teamId);
  };

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
          isImpersonating={impersonating}
          roleFilter={roleFilter}
          setRoleFilter={setRoleFilter}
          onSelectUser={setSelectedUser}
        />
      ) : tab === 'teams' ? (
        <TeamsTab
          teams={teams}
          allUsers={users}
          onRefresh={fetchData}
          targetTeamId={targetTeamId}
          onTeamExpanded={() => setTargetTeamId(null)}
        />
      ) : (
        <AuditTab
          logs={auditLogs}
          eventType={auditEventType}
          setEventType={setAuditEventType}
          onRefresh={fetchAuditLogs}
          users={users}
        />
      )}

      {selectedUser && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 140 }}
            onClick={() => setSelectedUser(null)}
          />
          <UserDetailPanel
            user={selectedUser}
            onClose={() => setSelectedUser(null)}
            onNavigateToTeam={handleNavigateToTeam}
            onToggleSuperAdmin={(id, cur) => { toggleSuperAdmin(id, cur); setSelectedUser(null); }}
            onImpersonate={(id) => { impersonate(id); setSelectedUser(null); }}
            onDelete={(u) => { deleteUser(u); setSelectedUser(null); }}
            onRestore={(u) => { restoreUser(u); setSelectedUser(null); }}
            currentUser={user}
            isImpersonating={impersonating}
          />
        </>
      )}
    </div>
  );
}


function UsersTab({ users, allTeams, search, setSearch, showDeleted, setShowDeleted,
  currentUser, onToggleSuperAdmin, onImpersonate, onDelete, onRestore, onChanged,
  isImpersonating, roleFilter, setRoleFilter, onSelectUser }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="ca-input"
          placeholder="Search by name, email or team…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 260 }}
        />
        <select
          className="ca-input"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          style={{ width: 'auto' }}
        >
          <option value="all">All users</option>
          <option value="super_admin">Super Admin</option>
          <option value="regular">Regular User</option>
        </select>
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
        <div className="ca-scroll-x" style={{ minHeight: 300 }}>
          <table className="ca-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th className="center">Role</th>
                <th className="center">Last Login</th>
                <th className="center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>No users found.</td></tr>
              )}
              {users.map(u => (
                <tr
                  key={u.id}
                  style={{ opacity: u.deleted_at ? 0.5 : 1, cursor: 'pointer' }}
                  onClick={() => onSelectUser(u)}
                >
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
                  <td className="center" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="center">
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                      {!u.deleted_at && u.id !== currentUser?.id && (
                        <>
                          <Tooltip text={u.is_super_admin ? 'Revoke Admin' : 'Make Admin'}>
                            <button
                              className="ca-btn ca-btn-ghost ca-btn-sm"
                              style={{ padding: '4px 8px', fontSize: 13, lineHeight: 1 }}
                              onClick={e => { e.stopPropagation(); onToggleSuperAdmin(u.id, u.is_super_admin); }}
                            >⚙</button>
                          </Tooltip>
                          <Tooltip text={u.is_super_admin ? 'Cannot impersonate a super admin' : isImpersonating ? 'Stop current impersonation first' : 'Impersonate'}>
                            <button
                              className="ca-btn ca-btn-ghost ca-btn-sm"
                              style={{ padding: '4px 8px', fontSize: 13, lineHeight: 1, color: 'var(--accent3)', borderColor: 'var(--accent3)', opacity: (isImpersonating || u.is_super_admin) ? 0.4 : 1 }}
                              onClick={e => { e.stopPropagation(); onImpersonate(u.id); }}
                              disabled={isImpersonating || u.is_super_admin}
                            >⇒</button>
                          </Tooltip>
                          <Tooltip text="Delete">
                            <button
                              className="ca-btn ca-btn-ghost ca-btn-sm"
                              style={{ padding: '4px 8px', fontSize: 13, lineHeight: 1, color: 'var(--accent2)', borderColor: 'var(--accent2)' }}
                              onClick={e => { e.stopPropagation(); onDelete(u); }}
                            >✕</button>
                          </Tooltip>
                        </>
                      )}
                      {u.deleted_at && (
                        <Tooltip text="Restore">
                          <button
                            className="ca-btn ca-btn-ghost ca-btn-sm"
                            style={{ padding: '4px 8px', fontSize: 13, lineHeight: 1, color: 'var(--accent)', borderColor: 'var(--accent)' }}
                            onClick={e => { e.stopPropagation(); onRestore(u); }}
                          >↺</button>
                        </Tooltip>
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


function TeamsTab({ teams, allUsers, onRefresh, targetTeamId, onTeamExpanded }) {
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState(null);
  const [error, setError] = useState(null);
  const [teamSearch, setTeamSearch] = useState('');

  useEffect(() => {
    if (targetTeamId) {
      setExpanded(targetTeamId);
      setError(null);
      onTeamExpanded?.();
    }
  }, [targetTeamId]);

  const [pendingRoles, setPendingRoles] = useState({});
  const [pendingRemovals, setPendingRemovals] = useState(new Set());
  const [pendingAdditions, setPendingAdditions] = useState([]);

  const hasPending = Object.keys(pendingRoles).length > 0 || pendingRemovals.size > 0 || pendingAdditions.length > 0;

  const clearPending = () => {
    setPendingRoles({});
    setPendingRemovals(new Set());
    setPendingAdditions([]);
  };

  const handleExpand = (teamId) => {
    if (expanded !== teamId) clearPending();
    setExpanded(prev => prev === teamId ? null : teamId);
    setError(null);
  };

  const stageRole = (userId, role, currentRole) => {
    if (role === currentRole) {
      setPendingRoles(p => { const n = { ...p }; delete n[userId]; return n; });
    } else {
      setPendingRoles(p => ({ ...p, [userId]: role }));
    }
  };

  const stageRemove = (userId) => setPendingRemovals(p => new Set([...p, userId]));
  const unstageRemove = (userId) => setPendingRemovals(p => { const n = new Set(p); n.delete(userId); return n; });

  const stageAdd = (user) => {
    if (!pendingAdditions.find(a => a.userId === user.id)) {
      setPendingAdditions(p => [...p, { userId: user.id, email: user.email, displayName: user.display_name }]);
    }
  };

  const memberLabel = (userId) => {
    const u = allUsers.find(u => u.id === userId);
    if (!u) return userId?.slice(0, 12) + '…';
    return u.display_name ? `${u.display_name} (${u.email})` : u.email;
  };

  const handleSave = async (team) => {
    const lines = [];
    for (const [uid, role] of Object.entries(pendingRoles)) {
      const m = team.members.find(m => m.user_id === uid);
      lines.push(`· ${memberLabel(uid)}: ${m?.role} → ${role}`);
    }
    for (const uid of pendingRemovals) {
      lines.push(`· Remove ${memberLabel(uid)}`);
    }
    for (const { userId, email, displayName } of pendingAdditions) {
      lines.push(`· Add ${displayName ? `${displayName} (${email})` : email}`);
    }

    const ok = await confirm({
      title: `Save changes to "${team.name}"?`,
      message: lines.join('\n'),
      confirmLabel: 'Save changes',
    });
    if (!ok) return;

    const errors = [];
    for (const [uid, role] of Object.entries(pendingRoles)) {
      try { await api.patch(`/api/admin/teams/${team.id}/members/${uid}`, { role }); }
      catch (e) { errors.push(e.response?.data?.detail || 'Role update failed'); }
    }
    for (const uid of pendingRemovals) {
      try { await api.delete(`/api/admin/teams/${team.id}/members/${uid}`); }
      catch (e) { errors.push(e.response?.data?.detail || 'Remove failed'); }
    }
    for (const { userId } of pendingAdditions) {
      try { await api.post(`/api/admin/users/${userId}/add-team`, { team_id: team.id, role: 'member' }); }
      catch (e) { errors.push(e.response?.data?.detail || 'Add failed'); }
    }

    clearPending();
    if (errors.length) setError(errors.join('; '));
    onRefresh();
  };

  const deleteTeam = async (t) => {
    const ok = await confirm({
      title: `Delete team "${t.name}"?`,
      message: 'All team data will be permanently lost. This cannot be undone.',
      confirmLabel: 'Delete team',
      danger: true,
    });
    if (!ok) return;
    try { await api.delete(`/api/admin/teams/${t.id}`); onRefresh(); }
    catch (e) { setError(e.response?.data?.detail || e.message || 'Error'); }
  };

  const filteredTeams = teamSearch
    ? teams.filter(t => {
        const q = teamSearch.toLowerCase();
        return t.name.toLowerCase().includes(q) ||
               t.members.some(m => m.email?.toLowerCase().includes(q));
      })
    : teams;

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

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          className="ca-input"
          placeholder="Search by team name or member email…"
          value={teamSearch}
          onChange={e => setTeamSearch(e.target.value)}
          style={{ maxWidth: 340 }}
        />
      </div>

      <div className="ca-card">
        <div className="ca-scroll-x" style={{ minHeight: 300 }}>
          <table className="ca-table">
            <thead>
              <tr>
                <th>Team</th>
                <th className="center">Members</th>
                <th className="center">Created</th>
                <th className="center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTeams.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>No teams found.</td></tr>
              )}
              {filteredTeams.map(t => {
                const isOpen = expanded === t.id;
                const memberIds = new Set(t.members.map(m => m.user_id));
                const addable = allUsers.filter(u => !memberIds.has(u.id) && !u.deleted_at && !pendingAdditions.find(a => a.userId === u.id));

                return (
                  <Fragment key={t.id}>
                    <tr>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</td>
                      <td className="center" style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {t.member_count} member{t.member_count !== 1 ? 's' : ''}
                      </td>
                      <td className="center" style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="center">
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => handleExpand(t.id)}>
                            {isOpen ? 'Close' : 'Manage'}
                          </button>
                          <button
                            className="ca-btn ca-btn-ghost ca-btn-sm"
                            style={{ color: 'var(--accent2)', borderColor: 'var(--accent2)' }}
                            onClick={() => deleteTeam(t)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr>
                        <td colSpan={4} style={{ padding: '16px 20px', background: 'var(--surface2)', borderLeft: '3px solid var(--accent)' }}>
                          <table className="ca-table" style={{ marginBottom: 14 }}>
                            <thead>
                              <tr>
                                <th>Member</th>
                                <th className="center">Role</th>
                                <th className="center">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {t.members.map(m => {
                                const pendingRole = pendingRoles[m.user_id];
                                const pendingRemoval = pendingRemovals.has(m.user_id);
                                const effRole = pendingRole ?? m.role;

                                return (
                                  <tr key={m.user_id} style={{
                                    opacity: pendingRemoval ? 0.4 : 1,
                                    borderLeft: pendingRole ? '2px solid var(--accent3)' : pendingRemoval ? '2px solid var(--accent2)' : undefined,
                                  }}>
                                    <td style={{ fontSize: 12 }}>{memberLabel(m.user_id)}</td>
                                    <td className="center">
                                      {!pendingRemoval ? (
                                        <select
                                          value={effRole}
                                          className="ca-input"
                                          style={{
                                            fontSize: 11, padding: '3px 6px', width: 'auto',
                                            borderColor: pendingRole ? 'var(--accent3)' : undefined,
                                          }}
                                          onChange={e => stageRole(m.user_id, e.target.value, m.role)}
                                        >
                                          <option value="owner">owner</option>
                                          <option value="admin">admin</option>
                                          <option value="member">member</option>
                                        </select>
                                      ) : (
                                        <span style={{ fontSize: 10, color: 'var(--accent2)' }}>removing</span>
                                      )}
                                    </td>
                                    <td className="center">
                                      {m.role !== 'owner' && !pendingRemoval && (
                                        <button
                                          className="ca-btn ca-btn-ghost ca-btn-sm"
                                          style={{ color: 'var(--accent2)', borderColor: 'var(--accent2)' }}
                                          onClick={() => stageRemove(m.user_id)}
                                        >
                                          Remove
                                        </button>
                                      )}
                                      {pendingRemoval && (
                                        <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => unstageRemove(m.user_id)}>
                                          Undo
                                        </button>
                                      )}
                                      {m.role === 'owner' && !pendingRemoval && (
                                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>transfer to remove</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}

                              {pendingAdditions.map(({ userId, email, displayName }) => (
                                <tr key={userId} style={{ borderLeft: '2px solid var(--accent)', opacity: 0.75 }}>
                                  <td style={{ fontSize: 12 }}>{displayName ? `${displayName} (${email})` : email}</td>
                                  <td className="center"><span style={{ fontSize: 10, color: 'var(--accent)' }}>member (pending)</span></td>
                                  <td className="center">
                                    <button
                                      className="ca-btn ca-btn-ghost ca-btn-sm"
                                      onClick={() => setPendingAdditions(p => p.filter(a => a.userId !== userId))}
                                    >
                                      Undo
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          {addable.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Add:</span>
                              <select
                                className="ca-input"
                                style={{ fontSize: 11, padding: '4px 8px' }}
                                value=""
                                onChange={e => {
                                  const u = allUsers.find(u => u.id === e.target.value);
                                  if (u) stageAdd(u);
                                }}
                              >
                                <option value="" disabled>Select user…</option>
                                {addable.map(u => (
                                  <option key={u.id} value={u.id}>{u.display_name ? `${u.display_name} (${u.email})` : u.email}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {hasPending && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                              <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={clearPending}>Discard</button>
                              <button className="ca-btn ca-btn-primary ca-btn-sm" onClick={() => handleSave(t)}>
                                Save {Object.keys(pendingRoles).length + pendingRemovals.size + pendingAdditions.length} change{Object.keys(pendingRoles).length + pendingRemovals.size + pendingAdditions.length !== 1 ? 's' : ''}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}


const AUDIT_EVENT_TYPES = [
  '', 'admin_impersonate_start', 'admin_impersonate_stop',
  'admin_update_user', 'admin_delete_user', 'admin_restore_user',
  'admin_set_team', 'admin_add_team', 'admin_remove_team',
  'admin_update_role', 'admin_remove_member',
  'create', 'update', 'delete',
];

function resolveUserName(entityId, usersMap) {
  const u = usersMap[entityId];
  return u ? (u.display_name || u.email) : (entityId?.slice(0, 12) + '…');
}

function formatAuditDetail(log, usersMap) {
  const nv = log.new_value || {};
  const pv = log.previous_value || {};
  const target = resolveUserName(log.entity_id, usersMap);
  switch (log.event_type) {
    case 'admin_add_team':
    case 'admin_set_team':
      return `${target} · role: ${nv.role} · team: ${nv.team}`;
    case 'admin_update_user': {
      const parts = Object.entries(nv.changes || {}).map(([k, v]) => `${k}: ${v.from}→${v.to}`);
      return `${target} · ${parts.join(', ')}`;
    }
    case 'admin_delete_user':  return `deleted: ${nv.email}`;
    case 'admin_restore_user': return `restored: ${nv.email}`;
    case 'admin_impersonate_start': return `target: ${nv.target_email}`;
    case 'admin_impersonate_stop':  return nv.target_email ? `stopped — was on ${nv.target_email}` : '(impersonation ended)';
    case 'admin_update_role':  return `${target} · role: ${pv.role}→${nv.role}`;
    case 'admin_remove_team':
    case 'admin_remove_member': return `${target} · removed`;
    default: {
      const parts = Object.entries(nv)
        .filter(([k]) => k !== 'by')
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
      return parts.join(' · ') || '—';
    }
  }
}

function AuditTab({ logs, eventType, setEventType, onRefresh, users }) {
  const [actorSearch, setActorSearch] = useState('');

  const usersMap = useMemo(
    () => Object.fromEntries((users || []).map(u => [u.id, u])),
    [users],
  );

  const filtered = actorSearch
    ? logs.filter(l => {
        const q = actorSearch.toLowerCase();
        const actor = usersMap[l.user_id];
        return l.user_email?.toLowerCase().includes(q) ||
               actor?.display_name?.toLowerCase().includes(q);
      })
    : logs;

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
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
        <input
          className="ca-input"
          placeholder="Search actor…"
          value={actorSearch}
          onChange={e => setActorSearch(e.target.value)}
          style={{ maxWidth: 200 }}
        />
        <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={onRefresh}>Refresh</button>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{filtered.length} entries</span>
      </div>

      <div className="ca-card">
        <div className="ca-scroll-x" style={{ minHeight: 300 }}>
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
              {filtered.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>No log entries.</td></tr>
              )}
              {filtered.map(log => {
                const actor = usersMap[log.user_id];
                const actorLabel = actor?.display_name
                  ? `${actor.display_name} (${log.user_email})`
                  : (log.user_email || log.user_id?.slice(0, 8));
                return (
                  <tr key={log.id}>
                    <td style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td style={{ fontSize: 11 }}>{actorLabel}</td>
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
                      {formatAuditDetail(log, usersMap)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}


function UserDetailPanel({ user, onClose, onNavigateToTeam, onToggleSuperAdmin,
  onImpersonate, onDelete, onRestore, currentUser, isImpersonating }) {
  if (!user) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0,
      width: 360, height: '100vh',
      background: 'var(--surface)',
      borderLeft: '1px solid var(--border)',
      zIndex: 150, overflowY: 'auto',
      padding: 24,
      boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>User Details</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        {user.avatar_url
          ? <img src={user.avatar_url} alt="" style={{ width: 48, height: 48, borderRadius: '50%' }} />
          : <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'var(--surface2)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 20, color: 'var(--muted)', fontWeight: 700,
            }}>
              {(user.display_name || user.email)?.[0]?.toUpperCase()}
            </div>
        }
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{user.display_name || 'No name'}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{user.email}</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Role</div>
        <span style={{
          display: 'inline-block', padding: '3px 10px', borderRadius: 4,
          fontSize: 10, fontWeight: 600,
          background: user.is_super_admin ? 'var(--success-bg)' : 'var(--neutral-bg)',
          color: user.is_super_admin ? 'var(--accent)' : 'var(--muted)',
        }}>
          {user.is_super_admin ? 'SUPER ADMIN' : 'USER'}
        </span>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Last Login</div>
        <div style={{ fontSize: 12 }}>
          {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : '—'}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Teams</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(!user.teams || user.teams.length === 0) && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>No teams</span>
          )}
          {user.teams?.map((t, i) => (
            <button
              key={i}
              onClick={() => onNavigateToTeam(t.team_id)}
              style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '7px 12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                color: 'var(--text)', fontSize: 12, textAlign: 'left',
                transition: 'border-color .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              <span>{t.team_name}</span>
              <span style={{ fontSize: 9, color: 'var(--accent3)', fontWeight: 600 }}>{t.role}</span>
            </button>
          ))}
        </div>
      </div>

      {!user.deleted_at && user.id !== currentUser?.id && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <button
            className="ca-btn ca-btn-ghost ca-btn-sm"
            onClick={() => onToggleSuperAdmin(user.id, user.is_super_admin)}
          >
            ⚙ {user.is_super_admin ? 'Revoke Admin' : 'Make Admin'}
          </button>
          <button
            className="ca-btn ca-btn-ghost ca-btn-sm"
            style={{ color: 'var(--accent3)', borderColor: 'var(--accent3)', opacity: (isImpersonating || user.is_super_admin) ? 0.4 : 1 }}
            onClick={() => onImpersonate(user.id)}
            disabled={isImpersonating || user.is_super_admin}
            title={user.is_super_admin ? 'Cannot impersonate a super admin' : undefined}
          >
            ⇒ {user.is_super_admin ? 'Cannot impersonate (super admin)' : 'Impersonate'}
          </button>
          <button
            className="ca-btn ca-btn-ghost ca-btn-sm"
            style={{ color: 'var(--accent2)', borderColor: 'var(--accent2)' }}
            onClick={() => onDelete(user)}
          >
            ✕ Delete
          </button>
        </div>
      )}
      {user.deleted_at && user.id !== currentUser?.id && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <button
            className="ca-btn ca-btn-ghost ca-btn-sm"
            style={{ color: 'var(--accent)', borderColor: 'var(--accent)', width: '100%' }}
            onClick={() => onRestore(user)}
          >
            ↺ Restore
          </button>
        </div>
      )}
    </div>
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
