import { useState, useMemo, useEffect, useRef } from 'react';

/**
 * Generalized interactive SVG line chart (stock-app style), used by the Index
 * Library drill-in for BOTH FX daily series and quarterly index series.
 *
 * Features: hover crosshair + tooltip, a trailing-window range selector, and
 * two-point selection (click point A then point B) that shades the band and
 * reports the selected slice back via `onWindowChange` for statistics.
 *
 * Props:
 *   points        : ascending array of { label, value, date? }
 *                   (date present → x-axis/annualisation use calendar dates;
 *                    absent → uses the `label`, e.g. "Q1-26")
 *   rangeOptions  : [[label, count], ...] trailing-window presets; count in
 *                   points (e.g. days for FX, quarters for index). Infinity = All.
 *   valueDecimals : optional fixed decimals (else auto by magnitude)
 *   unit          : optional unit string for the tooltip
 *   onWindowChange: (slice) => void — called with the effective slice (the
 *                   selection if two points are picked, else the full window)
 */
export default function SeriesChart({ points, comparePoints, rangeOptions, valueDecimals, unit, onWindowChange }) {
  const opts = rangeOptions && rangeOptions.length ? rangeOptions : [['All', Infinity]];
  const [rangeIdx, setRangeIdx] = useState(opts.length - 1); // default 'All'
  const [hover, setHover] = useState(null);
  const [selA, setSelA] = useState(null);
  const [selB, setSelB] = useState(null);

  const all = useMemo(
    () => (points || []).filter(p => p && p.value != null && Number.isFinite(Number(p.value))),
    [points],
  );

  const count = opts[Math.min(rangeIdx, opts.length - 1)][1];
  const windowed = useMemo(
    () => (count === Infinity ? all : all.slice(Math.max(0, all.length - count))),
    [all, count],
  );

  // Effective slice: the A–B selection if both set, else the whole window.
  const selLo = selA != null && selB != null ? Math.min(selA, selB) : null;
  const selHi = selA != null && selB != null ? Math.max(selA, selB) : null;
  const slice = useMemo(
    () => (selLo != null ? windowed.slice(selLo, selHi + 1) : windowed),
    [windowed, selLo, selHi],
  );

  // Emit the slice only when the window/selection actually changes — `points`
  // (hence `slice`) is a fresh array each parent render, so guarding on a stable
  // key avoids an infinite setState↔render loop with the parent's stats state.
  const lastKey = useRef(null);
  useEffect(() => {
    const key = `${count}|${selLo}|${selHi}|${windowed.length}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    onWindowChange?.(slice);
  }, [count, selLo, selHi, windowed.length, slice, onWindowChange]);

  const W = 760, H = 220;
  const PAD = { l: 52, r: 12, t: 14, b: 26 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  // Optional second series (Compare mode) — aligned to the primary by label.
  const compareByLabel = useMemo(() => {
    const m = {};
    (comparePoints || []).forEach(p => { if (p && p.value != null) m[p.label] = Number(p.value); });
    return m;
  }, [comparePoints]);
  const hasCompare = (comparePoints || []).length > 0;

  const N = windowed.length;
  const vals = windowed.map(d => Number(d.value));
  const cmpVals = hasCompare ? windowed.map(d => compareByLabel[d.label]).filter(v => v != null) : [];
  const minRaw = N ? Math.min(...vals, ...cmpVals) : 0;
  const maxRaw = N ? Math.max(...vals, ...cmpVals) : 1;
  const padV = (maxRaw - minRaw || maxRaw || 1) * 0.06;
  const minV = minRaw - padV, maxV = maxRaw + padV;
  const dec = valueDecimals != null ? valueDecimals : (maxRaw < 2 ? 4 : maxRaw < 100 ? 2 : 0);

  const xScale = i => PAD.l + plotW * (N <= 1 ? 0.5 : i / (N - 1));
  const yScale = v => PAD.t + plotH * (1 - (v - minV) / (maxV - minV || 1));

  const fmtVal = v => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(dec));
  const fmtX = d => {
    if (d.date) {
      const dt = new Date(d.date + 'T00:00:00');
      const spanDays = (new Date(windowed[N - 1].date) - new Date(windowed[0].date)) / 86400000;
      return spanDays > 200
        ? dt.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
        : dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
    }
    return d.label;
  };

  const rangeRow = opts.length > 1 && (
    <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
      {opts.map(([label], i) => (
        <button key={label}
          className={`ca-btn ca-btn-sm ${i === rangeIdx ? 'ca-btn-primary' : 'ca-btn-ghost'}`}
          onClick={() => { setRangeIdx(i); setSelA(null); setSelB(null); setHover(null); }}>
          {label}
        </button>
      ))}
    </div>
  );

  if (N < 2) {
    return (
      <div>
        {rangeRow}
        <div style={{ color: 'var(--muted)', fontSize: 12, padding: 24, textAlign: 'center' }}>Not enough data to chart.</div>
      </div>
    );
  }

  const up = vals[N - 1] >= vals[0];
  const stroke = up ? 'var(--accent2)' : 'var(--danger)';

  // y grid
  const range = maxV - minV;
  const gridLines = [];
  let step = Math.pow(10, Math.floor(Math.log10(range || 1)));
  if (range / step < 3) step /= 2;
  if (range / step > 8) step *= 2;
  for (let v = Math.ceil(minV / step) * step; v <= maxV; v += step) gridLines.push(v);

  const linePath = windowed.map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(Number(d.value)).toFixed(1)}`).join(' ');
  const fillPath = `${linePath} L${xScale(N - 1).toFixed(1)},${(H - PAD.b).toFixed(1)} L${xScale(0).toFixed(1)},${(H - PAD.b).toFixed(1)} Z`;
  // Compare line (Custom series), drawn over the primary (Default) when present.
  const cmpStroke = 'var(--accent4)';
  let comparePath = '';
  if (hasCompare) {
    let started = false;
    windowed.forEach((d, i) => {
      const v = compareByLabel[d.label];
      if (v == null) { started = false; return; }
      comparePath += `${started ? 'L' : 'M'}${xScale(i).toFixed(1)},${yScale(v).toFixed(1)} `;
      started = true;
    });
  }
  const labelStep = Math.max(1, Math.ceil(N / 6));

  const idxFromEvent = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fracX = (e.clientX - rect.left) / rect.width;
    const internalX = fracX * W;
    let idx = Math.round(((internalX - PAD.l) / plotW) * (N - 1));
    return Math.max(0, Math.min(N - 1, idx));
  };
  const onMove = e => setHover(idxFromEvent(e));
  const onClick = e => {
    const idx = idxFromEvent(e);
    if (selA == null || (selA != null && selB != null)) { setSelA(idx); setSelB(null); } // start new selection
    else setSelB(idx);
  };

  const hp = hover != null ? windowed[hover] : null;
  const prev = hover != null && hover > 0 ? windowed[hover - 1] : null;
  const hx = hover != null ? xScale(hover) : 0;
  const hy = hp ? yScale(Number(hp.value)) : 0;
  let dDelta = null, dPct = null;
  if (hp && prev) { dDelta = Number(hp.value) - Number(prev.value); dPct = (dDelta / Number(prev.value)) * 100; }
  const tipLeftPct = hover != null ? Math.max(4, Math.min(96, (hx / W) * 100)) : 0;

  const bandX1 = selLo != null ? xScale(selLo) : 0;
  const bandX2 = selHi != null ? xScale(selHi) : 0;

  return (
    <div className="ca-fade-in" style={{ width: '100%' }}>
      {rangeRow}
      <div style={{ position: 'relative', width: '100%' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto', cursor: 'crosshair' }}
          onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={onClick}>
          {gridLines.map((v, i) => (
            <g key={i}>
              <line x1={PAD.l} y1={yScale(v)} x2={W - PAD.r} y2={yScale(v)} stroke="var(--chart-grid, var(--border))" strokeWidth={0.5} />
              <text x={PAD.l - 6} y={yScale(v) + 3} textAnchor="end" fill="var(--muted)" fontSize={9} fontFamily="'JetBrains Mono', monospace">
                {fmtVal(v)}
              </text>
            </g>
          ))}

          {/* selection band */}
          {selLo != null && (
            <g>
              <rect x={Math.min(bandX1, bandX2)} y={PAD.t} width={Math.abs(bandX2 - bandX1)} height={plotH}
                fill="var(--accent4)" opacity={0.12} />
              {[selLo, selHi].map((si, k) => (
                <line key={k} x1={xScale(si)} y1={PAD.t} x2={xScale(si)} y2={H - PAD.b} stroke="var(--accent4)" strokeWidth={1} />
              ))}
            </g>
          )}

          <path d={fillPath} fill={stroke} opacity={0.08} />
          <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.6} />
          {hasCompare && comparePath && (
            <path d={comparePath} fill="none" stroke={cmpStroke} strokeWidth={1.6} strokeDasharray="5 3" />
          )}

          {/* selection endpoint markers */}
          {selLo != null && [selLo, selHi].map((si, k) => (
            <circle key={k} cx={xScale(si)} cy={yScale(vals[si])} r={3.5} fill="var(--accent4)" stroke="var(--surface)" strokeWidth={1.5} />
          ))}

          {/* hover crosshair */}
          {hp && (
            <g>
              <line x1={hx} y1={PAD.t} x2={hx} y2={H - PAD.b} stroke="var(--muted)" strokeWidth={0.75} strokeDasharray="3 3" />
              <circle cx={hx} cy={hy} r={3} fill={stroke} stroke="var(--surface)" strokeWidth={1.5} />
            </g>
          )}

          {windowed.map((d, i) => (
            i % labelStep === 0 && (
              <text key={i} x={xScale(i)} y={H - 6} textAnchor="middle" fill="var(--muted)" fontSize={9} fontFamily="'JetBrains Mono', monospace">
                {fmtX(d)}
              </text>
            )
          ))}
        </svg>

        {hp && (
          <div style={{
            position: 'absolute', top: 0, left: `${tipLeftPct}%`, transform: 'translateX(-50%)',
            background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6,
            padding: '6px 9px', fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
            pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 5, boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
          }}>
            <div style={{ color: 'var(--text)', fontWeight: 600 }}>{Number(hp.value).toFixed(dec)}{unit ? `/${unit}` : ''}</div>
            <div style={{ color: 'var(--muted)', fontSize: 10 }}>{hp.date || hp.label}</div>
            {dDelta != null && (
              <div style={{ color: dDelta >= 0 ? 'var(--accent2)' : 'var(--danger)', fontSize: 10, marginTop: 2 }}>
                {dDelta >= 0 ? '▲' : '▼'} {Math.abs(dDelta).toFixed(dec)} ({dPct >= 0 ? '+' : ''}{dPct.toFixed(2)}%) vs prev
              </div>
            )}
          </div>
        )}
      </div>

      {hasCompare && (
        <div style={{ display: 'flex', gap: 14, fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
          <span><span style={{ display: 'inline-block', width: 14, height: 0, borderTop: `2px solid ${stroke}`, verticalAlign: 'middle', marginRight: 4 }} />Default</span>
          <span><span style={{ display: 'inline-block', width: 14, height: 0, borderTop: `2px dashed ${cmpStroke}`, verticalAlign: 'middle', marginRight: 4 }} />Custom</span>
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
        {selLo != null
          ? <>Selected {windowed[selLo].date || windowed[selLo].label} → {windowed[selHi].date || windowed[selHi].label} · <button className="ca-btn ca-btn-sm ca-btn-ghost" style={{ padding: '0 6px' }} onClick={() => { setSelA(null); setSelB(null); }}>clear</button></>
          : 'Click two points on the chart to analyse a span.'}
      </div>
    </div>
  );
}
