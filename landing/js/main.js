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
