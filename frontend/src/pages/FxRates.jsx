import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../AuthContext';
import { useToast } from '../components/Toast';
import FileUpload from '../components/FileUpload';
import api from '../api';
import exportCsv from '../utils/exportCsv';

const _now = new Date();
const LIVE_YEAR = _now.getFullYear();
const LIVE_QUARTER = Math.ceil((_now.getMonth() + 1) / 3);

const STICKY_TH = { position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 3, boxShadow: '2px 0 5px -2px rgba(0,0,0,0.13)' };
const STICKY_TD = { position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 2, boxShadow: '2px 0 5px -2px rgba(0,0,0,0.13)' };


// ── Add / Edit FX Pair Modal ──────────────────────────────────────────────────

function FxPairModal({ pair, onSave, onClose }) {
  const { addToast } = useToast();
  const [form, setForm] = useState(pair || {
    from_currency: '', to_currency: '', name: '', source_type: 'ecb', scrape_url: '', scrape_enabled: true,
  });
  const [saving, setSaving] = useState(false);

  const isEdit = !!pair;

  const save = async () => {
    if (!form.from_currency || !form.to_currency || !form.name) {
      addToast('Fill in From, To, and Name', 'error'); return;
    }
    setSaving(true);
    try {
      await onSave(form);
      addToast(isEdit ? 'Pair updated' : 'Pair added', 'success');
      onClose();
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Failed to save pair';
      addToast(msg, 'error');
    } finally { setSaving(false); }
  };

  const updateForm = field => e => setForm(f => ({ ...f, [field]: e.target.value }));

  return createPortal(
    <div className="ca-modal-backdrop" onClick={onClose}>
      <div className="ca-modal" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
        <div className="ca-modal-header">
          <div className="ca-modal-title">{isEdit ? 'Edit FX Pair' : 'Add FX Pair'}</div>
          <button className="ca-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="ca-modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="ca-label">From Currency</label>
            <input className="ca-input" maxLength={3} placeholder="EUR" value={form.from_currency}
              onChange={e => setForm(f => ({ ...f, from_currency: e.target.value.toUpperCase() }))} />
          </div>
          <div>
            <label className="ca-label">To Currency</label>
            <input className="ca-input" maxLength={3} placeholder="USD" value={form.to_currency}
              onChange={e => setForm(f => ({ ...f, to_currency: e.target.value.toUpperCase() }))} />
          </div>
          <div>
            <label className="ca-label">Name</label>
            <input className="ca-input" placeholder="EUR/USD" value={form.name} onChange={updateForm('name')} />
          </div>
          <div>
            <label className="ca-label">Source Type</label>
            <select className="ca-select" value={form.source_type} onChange={updateForm('source_type')}>
              <option value="ecb">ECB (auto-scrape)</option>
              <option value="google_finance">Google Finance (daily)</option>
              <option value="generic">Generic URL</option>
              <option value="manual">Manual only</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="ca-label">Scrape URL</label>
            <input className="ca-input"
              placeholder={form.source_type === 'google_finance'
                ? 'https://www.google.com/finance/quote/CNY-EUR'
                : 'https://data-api.ecb.europa.eu/service/data/EXR/Q....'}
              value={form.scrape_url || ''} onChange={updateForm('scrape_url')} />
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              {form.source_type === 'google_finance'
                ? <>Google Finance URL — use a dash for the pair: <code>https://www.google.com/finance/quote/CNY-EUR</code></>
                : <>For ECB pairs: <code>https://data-api.ecb.europa.eu/service/data/EXR/Q.USD.EUR.SP00.A</code></>}
            </div>
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="scrape-enabled" checked={form.scrape_enabled}
              onChange={e => setForm(f => ({ ...f, scrape_enabled: e.target.checked }))} />
            <label htmlFor="scrape-enabled" style={{ fontSize: 13, cursor: 'pointer' }}>Scraping enabled</label>
          </div>
        </div>
        <div className="ca-modal-footer">
          <button className="ca-btn ca-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="ca-btn ca-btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Pair'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


// ── FX Pairs management section ───────────────────────────────────────────────

function FxPairsSection({ pairs, canManage, onRefresh }) {
  const { addToast } = useToast();
  const [open, setOpen] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editPair, setEditPair] = useState(null);
  const [scrapingId, setScrapingId] = useState(null);
  const [scrapingAll, setScrapingAll] = useState(false);

  const scrapeOne = async (pair) => {
    setScrapingId(pair.id);
    try {
      const { data } = await api.post(`/api/fx-rates/pairs/${pair.id}/scrape-live`);
      addToast(`${pair.name} live rate: ${data.live_rate?.toFixed(4)}`, 'success');
      onRefresh();
    } catch (err) {
      addToast(`Scrape failed: ${err?.response?.data?.detail || 'unknown error'}`, 'error');
    } finally { setScrapingId(null); }
  };

  const scrapeAll = async () => {
    setScrapingAll(true);
    try {
      const { data } = await api.post('/api/fx-rates/scrape-live');
      const ok = Object.values(data.results).filter(v => v !== null).length;
      addToast(`Scraped ${ok} live rates`, 'success');
      onRefresh();
    } catch {
      addToast('Scrape all live failed', 'error');
    } finally { setScrapingAll(false); }
  };

  const deletePair = async (pair) => {
    if (!window.confirm(`Delete pair ${pair.name}? Existing quarterly rates are kept.`)) return;
    try {
      await api.delete(`/api/fx-rates/pairs/${pair.id}`);
      addToast('Pair deleted', 'success');
      onRefresh();
    } catch {
      addToast('Delete failed', 'error');
    }
  };

  return (
    <>
      {showAdd && (
        <FxPairModal
          onSave={form => api.post('/api/fx-rates/pairs', form)}
          onClose={() => { setShowAdd(false); onRefresh(); }}
        />
      )}
      {editPair && (
        <FxPairModal
          pair={editPair}
          onSave={form => api.put(`/api/fx-rates/pairs/${editPair.id}`, form)}
          onClose={() => { setEditPair(null); onRefresh(); }}
        />
      )}

      <div className="ca-card" style={{ marginBottom: 20 }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setOpen(o => !o)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{open ? '▾' : '▸'}</span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>FX Pairs</span>
            <span className="ca-badge" style={{ background: 'var(--accent1-dim)', color: 'var(--accent1)', fontSize: 10 }}>
              {pairs.length}
            </span>
          </div>
          {canManage && (
            <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
              <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={scrapeAll} disabled={scrapingAll}>
                {scrapingAll ? 'Scraping…' : '⚡ Scrape All Live'}
              </button>
              <button className="ca-btn ca-btn-primary ca-btn-sm" onClick={() => setShowAdd(true)}>+ Add Pair</button>
            </div>
          )}
        </div>

        {open && (
          <div style={{ marginTop: 12, overflowX: 'auto' }}>
            <table className="ca-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Source</th>
                  <th style={{ maxWidth: 260 }}>Scrape URL</th>
                  <th className="center">Enabled</th>
                  <th className="right">Live Rate</th>
                  <th>Last Scraped</th>
                  {canManage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {pairs.length === 0 ? (
                  <tr><td colSpan={canManage ? 7 : 6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No pairs configured</td></tr>
                ) : pairs.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{p.name}</td>
                    <td>
                      <span className={`ca-badge`} style={{
                        background: p.source_type === 'ecb' ? 'var(--accent2-dim)' : p.source_type === 'google_finance' ? 'var(--accent-dim)' : p.source_type === 'generic' ? 'var(--accent3-dim)' : 'var(--surface-hover)',
                        color: p.source_type === 'ecb' ? 'var(--accent2)' : p.source_type === 'google_finance' ? 'var(--accent)' : p.source_type === 'generic' ? 'var(--accent3)' : 'var(--text-secondary)',
                        fontSize: 9, textTransform: 'uppercase',
                      }}>{p.source_type}</span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.scrape_url || <span style={{ color: 'var(--muted)' }}>—</span>}
                    </td>
                    <td className="center">
                      <span style={{ color: p.scrape_enabled ? 'var(--accent2)' : 'var(--muted)' }}>
                        {p.scrape_enabled ? '✓' : '—'}
                      </span>
                    </td>
                    <td className="right" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                      {p.live_rate != null
                        ? <span style={{ color: 'var(--accent2)' }}>{Number(p.live_rate).toFixed(4)}</span>
                        : <span style={{ color: 'var(--muted)', fontSize: 10 }}>No data</span>}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {p.live_scraped_at ? new Date(p.live_scraped_at).toLocaleString() : '—'}
                    </td>
                    {canManage && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          {p.scrape_url && (
                            <button className="ca-btn ca-btn-ghost ca-btn-xs" title="Scrape live now"
                              disabled={scrapingId === p.id} onClick={() => scrapeOne(p)}>
                              {scrapingId === p.id ? '…' : '⚡'}
                            </button>
                          )}
                          <button className="ca-btn ca-btn-ghost ca-btn-xs" onClick={() => setEditPair(p)}>✎</button>
                          <button className="ca-btn ca-btn-ghost ca-btn-xs" style={{ color: 'var(--danger)' }}
                            onClick={() => deletePair(p)}>✕</button>
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
    </>
  );
}


// ── Edit Rate Modal (Default tab — fixed value only) ──────────────────────────

function EditRateModal({
  pair, period, currentRate, referenceLabel, hasOverride,
  periods, onUpsert, onReset, resetLabel, onSaved, onClose,
}) {
  const { addToast } = useToast();
  const [value, setValue] = useState(currentRate !== null ? String(currentRate) : '');
  const [applyMode, setApplyMode] = useState('single');
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(periods.length - 1);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  const handleSave = async () => {
    const v = parseFloat(value);
    if (isNaN(v) || v <= 0) { addToast('Enter a valid positive rate', 'error'); return; }
    setSaving(true);
    try {
      let targets;
      if (applyMode === 'single') targets = [period];
      else if (applyMode === 'all') targets = periods;
      else {
        const lo = Math.min(rangeStart, rangeEnd);
        const hi = Math.max(rangeStart, rangeEnd);
        targets = periods.slice(lo, hi + 1);
      }
      await Promise.all(targets.map(p => onUpsert(p, v)));
      addToast('Rate saved', 'success');
      onSaved();
      onClose();
    } catch {
      addToast('Failed to save rate', 'error');
    } finally { setSaving(false); }
  };

  const handleReset = async () => {
    if (!onReset) return;
    setSaving(true);
    try {
      await onReset();
      addToast(resetLabel ? `${resetLabel} done` : 'Rate removed', 'success');
      onSaved();
      onClose();
    } catch {
      addToast('Failed to remove rate', 'error');
    } finally { setSaving(false); }
  };

  return createPortal(
    <div className="ca-modal-backdrop" onClick={onClose}>
      <div className="ca-modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div className="ca-modal-header">
          <div className="ca-modal-title">{pair.from}/{pair.to} · {period.label}</div>
          <button className="ca-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="ca-modal-body">
          {referenceLabel && (
            <div style={{ marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
              {referenceLabel}
              {hasOverride && (
                <span className="ca-badge" style={{ marginLeft: 10, background: 'var(--accent4-dim)', color: 'var(--accent4)', fontSize: 9 }}>OVERRIDE</span>
              )}
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <label className="ca-label">Rate ({pair.from} → {pair.to})</label>
            <input ref={inputRef} className="ca-input" type="number" step="0.000001"
              value={value} onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !saving) handleSave(); }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label className="ca-label">Apply to</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[['single', 'This period only'], ['all', 'All periods'], ['range', 'Custom range']].map(([m, l]) => (
                <label key={m} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="radio" checked={applyMode === m} onChange={() => setApplyMode(m)} />
                  {l}
                </label>
              ))}
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
          {onReset && (
            <button className="ca-btn ca-btn-danger" onClick={handleReset} disabled={saving} style={{ marginRight: 'auto' }}>
              {resetLabel || 'Reset to Default'}
            </button>
          )}
          <button className="ca-btn ca-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="ca-btn ca-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


// ── Custom Edit Modal — 3-mode (fixed / live / quarter_ref) ───────────────────

function CustomEditModal({ pair, period, current, liveRate, availableQuarters, teamId, onSaved, onClose }) {
  const { addToast } = useToast();
  const [mode, setMode] = useState(current?.value_type || 'fixed');
  const [fixedValue, setFixedValue] = useState(
    current?.value_type === 'fixed' && current.rate != null ? String(current.rate) : ''
  );
  const [refPeriod, setRefPeriod] = useState(
    current?.value_type === 'quarter_ref'
      ? `${current.ref_year}-${current.ref_quarter}`
      : (availableQuarters[0] ? `${availableQuarters[0].year}-${availableQuarters[0].quarter}` : '')
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    let payload = {
      team_id: teamId,
      from_currency: pair.from,
      to_currency: pair.to,
      year: period.year,
      quarter: period.quarter,
      value_type: mode,
      rate: null, ref_year: null, ref_quarter: null,
    };
    if (mode === 'fixed') {
      const v = parseFloat(fixedValue);
      if (isNaN(v) || v <= 0) { addToast('Enter a valid positive rate', 'error'); return; }
      payload.rate = v;
    } else if (mode === 'quarter_ref') {
      if (!refPeriod) { addToast('Select a platform quarter', 'error'); return; }
      const [ry, rq] = refPeriod.split('-').map(Number);
      payload.ref_year = ry;
      payload.ref_quarter = rq;
    }
    setSaving(true);
    try {
      await api.put('/api/fx-rates/custom', payload);
      addToast('Rate saved', 'success');
      onSaved();
      onClose();
    } catch {
      addToast('Failed to save rate', 'error');
    } finally { setSaving(false); }
  };

  const deleteRate = async () => {
    if (!current) return;
    setSaving(true);
    try {
      await api.delete('/api/fx-rates/custom-by-key', {
        params: { team_id: teamId, from_currency: pair.from, to_currency: pair.to, year: period.year, quarter: period.quarter },
      });
      addToast('Override removed', 'success');
      onSaved();
      onClose();
    } catch {
      addToast('Failed to remove override', 'error');
    } finally { setSaving(false); }
  };

  const modeStyle = (m) => ({
    padding: '8px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
    fontWeight: mode === m ? 600 : 400, border: `1px solid ${mode === m ? 'var(--accent1)' : 'var(--border)'}`,
    background: mode === m ? 'var(--accent1-dim)' : 'transparent',
    color: mode === m ? 'var(--accent1)' : 'var(--text-secondary)',
  });

  return createPortal(
    <div className="ca-modal-backdrop" onClick={onClose}>
      <div className="ca-modal" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
        <div className="ca-modal-header">
          <div className="ca-modal-title">{pair.from}/{pair.to} · {period.label}</div>
          <button className="ca-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="ca-modal-body">
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button style={modeStyle('fixed')} onClick={() => setMode('fixed')}>Fixed value</button>
            <button style={modeStyle('live')} onClick={() => setMode('live')}>Use Live Rate</button>
            <button style={modeStyle('quarter_ref')} onClick={() => setMode('quarter_ref')}>Platform Quarter</button>
          </div>

          {mode === 'fixed' && (
            <div>
              <label className="ca-label">Rate ({pair.from} → {pair.to})</label>
              <input className="ca-input" type="number" step="0.000001" placeholder="1.000000"
                value={fixedValue} onChange={e => setFixedValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') save(); }} autoFocus />
            </div>
          )}

          {mode === 'live' && (
            <div style={{ background: 'var(--surface-hover)', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Always resolves to the current live (daily) scraped rate for this pair.
              </div>
              {liveRate != null
                ? <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: 'var(--accent2)' }}>
                    Current live: {Number(liveRate).toFixed(4)}
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 8 }}>refreshed daily</span>
                  </div>
                : <div style={{ color: 'var(--muted)', fontSize: 12 }}>No live rate available yet. Scrape live first.</div>}
            </div>
          )}

          {mode === 'quarter_ref' && (
            <div>
              <label className="ca-label">Use platform rate from quarter</label>
              {availableQuarters.length === 0
                ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>No platform quarterly rates available.</div>
                : <select className="ca-select" value={refPeriod} onChange={e => setRefPeriod(e.target.value)}>
                    {availableQuarters.map(q => (
                      <option key={`${q.year}-${q.quarter}`} value={`${q.year}-${q.quarter}`}>
                        Q{q.quarter}-{q.year} — {q.rate != null ? Number(q.rate).toFixed(4) : 'no data'}
                      </option>
                    ))}
                  </select>}
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                Looks up the platform quarterly rate dynamically each time costing runs.
              </div>
            </div>
          )}
        </div>
        <div className="ca-modal-footer">
          {current && (
            <button className="ca-btn ca-btn-danger" onClick={deleteRate} disabled={saving} style={{ marginRight: 'auto' }}>
              Remove Override
            </button>
          )}
          <button className="ca-btn ca-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="ca-btn ca-btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


// ── Multi-period Sync Modal ────────────────────────────────────────────────────

function MultiSyncModal({ teamId, pairs, defaultRates, onSynced, onClose }) {
  const { addToast } = useToast();
  // expanded[pairName] = true/false; checked[pairName][periodKey] = bool
  const [expanded, setExpanded] = useState({});
  const [checked, setChecked] = useState({});
  const [syncing, setSyncing] = useState(false);

  // Compute available periods per pair from defaultRates
  const pairPeriods = useMemo(() => {
    const map = {};
    for (const r of defaultRates) {
      const k = `${r.from_currency}/${r.to_currency}`;
      if (!map[k]) map[k] = [];
      map[k].push({ year: r.year, quarter: r.quarter, rate: r.rate });
    }
    for (const k in map) {
      map[k].sort((a, b) => b.year - a.year || b.quarter - a.quarter);
    }
    return map;
  }, [defaultRates]);

  const togglePair = (pairName) => {
    const wasExpanded = expanded[pairName];
    setExpanded(e => ({ ...e, [pairName]: !wasExpanded }));
    if (!wasExpanded && !checked[pairName]) {
      // Auto-select all periods when first expanding
      const periods = pairPeriods[pairName] || [];
      const all = {};
      periods.forEach(p => { all[`${p.year}-${p.quarter}`] = true; });
      setChecked(c => ({ ...c, [pairName]: all }));
    }
  };

  const togglePeriod = (pairName, periodKey) => {
    setChecked(c => ({
      ...c,
      [pairName]: { ...(c[pairName] || {}), [periodKey]: !c[pairName]?.[periodKey] },
    }));
  };

  const selectAllForPair = (pairName) => {
    const periods = pairPeriods[pairName] || [];
    const all = {};
    periods.forEach(p => { all[`${p.year}-${p.quarter}`] = true; });
    setChecked(c => ({ ...c, [pairName]: all }));
  };

  const clearAllForPair = (pairName) => {
    setChecked(c => ({ ...c, [pairName]: {} }));
  };

  const totalSelected = useMemo(() => {
    let n = 0;
    for (const pairName in checked) {
      n += Object.values(checked[pairName]).filter(Boolean).length;
    }
    return n;
  }, [checked]);

  const sync = async () => {
    if (totalSelected === 0) { addToast('Select at least one period', 'error'); return; }
    setSyncing(true);
    try {
      const selections = [];
      for (const pairName in checked) {
        const periods = [];
        for (const periodKey in checked[pairName]) {
          if (!checked[pairName][periodKey]) continue;
          const [year, quarter] = periodKey.split('-').map(Number);
          periods.push({ year, quarter });
        }
        if (periods.length === 0) continue;
        const [from_currency, to_currency] = pairName.split('/');
        selections.push({ from_currency, to_currency, periods });
      }
      const { data } = await api.post('/api/fx-rates/custom/sync-periods', { team_id: teamId, selections });
      addToast(`Synced ${data.synced} rates from platform defaults`, 'success');
      onSynced();
      onClose();
    } catch {
      addToast('Sync failed', 'error');
    } finally { setSyncing(false); }
  };

  return createPortal(
    <div className="ca-modal-backdrop" onClick={onClose}>
      <div className="ca-modal" style={{ width: 500 }} onClick={e => e.stopPropagation()}>
        <div className="ca-modal-header">
          <div className="ca-modal-title">Sync from Platform Defaults</div>
          <button className="ca-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="ca-modal-body">
          <p style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
            Select currencies and quarters to copy from platform defaults into your team overrides. Existing custom rates will be overwritten.
          </p>
          <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pairs.map(pair => {
              const pairName = pair.name;
              const isExpanded = expanded[pairName];
              const periods = pairPeriods[pairName] || [];
              const pairChecked = checked[pairName] || {};
              const checkedCount = Object.values(pairChecked).filter(Boolean).length;

              return (
                <div key={pairName} style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      cursor: 'pointer', background: isExpanded ? 'var(--surface-hover)' : 'transparent',
                      borderRadius: isExpanded ? '8px 8px 0 0' : 8,
                    }}
                    onClick={() => togglePair(pairName)}
                  >
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 12 }}>{isExpanded ? '▾' : '▸'}</span>
                    <span style={{ fontWeight: 600, fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>{pairName}</span>
                    {checkedCount > 0 && (
                      <span className="ca-badge" style={{ background: 'var(--accent1-dim)', color: 'var(--accent1)', fontSize: 9 }}>
                        {checkedCount} selected
                      </span>
                    )}
                    {periods.length === 0 && (
                      <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>No platform data</span>
                    )}
                  </div>
                  {isExpanded && periods.length > 0 && (
                    <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <button className="ca-btn ca-btn-ghost ca-btn-xs" onClick={e => { e.stopPropagation(); selectAllForPair(pairName); }}>Select all</button>
                        <button className="ca-btn ca-btn-ghost ca-btn-xs" onClick={e => { e.stopPropagation(); clearAllForPair(pairName); }}>Clear all</button>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {periods.map(p => {
                          const key = `${p.year}-${p.quarter}`;
                          const isChecked = !!pairChecked[key];
                          return (
                            <label key={key} style={{
                              display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                              padding: '4px 8px', borderRadius: 4, fontSize: 11,
                              background: isChecked ? 'var(--accent1-dim)' : 'var(--surface-hover)',
                              border: `1px solid ${isChecked ? 'var(--accent1)' : 'var(--border)'}`,
                              color: isChecked ? 'var(--accent1)' : 'var(--text)',
                            }}
                              onClick={e => e.stopPropagation()}>
                              <input type="checkbox" checked={isChecked}
                                onChange={() => togglePeriod(pairName, key)}
                                style={{ margin: 0 }} />
                              <span>Q{p.quarter}-{p.year}</span>
                              {p.rate != null && <span style={{ color: 'var(--text-secondary)' }}>({Number(p.rate).toFixed(4)})</span>}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="ca-modal-footer">
          <button className="ca-btn ca-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="ca-btn ca-btn-primary" disabled={syncing || totalSelected === 0} onClick={sync}>
            {syncing ? 'Syncing…' : `Sync Selected (${totalSelected} period${totalSelected !== 1 ? 's' : ''})`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


// ── Add Rate Modal ─────────────────────────────────────────────────────────────

function AddRateModal({ title, onSave, onClose }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({
    from_currency: '', to_currency: '', year: LIVE_YEAR, quarter: LIVE_QUARTER, rate: '',
  });
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
    } finally { setSaving(false); }
  };

  return createPortal(
    <div className="ca-modal-backdrop" onClick={onClose}>
      <div className="ca-modal" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
        <div className="ca-modal-header">
          <div className="ca-modal-title">{title || 'Add Rate'}</div>
          <button className="ca-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="ca-modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="ca-label">From Currency</label>
            <input className="ca-input" maxLength={3} placeholder="EUR" value={form.from_currency}
              onChange={e => setForm(f => ({ ...f, from_currency: e.target.value.toUpperCase() }))} />
          </div>
          <div>
            <label className="ca-label">To Currency</label>
            <input className="ca-input" maxLength={3} placeholder="USD" value={form.to_currency}
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
            <input className="ca-input" type="number" step="0.000001" placeholder="1.000000"
              value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))}
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
    </div>,
    document.body
  );
}


// ── Rate Grid ─────────────────────────────────────────────────────────────────

function RateGrid({ periods, rows, onCellClick, canEdit, scrollRef, liveRateMap }) {
  if (rows.length === 0) return null;
  const showLive = !!liveRateMap;

  return (
    <div className="ca-scroll-x" ref={scrollRef}>
      <table className="ca-table">
        <thead>
          <tr>
            <th style={{ whiteSpace: 'nowrap', ...STICKY_TH }}>Pair</th>
            {showLive && (
              <th className="center" style={{ minWidth: 80 }}>
                Live
                <div style={{ fontSize: 8, color: 'var(--accent2)', fontWeight: 800, letterSpacing: 1, marginTop: 1, lineHeight: 1 }}>REALTIME</div>
              </th>
            )}
            {periods.map(p => {
              const isLive = p.year === LIVE_YEAR && p.quarter === LIVE_QUARTER;
              return (
                <th key={p.label} className="center" style={{ minWidth: 84 }}>
                  {p.label}
                  {isLive && (
                    <div style={{ fontSize: 8, color: 'var(--accent2)', fontWeight: 800, letterSpacing: 1, marginTop: 1, lineHeight: 1 }}>CURRENT</div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={`${row.from}/${row.to}`}>
              <td style={{ fontWeight: 600, whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, ...STICKY_TD }}>
                {row.from}/{row.to}
              </td>
              {showLive && (() => {
                const live = liveRateMap[`${row.from}/${row.to}`];
                return (
                  <td className="center" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                    {live != null
                      ? <span style={{ color: 'var(--accent2)' }}>{Number(live).toFixed(4)}</span>
                      : <span style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 0.3 }}>No data</span>}
                  </td>
                );
              })()}
              {periods.map((p, i) => {
                const cell = row.cells[i];
                const isCustom = cell?.value_type && cell.value_type !== 'fixed';
                const v = cell?.value_type === 'fixed' ? (cell?.custom ?? cell?.default ?? null) : (cell?.default ?? null);
                const displayV = cell?.custom ?? cell?.default ?? null;
                const isOverride = cell?.custom !== null && cell?.custom !== undefined;

                return (
                  <td key={p.label} className="center"
                    title={canEdit ? (displayV === null ? 'Click to set rate' : isOverride ? 'Team override — click to edit' : 'Click to edit') : undefined}
                    style={{
                      cursor: canEdit ? 'pointer' : 'default',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                    }}
                    onClick={() => canEdit && onCellClick(row, p, cell)}>
                    {isCustom && cell?.value_type === 'live' ? (
                      <span style={{ fontSize: 9, color: 'var(--accent2)', letterSpacing: 0.3 }}>LIVE↑</span>
                    ) : isCustom && cell?.value_type === 'quarter_ref' ? (
                      <span style={{ fontSize: 9, color: 'var(--accent3)', letterSpacing: 0.3 }}>Q-REF</span>
                    ) : displayV === null ? (
                      <span style={{ color: 'var(--muted)' }}>—</span>
                    ) : (
                      <span style={{ color: isOverride ? 'var(--accent4)' : 'var(--text)' }}>
                        {Number(displayV).toFixed(4)}
                      </span>
                    )}
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


// ── Default Tab ───────────────────────────────────────────────────────────────

function DefaultTab({ user, canManage, defaultRates, loading, onRefresh, periods, pairs, pairsLoading }) {
  const { addToast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [editCell, setEditCell] = useState(null);
  const scrollRef = useRef(null);

  const handleScrape = async () => {
    setScraping(true);
    try {
      const { data } = await api.post('/api/fx-rates/scrape');
      addToast(`Synced ${data.synced} quarterly rates from ECB`, 'success');
      onRefresh();
    } catch {
      addToast('ECB scrape failed', 'error');
    } finally { setScraping(false); }
  };

  const rows = useMemo(() => {
    const map = {};
    for (const r of defaultRates) {
      const key = `${r.from_currency}/${r.to_currency}`;
      if (!map[key]) map[key] = { from: r.from_currency, to: r.to_currency, cells: {} };
      map[key].cells[`${r.year}-${r.quarter}`] = { default: r.rate, id: r.id };
    }
    return Object.values(map)
      .sort((a, b) => `${a.from}/${a.to}`.localeCompare(`${b.from}/${b.to}`))
      .map(row => ({ ...row, cells: periods.map(p => row.cells[`${p.year}-${p.quarter}`] ?? null) }));
  }, [defaultRates, periods]);

  const lastSync = defaultRates.length > 0
    ? new Date(Math.max(...defaultRates.map(r => new Date(r.uploaded_at)))).toLocaleString()
    : null;

  return (
    <>
      {showAdd && (
        <AddRateModal
          title="Add Platform Rate"
          onSave={form => api.put('/api/fx-rates/', form)}
          onClose={() => { setShowAdd(false); onRefresh(); }}
        />
      )}
      {editCell && (
        <EditRateModal
          pair={{ from: editCell.row.from, to: editCell.row.to }}
          period={editCell.period}
          currentRate={editCell.cell?.default ?? null}
          referenceLabel={null}
          hasOverride={false}
          periods={periods}
          onUpsert={(p, rate) => api.put('/api/fx-rates/', {
            from_currency: editCell.row.from, to_currency: editCell.row.to,
            year: p.year, quarter: p.quarter, rate,
          })}
          onReset={editCell.cell?.id != null ? async () => { await api.delete(`/api/fx-rates/${editCell.cell.id}`); } : undefined}
          resetLabel="Delete Rate"
          onSaved={onRefresh}
          onClose={() => setEditCell(null)}
        />
      )}

      {/* FX Pairs management */}
      <FxPairsSection pairs={pairs} canManage={canManage} onRefresh={onRefresh} />

      {/* Quarterly rates */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <p className="ca-subtitle" style={{ margin: 0 }}>
            Platform quarterly exchange rates.{canManage ? ' Click any cell to edit.' : ' Managed by FX Managers.'}
          </p>
          {lastSync && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Last sync: {lastSync}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canManage && (
            <>
              <a href="/api/fx-rates/template" download className="ca-btn ca-btn-ghost ca-btn-sm">
                Download Template
              </a>
              <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={handleScrape} disabled={scraping}>
                {scraping ? 'Scraping…' : 'Scrape Quarterly (ECB)'}
              </button>
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
          No quarterly rates found.{canManage ? ' Scrape from ECB or upload a CSV to get started.' : ' Ask an FX Manager to upload rates.'}
        </div>
      ) : (
        <div className="ca-card">
          <RateGrid
            periods={periods}
            rows={rows}
            canEdit={canManage}
            onCellClick={(row, period, cell) => canManage && setEditCell({ row, period, cell })}
            scrollRef={scrollRef}
          />
        </div>
      )}
    </>
  );
}


// ── Custom Tab ────────────────────────────────────────────────────────────────

function CustomTab({ teamId, canEdit, defaultRates, pairs }) {
  const { addToast } = useToast();
  const [customRates, setCustomRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSync, setShowSync] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editCell, setEditCell] = useState(null);
  const scrollRef = useRef(null);

  const fetchCustom = () => {
    setLoading(true);
    api.get('/api/fx-rates/custom', { params: { team_id: teamId } })
      .then(({ data }) => setCustomRates(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (teamId) fetchCustom(); }, [teamId]);

  const periods = useMemo(() => {
    const set = new Set();
    set.add(`${LIVE_YEAR}-${LIVE_QUARTER}`);
    [...defaultRates, ...customRates].forEach(r => set.add(`${r.year}-${r.quarter}`));
    return [...set]
      .map(s => { const [y, q] = s.split('-'); return { year: +y, quarter: +q }; })
      .sort((a, b) => b.year - a.year || b.quarter - a.quarter)
      .map(p => ({ ...p, label: `Q${p.quarter}-${String(p.year).slice(2)}` }));
  }, [defaultRates, customRates]);

  // liveRateMap: pair name → live_rate
  const liveRateMap = useMemo(() => {
    const m = {};
    pairs.forEach(p => { if (p.live_rate != null) m[p.name] = p.live_rate; });
    return m;
  }, [pairs]);

  const rows = useMemo(() => {
    const pairsMap = new Map();
    for (const r of defaultRates) {
      const k = `${r.from_currency}/${r.to_currency}`;
      if (!pairsMap.has(k)) pairsMap.set(k, { from: r.from_currency, to: r.to_currency, defMap: {}, custMap: {} });
      pairsMap.get(k).defMap[`${r.year}-${r.quarter}`] = r.rate;
    }
    for (const r of customRates) {
      const k = `${r.from_currency}/${r.to_currency}`;
      if (!pairsMap.has(k)) pairsMap.set(k, { from: r.from_currency, to: r.to_currency, defMap: {}, custMap: {} });
      pairsMap.get(k).custMap[`${r.year}-${r.quarter}`] = r;
    }
    return [...pairsMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, row]) => ({
        ...row,
        cells: periods.map(p => {
          const key = `${p.year}-${p.quarter}`;
          const custRow = row.custMap[key];
          const defVal = row.defMap[key] ?? null;
          if (!custRow) return { default: defVal, custom: null, value_type: null };
          return {
            default: defVal,
            custom: custRow.value_type === 'fixed' ? custRow.rate : custRow.value_type,
            value_type: custRow.value_type,
            custRow,
          };
        }),
      }));
  }, [defaultRates, customRates, periods]);

  // Available quarters for quarter_ref mode (from defaultRates for the pair being edited)
  const getAvailableQuarters = (row) => {
    if (!row) return [];
    return defaultRates
      .filter(r => r.from_currency === row.from && r.to_currency === row.to)
      .map(r => ({ year: r.year, quarter: r.quarter, rate: r.rate }))
      .sort((a, b) => b.year - a.year || b.quarter - a.quarter);
  };

  return (
    <>
      {showSync && (
        <MultiSyncModal
          teamId={teamId}
          pairs={pairs}
          defaultRates={defaultRates}
          onSynced={fetchCustom}
          onClose={() => setShowSync(false)}
        />
      )}
      {showAdd && (
        <AddRateModal
          title="Add Custom Rate"
          onSave={form => api.put('/api/fx-rates/custom', { ...form, team_id: teamId, value_type: 'fixed' })}
          onClose={() => { setShowAdd(false); fetchCustom(); }}
        />
      )}
      {editCell && (
        <CustomEditModal
          pair={{ from: editCell.row.from, to: editCell.row.to }}
          period={editCell.period}
          current={editCell.cell?.custRow || null}
          liveRate={liveRateMap[`${editCell.row.from}/${editCell.row.to}`] ?? null}
          availableQuarters={getAvailableQuarters(editCell.row)}
          teamId={teamId}
          onSaved={fetchCustom}
          onClose={() => setEditCell(null)}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p className="ca-subtitle" style={{ margin: 0 }}>
          Team overrides take priority over platform defaults.
          {canEdit && ' Click any cell to set, change, or remove an override.'}
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canEdit && (
            <>
              <a href="/api/fx-rates/template" download className="ca-btn ca-btn-ghost ca-btn-sm">
                Download Template
              </a>
              <FileUpload endpoint={`/api/fx-rates/custom/upload?team_id=${teamId}`} onSuccess={fetchCustom} />
              <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => setShowSync(true)}>Sync from Default</button>
              <button className="ca-btn ca-btn-primary ca-btn-sm" onClick={() => setShowAdd(true)}>+ Add Rate</button>
            </>
          )}
          <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={() => {
            exportCsv('fx_rates_custom.csv',
              ['From', 'To', 'Year', 'Quarter', 'Type', 'Rate'],
              customRates.map(r => [r.from_currency, r.to_currency, r.year, r.quarter, r.value_type, r.rate ?? '']));
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
            onCellClick={(row, period, cell) => canEdit && setEditCell({ row, period, cell })}
            scrollRef={scrollRef}
            liveRateMap={liveRateMap}
          />
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
            <span style={{ color: 'var(--accent4)', marginRight: 4 }}>■</span> Team override (fixed) &nbsp;
            <span style={{ color: 'var(--accent2)', marginRight: 4 }}>■</span> Live rate override &nbsp;
            <span style={{ color: 'var(--accent3)', marginRight: 4 }}>■</span> Quarter reference override &nbsp;
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
  const [canManage, setCanManage] = useState(false);
  const [defaultRates, setDefaultRates] = useState([]);
  const [defaultLoading, setDefaultLoading] = useState(true);
  const [pairs, setPairs] = useState([]);
  const [pairsLoading, setPairsLoading] = useState(true);

  const fetchAll = () => {
    setDefaultLoading(true);
    setPairsLoading(true);
    api.get('/api/fx-rates/').then(({ data }) => setDefaultRates(data)).catch(console.error).finally(() => setDefaultLoading(false));
    api.get('/api/fx-rates/pairs').then(({ data }) => setPairs(data)).catch(console.error).finally(() => setPairsLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    api.get('/api/fx-rates/can-manage-pairs')
      .then(({ data }) => setCanManage(data.can_manage))
      .catch(() => setCanManage(false));
  }, [user]);

  useEffect(() => {
    if (!activeTeamId) return;
    api.get('/api/fx-rates/can-edit-custom', { params: { team_id: activeTeamId } })
      .then(({ data }) => setCanEdit(data.can_edit))
      .catch(() => setCanEdit(false));
  }, [activeTeamId]);

  const periods = useMemo(() => {
    const set = new Set();
    set.add(`${LIVE_YEAR}-${LIVE_QUARTER}`);
    defaultRates.forEach(r => set.add(`${r.year}-${r.quarter}`));
    return [...set]
      .map(s => { const [y, q] = s.split('-'); return { year: +y, quarter: +q }; })
      .sort((a, b) => b.year - a.year || b.quarter - a.quarter)
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
        <button className={`ca-btn ca-btn-sm ${tab === 'default' ? 'ca-btn-primary' : 'ca-btn-ghost'}`}
          onClick={() => setTab('default')}>Default</button>
        <button className={`ca-btn ca-btn-sm ${tab === 'custom' ? 'ca-btn-primary' : 'ca-btn-ghost'}`}
          onClick={() => setTab('custom')}>Custom Overrides</button>
      </div>

      {tab === 'default' && (
        <DefaultTab
          user={user}
          canManage={canManage}
          defaultRates={defaultRates}
          loading={defaultLoading}
          onRefresh={fetchAll}
          periods={periods}
          pairs={pairs}
          pairsLoading={pairsLoading}
        />
      )}
      {tab === 'custom' && (
        <CustomTab
          teamId={activeTeamId}
          canEdit={canEdit}
          defaultRates={defaultRates}
          pairs={pairs}
        />
      )}
    </div>
  );
}
