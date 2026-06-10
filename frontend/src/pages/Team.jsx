import { useState, useEffect, Fragment } from 'react';
import FileUpload from '../components/FileUpload';
import api, { formatApiError } from '../api';
import { useAuth } from '../AuthContext';
import exportCsv from '../utils/exportCsv';
import { useConfirm } from '../components/ConfirmDialog';

export default function Team() {
  const [tab, setTab] = useState('teams');

  return (
    <div className="ca-page ca-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div className="ca-h1">Team</div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['teams', 'activity', 'settings'].map(t => (
          <button key={t} className={`ca-btn ${tab === t ? 'ca-btn-primary' : 'ca-btn-ghost'}`}
            onClick={() => setTab(t)}>
            {t === 'teams' ? 'Teams' : t === 'activity' ? 'Activity Log' : 'Settings'}
          </button>
        ))}
      </div>

      {tab === 'teams' && <TeamsTab />}
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

function TeamsTab() {
  const { teams, refreshUser, user } = useAuth();
  const [newTeamName, setNewTeamName] = useState('');
  const [expandedTeamId, setExpandedTeamId] = useState(null);
  const [message, setMessage] = useState(null);

  const handleCreateTeam = async () => {
    const name = newTeamName.trim();
    if (!name) return;
    try {
      await api.post('/api/teams', { name });
      setNewTeamName('');
      await refreshUser();
      setMessage({ type: 'success', text: `Team "${name}" created.` });
    } catch (err) {
      setMessage({ type: 'error', text: formatApiError(err) });
    }
  };

  const toggleExpand = (teamId) => setExpandedTeamId(prev => prev === teamId ? null : teamId);

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString();
  };

  return (
    <>
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
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
          <input
            className="ca-input"
            placeholder="New team name…"
            value={newTeamName}
            onChange={e => setNewTeamName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateTeam()}
            style={{ maxWidth: 280 }}
          />
          <button className="ca-btn ca-btn-primary ca-btn-sm" onClick={handleCreateTeam}>
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

function TeamManagePanel({ teamId, teamName, userRole, currentUserId, onRefresh, onClose }) {
  const { activeTeamId } = useAuth();
  const confirm = useConfirm();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [pendingRoles, setPendingRoles] = useState({});
  const [pendingRemovals, setPendingRemovals] = useState(new Set());
  const [pendingInvites, setPendingInvites] = useState([]);
  const [message, setMessage] = useState(null);

  const isOwner = userRole === 'owner';
  const isAdmin = userRole === 'admin';
  const canManage = isOwner || isAdmin;

  const fetchMembers = async () => {
    try {
      const { data } = await api.get(`/api/teams/${teamId}/members`);
      setMembers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMembers(); }, [teamId]);

  const hasPending = Object.keys(pendingRoles).length > 0 || pendingRemovals.size > 0 || pendingInvites.length > 0;
  const pendingCount = Object.keys(pendingRoles).length + pendingRemovals.size + pendingInvites.length;

  const stageRole = (userId, role) => {
    const committed = members.find(m => m.user_id === userId);
    if (committed?.role === role) {
      setPendingRoles(p => { const n = { ...p }; delete n[userId]; return n; });
    } else {
      setPendingRoles(p => ({ ...p, [userId]: role }));
    }
  };

  const stageRemove = (uid) => setPendingRemovals(p => new Set([...p, uid]));
  const unstageRemove = (uid) => setPendingRemovals(p => { const n = new Set(p); n.delete(uid); return n; });

  const stageInvite = () => {
    if (!inviteEmail.trim()) return;
    setPendingInvites(p => [...p, inviteEmail.trim()]);
    setInviteEmail('');
  };

  const handleSave = async () => {
    const lines = [];
    for (const [uid, role] of Object.entries(pendingRoles)) {
      const m = members.find(m => m.user_id === uid);
      lines.push(`· ${m?.display_name || m?.email}: ${m?.role} → ${role}`);
    }
    for (const uid of pendingRemovals) {
      const m = members.find(m => m.user_id === uid);
      lines.push(`· Remove ${m?.display_name || m?.email}`);
    }
    for (const email of pendingInvites) {
      lines.push(`· Invite ${email}`);
    }

    const ok = await confirm({
      title: 'Save changes?',
      message: lines.join('\n'),
      confirmLabel: 'Save changes',
    });
    if (!ok) return;

    const errors = [];
    for (const [uid, role] of Object.entries(pendingRoles)) {
      try { await api.patch(`/api/teams/${teamId}/members/${uid}`, { role }); }
      catch (e) { errors.push(e.response?.data?.detail || 'Role update failed'); }
    }
    for (const uid of pendingRemovals) {
      try { await api.delete(`/api/teams/${teamId}/members/${uid}`); }
      catch (e) { errors.push(e.response?.data?.detail || 'Remove failed'); }
    }
    for (const email of pendingInvites) {
      try { await api.post(`/api/teams/${teamId}/invite`, { email }); }
      catch (e) { errors.push(e.response?.data?.detail || `Invite ${email} failed`); }
    }

    setPendingRoles({});
    setPendingRemovals(new Set());
    setPendingInvites([]);
    await fetchMembers();
    await onRefresh();

    setMessage(errors.length
      ? { type: 'error', text: errors.join('; ') }
      : { type: 'success', text: 'Changes saved.' }
    );
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

  const effectiveRole = (m) => pendingRoles[m.user_id] ?? m.role;

  if (loading) {
    return <div style={{ padding: '16px 24px', color: 'var(--muted)', fontSize: 12 }}>Loading members…</div>;
  }

  return (
    <div style={{ padding: '16px 24px' }}>
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

      <table className="ca-table" style={{ marginBottom: 12 }}>
        <thead>
          <tr>
            <th>Member</th>
            <th>Role</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {members.map(m => {
            const pendingRemoval = pendingRemovals.has(m.user_id);
            const pendingChange = m.user_id in pendingRoles;
            const effRole = effectiveRole(m);
            const isOwnerRow = m.role === 'owner';
            const isSelf = m.user_id === currentUserId;
            const canEditRow = canManage && !isSelf && !(isOwnerRow && !isOwner);
            const canRemoveRow = canManage && !isSelf && !isOwnerRow;

            return (
              <tr key={m.user_id} style={{
                opacity: pendingRemoval ? 0.4 : 1,
                borderLeft: pendingChange ? '2px solid var(--accent3)' : pendingRemoval ? '2px solid var(--accent2)' : '2px solid transparent',
              }}>
                <td style={{ fontSize: 12 }}>
                  {m.display_name ? `${m.display_name} (${m.email})` : m.email}
                  {isSelf && <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--muted)' }}>you</span>}
                </td>
                <td>
                  {canEditRow && !pendingRemoval ? (
                    <select
                      value={effRole}
                      className="ca-input"
                      style={{
                        fontSize: 11, padding: '3px 6px', width: 'auto',
                        borderColor: pendingChange ? 'var(--accent3)' : undefined,
                      }}
                      onChange={e => stageRole(m.user_id, e.target.value)}
                    >
                      {isOwner && <option value="owner">owner</option>}
                      <option value="admin">admin</option>
                      <option value="member">member</option>
                    </select>
                  ) : (
                    <RoleBadge role={effRole} />
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {canRemoveRow && !pendingRemoval && (
                    <button
                      className="ca-btn ca-btn-ghost ca-btn-sm"
                      style={{ color: 'var(--accent2)', borderColor: 'var(--accent2)', fontSize: 11 }}
                      onClick={() => stageRemove(m.user_id)}
                    >
                      Remove
                    </button>
                  )}
                  {pendingRemoval && (
                    <button className="ca-btn ca-btn-ghost ca-btn-sm" style={{ fontSize: 11 }} onClick={() => unstageRemove(m.user_id)}>
                      Undo
                    </button>
                  )}
                </td>
              </tr>
            );
          })}

          {pendingInvites.map((email, i) => (
            <tr key={`invite-${i}`} style={{ borderLeft: '2px solid var(--accent)', opacity: 0.7 }}>
              <td style={{ fontSize: 12 }}>
                {email}
                <span style={{ marginLeft: 8, fontSize: 9, color: 'var(--accent)' }}>pending invite</span>
              </td>
              <td />
              <td style={{ textAlign: 'right' }}>
                <button
                  className="ca-btn ca-btn-ghost ca-btn-sm"
                  style={{ fontSize: 11 }}
                  onClick={() => setPendingInvites(p => p.filter((_, j) => j !== i))}
                >
                  Undo
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {canManage && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            className="ca-input"
            placeholder="Add member by email…"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && stageInvite()}
            style={{ maxWidth: 280 }}
          />
          <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={stageInvite}>+ Add</button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {/* Leave only available if not owner and not the active team (avoids breaking the session) */}
          {!isOwner && teamId !== activeTeamId && (
            <button
              className="ca-btn ca-btn-ghost ca-btn-sm"
              style={{ color: 'var(--accent2)', borderColor: 'var(--accent2)', fontSize: 11 }}
              onClick={handleLeave}
            >
              Leave Team
            </button>
          )}
        </div>
        {hasPending && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="ca-btn ca-btn-ghost ca-btn-sm"
              onClick={() => { setPendingRoles({}); setPendingRemovals(new Set()); setPendingInvites([]); }}
            >
              Discard
            </button>
            <button className="ca-btn ca-btn-primary ca-btn-sm" onClick={handleSave}>
              Save {pendingCount} change{pendingCount !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityTab() {
  const { activeTeamId } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [entityType, setEntityType] = useState('');
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

  useEffect(() => { fetchLogs(true); }, [activeTeamId, entityType]);

  const loadMore = () => {
    setPage(p => p + 1);
  };

  useEffect(() => {
    if (page > 0) fetchLogs();
  }, [page]);

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  };

  return (
    <>
      <div className="ca-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <label className="ca-label">Entity Type</label>
            <select className="ca-select" value={entityType} onChange={e => setEntityType(e.target.value)}>
              <option value="">All</option>
              <option value="cost_model">Cost Model</option>
              <option value="formula_version">Formula Version</option>
              <option value="price_data">Price Data</option>
              <option value="actual_volume">Volume</option>
              <option value="supplier">Supplier</option>
              <option value="product">Product</option>
              <option value="index_override">Index Override</option>
            </select>
          </div>
        </div>
      </div>

      {loading && logs.length === 0 ? (
        <div style={{ padding: 20, color: 'var(--muted)' }}>Loading...</div>
      ) : logs.length === 0 ? (
        <div className="ca-card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>
          No audit events found.
        </div>
      ) : (
        <div className="ca-card">
          <div className="ca-scroll-x">
            <table className="ca-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Event</th>
                  <th>Entity</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {formatDate(log.timestamp)}
                    </td>
                    <td style={{ fontSize: 11 }}>{(() => {
                      const m = membersMap[log.user_id];
                      return m?.display_name ? `${m.display_name} (${log.user_email})` : (log.user_email || '—');
                    })()}</td>
                    <td>
                      <span style={{
                        display: 'inline-block', padding: '1px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                        background: log.event_type === 'create' ? 'var(--success-bg)' : log.event_type === 'delete' ? 'var(--danger-bg)' : 'var(--info-bg)',
                        color: log.event_type === 'create' ? 'var(--accent)' : log.event_type === 'delete' ? 'var(--accent2)' : 'var(--accent3)',
                      }}>
                        {log.event_type}
                      </span>
                    </td>
                    <td style={{ fontSize: 11 }}>
                      <span style={{ color: 'var(--text)' }}>{log.entity_type}</span>
                      <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 9 }}>{log.entity_id?.slice(0, 8)}</span>
                    </td>
                    <td style={{ maxWidth: 300 }}>
                      {log.new_value ? (
                        <details style={{ fontSize: 10 }}>
                          <summary style={{ cursor: 'pointer', color: 'var(--accent3)' }}>View changes</summary>
                          <pre style={{ marginTop: 4, padding: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'auto', maxHeight: 150, fontSize: 9 }}>
                            {JSON.stringify(log.new_value, null, 2)}
                          </pre>
                        </details>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button className="ca-btn ca-btn-ghost" onClick={loadMore} disabled={loading}>
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

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
