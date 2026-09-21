# Scrum 12 — Public Landing Page

**Status:** 🟡 In progress (built & deployed to staging; prod wiring pending)

## Goal
A public-facing marketing site for CostAdvisor, hosted separately from the app SPA for SEO. The page must render full HTML without JavaScript (Googlebot sees all content), load fast, and convert procurement visitors into access requests.

## Architecture Chosen
**Plain static HTML/CSS** in `landing/` directory, served via **Cloudflare Workers static assets** (`wrangler.jsonc`).

- No JS framework — keeps it lean and indexable
- One CSS file per section for clean component ownership
- Progressive enhancement: scroll-reveal runs only if JS is available
- Theme system shared with the app (`localStorage.ca_theme`, `data-theme` attribute on `<html>`)

| Environment | URL | Branch |
|---|---|---|
| Staging | `dev.costadvisor.org` | `dev` |
| Production | `www.costadvisor.org` | `main` |

## Page Structure

### Sections (in order)

| Section | CSS file | Notes |
|---|---|---|
| Nav | `nav.css` | Sticky glass nav; theme swatches; sign-in / Dashboard button (auth-aware) |
| Hero | `hero.css` | 2-col: headline + CTA left, product mockup card right |
| Trust strip | `strip.css` | 3 signal pills: live indices · should-cost · AI briefs |
| Problem | `problem.css` | Full-width centred editorial quote + accent statement |
| How it works | `how.css` | Numbered list 01/02/03, StringTune-style; hover accent on number |
| Feature showcase | `showcase.css` | 3 alternating full-width rows: formula builder, evolution chart, brief snippet |
| Principles | `principles.css` | 4-card grid: index-linked · one source of truth · RLS isolation · AI at brief layer |
| Social proof | `social.css` | 2 procurement quote cards |
| Security | `security.css` | 6 icon-tile grid; top row has headline + "Request security overview" CTA |
| CTA | `cta.css` | Centred, full-bleed; invite-only badge; mailto access request |
| Footer | `footer.css` | 3-column links: Product / Access / Legal |

### Key Files

| Path | Description |
|---|---|
| `landing/index.html` | Full page markup |
| `landing/css/tokens.css` | CSS variables for all 4 themes (`default`, `light`, `amber`, `staminachem`) |
| `landing/css/base.css` | Reset, typography, button classes (`.lp-btn-*`) |
| `landing/css/nav.css` | Sticky glass nav + theme swatch styles |
| `landing/css/strip.css` | 3-pill trust strip |
| `landing/css/hero.css` | 2-col hero + product mockup card styles |
| `landing/css/problem.css` | Editorial full-width problem section |
| `landing/css/how.css` | Numbered how-it-works list |
| `landing/css/showcase.css` | 3 alternating feature showcase rows + visual mock card styles |
| `landing/css/principles.css` | 4-principle card grid |
| `landing/css/social.css` | 2-quote social proof cards |
| `landing/css/security.css` | 6-tile security grid |
| `landing/css/cta.css` | Bottom call-to-action section |
| `landing/css/footer.css` | Footer layout |
| `landing/js/main.js` | Auth probe (`/auth/me`), theme switcher, scroll-reveal |
| `landing/favicon.svg` | Geometric C logo (donut ring, right side open) in brand green |
| `landing/wrangler.jsonc` | Cloudflare Workers static assets deploy config |
| `landing/sitemap.xml` | SEO sitemap |
| `landing/robots.txt` | Search engine directives |

## JavaScript Behaviour (`landing/js/main.js`)

### Theme system
- `THEMES` array mirrors `frontend/src/utils/theme.js` — add themes there first, then mirror here
- `applyTheme(id)` sets `document.documentElement.dataset.theme` and writes `localStorage.ca_theme`
- IIFE at top of file applies saved theme before `DOMContentLoaded` — prevents flash
- Swatch click handlers wired in `DOMContentLoaded`

### Auth probe
- `fetch('http://localhost:8000/auth/me', { credentials: 'include' })` on load
- If 200: swap nav "Sign in" → "Dashboard →", replace hero and bottom CTAs with a single dashboard link
- If 401 or network error: leave page as-is (invite flow shows)
- Prod URLs wired manually when deploying

### Scroll reveal
- JS adds `.lp-reveal` class to target elements after DOM ready
- `IntersectionObserver` adds `.visible` when element enters viewport
- Page renders fully without JS (progressive enhancement — Googlebot sees everything)

## Theme Support
All CSS uses variables from `tokens.css`. Four themes work on the landing page:

| Theme ID | Label | Background | Accent |
|---|---|---|---|
| `default` | Mint | `#0a0c10` | `#4fffb0` |
| `light` | Paper | `#f6f7f9` | `#0a7c42` |
| `amber` | Amber | `#1a130d` | `#ffb347` |
| `staminachem` | StaminaChem | `#f5f7fa` | `#00A99D` |

`--nav-glass-bg`, `--accent-glow`, `--accent-dim`, `--on-accent` added to each theme block so nav, glows, and button text all adapt correctly.

## Sign-in / CTA Links
Hardcoded to localhost for local dev. Wire to production URLs manually before deploying:

| Element | Localhost | Production |
|---|---|---|
| Nav "Sign in" | `http://localhost:8000/auth/login` | `https://costadvisor.org/auth/login` |
| Hero CTA | `http://localhost:8000/auth/login` | `https://costadvisor.org/auth/login` |
| Auth probe | `http://localhost:8000/auth/me` | `https://api.costadvisor.org/auth/me` |
| Dashboard redirect (signed in) | `http://localhost:5173` | `https://costadvisor.org` |
| Logout redirect | `http://localhost:3333` | `https://www.costadvisor.org` |

## Logout Redirect
`frontend/src/AuthContext.jsx` sets `window.location.href = 'http://localhost:3333'` (landing page) after sign-out. Update to `https://www.costadvisor.org` for production.

## SEO
- `<title>`, `<meta description>`, Open Graph, Twitter card all set in `<head>`
- `<link rel="canonical" href="https://www.costadvisor.org/" />`
- `sitemap.xml` and `robots.txt` present in `landing/`
- Full HTML visible without JS — no blank shell

## Acceptance Criteria

| # | Criterion | Status |
|---|---|---|
| 1 | `landing/` directory with static HTML/CSS | ✅ Done |
| 2 | `wrangler.jsonc` for Cloudflare Workers deploy | ✅ Done |
| 3 | `sitemap.xml` and `robots.txt` | ✅ Done |
| 4 | All content sections present | ✅ Done |
| 5 | CTA links to app login; Privacy & Terms in footer | ✅ Done |
| 6 | Scroll-reveal is progressive enhancement | ✅ Done |
| 7 | Invite-only messaging with mailto flow | ✅ Done |
| 8 | Theme selector (4 swatches) in nav, shared `ca_theme` key | ✅ Done |
| 9 | Auth-aware nav (sign in → Dashboard if signed in) | ✅ Done |
| 10 | Geometric C favicon | ✅ Done |
| 11 | Landing page deployed and live at `www.costadvisor.org` | 🔴 Pending (Cloudflare dashboard wiring) |
| 12 | Google Search Console shows page indexed | 🔴 Pending |
| 13 | Core Web Vitals pass (LCP < 2.5 s) | 🔴 Pending |

## Local Dev
```bash
# Serve landing page at localhost:3333
npx serve landing -p 3333

# Or with live reload
npx browser-sync start --server landing --port 3333 --watch
```
