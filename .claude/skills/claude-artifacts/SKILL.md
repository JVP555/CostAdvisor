---
name: claude-artifacts
description: Build polished, fully self-contained single-file web pages the way Claude Artifacts does — all CSS/JS inline, zero external runtime deps, responsive and accessible, works offline. Use for the CostAdvisor landing page (`landing/index.html`) and any standalone HTML deliverable. This is the closest fit to how the landing page is already built.
---

# claude-artifacts — self-contained, one-shot polished pages

Claude Artifacts produces a single file that renders beautifully on its own: everything inline, no external hosts, polished and responsive in one pass. The CostAdvisor **landing page is exactly this pattern**, so this skill is its native home.

## What Artifacts are known for
- **Self-contained** — one file. All CSS in a `<style>`, all JS in a `<script>`, assets as data-URIs. No external stylesheets/fonts/scripts to fetch at runtime.
- **Polished in one shot** — cohesive type/spacing/color, intentional motion, finished feel without a build step.
- **Responsive & accessible** — relative units, flex/grid, `max-width:100%` media, no horizontal body scroll; skip link, `:focus-visible`, `prefers-reduced-motion`, sensible contrast.
- **Robust** — renders without JS (progressive enhancement); graceful fallbacks.

## Apply it to `landing/index.html`
The landing page already follows these rules — keep them:
- **Single self-contained `index.html`** with inline CSS/JS. The one allowed external is **Chart.js via CDN, loaded `defer`** (used by Market Pulse + the FX monitor). Don't add new external deps.
- **Design tokens**: StaminaChem teal — `--blue:#00A99D`, `--teal:#00c8bc`; orange/green accents; mono font for labels. Reuse these, don't invent new colors.
- **Host-aware config**: `API_URL`/`APP_URL` switch on `dev.` host (dev → dev API/app). Only public, no-auth endpoints are fair game: `/api/access-requests`, `/api/demos/*`, `/api/fx-rates/public-daily`.
- **Core Web Vitals**: Chart.js `defer`; the live FX fetch (`loadDailyFx()`) is gated behind an IntersectionObserver on `#fx`; chart containers reserve height to avoid layout shift. Preserve these.
- **SEO**: keep `sitemap.xml`/`robots.txt`, canonical/OG/Twitter meta, and the JSON-LD (SoftwareApplication with StaminaChem as `publisher`, FAQPage). Update JSON-LD when content changes.
- **Brand/parent**: CostAdvisor is a **StaminaChem** product — parent link + real contact (laurent.thomas@staminachem.com, Vienna address, phones) live in the footer/legal; **not** in the nav (per the owner). No Calendly — use the in-app demo flow.
- **Deploy**: Cloudflare Workers static assets via `landing/wrangler.jsonc`; staging worker `costadvisor-landing-dev` on the `dev` branch.

## When publishing an Artifact via the Artifact tool
If rendering a *new* standalone artifact (not the landing page), the strict CSP blocks ALL external hosts — inline everything, embed images as data-URIs, set a stable `<title>` + `favicon`. (For tool-published artifacts, also load the separate `artifact-design` skill to calibrate design effort.)

## Self-contained checklist
- [ ] One file; CSS/JS inline; no new external requests (Chart.js CDN is the only sanctioned one here)
- [ ] Renders without JS; `prefers-reduced-motion` honored; skip link + `:focus-visible`
- [ ] Responsive; wide content (tables/charts) scrolls in its own container, body never scrolls sideways
- [ ] StaminaChem-teal tokens; parent/contact in footer, not nav
- [ ] Meta + JSON-LD updated to match content; CWV safeguards intact
