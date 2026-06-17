# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CostAdvisor is a procurement cost-intelligence platform. Users build should-cost models by composing commodity index-linked components, then run evolution analysis, squeeze/desqueeze calculations, and AI-generated cost briefs. Multi-tenant (per-team RLS), Google OAuth, deployed on Cloudflare (frontend) + Railway (backend).

## Development Commands

**Prerequisites**: PostgreSQL and Redis must be running locally.

```bash
# First-time setup
cd backend && python -m venv venv && source venv/bin/activate && pip install -r requirements-dev.txt
cd frontend && npm install

# Start both services (backend :8000, frontend :5173)
./start.sh

# Backend only (from backend/)
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend only (from frontend/)
npx vite --host

# Run backend tests
cd backend && pytest

# Run a single test file
cd backend && pytest tests/test_rls.py

# Database migrations
cd backend && alembic upgrade head
cd backend && alembic revision --autogenerate -m "description"

# Build frontend for Cloudflare
cd frontend && npm run build
```

## Architecture

### Deployment

Two environments, same shape:

| | Production | Staging |
|---|---|---|
| Website | costadvisor.org | dev.costadvisor.org |
| API | api.costadvisor.org | api-dev.costadvisor.org |
| Branch | `main` | `dev` |

- **Frontend**: Cloudflare Workers serving compiled React SPA (`frontend/dist`)
- **Backend**: FastAPI on Railway
- **Database**: PostgreSQL on Railway (separate per environment)
- **Jobs**: Redis + Celery on Railway
- **AI**: Ollama on a private Hetzner VM, reachable only over Tailscale

Push to `main` → production deploy; push to `dev` → staging deploy.

### Backend (`backend/`)

FastAPI app at `app/main.py`. All API routes are prefixed `/api/` except auth (`/auth/`).

**Key service layer** (`app/services/`):
- `costing_engine.py` — the core calculation engine: should-cost, evolution tracking, squeeze/desqueeze, brief generation. Most complex file in the repo.
- `data_resolver.py` — resolves index/price/volume values for a cost model at a given period
- `scraper.py` + `scrapers/` — orchestrates and runs nightly scrapes from ECB, EIA, Eurostat, FRED, World Bank
- `narrative.py` + `ollama.py` — AI narrative generation via Ollama (llama3.1:8b)
- `incoterm_normalizer.py` — normalises landed cost adjustments by INCOTERM
- `file_parser.py` — Excel/CSV upload parsing (openpyxl + pandas)

**Data model** (`app/models/`): `CostModel → FormulaVersion → FormulaComponent` is the cost formula hierarchy. Each component can reference a `CommodityIndex` for live pricing. `AuditLog` tracks all mutations. `FreightLane` stores shipping cost adjustments.

**Multi-tenancy**: Every model is filtered by team via Postgres Row-Level Security (RLS). The active team context is set per-request in `app/database.py`. Never bypass RLS when writing queries.

**Background jobs** (`app/tasks/scrape_indexes.py`): Celery tasks — `scrape_all` (all registered commodity scrapers + FX sync), `scrape_one` (single commodity), and `scrape_team_sources` (team-configured URL sources → `IndexOverride`).

### Frontend (`frontend/src/`)

React 18 + React Router 6 SPA. Auth state lives in `AuthContext.jsx` (Google OAuth + JWT). The Vite dev server proxies `/api/*` and `/auth/*` to `localhost:8000`.

**Key pages**: `CostModelBuilder.jsx`, `Evolution.jsx`, `Brief.jsx`, `Squeeze.jsx`, `Indexes.jsx` — these map directly to the core costing workflows.

**HTTP client**: `api.js` (Axios instance with base config). All backend calls go through it.

**Charts**: Custom components (`EvoChart.jsx`, `DonutChart.jsx`, `IndexTrendChart.jsx`) — not a third-party chart library.

## Working Rules

**Never push to remote** unless the user explicitly says "push" or "deploy". Committing locally is fine; pushing is not automatic. When pushing, always push to the `dev` branch only — never push directly to `main`.

**Commit after every implementation.** After completing each feature, scrum, or meaningful code change, create a git commit. Skip only if the user explicitly says "don't commit" or "skip commit".

**All `.md` documentation files go in `jvpdocs/`** unless a different location is explicitly specified. Never create markdown docs in the repo root or any other directory by default.

**Update TODO subtasks when features change.** When a new feature, fix, phase, or behaviour change is added within a scrum mid-implementation, add the relevant subtask(s) under that scrum in the TODO section below, with the correct status icon. Update status icons as work progresses.

**Follow existing folder structure.** New backend files go in the same layer they belong to (`routers/`, `services/`, `models/`, `schemas/`, `tasks/`). New frontend files go under `pages/` (full-page views), `components/` (reusable UI), or `utils/` (pure helpers). Do not create new top-level directories without discussing first.

**Comment non-obvious code.** When adding logic whose *why* is not immediately clear from the code itself — a subtle invariant, a workaround, a business rule that isn't obvious — add a short inline comment explaining it. Do not comment obvious code or repeat what the identifiers already say.

**Security & SOC 2 compliance:**

_Enterprise data isolation & access control_
- Tenancy is team-scoped. Every tenant-facing table has a Postgres RLS policy (`tenant_isolation`) enforced at the DB level — see the `h8i9j0k1l2m3_enable_rls` migration. Never write a raw query that bypasses this; the `bypass_rls_var` context in `database.py` exists only for Celery tasks, seed scripts, and migrations.
- Production data access or debugging must go through `routers/admin.py` (authenticated, logged) — never via direct DB queries.
- `TeamMembership.role` stores `owner/admin/member` as a system field (used for access-control fallback and ownership tracking). Displayed team roles are created via the Role model and assigned through `TeamMemberRole`. When adding features that touch sensitive outputs (e.g. exporting negotiation briefs, viewing raw cost data), gate them on the appropriate `require_permission()` key.

_Data protection & environment security_
- All data encrypted at rest (Railway Postgres) and in transit (HTTPS/TLS). Never make unencrypted HTTP calls between services. The Ollama endpoint is Tailscale-only — never expose it to the public internet.
- Secrets (DB URI, JWT secret, OAuth client credentials, Ollama URL) are environment variables injected via Railway's secret manager in deployed environments and `.env` files locally. `.env` is gitignored — never commit it.
- Dev / Staging (`dev` branch) / Production (`main` branch) use completely separate databases and secret sets. Never reuse or share credentials between environments.

_Hardened authentication (Google OAuth + JWT)_
- Use PKCE on every OAuth authorisation code flow to prevent code interception.
- Generate, store, and validate a unique `state` parameter per OAuth handshake to block CSRF.
- Never store JWTs or tokens in `localStorage`. Use `HttpOnly`, `Secure`, `SameSite=Strict` cookies.
- Keep access tokens short-lived (≤15 min). Refresh tokens must rotate on use — invalidate the previous token immediately on refresh.
- All user input is validated at the Pydantic schema layer (`app/schemas/`) before reaching services or the DB. All DB queries go through SQLAlchemy ORM or parameterised statements — never interpolate user input into raw SQL.

_Integrity & auditability_
- The costing engine (`services/costing_engine.py`) must produce deterministic, verifiable output — no silent failures or swallowed exceptions in calculation paths.
- Use the `AuditLog` model to record all security-relevant events: logins, login failures, token issuances, role changes, cost model exports, and any admin/production DB access. Audit records are append-only — never delete or update them.

## Key Conventions

- **INCOTERM normalisation** is a first-class concern. Any landed-cost or pricing logic must account for `incoterm_normalizer.py`.
- **Quarter granularity** is the default time unit throughout the system (`utils/quarters.js` on the frontend, period logic in `costing_engine.py`).
- **Alembic** for all schema changes — never modify tables by hand.
- **Pydantic schemas** in `app/schemas/` are the contract for all API inputs and outputs. Keep them in sync with the ORM models.
- Ollama is only reachable over Tailscale. `llm_enabled` defaults to `True` in code but is set to `False` in production via env var — when disabled, `ollama_generate()` returns `None` on a cache miss instead of calling the model (relies on pre-warmed Redis cache).

## TODO

Status icons: 🔴 Not started · 🟡 In progress · 🟢 Completed

When a task has subtasks, list them indented beneath the parent. Update the status icon as work progresses. Add new tasks and subtasks here as they are created.

<!-- Example format:
- 🔴 Task name
  - 🔴 Subtask 1
  - 🔴 Subtask 2
- 🟡 Task in progress
  - 🟢 Subtask done
  - 🟡 Subtask in progress
  - 🔴 Subtask not started
- 🟢 Completed task
-->

### Wave 1

- 🟢 **Scrum 8** — Real admin console
  - 🟢 Super-admin can list, search, and view all tenants and users
  - 🟢 Impersonation works end-to-end; `ImpersonationBar` is visible while impersonating
  - 🟢 Every admin action appears in `AuditLog`
  - 🟢 Non-super-admin users get 403 on all `/api/admin/*` routes
  - 🟢 No direct DB access required for any routine support task
  - 🟢 Stop-impersonation cookie deletion uses matching samesite/secure; RLS bypassed for audit log
  - 🟢 Signed-in super-admin is excluded from the users list (cannot act on themselves)
  - 🟢 Auto team creation on signup removed — super admin assigns users to teams manually
  - 🟢 `admin_*` events filtered out of team activity log; visible only in platform audit log
  - 🟢 Super admin: full team management (view members, change role, remove member, delete team) via admin console
  - 🟢 Team ownership is a single-owner transfer — setting a new owner auto-demotes the old owner to admin
  - 🟢 Owner role manageable by team owner (transfer, role change, remove) from Team page

- 🟢 **Scrum 8b** — RBAC + Plans (granular permissions, subscription tiers, team-scoped roles)
  - 🟢 38 permissions seeded across 11 categories (products, cost_models, suppliers, indexes, prices, volumes, fx_rates, costing, evolution, briefs, squeeze, scenarios)
  - 🟢 Free plan (default, view+export) and Dream Plan (all 38 permissions) seeded
  - 🟢 Roles are team-scoped; created and managed per team — no hardcoded admin/member display roles
  - 🟢 Alembic migration: creates permissions/plans/roles/team_member_roles tables, seeds data, migrates existing memberships
  - 🟢 `has_permission()` service: super_admin bypass → plan ceiling → custom roles → membership.role fallback
  - 🟢 All resource endpoints enforced: products, cost_models, suppliers, indexes, prices, volumes, costing, evolution, squeeze, briefs, scenarios, portfolio
  - 🟢 Admin Settings tab (5th tab): Permissions list (scrollable, read-only — dev-managed), Plans CRUD, Platform Roles CRUD (User + SuperAdmin defaults)
  - 🟢 Admin Users tab: role chips (User/SuperAdmin) + "Edit Role" popover instead of Make Admin/Revoke buttons
  - 🟢 Admin TeamsTab: Plan column per team; expanded member view shows Roles chips (team-scoped) with + add/× remove — no Membership Role dropdown
  - 🟢 Team Manage panel: Roles chips per member with + add / × remove; owner shown as OWNER badge; no admin/member dropdown
  - 🟢 Team Settings → Role Settings section: role CRUD with permission checkboxes, member-role assignment table
  - 🟢 Team roles limited to plan-allowed permissions — validated at API level; UI shows only plan-scoped permissions
  - 🟢 Team owner gets all plan-allowed permissions (plan ceiling enforced before owner fallback)
  - 🟢 `require_team_role` has super_admin bypass; `GET /api/teams/{id}/members` includes custom_roles batch-loaded
  - 🟢 Chemist and FX Manager are default/protected platform roles — show "default" badge in Admin → Settings → Roles, cannot be deleted
  - 🟢 FX Manager platform role seeded with `fx_rates.view/edit/delete` permissions; added to Dream Plan and SuperAdmin role
  - 🟢 Platform role chips (accent3) visible on Team page member rows alongside team-scoped role chips; `GET /api/teams/{id}/members` includes `platform_role_names`

- 🔴 **Scrum 9** — Hardened authentication on OAuth 2.0
  - 🔴 PKCE `code_verifier`/`code_challenge` used on every OAuth flow
  - 🟡 `state` generated per-request, validated, and deleted after use (generated but never validated on callback)
  - 🔴 Access token TTL ≤ 15 min; refresh token TTL = 7 days (currently 72h, no refresh token)
  - 🔴 Refresh token rotates on every use; old token is immediately invalidated
  - 🟡 `ca_token` cookie has `HttpOnly`, `Secure`, `SameSite=Strict` in production (`HttpOnly`+`Secure` set; `SameSite` is `none` not `Strict`)
  - 🔴 Silent refresh in `api.js` — user is not logged out on a single 401
  - 🟢 OAuth scope is `openid email profile` only

- 🔴 **Scrum 10** — Defined data-security story for buyer IT (TLS, encryption at rest, tenant isolation, audit, secrets, EU residency, backup/retention policy)
  - 🔴 RLS test covers every tenant-scoped table
  - 🔴 Audit log covers login, logout, failed login, export, impersonation
  - 🔴 Written confirmation of TLS in transit and encryption at rest
  - 🔴 EU data residency confirmed or migration plan documented
  - 🔴 Backup/retention policy written and tested (restore drill)
  - 🔴 Security posture document ready to share with enterprise IT

- 🔴 **Scrum 11** — SOC 2 groundwork
  - 🔴 Sentry capturing errors in production
  - 🔴 Uptime monitoring with alerting configured
  - 🔴 Branch protection on `main` enforced
  - 🔴 Costing engine has determinism regression tests
  - 🔴 Incident response plan written
  - 🔴 Vendor DPA list complete
  - 🔴 All items from Scrum 10 completed (prerequisite)

- 🟡 **Scrum 12** — Public landing page (static, SPA hosted separately for SEO)
  - 🟢 `landing/` directory created with static HTML/CSS; one CSS file per section (`tokens`, `base`, `nav`, `hero`, `strip`, `problem`, `how`, `showcase`, `principles`, `social`, `security`, `cta`, `footer`)
  - 🟢 `landing/wrangler.jsonc` added for Cloudflare Workers static assets deploy
  - 🟢 `landing/sitemap.xml` and `landing/robots.txt` included
  - 🟢 All content sections: hero, problem, how-it-works, features, security, CTA
  - 🟢 CTA links to app login (`https://costadvisor.org`); Privacy and Terms in footer
  - 🟢 Scroll-reveal animations are progressive enhancement — page fully renders without JS
  - 🟢 Invite-only messaging: CTA form submits to `POST /api/access-requests` (replaced mailto)
  - 🟢 Theme selector (4 swatches) in nav; persists via `localStorage.ca_theme`
  - 🟢 Redesigned — hero 2-col with product mockup, trust strip, editorial problem section, numbered how-it-works, 3 alternating showcase rows, principles block, social proof, security tiles
  - 🟢 Modernised — Platform roadmap bento section covering all waves/scrums with Live/Wave-2/Wave-3 status badges and wave rail; spotlight hover tiles; scroll progress bar (CSS scroll-timeline + JS fallback); mobile burger menu; JSON-LD structured data (SoftwareApplication + FAQPage); skip link, `:focus-visible`, `text-wrap: balance`, full `prefers-reduced-motion` support; hero grid backdrop
  - 🔴 Landing page deployed and live at `www.costadvisor.org` (Cloudflare dashboard wiring)
  - 🔴 Google Search Console shows page indexed
  - 🔴 Core Web Vitals pass (LCP < 2.5 s)
  - 🔴 Stats verified and added (McKinsey 13%, AlixPartners ~50%, Bain 8–12%)
  - 🔴 Embedded demo section (possible later-phase item: a tiny interactive demo using a common household product, e.g. Coca-Cola or a soda brand — to consider, not committed)

- 🟢 **Scrum 13** — Working team invites (send invite emails)
  - 🟢 Owner/admin can send an invite email to any address (creates TeamInvite with 256-bit token; sends via SMTP — no third-party SDK)
  - 🟢 Invitee receives an HTML email with team name, role, invited-by, and link to Team page
  - 🟢 Invite link works for 7 days; expired/revoked invites return 400 with clear error
  - 🟢 Accepting an invite as a new user: Google OAuth creates account with invited email; pending invites appear automatically on Requests tab
  - 🟢 Accepting an invite as an existing user joins the team without duplicate account
  - 🟢 Invite acceptance is recorded in `AuditLog` (invite_accepted event)
  - 🟢 Requests tab inside Team page with badge count on Team nav tab; accept/decline with confirm dialogs; history section shows accepted/declined/revoked/expired
  - 🟢 Pending invites visible and revocable in TeamManagePanel
  - 🟢 `TeamInvite` model with token, status (pending/accepted/revoked/declined), 7-day expiry; migration applied
  - 🟢 Duplicate pending invite blocked; existing member invite blocked

- 🟡 **Scrum 13b** — Platform-level access gating (invite-only sign-up with admin approval)
  - 🟢 `PlatformAccessRequest` model + Alembic migration (partial unique index on pending email)
  - 🟢 Public `POST /api/access-requests` endpoint — submits request, returns status without 409 to allow landing page messaging
  - 🟢 OAuth callback gates new users: must have accepted access request OR pending team invite
  - 🟢 Blocked users redirected to app with `?login_error=access_pending|access_rejected|access_needed|signup_disabled`
  - 🟢 Login page shows contextual error message per `login_error` value; `loginError` exposed via `AuthContext`
  - 🟢 Admin "Requests" 4th tab — lists all requests with pending badge, Accept/Reject actions, history
  - 🟢 Admin accept: sets status=accepted, sends access-granted email + welcome email; reject: no email
  - 🟢 Team-invite bypass users receive welcome email on first sign-in (account creation)
  - 🟢 CORS updated for `www.costadvisor.org`; router registered in `main.py`
  - 🟢 Landing page CTA form submits email to API via `fetch POST` (replaced mailto fallback)

- 🟢 **Scrum 14** — End-to-end win-a-negotiation flow (product → components → indices → should-cost → actuals → gap → export brief)
  - 🟢 A new user can complete the full flow (steps 1–8) without external help
  - 🟢 Every empty or missing-data state has a clear message and a next action
  - 🟢 The brief shows gap, top drivers, and narrative with real data
  - 🟢 Total impact shows correctly when volumes are present; prompts to upload when absent
  - 🟢 No raw API errors surface in the UI (`formatApiError()` in `api.js` + consistent error display)
  - 🟢 Evolution chart does not show flat zero line when actuals are absent
  - 🟢 Malformed CSV upload shows readable per-row errors
  - 🟢 User warned when commodities have no index data (`data_gaps` flag)
  - 🟢 Unknown routes render a 404 page
  - 🟢 `db.commit() → db.refresh()` 500 fixed across 6 RLS-protected routers (flush+expunge pattern)

- 🟢 **Scrum 14b** — Two-speed formula system (simple parts+weights AND advanced expression mode)
  - 🟢 Simple mode unchanged: parts + weights + base price + base quarter (current model)
  - 🟢 Advanced formula mode: user can type a free-form expression (e.g. `0.92*[(0.75*ACN+1500)*(1-h)+h*AA/0.8]+FC`)
  - 🟢 Variables in advanced mode are defined by the user and mapped to a commodity index, a fixed value, or a per-period upload
  - 🟢 UI toggle between Simple and Advanced mode; existing formulas open in the mode they were saved with
  - 🟢 Expression validated client-side (balanced brackets, recognised operators) and server-side before saving
  - 🟢 Costing engine evaluates advanced expressions deterministically with the same index/FX/incoterm pipeline as simple mode
  - 🔴 Should-cost drill-down (Scrum 17) works for advanced formulas — shows resolved variable values (deferred to Scrum 17)

- 🟢 **Scrum 14c** — Formula library + Chemist platform role
  - 🟢 `FormulaTemplate` entity (nullable `team_id`): `team_id IS NULL` = platform Default, `team_id = X` = team-scoped
  - 🟢 `UserPlatformRole` junction table: real assignment of platform roles (Chemist, etc.) to users
  - 🟢 `has_platform_permission` / `require_platform_permission` in permissions service
  - 🟢 Chemist platform role seeded with `formulas.view/edit/delete`; SuperAdmin role updated; Dream Plan updated
  - 🟢 `/api/formulas` CRUD router: GET/POST/PUT/DELETE gated per tier (platform vs team)
  - 🟢 RLS policy on `formula_templates`: allows `team_id IS NULL` rows to all authenticated teams
  - 🟢 Admin → Users → Edit Role: Chemist checkbox stores in `user_platform_roles` (not `is_super_admin`); `PlatformRoleChips` shows all assigned roles
  - 🟢 `/formulas` page: Default Formulas + Team Formulas sections; full CRUD gated by permission
  - 🟢 CostModelBuilder advanced mode: "Load Template" dropdown pre-fills expression + variables
  - 🟢 CostModelBuilder advanced mode: "Save as Template" scope toggle respects `canEditPlatform && canEditTeam`; Chemist-only users default to platform scope with no toggle

- 🟢 **Scrum 14d** — FX Rates page + team custom overrides
  - 🟢 `/fx-rates` nav page with two tabs: Default (platform rates, read-only) and Custom (team overrides, editable)
  - 🟢 `custom_fx_rates` table with RLS (`team_id` scoped); Alembic migration (`r9s0t1u2v3w4`)
  - 🟢 `GET/PUT/DELETE /api/fx-rates/custom` endpoints; `POST /api/fx-rates/custom/copy-from-default` bulk-seeds team overrides from platform rates
  - 🟢 Custom tab: inline-editable rate cells, "Sync from Default" modal, "+ Add Rate" modal, delete per row
  - 🟢 `fx_converter.py` checks `custom_fx_rates` first (team priority), falls back to platform `fx_rates`
  - 🟢 Costing engine threads `team_id` through all 14 `_apply_fx` call sites
  - 🟢 FX Rates section removed from Team → Settings; `FxRates.jsx` registered in App.jsx and Navbar after Formulas
  - 🟢 Write endpoints gated on `fx_rates.edit` permission (via FX Manager role or plan ceiling)

- 🔴 **Scrum 15** — Polished exportable deliverable (clean PDF negotiation brief with verdict, gap, ranked drivers)
  - 🔴 "Export PDF" button on the Brief page
  - 🔴 PDF contains: verdict, gap, top drivers table, evolution chart, narrative
  - 🔴 PDF is legible when printed in black and white
  - 🔴 Customer logo / branding can be added
  - 🔴 File is named sensibly (e.g., `brief-product-supplier-Q12025.pdf`)

- 🔴 **Scrum 16** — Self-serve onboarding (empty states, example data, guidance to first should-cost vs actual gap)
  - 🟡 Every list/chart page has a non-empty empty state with a clear next action (Dashboard + Pricing covered; others incomplete)
  - 🔴 "Load example data" works for a brand-new team and produces a runnable should-cost
  - 🔴 Onboarding checklist tracks real progress and disappears when done
  - 🔴 A new user can reach a gap insight without external guidance

- 🔴 **Scrum 17** — Inspectable numbers (show how a should-cost was built: index values, weights, FX/unit/Incoterm conversions)
  - 🔴 Every should-cost figure has an accessible breakdown
  - 🔴 Breakdown shows: index name, weight, base value, current value, ratio, contribution
  - 🔴 Breakdown shows: indexed cost, margin, FX rate used, unit conversion, Incoterm adjustment
  - 🔴 Index source is shown (scraped / team override / fixed)
  - 🔴 Numbers in the breakdown sum to the displayed should-cost exactly

- 🟡 **Scrum 18** — Data import & export — Wave 1: forgiving import of core data, export of anything on screen; consolidate existing CSV/Excel
  - 🟡 Every upload shows a row-count preview before committing (row count shown after upload, not before as a preview)
  - 🟢 Per-row errors returned with row number and description (`file_parser.py` + Pricing page display)
  - 🔴 Common column name variants accepted without failing
  - 🔴 Both CSV and `.xlsx` accepted for all uploads
  - 🟡 "Download template" available at every upload dialog (Pricing page has it; other upload dialogs do not)
  - 🟢 Export CSV button on every data table and result view (Dashboard, Pricing/FX, Evolution, Squeeze)
  - 🟢 Exported CSV column names are human-readable (not internal field names)

---

### Wave 2

- 🔴 **Scrum 19** — Automatic gap flagging (dashboard as portfolio triage screen ranked by money at stake)
  - 🔴 Dashboard shows all products with a should-cost vs actual comparison in one view
  - 🔴 Each row shows: product, supplier, should-cost, actual price, gap %, gap value (price × volume)
  - 🔴 Rows sorted by absolute gap value descending — biggest opportunity first
  - 🔴 Visual indicator (colour or bar) for gap severity
  - 🔴 Clicking a row navigates to the cost model

- 🔴 **Scrum 20** — Procurement Priority Matrix (portfolio view: volatility × spend exposure)
  - 🔴 2×2 or scatter matrix: index volatility (x) vs spend exposure (y) per product/category
  - 🔴 Quadrant labels: "monitor", "hedge", "act now", "low priority"
  - 🔴 Volatility calculated from index movement over trailing 4 quarters
  - 🔴 Spend exposure = should-cost × volume
  - 🔴 Exportable as CSV and image

- 🔴 **Scrum 21** — Predictive index forecasting (directional, uncertainty-honest)
  - 🔴 Each tracked index shows a trailing trend and a 2-quarter forward projection
  - 🔴 Projection uses simple trend extrapolation; confidence band shown
  - 🔴 "Impact on my models" — shows projected should-cost change if forecast holds
  - 🔴 Clearly labelled as an estimate, not a guarantee

- 🔴 **Scrum 22** — Opportunistic buy windows (spot vs contract signal)
  - 🔴 Per-product signal: current should-cost vs 4-quarter average — "cheap now" or "expensive now"
  - 🔴 Requires spot-price data stored at product level (extend pricing model)
  - 🔴 Recommendation shown in cost model view and dashboard

- 🔴 **Scrum 23** — Supplier benchmarking (who prices near should-cost, who pads margin)
  - 🔴 Per-supplier view: average gap % across all products, trend over time
  - 🔴 Ranking table: suppliers ordered by how closely they track should-cost
  - 🔴 Visible to owner/admin only; seeds Wave 3 trust grading

- 🔴 **Scrum 24** — Alerts (email & Slack on index moves, new gaps, buy windows)
  - 🔴 User can subscribe to alerts per index or per product
  - 🔴 Email alert sent when index moves > configurable threshold (e.g. ±5% in a quarter)
  - 🔴 Email alert sent when a new gap exceeds a threshold
  - 🔴 Slack webhook support (team-level setting)
  - 🔴 Alert history visible in-app; alerts recorded in AuditLog

- 🔴 **Scrum 25** — Intra-team collaboration (notes, flags, shared negotiation position)
  - 🔴 Users can leave notes on a cost model (threaded, timestamped)
  - 🔴 Flag a model as "in negotiation", "agreed", "under review"
  - 🔴 Notes and flags visible to all team members; recorded in AuditLog
  - 🔴 @mention teammate in a note triggers email notification

- 🔴 **Scrum 26** — Index-provider API integration (stretch — Fastmarkets, Argus, ICIS)
  - 🔴 Team can configure an API key for a supported index provider
  - 🔴 Nightly job pulls licensed index data and stores as IndexValue with source tag
  - 🔴 Falls back to existing scraper/upload flow if provider API is unavailable
  - 🔴 Not a wave blocker — only if provider APIs prove tractable

---

### Wave 3

- 🔴 **Scrum 27** — Multi-tiered "Lego" formulas (sub-models nested into parent models)
  - 🔴 A FormulaVersion can reference another CostModel as a component
  - 🔴 Costing engine resolves nested models recursively (guard against cycles)
  - 🔴 UI shows nested breakdown: top-level components expand to reveal sub-model detail
  - 🔴 Export and brief generation handle nested structure correctly

- 🔴 **Scrum 28** — Complex mathematical formulas (non-linear, thresholds, conditional logic)
  - 🔴 Formula components support: min/max bounds, step functions, yield/conversion factors
  - 🔴 Expression editor or structured form for defining non-linear relationships
  - 🔴 Costing engine validates and evaluates complex expressions deterministically
  - 🔴 Pairs with Scrum 27 (Lego) — designed together

- 🔴 **Scrum 29** — Negotiation aid system (guided advisor with auto-generated script and materials)
  - 🔴 "Prepare negotiation" flow: enter known supplier position, get counter-argument suggestions
  - 🔴 Auto-generates talking points from the gap, drivers, and index movement
  - 🔴 Produces a structured negotiation brief: your position, likely counter, recommended floor
  - 🔴 Output exportable as PDF alongside the standard cost brief

- 🔴 **Scrum 30** — Extract pricing from PDFs (supplier quotes and price lists)
  - 🔴 User uploads a supplier PDF; system extracts product name, price, date, currency
  - 🔴 Extracted data shown for review before committing to ActualPrice records
  - 🔴 Handles tabular and free-text price formats; shows confidence per extracted value
  - 🔴 Falls back gracefully — unrecognised formats prompt manual entry

- 🔴 **Scrum 31** — Supplier trust & margin grading (reputation score from collected data)
  - 🔴 Score computed from: gap trend, pricing volatility, response to index moves
  - 🔴 Grade shown on supplier page and in negotiation brief
  - 🔴 Built on Wave 2 benchmarking data (Scrum 23 prerequisite)
  - 🔴 Score methodology documented and visible to user (not a black box)

- 🔴 **Scrum 32** — AI cost modeler (retroactive estimation for products without decomposition)
  - 🔴 User provides product name, sector, rough price — system suggests a likely component breakdown
  - 🔴 Output is clearly labelled as an AI estimate; user refines before saving
  - 🔴 Uses Ollama (llama3.1:8b) same as existing narrative service
  - 🔴 Estimated components can be promoted to a real FormulaVersion

- 🔴 **Scrum 33** — Multi-source index validation (cross-check values, flag anomalies)
  - 🔴 When multiple sources cover the same index, system compares values
  - 🔴 Flags when a value deviates > threshold from other sources
  - 🔴 User can inspect source provenance per IndexValue
  - 🔴 Anomalies visible in the Indexes page and surfaced in alerts (Scrum 24)

---

## Product Roadmap

Direction for the next three waves. The "what" and "why" are here; the "how" is owned by whoever picks up the work.

### The Product

CostAdvisor is buyer-side "should-cost" intelligence for procurement teams.

The supplier knows their real input costs; the buyer doesn't. So when a supplier says "oil went up 30%, we need +20%," the buyer has no defensible way to push back. CostAdvisor closes that gap:

1. **Decompose** a product into raw-material components, each weighted by its share of cost.
2. **Link** each component to a tracked commodity index (oil, ammonia, gas…) by region and quarter.
3. **Calculate** what the product should cost today, given how those indices have moved.
4. **Compare** against the supplier's actual price. The gap is the negotiation signal.

The output is a transparent, auditable cost figure to put in front of any supplier.

**Why it's a business:** Procurement is ~50% of industrial company revenue — yet most teams negotiate with spreadsheets and gut feel. Cost transparency pays: 13% raw-material savings from should-cost models (McKinsey); ~50% of supplier increase requests deflected (AlixPartners). The suites (Ariba, Coupa, Sievo) do retrospective spend analytics; McKinsey Cleansheet is supplier-side and consultant-gated. Nobody offers self-serve, buyer-side cost intelligence. That's the space.

Tagline: *know what your products should cost before your supplier tells you.*

**The customer:** Procurement Directors / CPOs at industrial companies buying commodity-linked products; daily users are Category Managers and Procurement Analysts. Sectors: water treatment, specialty chemicals, paper & pulp, mining, agriculture, oil & gas, food & beverage, automotive.

---

### Wave Summary

| Wave | Theme | Goal |
|------|-------|------|
| **Wave 1** | Presentable & Sellable | A product we can put in front of a paying company — secure, polished, core value proposition airtight. |
| **Wave 2** | Intelligence | The app does the analysis — flags gaps, forecasts, recommends — instead of just calculating. |
| **Wave 3** | Depth & Differentiation | Hard, defensible features that make it a negotiation system, not just a tool. |
| **Parking Lot** | Scale & Ecosystem | Enterprise integration and platform plays we believe in but aren't committing to yet. |

---

### Wave 1 — Presentable & Sellable

**Goal:** demo on a prospect's own category and have them take it seriously as something they'd buy. Trustworthy enough to put real data in, clean enough to sell itself in a short demo.

**Track A — Commercial & Security Readiness**
- Real admin console (manage users/teams, support, global reference data without touching DB)
- Hardened authentication on OAuth 2.0
- Defined data-security story: TLS everywhere, encryption at rest, tenant isolation via RLS, least-privilege + audit logging, secrets in managed store, EU data residency, written backup/recovery/retention/deletion policy
- SOC 2 groundwork
- Public landing page (static, separate from SPA for SEO). Key proof points (verify before using): 13% raw-material savings from should-cost models (McKinsey); ~50% of supplier cost-increase requests deflected (AlixPartners); 8–12% purchasing-expense reduction by world-class procurement teams (Bain). Consider a live Coca-Cola-style demo embedded in the landing page.
- Working team invites (send email)

**Track B — Core Value Loop**
- End-to-end "win a negotiation" flow: product → components → indices → should-cost → actuals → gap → export brief. No dead ends. This path is the demo.
- Polished, exportable deliverable — clean PDF brief, clear verdict, gap quantified, drivers ranked
- Self-serve onboarding — sensible empty states, example data, first gap without a training session
- Inspectable numbers — show how a should-cost was built: index values, weights, FX/unit/Incoterm conversions
- Baseline import & export — forgiving import of core data; export anything on screen

**Done when:** live self-serve demo on a prospect's category, IT has no blocking objection, brief looks like something they'd use.

---

### Wave 2 — Intelligence

**Goal:** today the user does the analysis; the app is a calculator. Wave 2 makes the app surface where to look.

- **Automatic gap flagging** — dashboard becomes a triage screen ranked by money at stake
- **Procurement Priority Matrix** — portfolio view scoring each product/category on volatility and spend exposure
- **Predictive analysis / index forecasting** — directional forecasts, honest about uncertainty
- **Opportunistic buy windows** — recommend when/how to buy; needs spot-price data per product
- **Supplier benchmarking** — who prices near should-cost, who pads margin; seeds Wave 3 grading
- **Alerts (email & Slack)** — push index moves, new gaps, buy windows
- **Intra-team collaboration** — notes on models, flags for colleagues, shared position before a negotiation
- **Index-provider API integration (stretch)** — plug in Fastmarkets/Argus/ICIS API keys; fall back to upload/scraper if too hard

**Done when:** a user logs in and immediately sees where the opportunities and risks are, without running the analysis themselves.

---

### Wave 3 — Depth & Differentiation

**Goal:** hard, defensible features that make it a negotiation system. Larger bets — expect each to span most of a cohort.

- **Multi-tiered "Lego" formulas** — sub-models nested into parent models; touches the core engine
- **More complex mathematical formulas** — non-linear effects, thresholds, conditional logic, yield/conversion factors
- **The negotiation aid system** — guided advisor: your position, supplier's likely counter, the script; auto-generates negotiation materials from the model
- **Extract pricing from PDFs** — pull prices from supplier quotes and price lists automatically
- **Supplier trust & margin grading** — reputation score per supplier built from collected data
- **AI cost modeler (retroactive estimation)** — estimate cost structure for products without a clean decomposition
- **Multi-source validation** — cross-check index values across sources; flag suspicious data points

**Done when:** CostAdvisor is where a team prepares for and runs a negotiation end to end, with depth competitors can't match quickly.

---

### Cross-Cutting: Data Import & Export

Not one feature — a capability that grows across every wave.

Principle: anything a user can see, they can export; anything they'd type by hand, they can import.

- **Wave 1** — forgiving import of core entities; export of anything on screen; consistent formats, clear errors, no silent data loss
- **Wave 2** — import templates, bulk operations, presentation-ready exports, scheduled export packs
- **Wave 3** — round-trip import/export of whole cost models; structured exports for API and BI tools; ERP integration groundwork

When a new view or entity is added, "how does data get in and out?" is part of the work, not an afterthought.

---

### Parking Lot

- ERP integration (SAP and others) — large, enterprise-gated
- Public API & BI integration (outbound) — let customers pull CostAdvisor data into their own tools
- SSO for enterprise — foreshadowed by Wave 1 auth hardening
- Custom composite indexes — customer-defined blended indices
- Richer multi-currency / FX — multinationals will want more
- Strategy lead-time view — portfolio-and-time view to plan ahead of contract renewals

---

### Engineering Notes (Roadmap Context)

- The costing engine is the core — should-cost / evolution / Incoterm / FX / unit-conversion. Match existing patterns. Subtle bugs land here.
- Multi-tenancy enforced at the DB via Postgres RLS. Tenancy leak is the worst bug we can ship. The bypass exists for admin/background tasks only.
- Incoterm is a pricing dimension, not a label. Anything touching pricing accounts for it.
- Mutations are auditable — keep new write paths consistent with the audit pattern.
- `CostAdvisor_Business_Case.pptx` covers market, customer, and positioning.
