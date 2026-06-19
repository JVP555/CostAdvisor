import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { useToast } from '../components/Toast';
import FileUpload from '../components/FileUpload';
import api from '../api';
import exportCsv from '../utils/exportCsv';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPeriods(startYear, startQ, endYear, endQ) {
  const out = [];
  for (let y = startYear; y <= endYear; y++) {
    for (let q = 1; q <= 4; q++) {
      if (y === startYear && q < startQ) continue;
      if (y === endYear && q > endQ) break;
      out.push({ year: y, quarter: q, label: `Q${q}-${String(y).slice(2)}` });
    }
  }
  return out;
}

function periodOptions() {
  const opts = [];
  for (let y = 2020; y <= 2028; y++)
    for (let q = 1; q <= 4; q++)
      opts.push({ value: `${y}-${q}`, label: `Q${q}-${String(y).slice(2)}` });
  return opts;
}

// ── Edit Rate Modal (mirrors EditCellModal pattern from Indexes) ──────────────

function EditRateModal({ pair, period, currentRate, defaultRate, periods, teamId, onSaved, onClose }) {
  const { addToast } = useToast();
  const [value, setValue] = useState(currentRate !== null ? String(currentRate) : (defaultRate !== null ? String(defaultRate) : ''));
  const [applyMode, setApplyMode] = useState('single');
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(periods.length - 1);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  const periodIdx = periods.findIndex(p => p.year === period.year && p.quarter === period.quarter);
  const periodLabel = period.label;

  const upsertPeriods = async (ps) => {
    await Promise.all(ps.map(p =>
      api.put('/api/fx-rates/custom', {
        team_id: teamId,
        from_currency: pair.from,
        to_currency: pair.to,
        year: p.year,
        quarter: p.quarter,
        rate: parseFloat(value),
      })
    ));
  };

  const handleSave = async () => {
    const v = parseFloat(value);
    if (isNaN(v) || v <= 0) { addToast('Enter a valid positive rate', 'error'); return; }
    setSaving(true);
    try {
      let targets;
      if (applyMode === 'single') targets = [period];
      else if (applyMode === 'all') targets = periods;
      else targets = periods.slice(rangeStart, rangeEnd + 1);
      await upsertPeriods(targets);
      addToast('Rate saved', 'success');
      onSaved();
      onClose();
    } catch {
      addToast('Failed to save rate', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (currentRate === null) return;
    setSaving(true);
    try {
      await api.delete('/api/fx-rates/custom-by-key', {
        params: { team_id: teamId, from_currency: pair.from, to_currency: pair.to, year: period.year, quarter: period.quarter },
      });
      addToast('Reset to default', 'success');
      onSaved();
      onClose();
    } catch {
      addToast('Failed to reset rate', 'error');
    } finally {
      setSaving(false);
    }
  };

  const opts = periodOptions();

  return (
    <div className="ca-modal-overlay" onClick={onClose}>
      <div className="ca-modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div className="ca-modal-header">
          <div className="ca-modal-title">{pair.from}/{pair.to} · {periodLabel}</div>
          <button className="ca-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="ca-modal-body">
          {/* Reference row — mirrors "Global value" in EditCellModal */}
          <div style={{ marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
            {defaultRate !== null
              ? <span>Platform default: <strong style={{ color: 'var(--text)' }}>{Number(defaultRate).toFixed(6)}</strong></span>
              : <span style={{ color: 'var(--muted)' }}>No platform default for this period</span>
            }
            {currentRate !== null && (
              <span className="ca-badge" style={{ marginLeft: 10, background: 'var(--accent4-dim)', color: 'var(--accent4)', fontSize: 9 }}>
                OVERRIDE
              </span>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="ca-label">Rate ({pair.from} → {pair.to})</label>
            <input
              ref={inputRef}
              className="ca-input"
              type="number"
              step="0.000001"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !saving) handleSave(); }}
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label className="ca-label">Apply to</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" checked={applyMode === 'single'} onChange={() => setApplyMode('single')} />
                This period only
              </label>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" checked={applyMode === 'all'} onChange={() => setApplyMode('all')} />
                All periods
              </label>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" checked={applyMode === 'range'} onChange={() => setApplyMode('range')} />
                Custom range
              </label>
            </div>
            {applyMode === 'range' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <label className="ca-label">From</label>
                  <select className="ca-select" value={rangeStart} onChange={e => setRangeStart(+e.target.value)}>
                    {periods.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label className="ca-label">To</label>
                  <select className="ca-select" value={rangeEnd} onChange={e => setRangeEnd(+e.target.value)}>
                    {periods.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="ca-modal-footer">
          <button
            className="ca-btn ca-btn-danger"
            onClick={handleReset}
            disabled={currentRate === null || saving}
            style={{ marginRight: 'auto', opacity: currentRate !== null ? 1 : 0.4 }}
          >
            Reset to Default
          </button>
          <button className="ca-btn ca-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="ca-btn ca-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Rate Grid (shared by both tabs) ─────────────────────────────────────────

function RateGrid({ periods, rows, onCellClick, canEdit, scrollRef }) {
  if (rows.length === 0) return null;
  return (
    <div className="ca-scroll-x" ref={scrollRef}>
      <table className="ca-table">
        <thead>
          <tr>
            <th style={{ whiteSpace: 'nowrap' }}>Pair</th>
            {periods.map(p => <th key={p.label} className="center">{p.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={`${row.from}/${row.to}`}>
              <td style={{ fontWeight: 600, whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                {row.from}/{row.to}
              </td>
              {periods.map((p, i) => {
                const cell = row.cells[i];
                const v = cell?.custom ?? cell?.default ?? null;
                const isOverride = cell?.custom !== null && cell?.custom !== undefined;
                const isEmpty = v === null;

                return (
                  <td
                    key={p.label}
                    className="center"
                    title={canEdit ? (isEmpty ? 'Click to set rate' : isOverride ? 'Team override — click to edit' : 'Click to override') : undefined}
                    style={{
                      cursor: canEdit ? 'pointer' : 'default',
                      color: isEmpty ? 'var(--muted)' : isOverride ? 'var(--accent4)' : 'var(--text)',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11,
                    }}
                    onClick={() => canEdit && onCellClick(row, p, cell)}
                  >
                    {isEmpty ? '—' : Number(v).toFixed(4)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Sync modal ────────────────────────────────────────────────────────────────

function SyncModal({ teamId, onSynced, onClose }) {
  const { addToast } = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3));
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
            Copy all platform default rates for a period into your team overrides. Existing custom rates for that period will be overwritten.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="ca-label">Year</label>
              <input className="ca-input" type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} />
            </div>
            <div>
              <label className="ca-label">Quarter</label>
              <select className="ca-select" value={quarter} onChange={e => setQuarter(parseInt(e.target.value))}>
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

// ── Default tab ───────────────────────────────────────────────────────────────

function DefaultTab({ user, defaultRates, loading, onRefresh, periods }) {
  const [showAdd, setShowAdd] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!loading && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [loading]);

  const rows = useMemo(() => {
    const map = {};
    for (const r of defaultRates) {
      const key = `${r.from_currency}/${r.to_currency}`;
      if (!map[key]) map[key] = { from: r.from_currency, to: r.to_currency, cells: {} };
      map[key].cells[`${r.year}-${r.quarter}`] = { default: r.rate };
    }
    return Object.values(map).sort((a, b) => `${a.from}/${a.to}`.localeCompare(`${b.from}/${b.to}`))
      .map(row => ({ ...row, cells: periods.map(p => row.cells[`${p.year}-${p.quarter}`] ?? null) }));
  }, [defaultRates, periods]);

  return (
    <>
      {showAdd && (
        <AddRateModal
          title="Add Platform Rate"
          onSave={form => api.put('/api/fx-rates/', form)}
          onClose={() => { setShowAdd(false); onRefresh(); }}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p className="ca-subtitle" style={{ margin: 0 }}>
          Platform default exchange rates.{user?.is_super_admin ? '' : ' Managed by super admins.'}
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {user?.is_super_admin && (
            <>
              <FileUpload endpoint="/api/fx-rates/upload" onSuccess={onRefresh} />
              <button className="ca-btn ca-btn-primary ca-btn-sm" onClick={() => setShowAdd(true)}>+ Add Rate</button>
            </>
          )}
          <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => defaultRates.length > 0 && exportCsv(
            'fx_rates_default.csv',
            ['From', 'To', 'Year', 'Quarter', 'Rate'],
            defaultRates.map(r => [r.from_currency, r.to_currency, r.year, r.quarter, r.rate])
          )}>Export CSV</button>
        </div>
      </div>

      {loading ? (
        <div className="ca-card" style={{ padding: 20, color: 'var(--muted)' }}>Loading...</div>
      ) : rows.length === 0 ? (
        <div className="ca-card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>
          No FX rates found.{user?.is_super_admin ? ' Upload a CSV or add a rate to get started.' : ' Ask a super admin to upload rates.'}
        </div>
      ) : (
        <div className="ca-card">
          <RateGrid periods={periods} rows={rows} canEdit={false} scrollRef={scrollRef} />
        </div>
      )}
    </>
  );
}

// ── Add Rate Modal (shared by Default and Custom tabs) ───────────────────────

function AddRateModal({ title, onSave, onClose }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({ from_currency: '', to_currency: '', year: new Date().getFullYear(), quarter: 1, rate: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const rate = parseFloat(form.rate);
    if (!form.from_currency || !form.to_currency || isNaN(rate) || rate <= 0) {
      addToast('Fill in all fields with valid values', 'error'); return;
    }
    setSaving(true);
    try {
      await onSave({ ...form, rate });
      addToast('Rate added', 'success');
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
          <div className="ca-modal-title">{title || 'Add Rate'}</div>
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
              onChange={e => setForm(f => ({ ...f, rate: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') save(); }} />
          </div>
        </div>
        <div className="ca-modal-footer">
          <button className="ca-btn ca-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="ca-btn ca-btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Add Rate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Custom tab ────────────────────────────────────────────────────────────────

function CustomTab({ teamId, canEdit, defaultRates }) {
  const { addToast } = useToast();
  const [customRates, setCustomRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSync, setShowSync] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editCell, setEditCell] = useState(null); // { row, period, cell }
  const scrollRef = useRef(null);

  const fetchCustom = () => {
    setLoading(true);
    api.get('/api/fx-rates/custom', { params: { team_id: teamId } })
      .then(({ data }) => setCustomRates(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (teamId) fetchCustom(); }, [teamId]);

  useEffect(() => {
    if (!loading && scrollRef.current)
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [loading]);

  // Build periods from union of default + custom data
  const periods = useMemo(() => {
    const set = new Set();
    [...defaultRates, ...customRates].forEach(r => set.add(`${r.year || r.year}-${r.quarter}`));
    return [...set]
      .map(s => { const [y, q] = s.split('-'); return { year: +y, quarter: +q }; })
      .sort((a, b) => a.year - b.year || a.quarter - b.quarter)
      .map(p => ({ ...p, label: `Q${p.quarter}-${String(p.year).slice(2)}` }));
  }, [defaultRates, customRates]);

  // Build rows: union of all pairs seen in default or custom
  const rows = useMemo(() => {
    const pairs = new Map();
    for (const r of defaultRates) {
      const k = `${r.from_currency}/${r.to_currency}`;
      if (!pairs.has(k)) pairs.set(k, { from: r.from_currency, to: r.to_currency, defMap: {}, custMap: {} });
      pairs.get(k).defMap[`${r.year}-${r.quarter}`] = r.rate;
    }
    for (const r of customRates) {
      const k = `${r.from_currency}/${r.to_currency}`;
      if (!pairs.has(k)) pairs.set(k, { from: r.from_currency, to: r.to_currency, defMap: {}, custMap: {} });
      pairs.get(k).custMap[`${r.year}-${r.quarter}`] = r.rate;
    }
    return [...pairs.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, row]) => ({
        ...row,
        cells: periods.map(p => {
          const key = `${p.year}-${p.quarter}`;
          const def = row.defMap[key] ?? null;
          const cust = row.custMap[key] ?? null;
          return { default: def, custom: cust };
        }),
      }));
  }, [defaultRates, customRates, periods]);

  const handleCellClick = (row, period, cell) => {
    if (!canEdit) return;
    setEditCell({ row, period, cell });
  };

  return (
    <>
      {showSync && <SyncModal teamId={teamId} onSynced={fetchCustom} onClose={() => setShowSync(false)} />}
      {showAdd && <AddRateModal
        title="Add Custom Rate"
        onSave={form => api.put('/api/fx-rates/custom', { ...form, team_id: teamId })}
        onClose={() => { setShowAdd(false); fetchCustom(); }}
      />}
      {editCell && (
        <EditRateModal
          pair={{ from: editCell.row.from, to: editCell.row.to }}
          period={editCell.period}
          currentRate={editCell.cell?.custom ?? null}
          defaultRate={editCell.cell?.default ?? null}
          periods={periods}
          teamId={teamId}
          onSaved={fetchCustom}
          onClose={() => setEditCell(null)}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p className="ca-subtitle" style={{ margin: 0 }}>
          Team overrides (<span style={{ color: 'var(--accent4)' }}>highlighted</span>) take priority over platform defaults in all costing calculations.
          {canEdit && ' Click any cell to set or edit a rate.'}
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canEdit && (
            <>
              <FileUpload
                endpoint={`/api/fx-rates/custom/upload?team_id=${teamId}`}
                onSuccess={fetchCustom}
              />
              <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => setShowSync(true)}>Sync from Default</button>
              <button className="ca-btn ca-btn-primary ca-btn-sm" onClick={() => setShowAdd(true)}>+ Add Rate</button>
            </>
          )}
          <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => {
            const flat = customRates.map(r => [r.from_currency, r.to_currency, r.year, r.quarter, r.rate]);
            exportCsv('fx_rates_custom.csv', ['From', 'To', 'Year', 'Quarter', 'Rate'], flat);
          }}>Export CSV</button>
        </div>
      </div>

      {loading ? (
        <div className="ca-card" style={{ padding: 20, color: 'var(--muted)' }}>Loading...</div>
      ) : rows.length === 0 ? (
        <div className="ca-card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>
          {canEdit
            ? <>No rates yet. Use <strong>Sync from Default</strong> to seed from platform rates.</>
            : 'No rates available.'}
        </div>
      ) : (
        <div className="ca-card">
          <RateGrid
            periods={periods}
            rows={rows}
            canEdit={canEdit}
            onCellClick={handleCellClick}
            scrollRef={scrollRef}
          />
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
            <span style={{ color: 'var(--accent4)', marginRight: 4 }}>■</span> Team override &nbsp;
            <span style={{ color: 'var(--text)', marginRight: 4 }}>■</span> Platform default &nbsp;
            <span style={{ color: 'var(--muted)', marginRight: 4 }}>—</span> No data
          </div>
        </div>
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FxRates() {
  const { user, activeTeamId } = useAuth();
  const [tab, setTab] = useState('default');
  const [canEdit, setCanEdit] = useState(false);
  const [defaultRates, setDefaultRates] = useState([]);
  const [defaultLoading, setDefaultLoading] = useState(true);

  const fetchDefaults = () => {
    setDefaultLoading(true);
    api.get('/api/fx-rates/')
      .then(({ data }) => setDefaultRates(data))
      .catch(console.error)
      .finally(() => setDefaultLoading(false));
  };

  useEffect(() => { fetchDefaults(); }, []);

  useEffect(() => {
    if (!activeTeamId) return;
    api.get('/api/fx-rates/can-edit-custom', { params: { team_id: activeTeamId } })
      .then(({ data }) => setCanEdit(data.can_edit))
      .catch(() => setCanEdit(false));
  }, [activeTeamId]);

  // Build period columns from default rates
  const periods = useMemo(() => {
    const set = new Set();
    defaultRates.forEach(r => set.add(`${r.year}-${r.quarter}`));
    return [...set]
      .map(s => { const [y, q] = s.split('-'); return { year: +y, quarter: +q }; })
      .sort((a, b) => a.year - b.year || a.quarter - b.quarter)
      .map(p => ({ ...p, label: `Q${p.quarter}-${String(p.year).slice(2)}` }));
  }, [defaultRates]);

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

      {tab === 'default' && (
        <DefaultTab user={user} defaultRates={defaultRates} loading={defaultLoading} onRefresh={fetchDefaults} periods={periods} />
      )}
      {tab === 'custom' && (
        <CustomTab teamId={activeTeamId} canEdit={canEdit} defaultRates={defaultRates} />
      )}
    </div>
  );
}
