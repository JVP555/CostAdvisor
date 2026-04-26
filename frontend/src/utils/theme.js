export const THEMES = [
  { id: 'default', label: 'Mint', description: 'The original — green-on-charcoal terminal vibe.' },
  { id: 'light', label: 'Paper', description: 'Black-on-white, clean and high-contrast.' },
  { id: 'amber', label: 'Amber', description: 'Warm sepia dark — easier on the eyes at night.' },
];

const VALID = new Set(THEMES.map(t => t.id));
const STORAGE_KEY = 'ca_theme';

export function applyTheme(theme) {
  const name = VALID.has(theme) ? theme : 'default';
  if (name === 'default') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = name;
  }
}

export function cacheTheme(theme) {
  if (VALID.has(theme)) localStorage.setItem(STORAGE_KEY, theme);
}

export function getCachedTheme() {
  const t = localStorage.getItem(STORAGE_KEY);
  return VALID.has(t) ? t : 'default';
}
