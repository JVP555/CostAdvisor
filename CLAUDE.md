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
  - 🟢 Fixed: `/stop-impersonate` now resets `bypass_rls_var` in a `finally` (was set without reset — defensive gap, not an exploitable leak given per-request context isolation)
  - **Verification (audited `routers/admin.py` + impersonation flow; tests in `backend/tests/test_admin.py`: 9 tests, full suite 29 passed):**
    - 🟢 Function works — ~32 admin endpoints (users, teams, plans, access requests, platform roles, audit logs, demo hosts); impersonation start swaps `ca_token`→target + stashes `ca_admin_token`, stop restores admin token and deletes impersonation cookies
    - 🟢 Authentication — every `/api/admin/*` route depends on `require_super_admin` → `get_current_user` (cookie-JWT); unauthenticated → 401 (`test_unauthenticated_gets_401`)
    - 🟢 Authorization — `require_super_admin` raises 403 for any non-super-admin (`test_non_super_admin_gets_403`); nested impersonation blocked (token swap makes you non-admin → 403)
    - 🟢 RLS — `bypass_rls_var` set/reset around cross-team reads; super-admin bypass is set in `get_current_user` (gated by app-layer `require_super_admin`); `/stop-impersonate` bypass now reset in `finally`
    - 🟢 Audit — 17 `admin_*` events written via `log_event`; impersonation start/stop attributed to the acting admin's `user_id` (`test_impersonate_sets_cookies_and_audits`, `test_stop_impersonate_restores_and_audits`); actions during impersonation tagged `_impersonated_by`
    - 🟢 Transit/cookies — impersonation cookies `HttpOnly`+`Secure`(prod)+`SameSite`; `ca_impersonating` intentionally non-HttpOnly (UI flag); delete uses matching attributes so browsers honour it
    - 🟢 Self-protection — signed-in super-admin excluded from own user list (`User.id != current_user.id`, `test_super_admin_excluded_from_own_list`); cannot impersonate a super-admin or deleted user (`test_cannot_impersonate_super_admin`)
    - 🟢 Comments — non-obvious *why* commented (non-HttpOnly flag, cookie-delete attribute matching, bypass rationale + new finally); fixed a conftest teardown gap (cross-team audit rows blocked user deletes)

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
  - 🟢 Tests: `tests/test_rbac.py` (7) — `has_permission` order (super-admin → plan ceiling → custom roles → membership fallback), plan ceiling caps even owner, custom role replaces fallback, member view/export-only, API plan-ceiling validation on role creation (400), platform-permission resolution

- 🔴 **Scrum 9** — Hardened authentication on OAuth 2.0
  - 🔴 PKCE `code_verifier`/`code_challenge` used on every OAuth flow
  - 🟡 `state` generated per-request, validated, and deleted after use (generated but never validated on callback)
  - 🔴 Access token TTL ≤ 15 min; refresh token TTL = 7 days (currently 72h, no refresh token)
  - 🔴 Refresh token rotates on every use; old token is immediately invalidated
  - 🟡 `ca_token` cookie has `HttpOnly`, `Secure`, `SameSite=Strict` in production (`HttpOnly`+`Secure` set; `SameSite` is `none` not `Strict`)
  - 🔴 Silent refresh in `api.js` — user is not logged out on a single 401
  - 🟢 OAuth scope is `openid email profile` only

- 🔴 **Scrum 10** — Defined data-security story for buyer IT (TLS, encryption at rest, tenant isolation, audit, secrets, EU residency, backup/retention policy)
  - 🟡 RLS test covers tenant-scoped tables (`test_rls.py`: products, suppliers, custom_fx_rates, formula_templates incl. platform `team_id IS NULL` visible-to-all). **Gap found:** `roles`, `team_member_roles`, `team_memberships`, `team_invites` have a `team_id` but NO RLS policy — app-layer gated only; add `tenant_isolation` for defense-in-depth (`team_memberships` is intentionally exempt — it's the RLS bootstrap table)
  - 🟡 Audit log covers export + impersonation (brief generation now logged — `costing.py` `brief_generated`, test in `test_brief.py`; impersonation start/stop already logged). Login/logout/failed-login still 🔴 — blocked by `audit_logs.team_id`/`user_id` being NOT NULL while login is platform-level and new users have no team; needs a nullable-team_id migration or a separate auth-events log
  - 🔴 Written confirmation of TLS in transit and encryption at rest
  - 🔴 EU data residency confirmed or migration plan documented
  - 🔴 Backup/retention policy written and tested (restore drill)
  - 🔴 Security posture document ready to share with enterprise IT

- 🔴 **Scrum 11** — SOC 2 groundwork
  - 🔴 Sentry capturing errors in production
  - 🔴 Uptime monitoring with alerting configured
  - 🔴 Branch protection on `main` enforced
  - 🟢 Costing engine has determinism regression tests — `test_brief.py` covers brief / evolution / squeeze (repeated calls return identical output) + exact numeric anchors on the brief
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
  - 🟢 Rebuilt as a single self-contained `index.html` (inline CSS/JS, Chart.js from CDN) with interactive data viz: 5 commodity sparkline cards (Market Pulse) with QoQ deltas + market-signal tiles, FX Rate Monitor (pair-switching line chart + live tiles), Cost Evolution showcase (should-cost vs supplier-price with filled gap area)
  - 🟢 Embedded interactive should-cost demo: 4 commodity sliders (filled-track) → live should-cost, gap, annual impact + colour-coded verdict pill; doughnut breakdown with center total and live €/t legend
  - 🟢 Legal as scroll-revealing glassmorphic cards (Terms, Privacy/GDPR, IP, residency/retention, auth/AI, contact); dismissible engagement popup (book-a-demo, sessionStorage-gated)
  - 🟢 Request Access / Book Demo are button-only on the page — forms live only in the modals; access form → `POST /api/access-requests`, demo flow → `GET /api/demos/available-slots` + `POST /api/demos/`
  - 🟢 Light-theme conversion to StaminaChem teal branding; full mobile pass (safe-area, touch targets, rhythm); generic phrasing replacing hard counts ("every currency you trade in" vs a fixed pair count)
  - 🔴 Landing page deployed and live at `www.costadvisor.org` (Cloudflare dashboard wiring)
  - 🔴 Google Search Console shows page indexed
  - 🔴 Core Web Vitals pass (LCP < 2.5 s)
  - 🟡 Stats added (McKinsey 13%, AlixPartners ~50%) with source footnote; Bain 8–12% not yet included; formal verification pending

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

- 🟢 **Scrum 13b** — Platform-level access gating (invite-only sign-up with admin approval)
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
  - 🟢 OAuth callback account-linking: a pre-provisioned account (seeded/created before first login) is bound to its Google identity by Google-verified unique email on first sign-in, so it bypasses the signup gate instead of colliding on the unique-email constraint

- 🟢 **Scrum 51** — Demo scheduling (landing page book-a-demo flow + admin management)
  - 🟢 `DemoHost`, `DemoBlockedSlot`, `DemoRequest` models + Alembic migration (`dem0_1a2b3c4d5e`)
  - 🟢 `GET /api/demos/available-slots?date=` (public) — slots where at least one host is free
  - 🟢 `POST /api/demos/` (public) — submit demo request; 409 if active request for email; receipt email sent
  - 🟢 Admin demo-hosts CRUD: GET/POST/PUT/DELETE `/api/admin/demo-hosts`, disconnect calendar endpoint
  - 🟢 Admin blocked slots CRUD: GET/POST/DELETE per host
  - 🟢 Admin demo-requests: GET list, accept (creates Google Meet + Calendar event + confirmation email), reject, edit remarks
  - 🟢 `GET /auth/google-calendar/start` + `GET /auth/google-calendar/callback` — per-host OAuth (offline, prompt=consent)
  - 🟢 `google_calendar.py` — Fernet-encrypt/decrypt refresh token; `create_google_meet()` with conferenceDataVersion=1
  - 🟢 `send_demo_request_received_email` + `send_demo_confirmation_email` added to email.py
  - 🟢 `google_calendar_encryption_key` setting added to config.py; `google-api-python-client` added to requirements.txt
  - 🟢 Admin Requests tab split into Access / Demo sub-tabs (pill toggle)
  - 🟢 DemoRequestsTab: Name/Company/Phone/Email/Date-Time/Status/Meet/Remarks/Actions columns; Accept (opens dialog with remarks + creates Meet) / Reject; inline remarks editing
  - 🟢 Admin Settings → Demo Hosts section: table with calendar status, active toggle, edit config, blocked slots expander, remove
  - 🟢 Landing page hero + CTA: "Schedule a demo" button added
  - 🟢 Landing page 3-step demo modal: date calendar → time slot picker → contact form → success/error
  - 🟢 `landing/css/demo.css` — calendar grid, slot button, step indicator styles
  - 🟢 "Connect Google Calendar" in admin redirects correctly after OAuth (`GOOGLE_CALENDAR_ENCRYPTION_KEY` set in local `.env`; Railway env vars to be added on deploy)
  - 🟢 Google Cloud project: Calendar API enabled, redirect URIs registered (local dev confirmed; prod/staging URIs to register on deploy)

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
  - 🟢 `detectVars` rebuilds variable map from scratch on each expression change — stale variables from cleared/retyped expressions no longer persist
  - 🟢 Expression evaluated by a safe AST whitelist (`safe_eval_expr`, no `eval`/`exec`/calls/attributes) — verified no code-injection risk
  - 🟢 **Audit fix:** cost_models router was dropping `formula_type`/`expression`/`variables` before insert (advanced models silently fell back to base price) — now persisted at all 4 sites (create / renegotiate update / renegotiate new / clone); API-level regression test `tests/test_advanced_formula.py`
  - 🔴 Should-cost drill-down (Scrum 17) works for advanced formulas — shows resolved variable values (deferred to Scrum 17)

- 🟢 **Scrum 14c** — Formula library + Chemist platform role
  - 🟢 `FormulaTemplate` entity (nullable `team_id`): `team_id IS NULL` = platform Default, `team_id = X` = team-scoped
  - 🟢 `UserPlatformRole` junction table: real assignment of platform roles (Chemist, etc.) to users
  - 🟢 `has_platform_permission` / `require_platform_permission` in permissions service
  - 🟢 Chemist platform role seeded with `formulas.view/edit/delete`; SuperAdmin role updated; Dream Plan updated
  - 🟢 `/api/formulas` CRUD router: GET/POST/PUT/DELETE gated per tier (platform vs team)
  - 🟢 RLS policy on `formula_templates`: allows `team_id IS NULL` rows to all authenticated teams; team-scoped rows use membership-subquery (fixed broken `current_team_id` policy)
  - 🟢 Admin → Users → Edit Role: Chemist checkbox stores in `user_platform_roles` (not `is_super_admin`); `PlatformRoleChips` shows all assigned roles
  - 🟢 `/formulas` page: Default Formulas + Team Formulas sections; full CRUD gated by permission
  - 🟢 CostModelBuilder advanced mode: "Load Template" dropdown pre-fills expression + variables
  - 🟢 CostModelBuilder advanced mode: "Save as Template" scope toggle respects `canEditPlatform && canEditTeam`; Chemist-only users default to platform scope with no toggle
  - 🟢 Seeded the platform Default Formula library from `sample_idea/full_shadow_formula_library.html`: 42 product formula templates across 10 chemical families + 29 referenced commodity indexes (free sources where available, manual/proxy for paywalled specialist ones). Idempotent `backend/seed_shadow_library.py`; templates use the base-anchored weighted index-ratio convention (`P0*(Σ wi*Vi/ViB + wFlat)`, evaluates to P0 at base)

- 🟢 **Scrum 14d** — FX Rates page + team custom overrides
  - 🟢 `/fx-rates` nav page with two tabs: Default (platform rates, read-only) and Custom (team overrides, editable)
  - 🟢 `custom_fx_rates` table with RLS (`team_id` scoped); Alembic migration (`r9s0t1u2v3w4`); RLS policy fixed to use membership-subquery (was broken with `current_team_id`)
  - 🟢 `GET/PUT/DELETE /api/fx-rates/custom` endpoints; `POST /api/fx-rates/custom/copy-from-default` bulk-seeds team overrides from platform rates
  - 🟢 Custom tab: inline-editable rate cells, "Sync from Default" modal, "+ Add Rate" modal, delete per row
  - 🟢 `fx_converter.py` checks `custom_fx_rates` first (team priority), falls back to platform `fx_rates`
  - 🟢 Costing engine threads `team_id` through all 14 `_apply_fx` call sites
  - 🟢 FX Rates section removed from Team → Settings; `FxRates.jsx` registered in App.jsx and Navbar after Formulas
  - 🟢 Write endpoints gated on `fx_rates.edit` permission (via FX Manager role or plan ceiling)
  - 🟢 `fx_pairs` table: configurable currency pairs with scrape URLs + live rate column; seeded with 6 ECB pairs; replaces hardcoded `_FX_PAIR_MAP`
  - 🟢 FX Pairs management section in Default tab (FX Manager / super admin): add/edit/delete pairs, per-row "Scrape Live Now", "Scrape All Live"
  - 🟢 `custom_fx_rates` extended: `value_type` (fixed/live/quarter_ref), `ref_year`, `ref_quarter`; rate nullable
  - 🟢 3-mode custom edit modal: fixed value / use live rate (dynamic) / point to a platform quarter
  - 🟢 LIVE column in Custom tab showing each pair's daily scraped rate (read-only reference)
  - 🟢 Multi-period Sync modal: per-pair accordion, per-quarter checkboxes, syncs N periods in one call
  - 🟢 ECBUrlScraper + ECBLiveScraper (Q→D URL swap for daily rate); scrape_fx_live Celery task (daily 08:00 UTC)
  - 🟢 fx_converter 3-branch: custom fixed → custom live → custom quarter_ref → platform quarterly → platform live fallback
  - 🟢 Download Template CSV button in both Default and Custom upload areas
  - 🟢 Live FX rates via Frankfurter JSON API (`FrankfurterScraper`, ECB-backed, no auth, `follow_redirects=True`) — replaces brittle ECBLive/GoogleFinance HTML scraping; `scrape_fx_live` task + both router endpoints dispatch `source_type in ("frankfurter","google_finance")`
  - 🟢 All ECB-published currency pairs seeded vs EUR (migration `fxf2b3c4d5e6`: updates 6 existing pairs to `source_type=frankfurter`, inserts the rest); `fx_pairs.from_currency/to_currency` populated
  - 🟢 Quarterly backfill from Frankfurter (`fetch_quarterly_rates`: daily series since 2020 → quarterly averages written straight to `fx_rates`); `POST /api/fx-rates/scrape` runs ECB legacy path + Frankfurter backfill for all pairs in one click
  - 🟢 FX Rates page restructured into 4 tabs: **FX Pairs** (pair config + live scraping), **Default** (platform quarterly grid), **Custom Overrides**, **History** (read-only combined live + full quarterly grid, CSV export)
  - 🟢 Public `GET /api/fx-rates/public-daily` (no-auth, landing page) — platform ECB data only, no tenant column; rate-limited 60/min
  - **Verification (Frankfurter FX live + backfill — full suite 20 passed):**
    - 🟢 Function works — live fetch end-to-end (CNY/EUR=0.1289) and quarterly range fetch (126 trading days/H1 → averaged into quarters via `fetch_quarterly_rates`); migration `fxf2b3c4d5e6` applied, all pairs seeded `source_type=frankfurter`
    - 🟢 Security — Frankfurter is read-only outbound (no user input in URL beyond seeded currency codes); writes go through ORM (`FxRate`/`FxPair`), no raw SQL in the scrape paths; scraper swallows network errors → returns `None` (no swallowed errors in a *calculation* path — this is data ingestion)
    - 🟢 Authentication — all three scrape endpoints (`/pairs/{id}/scrape-live`, `/scrape-live`, `/scrape`) depend on `get_current_user` → 401 when unauthenticated
    - 🟢 Authorization — each calls `require_fx_manager` (super-admin OR `fx_rates.edit` platform permission) → 403 otherwise
    - 🟢 RLS — `fx_pairs`/`fx_rates` are platform-level; `bypass_rls_var.set(True)` is scoped and reset in a `finally` on all three endpoints (no leaked bypass, no tenant data touched)
    - 🟢 Transit — HTTPS to `api.frankfurter.app` with `follow_redirects=True` (the 301 fix); ECB-backed source, no auth/secrets in transit
    - 🟢 Comments — only the non-obvious *why* is commented (redirect handling, `source_type` alias for old `google_finance` rows, backfill-writes-direct-to-`fx_rates` rationale)

- 🟢 **Scrum 15** — Polished exportable deliverable (clean PDF negotiation brief with verdict, gap, ranked drivers)
  - 🟢 "Export PDF" button on the Brief page
  - 🟢 PDF contains: verdict, gap, top drivers table, evolution chart, narrative
  - 🟢 PDF is legible when printed in black and white (direction badges use `borderLeft: 3px solid currentColor` + print CSS strips background fill; `@page` A4 margins; animation kill; chart SVG unlocked from scroll container)
  - 🟢 Customer logo / branding — print masthead: "CostAdvisor" wordmark + "Negotiation Brief" title on left; product / supplier / destination / period / date on right; `2px solid #111` separator
  - 🟢 File is named sensibly (`brief-{product}-{supplier}-{period}.pdf` via `document.title` trick before `window.print()`)
  - **Verification (7 checks — audited against the server-side brief content behind the printed page; tests in `backend/tests/test_brief.py`: 6 tests, full suite 20 passed):**
    - 🟢 Function works — `calculate_brief` (`costing_engine.py:647`): exact should-cost / gap / total-impact + drivers ranked by absolute cost contribution
    - 🟢 Security — `@limiter.limit("30/minute")` on the endpoint, Pydantic UUID validation, ORM-only (no raw SQL in the calc path)
    - 🟢 Authentication — `get_current_user` cookie-JWT → 401 when unauthenticated
    - 🟢 Authorization — `require_permission(..., "briefs.view")` → 403 for a same-team member lacking the permission
    - 🟢 RLS — `CostModel` lookup is unfiltered and relies on the `tenant_isolation` policy; cross-tenant request → 403/404
    - 🟢 Transit — cookies `HttpOnly`+`Secure` in prod, HTTPS via Cloudflare/Railway; Ollama narrative over Tailscale with graceful fallback. Caveat: `ca_token` is `SameSite=none`, not `Strict` (a Scrum 9 auth-hardening gap, not Scrum 15)
    - 🟢 Comments — `Brief.jsx` + engine comment only the non-obvious *why* (null-passthrough, active-formula choice); no redundant comments

- 🔴 **Scrum 16** — Self-serve onboarding (empty states, example data, guidance to first should-cost vs actual gap)
  - 🟡 Every list/chart page has a non-empty empty state with a clear next action (Dashboard, Pricing, Products, FX Rates covered; Suppliers now has a "+ Add your first supplier" CTA; Indexes / Formulas / Scenarios still to do)
  - 🔴 "Load example data" works for a brand-new team and produces a runnable should-cost
  - 🔴 Onboarding checklist tracks real progress and disappears when done
  - 🔴 A new user can reach a gap insight without external guidance
  - 🟢 Fixed dead ends (from cost-model-split analysis): routed the `Squeeze` page (`/cost-models/:id/squeeze`) + linked it from the CostModelBuilder / Evolution / Brief nav rows; added `Products` to the `Navbar`

- 🔴 **Scrum 17** — Inspectable numbers (show how a should-cost was built: index values, weights, FX/unit/Incoterm conversions)
  - 🔴 Every should-cost figure has an accessible breakdown
  - 🔴 Breakdown shows: index name, weight, base value, current value, ratio, contribution
  - 🔴 Breakdown shows: indexed cost, margin, FX rate used, unit conversion, Incoterm adjustment
  - 🔴 Index source is shown (scraped / team override / fixed)
  - 🔴 Numbers in the breakdown sum to the displayed should-cost exactly
  - 🟢 Scoping note: this breakdown IS the Wave-1 form of the mockup's Negotiate "itemized FOB→landed" view. The full 5-area workspace (Monitor/Forecast/Negotiate/Portfolio/Indexes) is a **Wave 2** reorg of the existing cost model (~55% already built), NOT Wave 1 — see `jvpdocs/cost_model_split_roadmap.md`, `cost_model_split_steps.md`, `cost_model_split_vs_wave1.md`. Wave 1 priority stays: Scrum 16 + 17, with 9/10/11/12 as the real finish-line blockers.
  - 🟢 Wave-2 Index Library (`pages/workspace/IndexLibraryArea.jsx`) is now the **single home** for indexes + FX — the standalone `/indexes` and `/fx-rates` pages were deleted (`Indexes.jsx`, `FxRates.jsx` removed; both routes 301→`/index-library`; nav entries dropped). Single table (no tabs); ALL `fx_pairs` shown as rows (from `/api/fx-rates/pairs`) with platform/override-resolved values + live latest. Editing is by clicking a quarter cell in the row: non-FX → `EditCellModal` (fixed, `/api/indexes/overrides/*`), FX → `FxCustomEditModal` 3-mode (`/api/fx-rates/custom`). Drill-in `IndexPopupModal` is view-only: one interactive `SeriesChart` (crosshair + range selector + two-point selection; FX daily from `/api/fx-rates/daily`, else quarterly), a three-price header (live/quarterly/overridden), a deterministic Statistics card (`utils/seriesStats.js`), Default/Custom graph toggle, kept AI Analysis, portfolio impact, and (FX-manager only) an FX Pair admin card — add (header) / edit / delete / scrape-live / scrape-platform via shared `FxPairModal`, gated on `/api/fx-rates/can-manage-pairs`. Shared extracted components: `SeriesChart`, `FxCustomEditModal`, `FxPairModal`. Live scraping deferred to a worker; platform FX defaults refreshed via the scrape action (no manual per-quarter platform editor).

- 🟢 **Scrum 18** — Data import & export — Wave 1: forgiving import of core data, export of anything on screen; consolidate existing CSV/Excel
  - 🟢 Every upload shows a row-count preview before committing (FileUpload component two-step dry_run preview; Pricing page inline preview)
  - 🟢 Per-row errors returned with row number and description (all parsers: prices, volumes, FX, indexes)
  - 🟢 Common column name variants accepted without failing (`_read_file()` normalises: strip, lower, space→_)
  - 🟢 Both CSV and `.xlsx` accepted for all uploads (`_read_file()` + FileUpload default accept)
  - 🟢 "Download template" available at every upload dialog (Pricing prices + volumes, FX Rates default + custom, Indexes overrides)
  - 🟢 Export CSV button on every data table and result view (Dashboard, Pricing/FX, Evolution, Squeeze, Products, Formulas)
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
