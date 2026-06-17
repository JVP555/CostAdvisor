import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { useToast } from '../components/Toast';
import FileUpload from '../components/FileUpload';
import api from '../api';
import exportCsv from '../utils/exportCsv';

// ── Default tab — read-only platform rates ────────────────────────────────────

function DefaultTab({ user }) {
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p className="ca-subtitle" style={{ margin: 0 }}>Platform default exchange rates. Read-only — managed by super admins.</p>
        <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => rates.length > 0 && exportCsv(
          'fx_rates_default.csv',
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
          No FX rates found.{user?.is_super_admin ? ' Upload a CSV to get started.' : ' Ask a super admin to upload rates.'}
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

// ── Add Rate Modal ────────────────────────────────────────────────────────────

function AddRateModal({ teamId, onSaved, onClose }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({ from_currency: '', to_currency: '', year: new Date().getFullYear(), quarter: 1, rate: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.from_currency || !form.to_currency || !form.rate) return;
    setSaving(true);
    try {
      await api.put('/api/fx-rates/custom', { ...form, team_id: teamId, rate: parseFloat(form.rate) });
      addToast('Rate saved', 'success');
      onSaved();
      onClose();
    } catch {
      addToast('Failed to save rate', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ca-modal-overlay" onClick={onClose}>
      <div className="ca-modal" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
        <div className="ca-modal-header">
          <div className="ca-modal-title">Add Custom Rate</div>
          <button className="ca-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="ca-modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="ca-label">From Currency</label>
            <input className="ca-input" maxLength={3} placeholder="USD" value={form.from_currency}
              onChange={e => setForm(f => ({ ...f, from_currency: e.target.value.toUpperCase() }))} />
          </div>
          <div>
            <label className="ca-label">To Currency</label>
            <input className="ca-input" maxLength={3} placeholder="EUR" value={form.to_currency}
              onChange={e => setForm(f => ({ ...f, to_currency: e.target.value.toUpperCase() }))} />
          </div>
          <div>
            <label className="ca-label">Year</label>
            <input className="ca-input" type="number" value={form.year}
              onChange={e => setForm(f => ({ ...f, year: parseInt(e.target.value) }))} />
          </div>
          <div>
            <label className="ca-label">Quarter</label>
            <select className="ca-select" value={form.quarter}
              onChange={e => setForm(f => ({ ...f, quarter: parseInt(e.target.value) }))}>
              {[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="ca-label">Rate</label>
            <input className="ca-input" type="number" step="0.000001" placeholder="1.000000" value={form.rate}
              onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} />
          </div>
        </div>
        <div className="ca-modal-footer">
          <button className="ca-btn ca-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="ca-btn ca-btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save Rate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sync modal ────────────────────────────────────────────────────────────────

function SyncModal({ teamId, onSynced, onClose }) {
  const { addToast } = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(1);
  const [syncing, setSyncing] = useState(false);

  const sync = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post('/api/fx-rates/custom/copy-from-default', null, {
        params: { team_id: teamId, year, quarter },
      });
      addToast(`Synced ${data.copied} rates from defaults`, 'success');
      onSynced();
      onClose();
    } catch {
      addToast('Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="ca-modal-overlay" onClick={onClose}>
      <div className="ca-modal" style={{ width: 360 }} onClick={e => e.stopPropagation()}>
        <div className="ca-modal-header">
          <div className="ca-modal-title">Sync from Default</div>
          <button className="ca-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="ca-modal-body">
          <p style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
            Copy all platform default rates for a given period into your team overrides. Existing custom rates for that period will be overwritten.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="ca-label">Year</label>
              <input className="ca-input" type="number" value={year}
                onChange={e => setYear(parseInt(e.target.value))} />
            </div>
            <div>
              <label className="ca-label">Quarter</label>
              <select className="ca-select" value={quarter}
                onChange={e => setQuarter(parseInt(e.target.value))}>
                {[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="ca-modal-footer">
          <button className="ca-btn ca-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="ca-btn ca-btn-primary" disabled={syncing} onClick={sync}>
            {syncing ? 'Syncing…' : 'Sync Rates'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Custom tab — team overrides ───────────────────────────────────────────────

function CustomTab({ teamId, canEdit }) {
  const { addToast } = useToast();
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editVal, setEditVal] = useState('');
  const editRef = useRef(null);

  const fetchRates = () => {
    setLoading(true);
    api.get('/api/fx-rates/custom', { params: { team_id: teamId } })
      .then(({ data }) => setRates(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (teamId) fetchRates(); }, [teamId]);

  useEffect(() => {
    if (editingId && editRef.current) editRef.current.focus();
  }, [editingId]);

  const startEdit = (r) => {
    setEditingId(r.id);
    setEditVal(r.rate.toFixed(6));
  };

  const saveEdit = async (r) => {
    const rate = parseFloat(editVal);
    if (isNaN(rate) || rate <= 0) { setEditingId(null); return; }
    try {
      await api.put('/api/fx-rates/custom', {
        team_id: teamId,
        from_currency: r.from_currency,
        to_currency: r.to_currency,
        year: r.year,
        quarter: r.quarter,
        rate,
      });
      setRates(prev => prev.map(x => x.id === r.id ? { ...x, rate } : x));
    } catch {
      addToast('Failed to save rate', 'error');
    }
    setEditingId(null);
  };

  const deleteRate = async (r) => {
    try {
      await api.delete(`/api/fx-rates/custom/${r.id}`, { params: { team_id: teamId } });
      setRates(prev => prev.filter(x => x.id !== r.id));
      addToast('Rate deleted', 'success');
    } catch {
      addToast('Failed to delete rate', 'error');
    }
  };

  // Group by pair
  const pairs = {};
  for (const r of rates) {
    const key = `${r.from_currency}/${r.to_currency}`;
    if (!pairs[key]) pairs[key] = [];
    pairs[key].push(r);
  }

  return (
    <>
      {showAdd && <AddRateModal teamId={teamId} onSaved={fetchRates} onClose={() => setShowAdd(false)} />}
      {showSync && <SyncModal teamId={teamId} onSynced={fetchRates} onClose={() => setShowSync(false)} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p className="ca-subtitle" style={{ margin: 0 }}>
          Team overrides take priority over platform defaults in all costing calculations.
        </p>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => setShowSync(true)}>Sync from Default</button>
            <button className="ca-btn ca-btn-primary ca-btn-sm" onClick={() => setShowAdd(true)}>+ Add Rate</button>
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 20, color: 'var(--muted)' }}>Loading...</div>
      ) : rates.length === 0 ? (
        <div className="ca-card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>
          {canEdit
            ? <>No custom rates yet. Use <strong>Sync from Default</strong> to seed from platform rates, or <strong>+ Add Rate</strong> to add manually.</>
            : 'No custom rates for this team.'}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => exportCsv(
              'fx_rates_custom.csv',
              ['From', 'To', 'Year', 'Quarter', 'Rate'],
              rates.map(r => [r.from_currency, r.to_currency, r.year, r.quarter, r.rate])
            )}>Export CSV</button>
          </div>
          {Object.entries(pairs).map(([pair, pairRates]) => (
            <div key={pair} className="ca-card" style={{ marginBottom: 12 }}>
              <div className="ca-card-title">{pair}</div>
              <div className="ca-scroll-x">
                <table className="ca-table">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th className="center">Quarter</th>
                      <th className="center">Rate</th>
                      {canEdit && <th className="center">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pairRates.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{r.year}</td>
                        <td className="center">Q{r.quarter}</td>
                        <td className="center" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {editingId === r.id ? (
                            <input
                              ref={editRef}
                              style={{ width: 100, fontFamily: 'inherit', fontSize: 13, padding: '2px 6px' }}
                              className="ca-input"
                              type="number"
                              step="0.000001"
                              value={editVal}
                              onChange={e => setEditVal(e.target.value)}
                              onBlur={() => saveEdit(r)}
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(r); if (e.key === 'Escape') setEditingId(null); }}
                            />
                          ) : (
                            <span
                              onClick={() => canEdit && startEdit(r)}
                              title={canEdit ? 'Click to edit' : undefined}
                              style={{ cursor: canEdit ? 'pointer' : 'default', borderBottom: canEdit ? '1px dashed var(--muted)' : 'none' }}
                            >
                              {typeof r.rate === 'number' ? r.rate.toFixed(6) : parseFloat(r.rate).toFixed(6)}
                            </span>
                          )}
                        </td>
                        {canEdit && (
                          <td className="center">
                            <button className="ca-btn ca-btn-ghost ca-btn-sm" style={{ color: 'var(--danger)' }} onClick={() => deleteRate(r)}>Delete</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FxRates() {
  const { user, activeTeamId } = useAuth();
  const [tab, setTab] = useState('default');
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    if (!activeTeamId) return;
    api.get('/api/fx-rates/can-edit-custom', { params: { team_id: activeTeamId } })
      .then(({ data }) => setCanEdit(data.can_edit))
      .catch(() => setCanEdit(false));
  }, [activeTeamId]);

  if (!activeTeamId) {
    return (
      <div className="ca-page ca-fade-in">
        <div className="ca-h1">FX Rates</div>
        <div className="ca-card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>
          Select a team to view FX rates.
        </div>
      </div>
    );
  }

  return (
    <div className="ca-page ca-fade-in">
      <div style={{ marginBottom: 4 }}>
        <div className="ca-h1">FX Rates</div>
        <p className="ca-subtitle">Exchange rates used for currency conversion in costing calculations.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          className={`ca-btn ca-btn-sm ${tab === 'default' ? 'ca-btn-primary' : 'ca-btn-ghost'}`}
          onClick={() => setTab('default')}
        >Default</button>
        <button
          className={`ca-btn ca-btn-sm ${tab === 'custom' ? 'ca-btn-primary' : 'ca-btn-ghost'}`}
          onClick={() => setTab('custom')}
        >Custom Overrides</button>
      </div>

      {tab === 'default' && <DefaultTab user={user} />}
      {tab === 'custom' && <CustomTab teamId={activeTeamId} canEdit={canEdit} />}
    </div>
  );
}
