import { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import api, { formatApiError } from '../api';

export default function AddIndexModal({ isOpen, onClose, commodities, teamId, onAdded }) {
  const [commodityQuery, setCommodityQuery] = useState('');
  const [commodityId, setCommodityId] = useState(null); // null = custom (not yet created)
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [customUnit, setCustomUnit] = useState('');
  const [customCurrency, setCustomCurrency] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [region, setRegion] = useState('');
  const [sourceType, setSourceType] = useState('manual');
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapeConfig, setScrapeConfig] = useState('{}');
  const [fixedValue, setFixedValue] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [detectedSource, setDetectedSource] = useState(null);
  const fileRef = useRef(null);

  // Clear form state whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      setMessage(null);
      setCommodityQuery('');
      setCommodityId(null);
      setShowSuggestions(false);
      setHighlightedIndex(-1);
      setCustomUnit('');
      setCustomCurrency('');
    }
  }, [isOpen]);

  // Detect source type when URL changes
  useEffect(() => {
    if (!scrapeUrl || scrapeUrl.length < 5) {
      setDetectedSource(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/api/indexes/detect-source', { params: { url: scrapeUrl } });
        setDetectedSource(res.data.detected_source !== 'generic' ? res.data.detected_source : null);
      } catch {
        setDetectedSource(null);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [scrapeUrl]);

  const handleAdd = async () => {
    if (!commodityQuery.trim() || !region) {
      setMessage({ type: 'error', text: 'Enter a commodity name and a region.' });
      return;
    }
    if (sourceType === 'fixed' && fixedValue === '') {
      setMessage({ type: 'error', text: 'Enter a fixed value.' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      let config = null;
      try { config = JSON.parse(scrapeConfig); } catch { /* ignore */ }

      // Resolve commodity ID: use selected or create a new custom commodity
      let resolvedId = commodityId;
      if (!resolvedId) {
        const res = await api.post('/api/indexes/commodities', {
          name: commodityQuery.trim(),
          unit: customUnit.trim() || null,
          currency: customCurrency.trim() || null,
          category: customCategory || null,
        });
        resolvedId = res.data.id;
      }

      await api.post('/api/indexes/sources', {
        team_id: teamId,
        commodity_id: resolvedId,
        region: region.toUpperCase().trim(),
        source_type: sourceType,
        scrape_url: sourceType === 'scrape_url' ? scrapeUrl : null,
        scrape_config: sourceType === 'scrape_url' ? config : null,
        fixed_value: sourceType === 'fixed' ? parseFloat(fixedValue) : null,
      });

      // Upload file immediately if one was selected for an upload-type source
      if (sourceType === 'upload' && uploadFile) {
        const formData = new FormData();
        formData.append('file', uploadFile);
        const uploadRes = await api.post(
          `/api/indexes/overrides?team_id=${teamId}`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );
        const count = uploadRes.data?.rows_processed ?? uploadRes.data?.count ?? '?';
        setMessage({ type: 'success', text: `Index source added. ${count} row(s) uploaded.` });
      } else {
        setMessage({ type: 'success', text: 'Index source added.' });
      }

      // Reset form
      setCommodityQuery('');
      setCommodityId(null);
      setCustomUnit('');
      setCustomCurrency('');
      setCustomCategory('');
      setRegion('');
      setSourceType('manual');
      setScrapeUrl('');
      setScrapeConfig('{}');
      setFixedValue('');
      setUploadFile(null);
      onAdded();
      setTimeout(() => onClose(), 600);
    } catch (err) {
      setMessage({ type: 'error', text: formatApiError(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Index" width={480}>
      <div className="ca-modal-body">
        {/* Commodity combobox — compute matches here so keyboard handler can reference them */}
        {(() => {
          const q = commodityQuery.toLowerCase();
          const filteredMatches = commodityQuery.length > 0
            ? commodities.filter(c =>
                c.name.toLowerCase().includes(q) ||
                (c.category || '').toLowerCase().includes(q)
              ).slice(0, 8)
            : [];
          const hasExactMatch = commodities.some(c => c.name.toLowerCase() === q);
          const showCreate = filteredMatches.length > 0 && !hasExactMatch;
          // Total keyboard-navigable items: matches + optional create row
          const totalItems = filteredMatches.length + (showCreate ? 1 : 0);
          const isDropdownOpen = showSuggestions && filteredMatches.length > 0;

          const selectMatch = (c) => {
            setCommodityQuery(c.name);
            setCommodityId(c.id);
            setShowSuggestions(false);
            setHighlightedIndex(-1);
          };
          const confirmCreate = () => {
            setCommodityId(null);
            setShowSuggestions(false);
            setHighlightedIndex(-1);
          };

          return (
            <div style={{ marginBottom: 14, position: 'relative' }}>
              <label className="ca-label">Commodity</label>
              <input
                className="ca-input"
                value={commodityQuery}
                onChange={e => {
                  setCommodityQuery(e.target.value);
                  setCommodityId(null);
                  setShowSuggestions(true);
                  setHighlightedIndex(-1);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => { setTimeout(() => { setShowSuggestions(false); setHighlightedIndex(-1); }, 150); }}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setShowSuggestions(true);
                    setHighlightedIndex(i => Math.min(i + 1, totalItems - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlightedIndex(i => Math.max(i - 1, -1));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (highlightedIndex >= 0 && highlightedIndex < filteredMatches.length) {
                      selectMatch(filteredMatches[highlightedIndex]);
                    } else if (highlightedIndex === filteredMatches.length && showCreate) {
                      confirmCreate();
                    } else {
                      // No highlight — treat typed text as custom entry
                      setShowSuggestions(false);
                      setHighlightedIndex(-1);
                    }
                  } else if (e.key === 'Escape') {
                    setCommodityQuery('');
                    setCommodityId(null);
                    setShowSuggestions(false);
                    setHighlightedIndex(-1);
                  }
                }}
                placeholder="Search or enter a custom name…"
                autoComplete="off"
              />

              {/* Dropdown — only rendered when there are existing matches */}
              {isDropdownOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', boxShadow: '0 8px 24px rgba(0,0,0,.18)',
                  maxHeight: 240, overflowY: 'auto',
                }}>
                  {filteredMatches.map((c, i) => (
                    <div
                      key={c.id}
                      onMouseDown={() => selectMatch(c)}
                      onMouseEnter={() => setHighlightedIndex(i)}
                      onMouseLeave={() => setHighlightedIndex(-1)}
                      style={{
                        padding: '9px 12px', cursor: 'pointer', fontSize: 13, display: 'flex',
                        alignItems: 'baseline', gap: 6,
                        background: highlightedIndex === i ? 'var(--bg)' : '',
                        borderBottom: i < filteredMatches.length - 1 || showCreate ? '1px solid var(--border-light)' : 'none',
                      }}
                    >
                      <span>{c.name}</span>
                      {c.unit && <span style={{ color: 'var(--muted)', fontSize: 10 }}>{c.unit}</span>}
                      {c.category && <span style={{ color: 'var(--muted)', fontSize: 10, marginLeft: 'auto' }}>{c.category}</span>}
                    </div>
                  ))}
                  {showCreate && (
                    <div
                      onMouseDown={confirmCreate}
                      onMouseEnter={() => setHighlightedIndex(filteredMatches.length)}
                      onMouseLeave={() => setHighlightedIndex(-1)}
                      style={{
                        padding: '9px 12px', cursor: 'pointer', fontSize: 13, display: 'flex',
                        alignItems: 'center', gap: 6,
                        background: highlightedIndex === filteredMatches.length ? 'var(--bg)' : '',
                      }}
                    >
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 16, height: 16, borderRadius: '50%',
                        background: 'var(--accent)', color: '#fff', fontSize: 11, flexShrink: 0,
                      }}>+</span>
                      <span style={{ color: 'var(--accent)', fontSize: 13 }}>
                        Create <strong>"{commodityQuery.trim()}"</strong>
                      </span>
                      <span style={{ color: 'var(--muted)', fontSize: 10, marginLeft: 'auto' }}>custom</span>
                    </div>
                  )}
                </div>
              )}

              {/* Hints below input — shown only when dropdown is closed */}
              {!isDropdownOpen && commodityId && (() => {
                const sel = commodities.find(c => c.id === commodityId);
                return sel?.source_url ? (
                  <a href={sel.source_url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 10, color: 'var(--accent4)', textDecoration: 'underline', marginTop: 4, display: 'inline-block' }}>
                    {sel.source_url.length > 60 ? sel.source_url.slice(0, 60) + '…' : sel.source_url}
                  </a>
                ) : null;
              })()}
              {!isDropdownOpen && !commodityId && commodityQuery.trim() && (
                <>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, marginBottom: 8 }}>
                    Custom commodity — will be created on save
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label className="ca-label" style={{ marginBottom: 4 }}>Unit <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
                      <input
                        className="ca-input"
                        value={customUnit}
                        onChange={e => setCustomUnit(e.target.value)}
                        placeholder="e.g. $/mt, €/kg"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="ca-label" style={{ marginBottom: 4 }}>Currency <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
                      <input
                        className="ca-input"
                        value={customCurrency}
                        onChange={e => setCustomCurrency(e.target.value)}
                        placeholder="e.g. USD, EUR"
                        maxLength={3}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="ca-label" style={{ marginBottom: 4 }}>Category <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></label>
                      <select className="ca-select" value={customCategory} onChange={e => setCustomCategory(e.target.value)}>
                        <option value="">— none —</option>
                        <option value="Metal">Metal</option>
                        <option value="Energy">Energy</option>
                        <option value="Chemical">Chemical</option>
                        <option value="Labor">Labor</option>
                        <option value="PPI">PPI</option>
                        <option value="Freight">Freight</option>
                        <option value="FX">FX</option>
                        <option value="Custom">Custom</option>
                      </select>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })()}

        <div style={{ marginBottom: 14 }}>
          <label className="ca-label">Region</label>
          <input
            className="ca-input"
            value={region}
            onChange={e => setRegion(e.target.value)}
            placeholder="e.g. EU, GLOBAL, US, APAC"
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label className="ca-label">Source Type</label>
          <select className="ca-select" value={sourceType} onChange={e => setSourceType(e.target.value)}>
            <option value="manual">Manual</option>
            <option value="scrape_url">Scrape URL</option>
            <option value="upload">Upload</option>
            <option value="fixed">Fixed (constant value)</option>
          </select>
        </div>

        {sourceType === 'fixed' && (
          <div style={{ marginBottom: 14 }}>
            <label className="ca-label">Fixed Value</label>
            <input
              className="ca-input"
              type="number"
              step="0.0001"
              value={fixedValue}
              onChange={e => setFixedValue(e.target.value)}
              placeholder="e.g. 100.00"
            />
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
              Applied across all periods. No scraping, no per-quarter edits.
            </div>
          </div>
        )}

        {sourceType === 'scrape_url' && (
          <>
            <div style={{ marginBottom: 14 }}>
              <label className="ca-label">Scrape URL or IDBANK code</label>
              <input className="ca-input" value={scrapeUrl} onChange={e => setScrapeUrl(e.target.value)} placeholder="https://... or 010002077" />
              {detectedSource && (
                <span className="ca-badge" style={{
                  marginTop: 6, display: 'inline-block',
                  background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: 9,
                }}>
                  Detected: {detectedSource}
                </span>
              )}
            </div>
            {!detectedSource && (
              <div style={{ marginBottom: 14 }}>
                <label className="ca-label">Scrape Config (JSON)</label>
                <textarea
                  className="ca-input"
                  value={scrapeConfig}
                  onChange={e => setScrapeConfig(e.target.value)}
                  rows={3}
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
                />
              </div>
            )}
          </>
        )}

        {sourceType === 'upload' && (
          <div style={{ marginBottom: 14 }}>
            <label className="ca-label">
              File <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional — you can upload later from the row detail)</span>
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={e => setUploadFile(e.target.files[0] || null)}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="ca-btn ca-btn-ghost ca-btn-sm" type="button" onClick={() => fileRef.current?.click()}>
                {uploadFile ? uploadFile.name : 'Choose file…'}
              </button>
              {uploadFile && (
                <button className="ca-btn ca-btn-ghost ca-btn-sm" type="button" onClick={() => { setUploadFile(null); if (fileRef.current) fileRef.current.value = ''; }}>
                  ×
                </button>
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
              Columns: <code>material</code>, <code>region</code>, <code>period</code> (Q1-2024), <code>value</code>
            </div>
          </div>
        )}

        {/* Feedback */}
        {message && (
          <div style={{
            padding: '8px 12px', borderRadius: 6, fontSize: 11,
            background: message.type === 'success' ? 'var(--accent-dim)' : 'var(--accent2-dim)',
            color: message.type === 'success' ? 'var(--accent)' : 'var(--accent2)',
          }}>
            {message.text}
          </div>
        )}
      </div>

      <div className="ca-modal-footer">
        <button className="ca-btn ca-btn-ghost ca-btn-sm" onClick={onClose}>Cancel</button>
        <button className="ca-btn ca-btn-primary ca-btn-sm" onClick={handleAdd} disabled={saving}>
          {saving ? 'Adding...' : 'Add Index'}
        </button>
      </div>
    </Modal>
  );
}
