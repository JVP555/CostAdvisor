// ─── Theme system ─── mirrors frontend/src/utils/theme.js
// Add new themes here and the landing page will pick them up automatically.
const THEMES = [
  { id: 'default',     label: 'Mint'        },
  { id: 'light',       label: 'Paper'       },
  { id: 'amber',       label: 'Amber'       },
  { id: 'staminachem', label: 'StaminaChem' },
];

function applyTheme(id) {
  if (!id || id === 'default') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.dataset.theme = id;
  }
  try { localStorage.setItem('ca_theme', id || 'default'); } catch {}
  document.querySelectorAll('.lp-swatch').forEach((sw) => {
    sw.classList.toggle('active', sw.dataset.themeId === (id || 'default'));
  });
}

// Apply saved theme immediately — before DOMContentLoaded to avoid a flash.
(function () {
  let saved = 'default';
  try { saved = localStorage.getItem('ca_theme') || 'default'; } catch {}
  if (saved && saved !== 'default') {
    document.documentElement.dataset.theme = saved;
  }
}());

// ─── Auth probe ───
// Check auth status — swap sign-in buttons to Dashboard if already signed in.
// ca_token is HttpOnly so we probe /auth/me instead of reading the cookie.
const API_URL = 'https://api.costadvisor.org';
const APP_URL = 'https://costadvisor.org';

fetch(`${API_URL}/auth/me`, { credentials: 'include' })
  .then((r) => {
    if (!r.ok) return; // 401 = not signed in, leave everything as-is

    const dashboardBtn = `<a href="${APP_URL}" class="lp-btn lp-btn-primary lp-btn-lg">Go to Dashboard →</a>`;

    // Nav button
    const navBtn = document.getElementById('nav-auth-btn');
    if (navBtn) {
      navBtn.textContent = 'Dashboard →';
      navBtn.href = APP_URL;
      navBtn.classList.replace('lp-btn-outline', 'lp-btn-primary');
    }

    // Hero CTA — replace both buttons with a single dashboard link
    const heroCta = document.getElementById('hero-cta');
    if (heroCta) heroCta.innerHTML = dashboardBtn;

    // Bottom CTA section — replace buttons and hide the "no automated replies" note
    const ctaActions = document.getElementById('cta-actions');
    if (ctaActions) ctaActions.innerHTML = dashboardBtn;
    const ctaNote = document.getElementById('cta-note');
    if (ctaNote) ctaNote.style.display = 'none';
  })
  .catch(() => {/* backend not reachable — leave page as-is */});

// Progressive scroll-reveal: add .lp-reveal to elements via JS so the page
// renders fully without JS (Googlebot sees all content), and animations are
// treated as enhancement only.
document.addEventListener('DOMContentLoaded', () => {
  // Mark the current theme swatch as active and wire click handlers.
  let currentTheme = 'default';
  try { currentTheme = localStorage.getItem('ca_theme') || 'default'; } catch {}
  document.querySelectorAll('.lp-swatch').forEach((sw) => {
    sw.classList.toggle('active', sw.dataset.themeId === currentTheme);
    sw.addEventListener('click', () => applyTheme(sw.dataset.themeId));
  });
  const selectors = [
    '.lp-how-item',
    '.lp-showcase-row',
    '.lp-principle-card',
    '.lp-social-card',
    '.lp-sec-tile',
    '.lp-cta-inner',
    '.lp-problem-quote',
    '.lp-problem-answer',
    '.lp-problem-statement',
    '.lp-strip',
    '.lp-stat-card',
    '.lp-sectors',
  ];

  const elements = document.querySelectorAll(selectors.join(', '));

  elements.forEach((el) => el.classList.add('lp-reveal'));

  // Stagger siblings inside the same parent
  document.querySelectorAll('.lp-principles-grid, .lp-social-grid, .lp-security-tiles, .lp-how-list, .lp-stats-grid').forEach((container) => {
    Array.from(container.children).forEach((child, i) => {
      child.style.transitionDelay = `${i * 60}ms`;
    });
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
  );

  elements.forEach((el) => observer.observe(el));
});
