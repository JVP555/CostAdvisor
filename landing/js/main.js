const apiBase =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : 'https://api.costadvisor.org';

const appBase =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5173'
    : 'https://costadvisor.org';

// Check auth status — swap sign-in buttons to Dashboard if already signed in.
// ca_token is HttpOnly so we probe /auth/me instead of reading the cookie.
fetch(`${apiBase}/auth/me`, { credentials: 'include' })
  .then((r) => {
    if (!r.ok) return; // 401 = not signed in, leave everything as-is

    const dashboardBtn = `<a href="${appBase}" class="lp-btn lp-btn-primary lp-btn-lg">Go to Dashboard →</a>`;

    // Nav button
    const navBtn = document.getElementById('nav-auth-btn');
    if (navBtn) {
      navBtn.textContent = 'Dashboard →';
      navBtn.href = appBase;
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
  .catch(() => {/* network error — leave page as-is */});

// Progressive scroll-reveal: add .lp-reveal to elements via JS so the page
// renders fully without JS (Googlebot sees all content), and animations are
// treated as enhancement only.
document.addEventListener('DOMContentLoaded', () => {
  const selectors = [
    '.lp-how-step',
    '.lp-feature-card',
    '.lp-security-list li',
    '.lp-cta-inner',
    '.lp-problem-quote',
    '.lp-problem-answer',
  ];

  const elements = document.querySelectorAll(selectors.join(', '));

  elements.forEach((el) => el.classList.add('lp-reveal'));

  // Stagger siblings inside the same parent (features grid, steps)
  document.querySelectorAll('.lp-features-grid, .lp-how-steps, .lp-security-list').forEach((container) => {
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
