import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { THEMES } from '../utils/theme';

/* Theme switcher — a `.ca-menu` dropdown between TeamSelector and the account
 * menu in Navbar.jsx, mirroring TeamSelector's exact dropdown/keyboard pattern
 * (same shared primitives, same roving-tabindex model). The full-page picker
 * on Profile.jsx stays as-is for browsing descriptions; this is the fast path
 * that doesn't require leaving the current page. Both call the same
 * `setTheme()` from AuthContext, so there's one source of truth for
 * apply + cache + persist. */
export default function ThemeSelector() {
  const { user, setTheme } = useAuth();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const itemRefs = useRef([]);

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') closeMenu(true); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const activeTheme = user?.theme || 'default';
    const idx = Math.max(0, THEMES.findIndex(t => t.id === activeTheme));
    setActiveIdx(idx);
    const id = requestAnimationFrame(() => itemRefs.current[idx]?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, user?.theme]);

  const activeThemeId = user?.theme || 'default';
  const activeTheme = THEMES.find(t => t.id === activeThemeId) || THEMES[0];

  const focusItem = (i) => {
    const next = (i + THEMES.length) % THEMES.length;
    setActiveIdx(next);
    itemRefs.current[next]?.focus();
  };

  const onMenuKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focusItem(activeIdx + 1); break;
      case 'ArrowUp': e.preventDefault(); focusItem(activeIdx - 1); break;
      case 'Home': e.preventDefault(); focusItem(0); break;
      case 'End': e.preventDefault(); focusItem(THEMES.length - 1); break;
      case 'Tab': closeMenu(); break;
      default: break;
    }
  };

  const selectTheme = (themeId) => {
    setTheme(themeId);
    setOpen(false);
  };

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="ca-theme-menu"
        title={`Theme: ${activeTheme.label}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'transparent',
          border: `1px solid ${open || hover ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 999, padding: '5px 10px', cursor: 'pointer',
          color: open || hover ? 'var(--accent)' : 'var(--text-secondary)',
          fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
          transition: 'border-color .15s, color .15s',
        }}
      >
        {/* Wrapping the dot in a data-theme scope picks up that theme's real
            --accent, same trick Profile.jsx's ThemePreview card uses. */}
        <span data-theme={activeTheme.id} aria-hidden style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
          background: 'var(--accent)', border: '1px solid var(--border)',
        }} />
        <span>{activeTheme.label}</span>
        <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
      </button>

      {open && (
        <div
          id="ca-theme-menu"
          className="ca-menu"
          role="menu"
          aria-label="Switch theme"
          onKeyDown={onMenuKeyDown}
          style={{ minWidth: 220 }}
        >
          <div className="ca-menu-label">Theme</div>
          {THEMES.map((t, i) => {
            const isActive = t.id === activeThemeId;
            return (
              <button
                key={t.id}
                ref={el => { itemRefs.current[i] = el; }}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                className="ca-menu-item"
                tabIndex={i === activeIdx ? 0 : -1}
                onFocus={() => setActiveIdx(i)}
                onClick={() => selectTheme(t.id)}
                title={t.description}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                  <span data-theme={t.id} aria-hidden style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--accent)', border: '1px solid var(--border)',
                  }} />
                  <span style={{
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: isActive ? 'var(--accent)' : 'var(--text)',
                  }}>
                    {t.label}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
