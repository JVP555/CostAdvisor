// ─── Theme system ───
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

// Apply saved theme immediately to avoid a flash before DOMContentLoaded.
(function () {
  let saved = 'default';
  try { saved = localStorage.getItem('ca_theme') || 'default'; } catch {}
  if (saved && saved !== 'default') {
    document.documentElement.dataset.theme = saved;
  }
}());

// ─── Auth probe ───
// ca_token is HttpOnly so we probe /auth/me instead of reading the cookie.
const API_URL = 'https://api.costadvisor.org';
const APP_URL = 'https://costadvisor.org';

fetch(`${API_URL}/auth/me`, { credentials: 'include' })
  .then((r) => {
    if (!r.ok) return;

    const dashboardBtn = `<a href="${APP_URL}" class="lp-btn lp-btn-primary lp-btn-lg">Go to Dashboard →</a>`;

    const navBtn = document.getElementById('nav-auth-btn');
    if (navBtn) {
      navBtn.textContent = 'Dashboard →';
      navBtn.href = APP_URL;
      navBtn.classList.replace('lp-btn-outline', 'lp-btn-primary');
    }

    const heroCta = document.getElementById('hero-cta');
    if (heroCta) heroCta.innerHTML = dashboardBtn;

    // Replace the email form with a dashboard link
    const ctaActions = document.getElementById('cta-actions');
    if (ctaActions) ctaActions.innerHTML = dashboardBtn;
    const ctaNote = document.getElementById('cta-note');
    if (ctaNote) ctaNote.style.display = 'none';
  })
  .catch(() => {/* backend not reachable — leave page as-is */});

// ─── Gap chart ───
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

let gapChartInstance = null;

function initGapChart() {
  const canvas = document.getElementById('gapChart');
  if (!canvas || typeof Chart === 'undefined' || gapChartInstance) return;

  const shouldCostColor = cssVar('--chart-should-cost') || '#4fffb0';
  const supplierColor   = cssVar('--chart-supplier')    || '#ff6b6b';
  const gridColor       = cssVar('--chart-grid')        || 'rgba(255,255,255,0.05)';
  const tickColor       = cssVar('--chart-tick')        || '#4d5680';

  const supplierFill = supplierColor.startsWith('#')
    ? hexToRgba(supplierColor, 0.10)
    : 'rgba(255,107,107,0.10)';

  const quarters       = ['Q1 23','Q2 23','Q3 23','Q4 23','Q1 24','Q2 24','Q3 24','Q4 24','Q1 25','Q2 25'];
  const shouldCostData = [300, 306, 310, 314, 319, 325, 330, 336, 339, 343];
  const supplierData   = [302, 309, 316, 325, 337, 350, 361, 371, 376, 382];

  gapChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: quarters,
      datasets: [
        {
          label: 'Should-cost',
          data: shouldCostData,
          borderColor: shouldCostColor,
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: shouldCostColor,
          borderWidth: 2.5,
        },
        {
          label: 'Supplier price',
          data: supplierData,
          borderColor: supplierColor,
          backgroundColor: supplierFill,
          fill: '-1',
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: supplierColor,
          borderWidth: 2.5,
        },
      ],
    },
    options: {
      animation: { duration: 2000, easing: 'easeInOutCubic' },
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: €${ctx.raw}/t`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: tickColor, font: { size: 11 } },
        },
        y: {
          min: 280,
          grid: { color: gridColor },
          ticks: {
            color: tickColor,
            font: { size: 11 },
            callback: (v) => '€' + v,
          },
        },
      },
    },
  });
}

// ─── ROI calculator ───
function calcLpROI() {
  const cat        = +document.getElementById('roiCat').value;
  const spendSlider = +document.getElementById('roiSpend').value;
  const gap        = +document.getElementById('roiGap').value;
  const spendM     = spendSlider * 0.5; // slider 1-40 → $0.5M–$20M

  document.getElementById('roiCatOut').textContent  = cat;
  document.getElementById('roiGapOut').textContent  = gap + '%';

  const spendDisplay = spendM >= 1
    ? '$' + (spendM === Math.floor(spendM) ? spendM : spendM.toFixed(1)) + 'M'
    : '$' + (spendM * 1000) + 'k';
  document.getElementById('roiSpendOut').textContent = spendDisplay;

  const annual = cat * spendM * 1e6 * (gap / 100);
  const result = annual >= 1e6
    ? '$' + (annual / 1e6).toFixed(1) + 'M'
    : '$' + Math.round(annual / 1000) + 'k';
  document.getElementById('roiResult').textContent = result;
}

// ─── FAQ accordion ───
function toggleLpFaq(btn) {
  const answer = btn.nextElementSibling;
  const isOpen = btn.classList.contains('open');

  // Close all
  document.querySelectorAll('.lp-faq-btn').forEach((b) => {
    b.classList.remove('open');
    b.setAttribute('aria-expanded', 'false');
    b.nextElementSibling.style.maxHeight = '0';
  });

  // Open clicked item if it was closed
  if (!isOpen) {
    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    answer.style.maxHeight = answer.scrollHeight + 'px';
  }
}

// ─── CTA form ───
function handleCtaSubmit(e) {
  e.preventDefault();
  const emailEl = document.getElementById('ctaEmail');
  if (!emailEl) return;
  const email   = emailEl.value.trim();
  const subject = encodeURIComponent('Early Access Request');
  const body    = encodeURIComponent(`Email: ${email}\nCompany:\nRole:\nCategory:\nUse case:`);
  window.location.href = `mailto:access@costadvisor.org?subject=${subject}&body=${body}`;
  const form = document.getElementById('ctaForm');
  const ok   = document.getElementById('ctaFormOk');
  if (form) form.style.display = 'none';
  if (ok)   ok.style.display = 'block';
}

// ─── Count-up for stat numbers ───
function animateLpStat(el) {
  const target   = parseFloat(el.dataset.countTo);
  const prefix   = el.dataset.countPrefix  || '';
  const suffix   = el.dataset.countSuffix  || '';
  const duration = 2000;
  const startTime = performance.now();

  function step(now) {
    const t    = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
    el.textContent = prefix + Math.round(ease * target) + suffix;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ─── DOMContentLoaded ───
document.addEventListener('DOMContentLoaded', () => {

  // Theme swatches
  let currentTheme = 'default';
  try { currentTheme = localStorage.getItem('ca_theme') || 'default'; } catch {}
  document.querySelectorAll('.lp-swatch').forEach((sw) => {
    sw.classList.toggle('active', sw.dataset.themeId === currentTheme);
    sw.addEventListener('click', () => applyTheme(sw.dataset.themeId));
  });

  // Initialize ROI calculator defaults
  if (document.getElementById('roiCat')) calcLpROI();

  // Scroll-reveal elements
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
    '.lp-gapchart-wrap',
    '.lp-roi-card',
    '.lp-faq-item',
  ];

  const elements = document.querySelectorAll(selectors.join(', '));
  elements.forEach((el) => el.classList.add('lp-reveal'));

  // Stagger sibling children inside grid/list containers
  document.querySelectorAll(
    '.lp-principles-grid, .lp-social-grid, .lp-security-tiles, .lp-how-list, .lp-stats-grid, .lp-faq-list'
  ).forEach((container) => {
    Array.from(container.children).forEach((child, i) => {
      child.style.transitionDelay = `${i * 60}ms`;
    });
  });

  // Reveal observer
  const revealObs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
  );
  elements.forEach((el) => revealObs.observe(el));

  // Gap chart — init when section enters view so animation fires on scroll
  const gapSection = document.getElementById('gapchart');
  if (gapSection) {
    const gapObs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          initGapChart();
          gapObs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    gapObs.observe(gapSection);
  }

  // Count-up stat numbers on first view
  const statsSection = document.querySelector('.lp-stats');
  if (statsSection) {
    let fired = false;
    const statsObs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !fired) {
          fired = true;
          statsSection.querySelectorAll('[data-count-to]').forEach(animateLpStat);
          statsObs.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    statsObs.observe(statsSection);
  }

});
