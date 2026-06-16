import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { useToast } from '../components/Toast';
import api from '../api';

export default function Formulas() {
  const { activeTeamId, user } = useAuth();
  const { addToast } = useToast();

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [canEditPlatform, setCanEditPlatform] = useState(false);
  const [canEditTeam, setCanEditTeam] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [commodities, setCommodities] = useState([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const platformTemplates = templates.filter(t => !t.team_id);
  const teamTemplates = templates.filter(t => t.team_id);

  const fetchData = async () => {
    if (!activeTeamId) return;
    setLoading(true);
    try {
      const [tmplRes, permRes, cmRes] = await Promise.all([
        api.get('/api/formulas/', { params: { team_id: activeTeamId } }),
        api.get('/api/formulas/can-edit-platform'),
        api.get('/api/indexes', { params: { has_data: true } }),
      ]);
      setTemplates(tmplRes.data);
      setCanEditPlatform(permRes.data.can_edit);
      setCommodities(cmRes.data);

      // Team edit: any owner-level check via membership role
      const meRes = await api.get('/auth/me');
      const membership = meRes.data?.memberships?.find(m => m.team_id === activeTeamId);
      setCanEditTeam(membership?.role === 'owner' || membership?.role === 'admin');
    } catch {
      // silently fail — page shows empty state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [activeTeamId]);

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/formulas/${id}`);
      setTemplates(prev => prev.filter(t => t.id !== id));
      addToast('Formula deleted', 'success');
    } catch (e) {
      addToast(e?.response?.data?.detail || 'Delete failed', 'error');
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const openCreate = (isPlatform) => {
    setEditingTemplate({ _new: true, _platform: isPlatform });
    setShowModal(true);
  };

  const openEdit = (t) => {
    setEditingTemplate(t);
    setShowModal(true);
  };

  const handleSaved = (saved) => {
    setTemplates(prev => {
      const idx = prev.findIndex(t => t.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    setShowModal(false);
    setEditingTemplate(null);
  };

  if (!activeTeamId) {
    return (
      <div className="ca-page">
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          Select a team to view formulas.
        </div>
      </div>
    );
  }

  return (
    <div className="ca-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 className="ca-page-title" style={{ marginBottom: 4 }}>Formula Library</h1>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            Reusable advanced formula templates for cost models
          </p>
        </div>
        {(canEditTeam || canEditPlatform) && (
          <button className="ca-btn ca-btn-primary ca-btn-sm" onClick={() => openCreate(false)}>
            + Add Formula
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          <FormulaSection
            title="Default Formulas"
            subtitle="Managed by platform Chemists and Super Admins — visible to all teams"
            rows={platformTemplates}
            canEdit={canEditPlatform}
            onEdit={openEdit}
            onDelete={id => setConfirmDeleteId(id)}
          />

          <FormulaSection
            title="Team Formulas"
            subtitle="Managed by your team — visible only to your team"
            rows={teamTemplates}
            canEdit={canEditTeam}
            onEdit={openEdit}
            onDelete={id => setConfirmDeleteId(id)}
          />

          {platformTemplates.length === 0 && teamTemplates.length === 0 && (
            <div style={{
              marginTop: 40, padding: 40, textAlign: 'center',
              border: '1px dashed var(--border)', borderRadius: 12,
              color: 'var(--muted)', fontSize: 13,
            }}>
              No formulas yet.
              {(canEditPlatform || canEditTeam) && (
                <span> Use the buttons above to create your first template.</span>
              )}
            </div>
          )}
        </>
      )}

      {confirmDeleteId && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            background: 'var(--surface)', borderRadius: 12, padding: 28,
            minWidth: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Delete formula?</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
              This cannot be undone. Cost models using this expression will keep their saved values.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </button>
              <button
                className="ca-btn ca-btn-sm"
                style={{ background: 'var(--accent2)', color: '#fff', border: 'none' }}
                onClick={() => handleDelete(confirmDeleteId)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <FormulaModal
          template={editingTemplate}
          activeTeamId={activeTeamId}
          canEditPlatform={canEditPlatform}
          commodities={commodities}
          onSaved={handleSaved}
          onClose={() => { setShowModal(false); setEditingTemplate(null); }}
          addToast={addToast}
        />
      )}
    </div>
  );
}

function FormulaSection({ title, subtitle, rows, canEdit, onEdit, onDelete }) {
  if (rows.length === 0 && !canEdit) return null;

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{subtitle}</div>
      </div>
      {rows.length === 0 ? (
        <div style={{
          padding: '20px 16px', border: '1px dashed var(--border)',
          borderRadius: 8, fontSize: 12, color: 'var(--muted)', textAlign: 'center',
        }}>
          No formulas yet.
        </div>
      ) : (
        <div className="ca-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="ca-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th style={{ textAlign: 'center' }}>Variables</th>
                <th>Created by</th>
                {canEdit && <th style={{ textAlign: 'center' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{t.description || '—'}</td>
                  <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 11 }}>
                    {t.variables ? Object.keys(t.variables).length : 0}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--muted)' }}>{t.creator_email || '—'}</td>
                  {canEdit && (
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => onEdit(t)}>
                          Edit
                        </button>
                        <button
                          className="ca-btn ca-btn-ghost ca-btn-sm"
                          style={{ color: 'var(--accent2)', borderColor: 'var(--accent2)' }}
                          onClick={() => onDelete(t.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FormulaModal({ template, activeTeamId, canEditPlatform, commodities, onSaved, onClose, addToast }) {
  const isNew = !!template?._new;
  const [name, setName] = useState(isNew ? '' : (template?.name || ''));
  const [description, setDescription] = useState(isNew ? '' : (template?.description || ''));
  const [scope, setScope] = useState(
    isNew
      ? (template?._platform ? 'platform' : 'team')
      : (template?.team_id ? 'team' : 'platform')
  );
  const [expression, setExpression] = useState(isNew ? '' : (template?.expression || ''));
  const [vars, setVars] = useState(isNew ? {} : (template?.variables || {}));
  const [saving, setSaving] = useState(false);

  const detectVars = () => {
    const expr = expression.replace(/[[\]]/g, '').replace(/\s/g, '');
    const tokens = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
    const unique = [...new Set(tokens)];
    setVars(prev => {
      const next = { ...prev };
      unique.forEach(n => { if (!next[n]) next[n] = { type: 'fixed', value: 0 }; });
      return next;
    });
  };

  const updateVar = (varName, key, val) => {
    setVars(prev => ({ ...prev, [varName]: { ...prev[varName], [key]: val } }));
  };

  const removeVar = (varName) => {
    setVars(prev => { const n = { ...prev }; delete n[varName]; return n; });
  };

  const handleSave = async () => {
    if (!name.trim()) { addToast('Name is required', 'error'); return; }
    if (!expression.trim()) { addToast('Expression is required', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        team_id: scope === 'platform' ? null : activeTeamId,
        name: name.trim(),
        description: description.trim() || null,
        expression: expression.trim(),
        variables: Object.keys(vars).length > 0 ? vars : null,
      };
      let res;
      if (isNew) {
        res = await api.post('/api/formulas/', payload);
      } else {
        res = await api.put(`/api/formulas/${template.id}`, payload);
      }
      addToast(isNew ? 'Formula created' : 'Formula updated', 'success');
      onSaved(res.data);
    } catch (e) {
      addToast(e?.response?.data?.detail || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      zIndex: 100, paddingTop: 60, overflowY: 'auto',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 12, padding: 28,
        width: '100%', maxWidth: 560, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        margin: '0 16px 60px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {isNew ? 'New Formula' : 'Edit Formula'}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 16, color: 'var(--muted)',
          }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="ca-label">Name *</label>
            <input className="ca-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Resin cost model" />
          </div>

          <div>
            <label className="ca-label">Description</label>
            <input className="ca-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
          </div>

          {canEditPlatform && (
            <div>
              <label className="ca-label">Scope</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['team', 'platform'].map(s => (
                  <button
                    key={s}
                    onClick={() => setScope(s)}
                    style={{
                      padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                      border: `1px solid ${scope === s ? 'var(--accent)' : 'var(--border)'}`,
                      background: scope === s ? 'var(--accent)' : 'transparent',
                      color: scope === s ? '#fff' : 'var(--text)',
                      fontWeight: scope === s ? 600 : 400,
                    }}
                  >
                    {s === 'platform' ? 'Default (all teams)' : 'Team only'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label className="ca-label" style={{ marginBottom: 0 }}>Expression *</label>
              <button className="ca-btn ca-btn-ghost ca-btn-sm" style={{ fontSize: 10 }} onClick={detectVars}>
                Detect Variables
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
              The result is the should-cost directly — embed margin in the expression. Use square or round brackets.
            </div>
            <textarea
              className="ca-input"
              rows={3}
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, width: '100%', resize: 'vertical', boxSizing: 'border-box' }}
              placeholder="e.g. 0.92*[(0.75*ACN+1500)*(1-h)+h*AA/0.8]+FC"
              value={expression}
              onChange={e => setExpression(e.target.value)}
            />
          </div>

          {Object.keys(vars).length > 0 && (
            <div>
              <label className="ca-label">Variables</label>
              <div style={{ display: 'grid', gridTemplateColumns: '90px 80px 1fr 28px', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' }}>Variable</span>
                <span style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' }}>Type</span>
                <span style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' }}>Index / Value</span>
                <span></span>
              </div>
              {Object.entries(vars).map(([varName, def]) => (
                <div key={varName} style={{ display: 'grid', gridTemplateColumns: '90px 80px 1fr 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{varName}</span>
                  <select className="ca-select" style={{ fontSize: 11, padding: '6px 8px' }}
                    value={def.type} onChange={e => updateVar(varName, 'type', e.target.value)}>
                    <option value="fixed">Fixed</option>
                    <option value="index">Index</option>
                  </select>
                  {def.type === 'fixed' ? (
                    <input className="ca-input" type="number" style={{ padding: '6px 8px', fontSize: 11 }}
                      value={def.value ?? 0}
                      onChange={e => updateVar(varName, 'value', parseFloat(e.target.value) || 0)} />
                  ) : (
                    <select className="ca-select" style={{ fontSize: 11, padding: '6px 8px' }}
                      value={def.commodity_id ?? ''}
                      onChange={e => updateVar(varName, 'commodity_id', parseInt(e.target.value) || null)}>
                      <option value="">Select index…</option>
                      {commodities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                  <button onClick={() => removeVar(varName)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--accent2)', fontSize: 14, fontWeight: 700,
                  }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
          <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="ca-btn ca-btn-primary ca-btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : (isNew ? 'Create' : 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}
