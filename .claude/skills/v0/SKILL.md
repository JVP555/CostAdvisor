---
name: v0
description: Build UI the way Vercel's v0 does — component-driven, accessible-by-default, modern-minimal React. Use when creating or refactoring frontend components/pages and you want clean composition, a tight spacing/type scale, and accessible primitives. Adapts v0's shadcn/Tailwind instincts to this repo's React 18 + CSS-variable design system (the repo does NOT use Tailwind or shadcn).
---

# v0 — component-driven, accessible modern UI

Vercel's v0 generates React UI that is composable, accessible, and visually restrained. Channel its *method*, not its exact stack.

## What v0 is known for
- **Component decomposition** — break a screen into small, single-purpose components; compose, don't duplicate.
- **Accessible primitives** — semantic HTML, real `<button>`/`<label>`/`<nav>`, keyboard focus, `aria-*`, `:focus-visible`.
- **Disciplined design tokens** — one spacing scale, one type scale, a small color set; never ad-hoc magic numbers.
- **Restraint** — generous whitespace, few weights, subtle borders/shadows, one accent. Looks expensive because it's quiet.
- **States by default** — every list/async view ships empty, loading, error, and populated states.

## Apply it in THIS repo
- Stack is **React 18 + React Router 6 + custom CSS variables** — NOT Tailwind/shadcn. Do **not** introduce Tailwind, shadcn, or Radix without asking first.
- Reuse the existing design tokens (`--blue:#00A99D`, `--teal:#00c8bc`, `--accent3` orange, `--accent4` blue) and the established component patterns. Match the look of existing components (`EvoChart.jsx`, `DonutChart.jsx`, `IndexTrendChart.jsx`, `SeriesChart.jsx`) rather than inventing a new visual language.
- New full-page views → `pages/`; reusable UI → `components/`; pure helpers → `utils/`. (Project rule — don't create new top-level dirs.)
- All backend calls go through `api.js`; use `formatApiError()` for error display.
- Quarter granularity is the default time unit (`utils/quarters.js`).

## Checklist before calling a v0-style component done
- [ ] Decomposed into small components; no copy-paste blocks
- [ ] Semantic HTML + keyboard/focus accessible (`:focus-visible`, labels tied to inputs)
- [ ] Uses repo CSS tokens; no hard-coded one-off colors/spacings
- [ ] Empty / loading / error / populated states all handled
- [ ] Responsive (flex/grid, `max-width:100%` media, no horizontal body scroll)
- [ ] Matches the existing CostAdvisor/StaminaChem-teal aesthetic
