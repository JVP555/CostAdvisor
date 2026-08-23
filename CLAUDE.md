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

> **Status: code-complete, not fully closed.** Every code-buildable slice across Scrums 9/10/11/16/17 has landed (branch `dev-wave1`). Draft written deliverables now exist too: `jvpdocs/security-posture.md`, `jvpdocs/eu-data-residency.md`, `jvpdocs/backup-retention-policy.md`, `jvpdocs/incident-response.md`, `jvpdocs/vendor-risk.md` — each has explicit `[NEEDS CONFIRMATION]`/`[NEEDS ACTION]` placeholders where a real dashboard check, a real drill, or a real signature is the only thing missing. **The complete remaining checklist — every non-code action across Scrums 9/10/11/12, in suggested order — lives in `jvpdocs/wave1manual.md`.** None of it is blocked on missing code; it's dashboard clicks, real accounts, an actual restore drill, and legal agreements.

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

- 🟢 **Scrum 9** — Hardened authentication on OAuth 2.0
  - 🟢 PKCE `code_verifier`/`code_challenge` used on every OAuth flow — `/login` generates a `code_verifier` (`secrets.token_urlsafe(64)`), instantiates `AsyncOAuth2Client(code_challenge_method="S256")`, and `/callback` passes the matching `code_verifier` to `fetch_token`
  - 🟢 `state` generated per-request, validated, and deleted after use — `/login` now captures the real `state` (was discarded as `_state`) and stores `{state}:{verifier}` in a short-lived HttpOnly `oauth_state` cookie (matches the existing `gc_state` pattern from the calendar OAuth flow); `/callback` reads the query-param `state`, compares it against the cookie, 400s on mismatch/missing — **before any network call to Google**, so state validation is unit-tested without mocking authlib. Cookie deleted on the success redirect
  - 🟢 Access token TTL ≤ 15 min; refresh token TTL = 7 days — new `RefreshToken` model (migration `rt1a2b3c4d5e`, only the SHA-256 hash ever stored) + `access_token_minutes=15`/`refresh_token_days=7` settings; `create_jwt` gained an optional `expiry_hours` override (default unchanged — admin impersonation tokens in `admin.py` still use the 72h `jwt_expiry_hours` default, untouched) so only the login-issued `ca_token` shrank
  - 🟢 Refresh token rotates on every use; old token is immediately invalidated — `POST /auth/refresh` (called by the frontend on a 401) hashes the incoming `ca_refresh` cookie, 401s if missing/revoked/expired, else marks the old row `revoked_at` + issues a new refresh token (`replaced_by_id` links the chain) + a new short-lived `ca_token`
  - 🟡 `ca_token` cookie has `HttpOnly`, `Secure`, `SameSite=Strict` in production — `HttpOnly`+`Secure` set; `SameSite` deliberately left at `none` rather than flipped to `Strict` — `app.dev.costadvisor.org`/`api-dev.costadvisor.org` share the registrable domain so `Strict` *should* work for XHR between them, but this can't be verified without a live cross-subdomain deploy test, and a wrong guess here silently breaks all logins in prod. **Flagged as a follow-up requiring a staging verification pass**, not attempted blind
  - 🟢 Silent refresh in `api.js` — user is not logged out on a single 401 — on a 401, `api.js` calls `POST /auth/refresh` once (concurrent 401s share one in-flight promise), retries the original request on success, only redirects to `/login` if the refresh itself also fails
  - 🟢 OAuth scope is `openid email profile` only
  - 🟢 **Bonus fix**: all 4 post-login redirects (`/login`→Google, `/callback`'s 3 branches) were hardcoded to `http://localhost:5173` instead of `settings.app_url` (which already defaults to that same value locally — confirmed zero-risk for local dev) — this is very likely the root cause of the earlier-diagnosed post-login redirect issue on `dev.costadvisor.org`; fixed as part of this pass since it's the exact code being extended
  - 🟢 Tests `tests/test_oauth_hardening.py` (7): `/callback` 400 on missing state, 400 on state mismatch (both short-circuit before any Google network call), refresh rotates + old token hash invalidated, revoked/expired refresh token rejected, missing-cookie 401, logout revokes the current refresh token

- 🟡 **Scrum 10** — Defined data-security story for buyer IT (TLS, encryption at rest, tenant isolation, audit, secrets, EU residency, backup/retention policy) — code, TLS/encryption/region/backup confirmations, and the restore drill are all done; only the final security-posture sign-off (DPAs + incident contacts) remains
  - 🟢 RLS gap closed — `roles`, `team_member_roles`, `team_invites` had a `team_id` but no `tenant_isolation` policy (app-layer gated only, confirmed via grep across every existing RLS migration). Migration `rls2a3b4c5d6e`: `team_invites`/`team_member_roles` get the direct-membership policy (same shape as `products`/`suppliers`); `roles` gets the `team_id IS NULL OR <membership>` variant (platform roles visible to all, same shape as the `formula_templates` fix). `team_memberships` stays deliberately exempt — it's the RLS bootstrap table the membership subqueries themselves read from. Tests: `test_rls.py` +3 (`test_team_invite_rls_isolation`, `test_team_member_role_rls_isolation`, `test_role_team_isolation_and_platform_visible`)
  - 🟢 Login/logout/failed-login audit trail — new platform-level `AuthEvent` model (`auth_events` table, migration `ae1a2b3c4d5e`; no `team_id`, no RLS — a login has no team yet, so it can't live in the NOT-NULL-`team_id` `audit_logs` table, and this was the lower-risk of the two options vs. making `audit_logs` nullable). `log_auth_event()` (`services/audit.py`) wired into `auth.py`: `login_success` on both new-account and returning-user paths, `login_failed` with a `reason` (`signup_disabled`/`access_pending`/`access_rejected`/`access_needed`) on every signup-gate rejection, and `logout` — deliberately NOT gated behind `get_current_user` (logout must succeed even with an expired `ca_token`; the event's user lookup is best-effort via the `ca_refresh` row's `user_id`, else a soft `ca_token` decode, never blocking the actual logout). Read surface: super-admin-only `GET /api/admin/auth-events` (mirrors the existing `/audit-logs` endpoint's filter/pagination pattern). Tests `tests/test_auth_events.py` (6): logout writes an event, logout with no valid token still 200s and writes nothing, a blocked signup writes `login_failed` with reason and no `user_id`, `/auth/refresh` does NOT write an event (only login/logout do), endpoint 403 for non-super-admin, endpoint lists for super-admin
  - 🟢 Written confirmation of TLS in transit and encryption at rest — confirmed live against production Railway: DB traffic is WireGuard-encrypted on Railway's private network (`postgres.railway.internal`), Postgres image is the TLS-enabled `postgres-ssl:18` variant, and Railway's own docs confirm disk-level encryption at rest by default. `jvpdocs/security-posture.md` §2–3 updated with sources
  - 🟢 EU data residency confirmed or migration plan documented — confirmed: production runs in **US East (Virginia)**, not EU. `jvpdocs/eu-data-residency.md` states this plainly + carries the migration-plan template for if/when an EU prospect requires it
  - 🟢 Backup/retention policy written and tested (restore drill) — PITR (continuous WAL archiving, one credential hiccup fixed via regenerate+redeploy) + daily volume backups + on-demand backups all confirmed live. Restore drill actually performed 2026-08-22: PITR restore to a new standalone Postgres service, **sub-minute** recovery, row counts verified (`users`=7, `cost_models`=20, `audit_logs`=45), production never touched, temp service deleted after. Logged in `jvpdocs/backup-retention-policy.md`
  - 🟡 Security posture document ready to share with enterprise IT — draft exists at `jvpdocs/security-posture.md` with real, sourced content for TLS/encryption/region/backups/RLS/audit; still needs vendor DPAs (below) and named incident-response contacts before it's truly "ready to hand to a prospect"

- 🟡 **Scrum 11** — SOC 2 groundwork (code slice done; the rest is ops/process, not attempted)
  - 🟡 Sentry capturing errors in production — `sentry-sdk==2.19.0` added to `requirements.txt`; `main.py` now conditionally applies `SentryAsgiMiddleware` (`if _SDK_AVAILABLE and settings.sentry_dsn`) — previously imported in `observability.py` (added in an earlier "Phase 13" pass by Alexis, commit `8877632`) but never actually attached to the FastAPI app at all, so even a configured DSN wouldn't have captured anything. Verified both branches locally: with the SDK installed and no DSN, middleware stays absent (inert, as before); with a DSN set, `app.user_middleware` includes it. **Deliberately deferred** — asked Alexis to confirm whether a Sentry account/project already exists from the earlier Phase-13 work before creating a new one; `SENTRY_DSN` will be set in Railway's production env vars once that's confirmed
  - 🟢 Uptime monitoring with alerting configured — UptimeRobot, 3 monitors (`api.costadvisor.org/health`, `app.costadvisor.org`, `costadvisor.org`), 5-minute interval, email alerting configured
  - 🟡 Branch protection on `main` enforced — **deliberately deferred**: only 3 people work on the private repo today, so the risk this guards against is low; revisit once the team grows (tracked in `jvpdocs/wave1manual.md`)
  - 🟢 Costing engine has determinism regression tests — `test_brief.py` covers brief / evolution / squeeze (repeated calls return identical output) + exact numeric anchors on the brief
  - 🔴 Incident response plan written
  - 🔴 Vendor DPA list complete
  - 🔴 **Production env vars still missing** (found auditing the live Railway production service against `config.py` during the go-live push — `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD`/`EMAIL_FROM` and `GOOGLE_CALENDAR_ENCRYPTION_KEY` are all absent): without SMTP, team invites/welcome emails/demo confirmations/alert emails all silently fail to send; without the calendar key, the demo-scheduling Google Calendar integration can't be used. Two fresh Fernet keys were generated for `GOOGLE_CALENDAR_ENCRYPTION_KEY` (dev + prod, never shared between environments) and handed to the user in chat — still needs to actually be pasted into Railway. SMTP needs a real provider account (Gmail/SendGrid/Mailgun/SES) chosen and set up by the user first; not something generatable. Also noticed live: `JWWT_EXPIRY_HOURS` (typo, extra "W") is set in production but silently ignored — pydantic-settings won't match it to `jwt_expiry_hours`, so the app falls back to the 72h default regardless; low-impact (only affects admin-impersonation token lifetime) but worth a rename or deletion whenever convenient
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
  - 🟢 Host-aware `API_URL`/`APP_URL` (`dev.` host → dev API/app); "Sign in" link added to nav (`.js-signin` → the app), nav order Schedule Demo → Request Access → Sign in
  - 🟢 Core Web Vitals hardening: Chart.js loaded `defer`, FX monitor (`loadDailyFx()`) gated behind an IntersectionObserver on `#fx`, reserved chart height to avoid layout shift
  - 🟢 Staging deploy plan: landing on `dev.costadvisor.org`, app moved to `app.dev.costadvisor.org` (Cloudflare Workers Builds per-branch worker `costadvisor-landing-dev` via `wrangler.jsonc` name + `dev` production branch; CORS `https://dev.costadvisor.org` added — both on `dev-push`); custom-domain wiring is the user's dashboard step
  - 🟢 StaminaChem parent-company tie-in (CostAdvisor is a StaminaChem product): footer "Built by StaminaChem" + real contact (laurent.thomas@staminachem.com, both phones, Vienna address), copyright "a StaminaChem company", legal-contact + JS error-fallback emails switched to StaminaChem, JSON-LD `publisher` Organization. No Calendly (kept in-app demo flow); no StaminaChem link in nav (per owner)
  - 🟢 Skill-driven upgrade pass (v0/lovable/bolt/claude-artifacts skills): **real data** — new public `GET /api/indexes/public-quarterly` (rate-limited, no-auth, curated headline commodities) now feeds the ticker, Market Pulse cards, signal tiles, and Evolution chart (lazy-loaded via IntersectionObserver on `#market`; hardcoded arrays kept as no-JS/API-down fallback; "live vs sample" caption). Evolution should-cost line is driven by a live commodity index, supplier line labelled illustrative
  - 🟢 Accessibility: skip link + `<main>` landmark; modals get `role="dialog"`/`aria-modal`/Tab focus-trap + focus restore; chart canvases get `role="img"` + aria-labels
  - 🟢 CWV: Google Fonts made non-render-blocking (preload + `media=print` swap + `<noscript>`); ticker min-height reserved
  - 🟢 SEO: branded 1200×630 `og-cover.png` + `og:image`/`twitter:image` tags; FAQPage JSON-LD added alongside SoftwareApplication
  - 🟢 v0 polish: disabled-button styling + FX range disabled until live data; access-modal submit spinner; demo-calendar "checking availability…" state; slider-fill rAF throttle; `.text-pos/.text-neg/.text-muted` utility classes
  - 🟢 Modern chemicals/procurement visual identity (R1–R4, v0 + claude-artifacts skills): **R1** type system Space Grotesk (display) + Inter (body) + JetBrains Mono (data); refined tokens (ink text, deep teal `--ink/--ink2`, layered shadows), flattened cards. **R2** benzene-ring hex lattice behind the hero + "chemical procurement" badge/copy. **R3** periodic-element formula badges on commodity cards (NaOH, Cl₂, H₂SO₄, HCl, CH₄, C₅–C₁₂). **Logo**: unified index-line mark (nav/footer/favicon/OG) via shared `<symbol>`. **Icons**: all emoji replaced by a 16-symbol Lucide-style stroke-icon sprite. **Motifs** (distinct, non-repeating): molecule network (security), atom orbitals (CTA). **R4** deep teal-ink testimonial contrast band, elevated hero mockup (clean surface + teal accent + current-quarter labels), cohesive ghost buttons
  - 🟢 Landing page deployed and live at `costadvisor.org` / `www.costadvisor.org` (Cloudflare Custom Domain binding on the `costadvisor-landing` worker) — production went live 2026-08-22, along with `app.costadvisor.org` (the SPA, `costadvisor-web` worker) and `api.costadvisor.org` (Railway). Hit and fixed along the way: an initial apex-domain mixup (bound to the app worker instead of landing), a Cloudflare 522 from a stale binding, and a Railway 502 from the redeploy not having actually run yet — all resolved, see `jvpdocs/wave1manual.md`
  - 🔴 Google Search Console shows page indexed — domain now live, verification not yet done
  - 🔴 Core Web Vitals pass (LCP < 2.5 s) — measured in the field, needs real traffic post-launch first
  - 🟢 All three roadmap proof points now on the page and sourced: McKinsey 13% + AlixPartners ~50% (existing per-card stats) plus a consolidated Bain 8–12% strip below the feature cards (`.fd3-consult`, theme-safe via existing CSS tokens only). Formal verification done — each figure now links directly to its primary source: McKinsey's *"Transforming procurement for an AI-driven world"* (a specialty chemicals company's should-cost COE, 13% raw-material savings — an exact-niche match), AlixPartners' *"Weathering Cost Volatility"* (chemical industry client, ~50% of cost headwinds deflected), Bain's *"Unearthing the Hidden Treasure of Procurement"* (8–12% purchasing-cost-base reduction for world-class procurement orgs)
  - 🟢 **Lighthouse/PageSpeed pass** (real report on the live prod page: Performance 88 mobile/99 desktop, Accessibility 88, Best Practices 96, SEO 92) — fixed every concrete finding: 7 form labels now have matching `for=`, 4 demo-slider `<input type="range">`s got `aria-label`s, the `--dim` text-color token (`#7c8b91`, 3.1–3.5:1 contrast, failing WCAG AA at every size it's used) darkened to `#63737a` (4.5:1+, verified by contrast calculation), and 5 places where headings skipped a level (`h2→h4`, `.fd3-card`/`.security-tile`/`.legal-card`/footer columns) were renumbered with their tag-scoped CSS selectors renamed in lockstep (`.fd3-card h4`→`h3`, `.fd3-item h5`→`h4`, etc. — verified the full heading sequence afterward has zero skips). SEO's "links are not crawlable" fixed: the two `href="javascript:void(0)"` "Schedule Demo" links (mobile nav + footer) now have a real `href="#cta"` fallback (`return false` suppresses navigation when JS runs the modal) — chosen over converting to `<button>` since it needed no CSS changes and matches the page's own no-JS-still-works philosophy. New `landing/_headers` file (Cloudflare Workers static-assets honors the same `_headers` convention as Pages, confirmed — no Worker script needed) adds CSP/HSTS/X-Frame-Options/nosniff/Referrer-Policy/COOP; CSP needs `'unsafe-inline'` for scripts+styles since the page is inline-`<script>`/`onclick=`/`style=` throughout — stated as an explicit tradeoff, not hidden: still real value restricting which third-party domains can load/connect at all. Bonus: removed a dead `<script src="http://localhost:8400/live.js">` (an `impeccable`-design-tool live-reload tag, shipping in production since commit `cd6e351`, silently failing for every real visitor). Mobile LCP (3.0s, just over the 2.5s "good" threshold) and CSP Trusted Types both explicitly out of scope — deeper work, not part of "fix the Lighthouse findings"

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
  - 🟢 Backfilled real free source URLs onto the seeded indexes (`INDEX_SOURCE_URLS` + idempotent backfill in `seed_shadow_library.py`, only fills rows where `source_url` is null): 13 chemicals → businessanalytiq price-index pages, 5 minerals → USGS NMIC. 64/68 non-FX indexes now have a Provider link; 4 specialty feedstocks (Alpha Olefins, PPD, Terephthaloyl Chloride, Tallow) have no free source and stay manual. `source_url` is a reference link only — `scrape_enabled` stays off until a per-index scraper is wired

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

- 🟢 **Scrum 16** — Self-serve onboarding (empty states, example data, guidance to first should-cost vs actual gap)
  - 🟡 Every list/chart page has a non-empty empty state with a clear next action (Dashboard, Pricing, Products, Suppliers "+ Add your first supplier", Formulas, and the merged Index Library "No index data… yet" all covered; standalone FX Rates / Indexes pages were retired into the Index Library; Scenarios still to do)
  - 🟢 "Load example data" works for a brand-new team and produces a runnable should-cost — `seed_staminachem.py::run()` refactored to accept `team_id`/`created_by` as parameters (module constants become defaults, so `seed_all.py`'s existing call is unaffected); `POST /api/teams/{id}/load-example-data` (gated `products.edit`, audit-logged) calls it for the active team. Live-verified against a genuinely new team (not the hardcoded staminachem one): 5 products/10 cost models created, idempotent on re-run. "Load example data" secondary button added to the `Dashboard`/`PortfolioArea` empty states
  - 🟢 Onboarding checklist tracks real progress and disappears when done — `GET /api/teams/{id}/onboarding-status` computes 4 signals live from existing data (no new schema): has a product, has a priced cost model (`CostModel` ⋈ `FormulaVersion`), has an actual price, has generated a brief (reads the existing `brief_generated` `AuditLog` event as an aggregate boolean). `components/OnboardingChecklist.jsx` mounted in `App.jsx` next to `ImpersonationBar` (same self-fetching, return-`null`-when-done pattern); dismiss persisted per-team in `localStorage`
  - 🟡 A new user can reach a gap insight without external guidance — the checklist now points at the exact 4 steps (product → should-cost → actual → brief); "reach a gap insight without guidance" as a full guided-tour experience is not attempted
  - 🟢 Tests `tests/test_onboarding.py` (5): load-example-data works for an arbitrary new team + is idempotent, 403 without edit permission, onboarding-status reflects real progress at each step, 403 for a non-member
  - 🟢 Fixed dead ends (from cost-model-split analysis): routed the `Squeeze` page (`/cost-models/:id/squeeze`) + linked it from the CostModelBuilder / Evolution / Brief nav rows; added `Products` to the `Navbar`

- 🟢 **Scrum 17** — Inspectable numbers (show how a should-cost was built: index values, weights, FX/unit/Incoterm conversions)
  - 🟢 Every should-cost figure has an accessible breakdown — `POST /api/costing/should-cost/breakdown` (gated `costing.view`, 422 with no formula) + a "Show breakdown" toggle in `ProductDetailArea.jsx` rendering `ShouldCostBreakdownTable` (mirrors `FormulaDetailModal`'s resolved-recipe table visual pattern — index/weight/ratio/contribution columns, PROXY-style source badges)
  - 🟢 Breakdown shows: index name, weight, base value, current value, ratio, contribution — `_compute_indexed_cost_detailed` (new, parallel to `_compute_indexed_cost` so the 3 existing callers are untouched) mirrors the simple-mode loop exactly, building a `ComponentBreakdown` per component
  - 🟢 Breakdown shows: indexed cost, margin, FX rate used, unit conversion, Incoterm adjustment — `calculate_should_cost_breakdown` wires the previously-dead `ShouldCostRequest.display_currency`/`display_unit` fields (existed on the schema, never passed to the engine — confirmed) through `_apply_fx`/`_apply_unit`, applied to the total *and* proportionally to each component so the breakdown still sums in the display currency/unit; reports the FX rate/unit factor used. Captures should-cost before/after `_normalize_to` and exposes the difference as `incoterm_adjustment`
  - 🟢 Index source is shown (scraped / team override / fixed) — new `get_single_index_value_detailed` in `data_resolver.py` (the existing `get_single_index_value` becomes a thin wrapper around it, zero behavior change for its ~10 existing callers) returns `(value, source)` at every branch of the priority chain: composite/fixed/team_override/scraped_region/scraped_global/scraped_any_region/scraped_temporal_carry_forward
  - 🟢 Numbers in the breakdown sum to the displayed should-cost exactly — `_apply_margin` (confirmed by direct read) always returns `margin_amount = should_cost - indexed_cost` in every branch, so `cost_before_margin + margin_amount == should_cost` pre-Incoterm by construction; the explicit `incoterm_adjustment` line completes the sum to the final (post-normalization) should-cost. **Bonus fix**: `_resolve_basis` referenced a nonexistent `cost_model.landed_cost_adjustments` (the column only exists on `FormulaVersion`) — calling `/should-cost` with `normalize_to_incoterm` set has been crashing with `AttributeError` since this was written; fixed as part of this work since it's the exact function being extended
  - 🟢 Tests `tests/test_should_cost_breakdown.py` (6, reusing the `brief_model` fixture from `test_brief.py`): components sum to `cost_before_margin`, margin-sum identity holds at a non-zero margin, Incoterm-adjustment completes the sum, a component missing all index data (not just the current quarter — temporal carry-forward would otherwise mask it) appears in `data_gaps` and rides flat, non-member 403, no-formula 422
  - 🟢 Scoping note: this breakdown IS the Wave-1 form of the mockup's Negotiate "itemized FOB→landed" view. The full 5-area workspace (Monitor/Forecast/Negotiate/Portfolio/Indexes) is a **Wave 2** reorg of the existing cost model (~55% already built), NOT Wave 1 — see `jvpdocs/cost_model_split_roadmap.md`, `cost_model_split_steps.md`, `cost_model_split_vs_wave1.md`. Wave 1 priority stays: Scrum 16 + 17, with 9/10/11/12 as the real finish-line blockers.
  - 🟢 Wave-2 Index Library (`pages/workspace/IndexLibraryArea.jsx`) is now the **single home** for indexes + FX — the standalone `/indexes` and `/fx-rates` pages were deleted (`Indexes.jsx`, `FxRates.jsx` removed; both routes 301→`/index-library`; nav entries dropped). Single table (no tabs); EVERY tracked index is listed — non-FX rows built from the full `/api/indexes` commodity list (value-less indexes get an empty `GLOBAL` row, so the shadow-library indexes appear even before they carry data), plus ALL `fx_pairs` as rows (from `/api/fx-rates/pairs`) with platform/override-resolved values + live latest. Row key is `${mat}-${reg}` (FX pairs have null `commodity_id`). Provider column links to each index's `source_url` (commodity) / `scrape_url` (FX pair) in a new tab; CSV export includes a "Source URL" column. Editing is by clicking a quarter cell in the row (incl. the latest-period cell): non-FX → `EditCellModal` (fixed, `/api/indexes/overrides/*`), FX → `FxCustomEditModal` 3-mode (`/api/fx-rates/custom`); overridden cells render in an accent colour. Override save fix: response built **before** commit (transaction-local RLS GUCs reset on commit). Drill-in `IndexPopupModal` is view-only: CSV-export + Print in the header; an interactive `SeriesChart` with a **Default / Custom / Compare** graph toggle (Default = scraped line — FX daily from `/api/fx-rates/daily`, else quarterly; Custom = the default line taking the custom value at overridden quarters with those points white-ring highlighted; Compare = both lines overlaid + per-quarter diff stats), shown only when ≥1 override exists; crosshair + range selector + two-point selection; a three-price header (live/quarterly/overridden); a deterministic Statistics card (`utils/seriesStats.js`); a historical Default/Custom table (Custom column appears only when an override exists); kept AI Analysis; portfolio impact; and (FX-manager only) an FX Pair admin card — add (header) / edit / delete / scrape-live / scrape-platform via shared `FxPairModal`, gated on `/api/fx-rates/can-manage-pairs`. Shared extracted components: `SeriesChart` (Catmull-Rom smooth path, `comparePoints`/`markedLabels`/`color` props), `FxCustomEditModal`, `FxPairModal`. Live scraping deferred to a worker; platform FX defaults refreshed via the scrape action (no manual per-quarter platform editor).
  - 🟢 **Fix: top-level "Sync FX rates" button restored** — the FX consolidation dropped the old FxRates "Scrape All" button (only per-pair scrape survived inside the popup), so a freshly-seeded env (e.g. `dev.costadvisor.org`) had no FX data and no way to fetch it (the seed loads commodity `index_values` but NOT FX rates). Added a `canManagePairs`-gated toolbar button in `IndexLibraryArea` → `POST /api/fx-rates/scrape` (ECB scrapers + `sync_fx_rates` + Frankfurter quarterly backfill for all pairs), with `addToast` feedback + grid refetch; stale empty-state text (pointed at the retired Indexes page) updated to reference it
  - 🟢 **UX pass on the Index Library grid** (from a design critique of `IndexLibraryArea.jsx`; scored 15/40 before, all P0/P1s addressed):
    - 🟢 **Layout** — 43 per-category stat tiles (816px) → 4 filter-aware tiles; 49 filter chips (212px, incl. 44 near-duplicate categories) → search + Family select + Region select + Followed toggle + Clear filters. Chrome before the first data row: **1,269px → 403px** (1.72 → 0.55 viewports); rows visible at once 4.5 → ~20. Fixed the `flex: 1 1 150px` orphan tile stretching to 1300px, and moved `+ Add Index` / Export / Sync out of the wrapped chip row into the page header
    - 🟢 **Rendered columns windowed to the last 8 quarters** (was every quarter found = 28, Q4-19→Q3-26). This removed the `overflow-x` wrapper, which as a scroll container had been the sticky containing block — so `thead` offset by the nav height rendered 58px *down inside the card* and could never pin to the viewport. Header now pins correctly under the nav; DOM cells 7,400 → 1,250. Full history stays in the row's detail view; CSV still exports all quarters, and the grid footer says what's hidden
    - 🟢 **Free-text `category` folded onto the 7 canonical families** for grouping + colour (43 raw values incl. "Base metal"/"Base metals", three labour variants, six overlapping energy buckets → Metal/Energy/Chemical/Labor/PPI/Freight/FX/Other). Exact-match override map + ordered fallback patterns; raw category preserved in the row tooltip. Previously 36 of 43 groups fell back to the brand accent, so colour looked like a category signal while encoding nothing
    - 🟢 **Per-row data-trust status chip** from `retrieval_status` (Live / Proxy / Weak / Blocked / Stale / No data). 135 of 201 rows are seeded catalog placeholders with no feed and previously rendered as bare em-dashes; `Followed only` now defaults ON with an explicit "Showing all N" escape, and filtering to zero shows a real empty state naming the active filters (it used to render headers over an empty `<tbody>`)
    - 🟢 **Number formatting** — decimals chosen per row from that row's own magnitude (a flat 2dp made a 0.13 EUR/kWh series render identically across four quarters while its own vs-base column said −10.8%); FX pair names no longer passed as a `unit`, which had produced `0.61/AUD/EUR` in every cell; movement under 0.05% renders as neutral "flat" instead of danger red (`delta >= 0` had painted pegged pairs `+0.0%` red with a flat red sparkline, inverting the Signal Color Rule); `2-yr trend` header replaced with the honest base period
    - 🟢 **Keyboard + a11y** — rows are focusable with Enter/Space (0 of 201 were reachable before); group headers get `role`/`aria-expanded`/keyboard toggle (a collapsed group couldn't be reopened without a mouse); `aria-pressed` on toggles; `role="img"` + labels on every `Sparkline`; `<caption>` + `scope="col"`. Period cells stay pointer-only **by design** — one tab stop per cell would put ~5,800 stops on the page — so the detail view's Historical Data list is the keyboard path to a per-quarter override (`onEditPeriod`)
    - 🟢 **Detail view** (`IndexPopupModal`) — Escape closes, Tab is trapped, focus restores to the originating row (it hand-rolls its own backdrop so it had inherited none of that from `Modal`); header is sticky (the only close affordance used to scroll away); removed the inner 260px scroll box on Historical Data that captured the wheel and left AI Analysis / Portfolio Impact / Source unreachable; raw endpoint URL replaced with a provider label; empty AI card now states why it's empty
    - 🟢 **Repo-wide token fixes found along the way** — `.ca-table th.right/td.right` was **never defined** despite 19 usages, so every "right-aligned" numeric column in the app was left-aligned; `var(--danger)` (7 usages across `SeriesChart`, `PriceChart`, `IndexPopupModal`) was never defined, so every price-*fell* indicator rendered colourless while price-rose was red; `--accent1`/`--accent1-dim`/`--surface-hover` (FX 3-mode override editor) were undefined, making the *selected* mode indistinguishable from unselected; `--warning`/`--warning-bg`/`--accent-bg` fell back to hardcoded light-theme hex (`#92400e`, `#fffbea`, `#f0faf4`), breaking the dark and amber themes in `Evolution`, `Pricing`, `FileUpload`, `IndexDetailPanel`. Also: React key moved onto the wrapping Fragment (was a console warning), `Toast`'s 4px left stripe replaced with a full border, skeleton loading state with a `prefers-reduced-motion` path, ambiguous `Dec 19` chart axis → `Dec ’19`, chart default range no longer `All` (1,660 daily points over ~660px), and silently-swallowed FX fetch errors now surface a toast instead of making 31 rows vanish
  - 🔴 **Follow-up — `commodity_indexes` has no link to the taxonomy**: the Scrum 55 spine is `ChemicalFamily → Subfamily → Product`/`FormulaTemplate`; `CommodityIndex` carries only free-text `category`, so grouping the index grid by family is currently a display-layer mapping (above), not real data. Needs (a) an Alembic migration adding `commodity_indexes.family_id`/`subfamily_id` + a mapping pass over the 133 metadata commodities, and (b) `GET /api/indexes/usage` returning `commodity_id → family codes` in one query, so the grid can show a real "Used by" column without an N+1 (derivable today only via `FormulaTemplateComponent`, which is many-to-many and depends on the stale Scrum 60 combos drop)
  - 🔴 **Follow-up — backend venv is broken**: `backend/venv/Scripts` has the entry-point scripts (`alembic`, `celery`, …) but no `python.exe`, so `pytest` could not be run during this pass (frontend-only changes; `npm run build` clean). Rebuild with `python -m venv venv && pip install -r requirements-dev.txt` before the next backend task

- 🟢 **Scrum 18** — Data import & export — Wave 1: forgiving import of core data, export of anything on screen; consolidate existing CSV/Excel
  - 🟢 Every upload shows a row-count preview before committing (FileUpload component two-step dry_run preview; Pricing page inline preview)
  - 🟢 Per-row errors returned with row number and description (all parsers: prices, volumes, FX, indexes)
  - 🟢 Common column name variants accepted without failing (`_read_file()` normalises: strip, lower, space→_)
  - 🟢 Both CSV and `.xlsx` accepted for all uploads (`_read_file()` + FileUpload default accept)
  - 🟢 "Download template" available at every upload dialog (Pricing prices + volumes, FX Rates default + custom, Indexes overrides)
  - 🟢 Export CSV button on every data table and result view (Dashboard, Pricing/FX, Evolution, Squeeze, Products, Formulas)
  - 🟢 Exported CSV column names are human-readable (not internal field names)

---

### Wave 2 — Catalog track & new journey IA (Scrums 55–68)

> Re-sequenced: the catalog track is now **Wave 2**. Scrums 55–60 are shipped; 61–68 (UI-1…UI-8) build the new 8-tab journey shell + tabs.

### Scrum 55 — Catalog taxonomy & platform/team forking

Ship a shared starting catalog that any team can fork into a private, editable copy without touching ours or another team's. Reference: `sample_idea/scrum55/02-platform-vs-team.md`.

- 🟢 **DB-1** — Taxonomy spine: add subfamily + platform/team forking (8 pts)
  - 🟢 Model `ChemicalFamily` (family) extended with `team_id` (NULL = platform, set = team fork), `origin_id` (fork back-link to platform original), `code`; new `Subfamily` model (family → subfamily → product) with the same fork columns; `Product` gains nullable `subfamily_id` (family link kept)
  - 🟢 Migration `tx1a2b3c4d5e` + backfill: existing products keep `chemical_family_id` (no orphaning); dropped global `UNIQUE(name)` (breaks forking) and re-scoped uniqueness via partial indexes (platform names unique among platform; team names unique per team; same for subfamilies per family)
  - 🟢 RLS on `chemical_families` + `subfamilies`: platform rows (`team_id IS NULL`) readable by all; team rows scoped to the team (same policy shape as `formula_templates`); reversible downgrade verified
  - 🟢 Fork endpoints: `POST /api/chemical-families/{id}/fork` and `POST /api/subfamilies/{id}/fork` (copy platform node → team node, set `origin_id`); only platform nodes forkable (400 on team row), duplicate fork per team blocked (409), gated on `products.edit`; team-scoped create/delete added, platform create/delete stays super-admin
  - 🟢 Tests `tests/test_taxonomy.py` (8): DB-level RLS isolation (family + subfamily), fork creates team copy + survives rename (origin resolves), can't fork a team row, duplicate 409, foreign-team 403, subfamily fork keeps platform family, product maps to family with subfamily optional. Full suite 59 passed
  - 🔴 Note: `code` is nullable and NOT globally unique (forks share their origin's code) and NOT contiguous (family codes F01–F28 skip numbers) — never assume either when walking the taxonomy
  - 🔴 Follow-ups (not DB-1): seed the real 22 → 91 → 257 catalog; frontend taxonomy UI (browse/fork/rename); repoint a team's products onto their forks

---

### Scrum 56 — Region as a first-class entity (5 pts)

Region was free-text/enum in 5 tables; promote it to a managed reference table with FKs and self-referential subregions.

- 🟢 **Region model + seed 7 (+Global)** — new `Region` (`code` unique natural key, `name`, self-ref `parent_id` for subregions). Seeded 7 top-level (Europe, NA, Latam, Asia, ME, Africa, Oceania) + `GLOBAL` sentinel (preserved for the `data_resolver` Europe→GLOBAL→any fallback), plus subregions NWE/France→Europe, USA→NA, China→Asia to reconcile feed grain
- 🟢 **Migrate 5 tables' region columns → FK + backfill** — migration `rg1a2b3c4d5e` FK-ifies all 7 region columns (`cost_models.region`+`destination_region`, `freight_lanes.origin_region`+`destination_region`, `index_values.region`, `index_overrides.region`, `team_index_sources.region`) → `regions.code`. Backfill inserts every DISTINCT existing region string first (absorbed real dev-DB typos like `EU`/`eu`/`ASIA`/`INDIA` as rows) so **no orphaned strings**; reversible downgrade verified. Columns stay VARCHAR so the string-matching resolver/costing/scraper code is untouched — value is now a validated FK, not free text
- 🟢 **Admin CRUD endpoint** — `/api/regions` (GET open to authed for dropdowns; POST/PUT/DELETE super-admin). Subregion = POST with `parent_id` → **added as a child with no migration**; DELETE of an in-use region → 409 (FK-guarded); duplicate code → 409
- 🟢 **Free-text safety net** — a single `before_flush` session listener (`services/regions.py`) auto-registers any region code written through the ORM (race-safe `ON CONFLICT DO NOTHING`), so the free-text write paths (AddIndexModal, CSV upload) never 500 on the new FK; registered in `main.py` + the Celery task module
- 🟢 **Reconcile feed region grain** — scrapers all write `GLOBAL`; finer grain (NWE vs EU, France/USA/China) lives in commodity *names*. Seeded the subregion hierarchy as the target to reconcile onto; repointing specific feeds onto subregions is a follow-up
- 🟢 Tests `tests/test_regions.py` (8): seed+hierarchy (NWE child of Europe), no-orphan invariant across all 5 tables, DB rejects unknown region (raw insert), ORM auto-registers new region, admin create-subregion, super-admin gating, delete-in-use 409, delete-unused 200. Full suite 67 passed
- 🟢 Frontend region picker — reusable `components/RegionSelect.jsx` (fetches `/api/regions`, session-cached, submits the region `code`, indents subregions under parents, keeps an unknown current value selectable). Wired into `CostModelBuilder` (Producing + Destination Region, replacing the hardcoded `REGIONS`) and `AddIndexModal` (replaced the free-text region box; dropped the `.toUpperCase()`). Read-side region *filter* buttons (IntelligenceArea, IndexLibraryArea) intentionally left as-is. Frontend build passes
- 🟢 Admin Regions screen — `Admin.jsx` "Regions" tab (super-admin): indented tree list, add region/subregion (parent picker), edit (rename/reparent; code locked; excludes self+descendants to block cycles), delete (409 if in use). Backend `PUT` fixed to allow promote-to-top-level (explicit null via `model_fields_set`) + ancestor-walk cycle guard. Frontend build passes
- 🟢 Typo-region cleanup — migration `rgc2b3c4d5e6` merges the 6 backfilled typo rows onto canonical (`EU`/`eu`→`Europe`, `ASIA`→`Asia`, `INDIA`→`India`, `BLOBAL`/`GLOBSL`→`GLOBAL`; 67 references repointed across all 9 region FK columns, collision-safe canonical-wins dedupe on unique-keyed tables, merges sequential so same-target typos can't collide; typo rows deleted, 21→15 clean regions). `before_flush` safety net hardened: known-alias map + case-insensitive canonicalisation rewrite the value onto the canonical row instead of minting a near-duplicate (`EUROPE`→`Europe`, `BLOBAL`→`GLOBAL`); genuinely new codes still auto-register. Tests: `test_regions.py` 11 (3 new: case-variant rewrite, alias rewrite, closed-vocabulary invariant). Full suite 121 passed
- 🔴 Follow-ups: repoint feeds onto subregions

---

### Scrum 57 — Index metadata & proxy-mapping fields (5 pts)

Carry, on each index, how it's approximated from free data, how often it refreshes, and how much to trust it — so paywalled feeds can be estimated and an estimate reads as a softer signal than a real feed. Reference: `sample_idea/scrum57/seed-data-reference.xlsx` (158 feeds).

- 🟢 **Add columns + migration** — `im1a2b3c4d5e` adds to `commodity_indexes` (region-agnostic, no region column): `access_tier`, `role`, `retrieval_status`, `free_source_name`, `free_source_url`, structured `proxy_logic` (JSONB), `proxy_for_id` (self-FK, proxy-stands-in-for). `frequency` already existed and is reused. Widened `category` 32→64 (reference categories are longer). Reversible downgrade verified. No RLS (platform table)
- 🟢 **Seed the enum vocabularies** — `constants/index_metadata.py`: `ACCESS_TIERS` (Free/Partial/Subscription), `FREQUENCIES`, `ROLES` (feedstock/energy/fixed), `RETRIEVAL_STATUSES` (free/good_proxy/weak_proxy/blocked), `PROXY_OPERATIONS`; `validate_proxy_logic()` enforces the structured spec shape (base_index + operation + spread + spread_unit + recalibration + note). Exposed on `CommodityIndexOut`
- 🟢 **Reconcile feed codes (region-in-code → commodity + region)** — `seed_index_metadata.py` reads the workbook, strips the ` · Region` name suffix → base commodity, and loads the **158 feeds → 59 region-agnostic commodities** (47 created, 12 matched existing) with **no region duplicated onto the index** (region stays on `index_values`). 157 region combos reconciled. `proxy_logic` prose stored in `note`; executable params left for the admin editor (SCRUM-67)
- 🟢 **Flag blocked feeds** — Ilmenite ore + Rutile ore loaded with `retrieval_status=blocked` (marked, **not dropped**)
- 🟢 Tests `tests/test_index_metadata.py` (7): vocabularies, `validate_proxy_logic` accept/reject, name-split, region-priority representative, proxy-logic builder, end-to-end reconcile (158→59, blocked flagged, no region on index), model round-trip incl. `proxy_for` self-FK. Full suite 74 passed
- 🔴 Known limitation / follow-up: 20 of 32 multi-region commodities have **divergent per-region metadata** (retrieval/frequency/access); per the spec, index-level metadata takes a representative feed by region priority (Global→EU→NA→APAC→CN→IN→LA→MEA), so per-region proxy fidelity is lost (e.g. Iron scrap is `free` in NA but the index shows Global's `weak_proxy`). A per-(commodity,region) proxy layer is the real fix for FD-1 (SCRUM-80). Also: map feed region codes (EU/CN/APAC/…) onto the Scrum-56 region entities when values load
- 🔴 Follow-ups (other scrums): admin proxy editor to fill structured `proxy_logic` params (SCRUM-67 / UI-7); FD-1 executes proxy_logic to produce estimates (SCRUM-80)

---

### Scrum 58 — Weighted components (no regression) + formula × region coverage

Give FormulaTemplate a structured weighted-lines form and per-region pricing — the substrate the 257-formula / 676-combo catalog loads into. Reference: `sample_idea/scrum58/`; writeup: `jvpdocs/scrum58.md`.

- 🟢 **FormulaTemplate component child** — `FormulaTemplateComponent` (`formula_template_components`): `component_type` (`index`/`fixed`/`formula`), nullable `commodity_id`, `input_template_id` (chaining), **signed** `weight_pct`, `is_proxy` ("stand-in index" = softer signal), `sort_order`. Type/target coherence + no-self-reference as DB CHECKs; weights must sum to 100 (±0.01) at the Pydantic layer (NOT the DB — seeders must keep the invariant themselves). `formula_templates.expression` now nullable (purely-weighted templates); frontend readers guard `|| ''`
- 🟢 **Per-(formula × region) coverage table** — `FormulaRegionCoverage` (`formula_region_coverage`): a combo = one formula priced in one region, unique `(template_id, region)`, region FK → `regions.code`; carries `base_price`/`currency`/`margin_pct`/`base_year`+`base_quarter`. Coverage writes validate the region explicitly (400 on typo) instead of relying on the free-text auto-register net
- 🟢 **Resolver (formula × region) + fallback** — `services/formula_resolver.py`: `resolve_coverage` falls back **exact → parent chain (NWE→Europe) → GLOBAL → Europe**; `flatten_components` expands chained formulas into effective lines with multiplicative weights (60% of a 50% line = 30%), each line tagged depth + source template for drill-down
- 🟢 **Formula-as-input chaining (tiered, depth cap)** — `MAX_CHAIN_DEPTH = 3` hops + cycle detection; the same walk is the write-time guard (`assert_valid_chain_input`) so cycles/over-deep chains 400 before save. Scope rule: platform formulas chain only platform (a team resolving one must never silently miss a private line); team formulas chain platform or same-team. Deleting a template used as an input → 409 (visible pre-check + IntegrityError backstop)
- 🟢 **API** — `GET/PUT /api/formulas/{id}/components` (PUT = replace-as-a-block), `GET …/coverage` + `PUT/DELETE …/coverage/{region}`, `GET …/resolve?region=&team_id=`. Permissions mirror the template tier (platform vs team `formulas.edit`; reads on `formulas.view`); mutations audit-logged
- 🟢 **Migration `wc1a2b3c4d5e`** — both tables + RLS (transitive through the parent template, same pattern as `formula_components`→`cost_models`; FORCE RLS) + expression nullable; reversible downgrade verified
- 🟢 Tests `tests/test_weighted_formulas.py` (12): RLS isolation (components + coverage), replace-block semantics, weight-sum/coherence 422s, fallback chain (exact / subregion→parent / GLOBAL / terminal Europe / unknown region 400), chained flattening weight math, depth cap at exactly 3 hops, cycle + self-ref blocked, delete-in-use 409, platform-can't-chain-team 400. Full suite 86 passed
- 🟡 Follow-ups: ~~seed the 257→676 catalog~~ (shipped as Scrums 59/60); ~~frontend weighted-lines editor + coverage grid + proxy/resolved-region badges~~ (shipped — `FormulaDetailModal` read/review view: region pills, resolved recipe table with PROXY/depth/`line_region`-fallback badges + Σ footer, coverage stat cells with inline pricing editor + add/remove region via `RegionSelect`; `FormulaModal` gains an Expression / Weighted-lines mode toggle editing the region-NULL template set with live Σ validation and index/fixed/formula line types incl. chaining). ~~costing-engine evaluation of weighted templates~~ (shipped — see "Catalog core blockers" section below)

---

### Scrum 59 — SEED-1: load families & indexes (idempotent, no duplicates) (8 pts)

One re-runnable loader (`backend/seed_catalog.py`) that gets the catalog taxonomy + the 158 index feeds actually loaded — upsert by stable key, update-in-place, never delete. Reference: `sample_idea/scrum59/`; writeup: `jvpdocs/scrum59.md`.

- 🟢 **Idempotent upsert framework (stable keys)** — family `code` (F01…, name fallback for pre-existing code-less rows) · subfamily (family, name) · formula shell `code` = formula_id · index base-name (Scrum 57 reconciliation). Nothing is deleted: platform rows missing from the source are reported **stale**, left in place
- 🟢 **Taxonomy parser/loader** — 22 families → `chemical_families`, 91 subfamilies → `subfamilies`, 257 formula shells → `formula_templates` (platform; `expression` NULL — weighted components are SEED-2). Migration `sd1a2b3c4d5e`: `formula_templates` + `code` (partial-unique among platform rows; forks keep origin's code), `family_id`/`subfamily_id` FKs, `catalog_meta` JSONB (form/coverage_tier/data_confidence/region_count — SEED-2's gating input); reversible verified
- 🟢 **Index-feed parser/loader (skips the retired list)** — reuses `seed_index_metadata` parse/reconcile (158 feeds → 59 region-agnostic commodities) with **value-compare** added so re-runs honestly report unchanged; retired `index_list.html` isn't in the repo and its orphan `IDX-CPO-CN` is a hard error if it ever reappears in a drop
- 🟢 **Pre-import join-validation + dry-run/diff report** — errors block the load with nothing written: feed→formula refs must exist, every formula must be priced by ≥1 feed, duplicate stable keys, retired orphan. Warnings: count drift vs 22/91/257/158/676, `# Formulas` list mismatches, subfamily rollup vs Formulas tab. `--dry-run` prints the create/update/unchanged/stale diff and writes nothing. **Real workbook validates clean: 0 errors, 0 warnings**
- 🟢 Handoff quirks: workbook resolution tolerates the ` (1)` filename suffix (exact name wins, else newest variant); custom path arg supported
- 🟢 **Done-when verified live** — run twice → 0 created/0 updated/429 unchanged; mutate one DB value → exactly 1 update, rest untouched, value restored; counts 22/91/257 + 59 metadata commodities in dev DB; all 257 shells have family links
- 🟢 Tests `tests/test_seed_catalog.py` (12): parsing, suffix-tolerant resolution, validation (unknown ref / unpriced formula / retired orphan / unknown family / duplicates / clean minimal), real-workbook clean + exact counts, E2E idempotency, one-value-one-row, shells carry taxonomy+meta+NULL expression, dry-run writes nothing. Full suite 98 passed
- 🟢 Known gap closed by Scrum 60: the combos drop carries the formula→subfamily mapping — SEED-2 fills `formula_templates.subfamily_id` for all 257
- 🟡 Follow-ups: ~~SEED-2~~ (shipped as Scrum 60); ~~Formulas page family grouping/search~~ (shipped — `Formulas.jsx` Default Formulas is now a collapsible family→subfamily catalog: search across name/code/family/subfamily, confidence filter chips, per-row code chip + CONF badge (LOW = amber "review") + coverage tier/region count, family-header review counts, catalog CSV export; formulas list API enriched with `family_code`/`family_name`/`subfamily_name`; code-less platform templates fall back to an "Other platform formulas" table); per-region feed rows stay SCRUM-80
- 🟢 **2026-07 workbook refresh (re-seed)** — the reference workbook was replaced with a larger, restructured drop and SEED-1 was reworked to it: **22 families / 143 subfamilies / 367 formula shells / 187 feeds → 83 region-agnostic commodities** (was 22/91/257/158→59). All three data sheets changed column layout: `parse_workbook` now reads `Form(s)`/`Coverage (derived)`/`# Regions` (old `Form (from ID)`/`Coverage tier`/`Data confidence` gone → `catalog_meta.data_confidence` is now null); the **Indexes sheet dropped `Formulas using it`**, so the feed→formula join-validation is skipped (with a warning) when no link column is present — the synthetic-fixture join tests still exercise it. `seed_index_metadata._read_feeds` now **auto-detects old vs new layout**; the new region-specific proxy model is remapped onto existing `CommodityIndex` fields: `Direct/Proxy`+`Swap priority` → `retrieval_status` (direct→free, proxy A→good_proxy, B/C→weak_proxy; `ILM-MB`/`RUT-MB`→blocked), `Source`→`free_source_name`, messy `Frequency` normalized (Semi-annual/Unknown/compound→Irregular), and `access_tier`/`role`/`free_source_url` (no new column) go null / preserve-existing (enum asserts relaxed to allow None). Region-agnostic base = code minus trailing region token (`LCI-NA`→`LCI`); region emitted as `"Global"` to match `REGION_PRIORITY`. **Never-delete honoured**: the 80 old formula shells + 1 old subfamily (F13/Ultra-performance thermoplastics) + old 59 commodities are left in place (DB now 447 coded shells, 144 subfamilies, 133 metadata commodities). Loaded to dev DB, idempotent (re-run 0/0). Tests updated (`test_seed_catalog.py` counts 22/143/367/187, `OLE-FAC-SAT` meta → form "Liquid/flake"/coverage "P3"/confidence null). Verified by 2 independent agents (taxonomy + index-remap, each PASS); agent-caught `Global`/`GLOBAL` case bug in the representative tie-break fixed (corrected `FE-MB` free→weak_proxy). Full suite 131 passed
- 🔴 **Deferred: SEED-2 (Scrum 60) not rebuilt to the new drop** — the combos' weighted-recipe source (`db_formula_combinations.html`) was NOT updated (still the 257-formula / 676-combo drop on the old ID scheme; 80 of those IDs no longer exist as new shells). Catalog is intentionally, temporarily inconsistent until a matching combos drop arrives. `seed_combos.feed_code_map()` was repointed to the **old** scrum57 feed roster (the new sheet dropped the `IDX-` prefix and would resolve zero codes); Scrum 60 data (676 coverage / 3806 components) + tests left intact

---

### Scrum 60 — SEED-2: formula-component seed + validation + confidence gate (8 pts)

Load the 676 weighted combos as real formula components on the Scrum 58 substrate — and flag the shaky rows for expert review instead of treating them as fact. Source: `sample_idea/scrum60/` (2026-06-30 handoff: `db_formula_combinations.html` = source of truth, `formula_tier_lookup.json`, `correction_plan_log.json`, `README.md`). Writeup: `jvpdocs/scrum60.md`.

- 🟢 **Parser for lines_html (+ tests)** — `parse_lines_html` in `seed_combos.py`: class-token state machine (`cl`/`wt-num`/`cl-label`/`cl-idx idx-*`) that ignores tag names, nesting, attribute order and unknown wrappers; survives the container class disappearing (wt-num opens a line); strips `[CONF-*]` label brackets; unparseable anything = load-blocking problem. Tested against the current markup AND reformatted/container-less variants
- 🟢 **Component loader (direct/proxy/fixed + margins, keyed formula × region)** — migration `cm1a2b3c4d5e`: `formula_template_components.region` (nullable FK; NULL = template-level/API set — API replace-all now touches only NULL rows so seeded recipes survive edits); coverage gains `data_confidence`/`coverage_tier`/`needs_review`/`reviewed_by`/`reviewed_at`/`review_metadata`. 676 combos → coverage rows (margin_pct + trust layer), 3,806 lines → region-tagged component sets (`idx-direct`→index, `idx-proxy`→index+is_proxy, `idx-fixed`→fixed). Line codes join feeds as `IDX-<code>`→base-commodity; the one non-feed code `SOL-ACE-LIQ` is a formula id — 4 combos load as `component_type='formula'` (real tiered chaining through the Scrum 58 resolver). Regions EU/CN/NA/LA→Europe/China/NA/Latam; India (parent Asia)/APAC/MEA created idempotently. Resolver made region-aware: per-template line-set via the coverage fallback chain, `line_region` on every resolved line. Bonus: fills `formula_templates.subfamily_id` for all 257 (SEED-1's gap)
- 🟢 **Weight-sum tolerance + tier-lookup count checks** — sums checked against [99.5, 110.5] (real data runs 99.90–110.00, mean 100.04), NOT exact 100; per-formula combo counts must equal `formula_tier_lookup.json` n_combos and total 676. Plus: unknown line codes, duplicate combos, unmapped regions, vocab, chain cycle/depth over formula-as-input refs. Real drop validates clean (0 errors, 4 label-truncation warnings)
- 🟢 **CONF-LOW flag + correction_plan_log as review metadata** — 99 CONF-LOW combos (83 formulas, proportional-scaling placeholders) load `needs_review=true`; `correction_plan_log.json` (54 formulas) rides as `review_metadata` on each of their 172 combos (action/label/weight/note — the reviewer's reasoning), never re-applied (corrections already baked into source lines)
- 🟢 **Done-when verified live** — 676/676/3,806 loaded, 0 per-formula mismatches vs tier-lookup; sample should-costs via resolver: OLE-FAC-SAT@Europe Σ=100.00 margin 9, chained FOD-LEC-PWD@Europe 10 lines (5 nested depth-1, scaled) Σ=100.00, NWE→Europe fallback; run twice → 0 created/0 updated; confidence dist 438/139/99 matches handoff
- 🟢 Tests `tests/test_seed_combos.py` (15): parser current/shifted/container-less markup + problems, tier-count mismatch, weight tolerance, unknown code + duplicate, chain cycle, E2E completeness + idempotency, CONF-LOW + correction-log attachment, sample should-costs (plain/chained/fallback), API-replace-preserves-seeded-lines, regions idempotent. Full suite 112 passed
- 🟡 Follow-ups: base-price anchors per combo still 🔴 as *data* (drop has no prices — coverage `base_price` stays NULL; the *tooling* is now shipped: per-region editor in the detail modal + bulk CSV import, see below); ~~expert-review API/UI~~ (shipped — `POST /api/formulas/{id}/coverage/{region}/review` sets reviewed_by/at + clears `needs_review`, audit-logged; `FormulaDetailModal` shows the amber placeholder banner with the correction-plan reasoning + "Mark as reviewed"; region pills carry a review dot; **seed re-runs preserve human sign-offs** — reviewed rows' flags never clobbered, regression-tested); ~~surface `blocked`-tier combos~~ (blocked tier renders red in catalog rows + the detail coverage cell); MPOB/SunSirs commercial licensing (business)

---

### Catalog core blockers (post-SEED) — weighted evaluation, cost-model integration, price-anchor import

The four blockers between the seeded catalog and a money-denominated, trustworthy should-cost. Three shipped; the fourth (live index values) is the next scrum.

- 🟢 **Engine: weighted-template evaluation** — `evaluate_weighted_template` in `services/formula_resolver.py`: `index_level_pct = 100 × Σ(eff_weight × ratio) / Σ(eff_weight)` (**rebased to the recipe's own weight sum** — catalog recipes legitimately run 99.9–110 with margin as an inside line, so the level is exactly 100.0 at the combo's base period and `should_cost = base_price × level/100` reproduces the anchor by construction; `margin_pct` is descriptive — applying it would double-count). Index ratios via `get_single_index_value` (team overrides → region → GLOBAL → any → temporal carry-forward); missing data = line rides flat + explicit `data_gaps` entry, never silent. Per-line `contribution_abs` sums exactly to the should-cost (inspectable numbers). Requires a base-period anchor on the combo; without a base *price* it still returns the index level ("index only"). `GET /api/formulas/{id}/evaluate?region=&year=&quarter=&team_id=` (`formulas.view`)
- 🟢 **Detail modal: should-cost panel** — quarter/year picker; evaluated should-cost (or "index only — no base price anchor" / the not-evaluable reason with an edit-pricing hint); index level ±% vs base (red up / green down); data-gap warning with per-line tooltip; recipe table gains `× Index` (ratio, colour-coded, `flat` for gap lines) and `Contribution` columns whose footer equals the should-cost
- 🟢 **Cost-model integration** — `loadTemplateIntoModel` in `CostModelBuilder`: "Load Catalog Formula ▾" dropdown now in **simple mode** too (advanced dropdown unified onto the same handler). Picking a weighted template resolves it at the model's region (chained lines flattened, effective weights → parts, fixed lines ride flat exactly like the engine's commodity-less components), prefills base price/period/currency from the combo, sets margin to 0 (**margin is a line inside catalog recipes** — a separate margin would double-count), warns on region fallback / needs_review / missing anchor. Mathematically identical to `/evaluate` (margin 0 → comp_base = P0, weights normalised by Σparts). Expression templates keep the advanced-mode prefill. Builder + Formulas page now fetch the **full** index list (catalog commodities without values would otherwise blank their rows). Bonus fix: `--accent2-bg/--accent-bg` phantom-token fallbacks → real `--accent2-dim/--accent-dim` tokens
- 🟢 **Bulk base-price import** — `POST /api/formulas/coverage/upload` (`dry_run` supported; platform `formulas.edit`): CSV/XLSX columns `formula, region, base_price` (+ optional `currency, base_period, margin_pct`), forgiving per-row errors, **update-only** (a typo can't mint a stray combo; recipes/review state never touched), audit-logged. `parse_coverage_price_upload` in `file_parser.py`. Formulas page: "Import Prices" panel (FileUpload two-step dry-run preview) + template CSV download
- 🟢 Tests: `test_weighted_formulas.py` now 17 — evaluation math (index +10% on a 60% line → 106/1060; exact anchor reproduction at base), catalog-style Σ=110 rebasing, evaluable-state reasons + data gaps, review endpoint, price upload (dry-run/apply/errors/403). Full suite 118 passed; frontend build passes
- 🟢 **Product → catalog-formula link + auto-load** (closes Scrum 58's "creating a product auto-loads the template by formula × region") — migration `pf1a2b3c4d5e`: `products.formula_template_id` (nullable FK, SET NULL). Products page: "Catalog Formula" picker on add/edit + code-chip column; products API validates the link (platform or own-team → else 400), enriches `formula_template_code/name` (batch), explicit-null unlinks. CostModelBuilder: a catalog-linked product entering the builder (Portfolio draft flow) **auto-loads its recipe at the model's region**; loading a template via the dropdown persists the link onto the product at save (new-product POST carries it; pre-existing product gets a PUT). Tests `test_product_template_link.py` (2). Full suite 123 passed
- 🟡 **FD-1 (index values for catalog commodities) — partial: on-demand commodity scrape shipped**: added `POST /api/indexes/scrape-all` (super-admin) — runs the ~20 registered commodity scrapers (Brent, metals, Naphtha, Urea, labor/PPI …) for every `scrape_enabled` non-FX commodity synchronously and returns per-run counts; exposed as a `canManagePairs`-gated "⟳ Sync indexes" button in `IndexLibraryArea` beside "Sync FX rates". This closes the "no on-demand way to pull live index data" gap (previously only the nightly Celery `scrape_all` + the FX button existed). **Still 🔴**: the specific `retrieval_status=free` catalog commodities that have NO scraper yet — map their `free_source_name` (World Bank Pink Sheet, EIA, Eurostat, FRED…) onto the registry with per-series IDs + region grain + per-feed verification (needs the Scrum-57 metadata seeded to identify them). Proxy estimation (executing `proxy_logic`) stays SCRUM-67/80; real price data for the 676 anchors stays business/data-blocked

---

### Scrum 61 (UI-1) — Journey nav shell + Indexes tab (8 pts · committed core) — 🟢

First time the app is laid out the way a buyer actually works: raw public price feeds → supplier negotiation. Indexes goes first because public feeds are the ground truth under every should-cost. A buyer only cares about the handful their products depend on (not all 158), so the tab auto-follows just those, with multi-year history.

- 🟢 8-tab journey nav shell in journey order — `Navbar.jsx` primary tab row consolidated to exactly Indexes (`/index-library`) → Portfolio → Monitor → Forecast → Negotiate → Intelligence → Team → Admin (super-admin only), replacing the old flat Dashboard/Formulas/Products/Suppliers-first nav. Deep links unchanged (same routes, `App.jsx` untouched) so nothing 404s. Dashboard/Products/Suppliers/Formulas dropped from the persistent tab row but kept one click away in the account (avatar) menu under a "More" section — Portfolio's "+ Add product" and other existing contextual links into them still work, so nothing becomes a dead end
- 🟢 Indexes tab list + detail (single index+FX home) — `IndexLibraryArea.jsx` lists every tracked index + all FX pairs; row → detail popup
- 🟢 Manual add + manual create (manual values) — `AddIndexModal` creates a custom commodity + manual/fixed source; per-period values via cell-click override (`EditCellModal`)
- 🟢 Auto-follow indexes used by a portfolio formula — the "In use" column (list + CSV export) is now real: `IndexLibraryArea.jsx` fetches `GET /api/cost-models` and derives `usedCommodityIds` from each cost model's current formula (`formula_versions[0]`) — simple-mode `components[].commodity_id` and advanced-mode index `variables`. A new "Followed only" filter toggle (default off, so Scrum 17's "every tracked index visible" behaviour is unchanged) narrows the list to auto-followed + has-data + has-a-source rows, satisfying "lists followed indexes" without hiding the full catalog by default
- 🟢 Selectable history window — detail popup exposes 1Y/2Y/3Y/5Y/All (`IndexPopupModal.jsx:121-123`); list itself fetches a fixed 2-yr span
- 🟢 Wired to existing index endpoints only — no new backend engine; auto-follow reuses the existing `/api/cost-models` list response, no new endpoint
- 🟢 **In-app theme selector added to the nav** (was previously only reachable via the full Profile page) — new `components/ThemeSelector.jsx` positioned between `TeamSelector` and the account menu. Rebuilt from an initial `.ca-menu` dropdown into a single cycling icon button per user feedback: one click advances to the next theme (wraps around); the icon itself is a 3-dot swatch (`--accent`/`--accent2`/`--accent3`) scoped to the *currently active* theme via `data-theme` (same trick `TeamSelector`'s dot and Profile's `ThemePreview` cards use), so the icon's own colors visibly change on every click. Calls the existing `setTheme()` from `AuthContext.jsx` (already does apply + cache + `PUT /auth/me/theme`) — no new API, no duplicated theme logic; the Profile page's full-page picker (`ThemePreview` cards) is untouched and still there for browsing descriptions
- Verified: `npm run build` clean; backend untouched so the full 131-test suite is unaffected. Not visually verified in a browser this pass (no browser tool available this session) — code-reviewed against the exact schema shapes (`FormulaVersionOut.components`/`.variables`) other pages already rely on, and the theme-selector dropdown mirrors `TeamSelector.jsx` line-for-line in structure

### Scrum 62 (UI-2) — Portfolio tab (8 pts · committed core) — 🟢

The category manager thinks in **products they must buy well**. Portfolio is their home base: every product they own, each with its own live should-cost.

- 🟢 Product as the central object — `PortfolioArea.jsx:7-13` (one row per cost-model + Draft rows for product-less products); formula version + starting point + should-cost as row properties
- 🟢 Product detail (formula / starting point / live should-cost) — `ProductDetailArea.jsx:148-262` at `/portfolio/:costModelId`
- 🟢 First-class starting-point editor — inline base-price/base-quarter editor → `renegotiate` (`ProductDetailArea.jsx:174-213, 66-99`)
- 🟢 Live should-cost — both list + detail `POST /api/costing/should-cost` with a "live" badge (draft product rows show "—")
- Note: built in the **old IA**; now sits behind the Scrum 61 journey-shell tab it was always meant for

### Scrum 63 (UI-3) — Monitor tab (5 pts · committed core) — 🟢

Where am I overpaying right now, across everything I buy, before I negotiate.

- 🟢 Wired to real gap / should-cost-vs-actual outputs — `MonitorArea.jsx:47` `GET /api/portfolio/summary` (same source as Dashboard); renders current_should_cost / latest_actual / gap_pct / exposure
- 🟢 Empty / loading / error states — all present (`MonitorArea.jsx:117-149`)
- 🟢 No new backend engine
- Note: REAL, not demo; now sits behind the Scrum 61 journey-shell tab. Trigger-radar / priority-matrix / alerts remain Wave 3

### Scrum 64 (UI-4) — Forecast tab (shell only) (5 pts · stretch) — 🟢

Buy-now-or-wait turns on where price is heading. Stand the home up now; the projection engine is Wave 3, forward part deliberately blank — a made-up forecast is worse than honest "we don't know yet."

- 🟢 Forecast layout exists — KPI cards, multi-line chart, portfolio table, index-movement cards (`ForecastArea.jsx`)
- 🟢 **No fabricated forward numbers** — all hardcoded BASE/BEAR/BULL / projected-KPI / per-product forward constants removed; the forward band is an honest dashed ±1.5% stub (IntelligenceDetailArea pattern), clearly labelled, `splitIndex` at the last real quarter
- 🟢 Index history REAL — composite of headline commodities from `GET /api/indexes/public-quarterly` (each rebased to 100, averaged); table present-values + KPIs from `GET /api/portfolio/summary`; assumption cards show each index's real latest QoQ %
- 🟢 React key-prop warning fixed (flat table keyed by `cost_model_id`); loading/empty/error states
- Note: the real forward-projection engine is Wave 3 (out of scope for "shell only")

### Scrum 65 (UI-5) — Negotiate tab (5 pts · committed core) — 🟢

Where the journey pays off — walk in with evidence. Land the existing product → gap → exportable-brief flow in the new IA (cheat-sheet / tornado / PDF extraction are Wave 3).

- 🟢 Negotiate layout to new IA — `NegotiateArea.jsx` rebuilt from the hardcoded 8-phase mockup (fixed Sasol/LABS demo context, no `api` import) into a real landing: every product ranked by exposure (reusing the `GET /api/portfolio/summary` join pattern from Monitor/Portfolio), draft products surfaced with "Complete formula". Row → `/negotiate/:costModelId`
- 🟢 Wire to existing brief/export — new `NegotiateDetailArea.jsx` calls the same `POST /api/costing/brief` Brief.jsx/Intelligence already use; verdict, total impact, `EvoChart` should-cost-vs-actual, decomposition waterfall, drivers table and narrative are the same computation, styled in the new IA. Export PDF reuses Brief.jsx's exact `window.print()` + title-swap mechanism and the shared print CSS (`.ca-print-page`/`.ca-no-print`/`.ca-print-only`) — no new export path
- 🟢 Empty / loading states — landing: loading/error/no-products states, per-row "Complete formula" CTA for products without a cost model; detail: loading/error, and a dedicated empty state when `evolution` comes back empty (no formula yet) linking to the cost model builder
- 🟢 No new backend engine — only pre-existing endpoints (`/api/portfolio/summary`, `/api/cost-models`, `/api/products`, `/api/costing/brief`) are called
- Dead code removed: `TornadoChart`/`PriceLadder` (wsCharts.jsx) dropped, unused once the fabricated cheat-sheet/phase demo was replaced
- `ProductDetailArea`'s "Negotiate" action now deep-links to `/negotiate/:costModelId` instead of the flat `/negotiate` landing

### Scrum 66 (UI-6) — Intelligence tab (shell) (5 pts · stretch) — 🟢

The one per-product dossier a buyer reads before a call.

- 🟢 Intelligence layout/panels to mockup — `IntelligenceArea.jsx` (family-grouped product cards, lazy sparkline) + `IntelligenceDetailArea.jsx` (Market & Pricing / Product Intelligence tabs) built to `sample_idea/intelligence_mockup.html`'s panel set (should-cost index chart, index components, market dynamics, market snapshot, cycle position); decorative mockup-only widgets with no backing data model (region/variant toggles, seasonality & volatility) intentionally left out of the shell
- 🟢 Renders derived history + stored narrative, read-only, from real endpoints — landing fetches `/api/cost-models` `/api/products` `/api/chemical-families` + per-card `POST /api/costing/evolution`; detail = one `POST /api/costing/brief` (`IntelligenceArea.jsx`, `IntelligenceDetailArea.jsx:47,174`)
- 🟢 Forecast band stubbed (honest) — flat ±1.5% dashed continuation labelled "Forecast (stub) — illustrative, no engine yet" (`IntelligenceDetailArea.jsx:18-19,83,141`); no invented spot values
- 🟢 Expert-reviewed persistence flagged as a dependency — Tab 2 "Product Intelligence" renders as an explicit `Persistence pending` placeholder (not fabricated content): narratives today are **Redis-cached only** (7-day TTL, `ollama.py`), never DB-stored or reviewed; no `ProductIntelligence`/`NarrativeReview` model or `expert_reviewed` field exists anywhere in the backend yet — confirmed still true on audit for this scrum. That model + review workflow is the prerequisite for real Tab 2 content and stays Wave 3
- Note: this was originally built under the old Wave-3 numbering (Scrum 21) and already satisfied the new Scrum 66 (UI-6) shell acceptance criteria verbatim on audit — no code change needed this pass

### Scrum 67 (UI-7) — Admin tab (incl. Region management + proxy-index editor) (5 pts · committed core) — 🟢

Back-office for the two things that decide whether a should-cost holds up: which region a price is for, and how we calculate the indexes we can only approximate.

- 🟢 Admin console in the new IA — `Admin.jsx` tabs: Users / Teams / Audit Log / Requests / Regions / **Proxy Indexes** / Settings
- 🟢 Region management UI (add/edit, hierarchy) — `RegionsTab` + `RegionFormModal` → `/api/regions` (Scrum 56)
- 🟢 **Proxy-index calculation editor** — `PUT /api/indexes/{id}/proxy-logic` (super-admin, `validate_proxy_logic`, ValueError→422, optional `retrieval_status` promotion, best-effort audit) + Admin "Proxy Indexes" tab (`ProxyIndexesTab`) listing proxies (good/weak/blocked or has spec) + `ProxyLogicFormModal` (base_index/operation/spread/spread_unit/recalibration/retrieval_status/note). Tests `test_index_proxy_logic.py` (4). FD-1 (SCRUM-80) executes what this sets
- 🟢 Permission-gated (super-admin) — `Admin.jsx:162`
- 🟢 **Derived indexes relocated to the Index Library + composite/calculated indexes** — the proxy editor moved out of Admin (`ProxyIndexesTab`/`ProxyLogicFormModal` deleted from `Admin.jsx`, tab removed) into `components/DerivedIndexesModal.jsx`, opened from a super-admin "Derived indexes" button in `IndexLibraryArea`. Added **composite indexes**: a `CommodityIndex` whose value is computed live from other indexes via an advanced expression (e.g. `Pencil = 0.6*Graphite + 0.3*Wood + FC`). Model gains `composite_expression` (Text) + `composite_variables` (JSONB, same `{var:{type:index,commodity_id}|{type:fixed,value}}` shape as `FormulaVersion.variables`); migration `co1a2b3c4d5e`. `validate_composite_structure` (constants) parses the expr + checks vars; `PUT /api/indexes/{id}/composite` (super-admin) also enforces referenced-commodity existence, no self-reference, no immediate cycle. **Computed live in `data_resolver.get_single_index_value`** (new `compute_composite_value`, recursion with a `_resolving` cycle guard; missing component → None, never fabricates 0) and mirrored in `resolve_index_values` (grid rows, `source="composite"`). Because a composite is a normal `CommodityIndex`, it auto-appears in cost-model formula pickers and resolves through the same path. Frontend: shared `components/VariableMapEditor.jsx` (extracted expression+var-map editor) used by the composite create flow in `AddIndexModal` ("Composite (calculated)" type, super-admin) and the edit flow in `DerivedIndexesModal`; "Composite" added to the Index Library category folding. Tests `tests/test_composite_index.py` (5): compute, missing-component→None, grid row, validation 422s (undefined var / self-ref / unknown commodity / unparseable), non-super-admin 403

### Scrum 68 (UI-8) — Team tab (incl. taxonomy fork management) (5 pts · stretch) — 🟢

Every team wants a slightly different catalog. Show platform-vs-team origin so a team knows which edits are theirs to protect.

- 🟢 Team management in the new IA — `Team.jsx` tabs: Teams / Requests / Activity Log / **Catalog** / Settings
- 🟢 **Taxonomy fork management UI** — `TaxonomyTab` in `Team.jsx`: indented family→subfamily tree from `GET /api/chemical-families`+`/api/subfamilies` (team_id-scoped); "+ Fork" on platform rows (hidden once forked) → confirm → `POST …/{id}/fork`; 409/403 via `formatApiError`; server enforces `products.edit`
- 🟢 Platform-vs-team origin lineage in UI — `OriginChip` (Platform / Team fork ← origin name); a platform row shows its team fork once created
- 🟢 **Edit the forked copy** — Scrum 55/DB-1 modeled `origin_id` specifically so a fork could be renamed without breaking platform resolution, but no rename endpoint or UI existed until now. Added `PUT /api/chemical-families/{id}` + `PUT /api/subfamilies/{id}` (team's own fork via `products.edit`, or a platform row via super-admin; 409 on a scope-unique name/code clash) and an `EditForkModal` in `TaxonomyTab` (name + code) reachable from an "Edit" button next to a forked row's origin chip. Tests: `test_taxonomy.py` now 12 (4 new — team edits its own fork/origin_id intact, 403 on a platform row, 403 on another team's fork, partial-update leaves untouched fields). Full suite 131 passed
- 🟢 **Backed by** the DB-1 fork endpoints/model (Scrum 55)
- 🟢 **Formula-template fork + update (catalog)** — a team can now fork a platform `FormulaTemplate` into an editable private copy, mirroring the family/subfamily fork. Migration `ff1a2b3c4d5e` adds `formula_templates.origin_id` (nullable self-FK, lineage back-link); `POST /api/formulas/{id}/fork` (gated `formulas.edit` on the team) copies the template + its weighted components + per-region coverage (review sign-off reset), sets `origin_id`, blocks forking a team row (400) and duplicate forks per team (409). Editing the fork uses the existing `PUT /{id}` + `/{id}/components` + `/{id}/coverage/{region}` (already team-`formulas.edit`-gated). Frontend `Formulas.jsx`: a **Fork** action on platform rows (both the catalog tree and "Other platform formulas"), gated on `canEditTeam`, shows "Forked" once done (`forkedOriginIds`); team forks carry a `fork` origin badge and are fully editable via the existing modal. `origin_id` exposed on `FormulaTemplateOut`. Tests `tests/test_formula_fork.py` (4): fork copies recipe+coverage & is editable, duplicate 409, can't-fork-team-row 400, non-member 403
- Reference: `sample_idea/scrum55/02-platform-vs-team.md`

---

### Wave 3 — Intelligence & Depth (Scrums 19–33)

> Re-sequenced: the former **Wave 2 (19–26)** moved here, alongside the existing Wave 3 (27–33).

- 🟢 **Scrum 19** — Automatic gap flagging (dashboard as portfolio triage screen ranked by money at stake)
  - 🟢 Dashboard shows all products with a should-cost vs actual comparison in one view (`Dashboard.jsx` → `GET /api/portfolio/summary` in `routers/portfolio.py`)
  - 🟢 Each row shows: product, supplier, should-cost, actual price, gap %, gap value (price × volume) (`Dashboard.jsx` table; gap = `latest_actual − current_sc`, exposure = `gap × total_vol`)
  - 🟢 Rows sorted by absolute gap value descending — biggest opportunity first (default sort `exposure` desc, also sortable by gap%/should-cost)
  - 🟢 Visual indicator (colour or bar) for gap severity — graded severity bar shipped in BOTH the triage `MonitorArea.jsx` and the `Dashboard.jsx` table: a new "Severity" column renders `DriftBar` on |gap %| (shared `maxAbsGap` scale, min 25%) colour-tiered by `severityColor` (price-drift=accent2 / index-moved=accent3 / on-track=accent), alongside the colour-coded gap% cells + IDX/DRIFT flag badges
  - 🟢 Clicking a row navigates to the cost model (View → `/cost-models/:id`, plus Evo/Brief actions)
  - 🟢 **Monitor re-platform (new IA)** — `pages/workspace/MonitorArea.jsx` rebuilt from a hardcoded demo to real data: fetches the same `GET /api/portfolio/summary`, flat table ranked by exposure, derived status filter (Alert/Watch/On-track from `flag_price_drift`/`flag_index_moved`), graded severity bar (`DriftBar` on |gap %|), IDX/DRIFT flags, CSV export, and empty/loading/error/filtered-empty states. Reuses `exportCsv`, `useAuth().activeTeamId`, `formatApiError`. No backend change; `Dashboard.jsx` kept as-is (coexist). Trigger radar / priority matrix / alerts remain Wave 3.
  - 🟢 **Scrum 63 (Monitor → new IA, mockup)** — rebuilt `MonitorArea` to the `costadvisor_mockup.html` IA: family-grouped collapsible table with per-group status badges, inline status (Alert/Watch/On-track/Formula-draft) + family filters + search, 4 stat tiles (products / should-costs live / estimated drift / awaiting invoice), gap·drift·exposure·invoice columns; draft products (no cost model) surface with "Complete formula". Wired to `/api/portfolio/summary` joined client-side with cost-models/products/families (same shape as `PortfolioArea`) — no new backend engine; trigger radar stays Wave 3. Verified live: all 4 endpoints + join keys confirmed against the dev DB.
  - 🟢 **Audit note (re-verified):** triage is live and real (not demo). Both formerly-open items now confirmed present in `MonitorArea.jsx` — graded severity bar (`DriftBar`) and family/category rollup (family-grouped collapsible table). Scrum closed 🟢.

- 🟢 **Scrum 20** — Procurement Priority Matrix (portfolio view: volatility × spend exposure)
  - 🟢 2×2 or scatter matrix: index volatility (x) vs spend exposure (y) per product/category — `components/PriorityMatrix.jsx` (custom inline SVG, repo convention) plotted from `GET /api/portfolio/priority-matrix`; a "Matrix" view added alongside Table/Cards on `Dashboard.jsx` (lazy-fetched)
  - 🟢 Quadrant labels: "monitor", "hedge", "act now", "low priority" — split at the portfolio **medians** of each axis (`_quadrant`): hi-vol+hi-exp=act now, lo-vol+hi-exp=hedge, hi-vol+lo-exp=monitor, else low priority; tinted zones + corner labels
  - 🟢 Volatility calculated from index movement over trailing 4 quarters — `volatility_pct` = `statistics.pstdev` of the last 4 QoQ % changes in the should-cost series (from `calculate_evolution`; should-cost tracks the indices, so this is index-driven volatility)
  - 🟢 Spend exposure = should-cost × volume — `current_should_cost × trailing-4Q volume`, converted to the reporting currency (`convert_price`) for cross-product comparability
  - 🟢 Exportable as CSV and image — CSV via `exportCsv`; PNG via SVG→canvas (`XMLSerializer` → 2× canvas → `toDataURL`); CSS-token colours resolved to concrete values so the PNG renders them
  - 🟢 Tests `tests/test_priority_matrix.py` (3): owner 200 + shape (`items`/thresholds), non-member 403, unauthenticated 401
  - 🟢 **Portfolio re-platform (product-centric)** — `workspace/PortfolioArea.jsx` rebuilt from a hardcoded demo to real data: one row per cost model + Draft rows for products with no cost model (every product visible), grouped by family/supplier/region, with search/status filters, stat tiles, CSV, and **index-evolved live should-cost** per row (`POST /api/costing/should-cost` at the current quarter, progressive fill). New product detail `workspace/ProductDetailArea.jsx` at `/portfolio/:costModelId` — live should-cost + breakdown + delta-since-starting-point, read-only formula display, and a **first-class starting-point editor** (base price / base quarter → `renegotiate`). `CostModelBuilder` preselects the product on the draft "Complete formula" flow (route state). No backend change.
  - 🟢 **Audit note (updated):** the product-centric Portfolio list + detail were already real; the Scrum 20 **matrix** (2×2 scatter, quadrant labels, trailing-4Q volatility, CSV+PNG export) is now shipped via `PriorityMatrix.jsx` + `GET /api/portfolio/priority-matrix`.
  - 🟢 **Scrum 62 (Portfolio → product-as-central-object, mockup IA)** — verified the pre-existing Portfolio re-platform satisfies every Scrum 62 acceptance criterion (lists products with live should-cost; a product opens to formula + starting point + live should-cost via `ProductDetailArea`; first-class starting-point editor; wired to the should-cost engine only). Aligned `PortfolioArea` stat tiles + group headers + "+ Add product" affordance to `costadvisor_mockup.html`. **Bug fixed:** `POST /cost-models/{id}/renegotiate` (the starting-point editor's Save) 500'd (`DetachedInstanceError` on `commodity_name`) for any component-based formula — it expunged the ORM object before FastAPI serialized the lazy `commodity` relationship; now builds `FormulaVersionOut` while session-bound (expire→validate→commit). Verified live against the dev DB (renegotiate 201 with 5 components incl. commodity names, idempotent). Hardened brittle `test_seed_combos` needs_review assertion (a real in-app expert sign-off legitimately drops the flagged count below 99; seeder preserves sign-offs). Full suite 123 passed.

- 🟢 **Scrum 21** — Predictive index forecasting (directional, uncertainty-honest)
  - 🟡 Each tracked index shows a trailing trend and a 2-quarter forward projection (`workspace/ForecastArea.jsx` shell rebuilt in Scrum 64 — see below; the forward-projection engine now exists (below) but is not wired into this specific composite-index chart — see the follow-up note)
  - 🟢 **Real forecast engine shipped** — `services/index_projection.py`: per-`(commodity_id, region)` price series (the series grain the drop's "W3-A"/series-layer dependency would have owned, had it existed here — it doesn't, so this treats `IndexValue`'s own `(commodity_id, region)` key as the series directly). Pure-Python OLS linear-trend fit with a residual-based prediction interval (real confidence band, not a fixed placeholder like the old `FORECAST_BAND = 0.015`, which has been deleted). Explicitly distinguishes three outcomes rather than always returning a number: `fitted` (real trend), `hold` (dead-flat recent tail, or too few points to trust a line), `no_history` (nothing to anchor to at all) — never silently returns an empty result
  - 🟢 Every projection is a stored, timestamped **vintage** (`IndexProjectionRun`/`IndexProjectionPoint`, migration `ip1a2b3c4d5e`, no RLS — platform-level like `commodity_indexes`) — re-running never overwrites a prior run, so a forecast can later be scored against what actually happened
  - 🟢 `POST /api/indexes/{id}/project` (super-admin) + `GET /api/indexes/{id}/projections/latest` (any authenticated user); on-demand bulk refresh via `POST /api/indexes/project-all` and a **"⟳ Project forecasts" button** in the Index Library toolbar (super-admin, next to "Sync indexes"); also runs automatically via a weekly Celery task (`tasks/project_indexes.py`, registered in `celeryconfig.py` after the scrape jobs)
  - 🔴 "Impact on my models" as a per-index UI concept — superseded by the Scrum 22 lock/hold verdict below, which answers the same question at the product level (using this engine's output) rather than per-index
  - 🟢 Clearly labelled as an estimate, not a guarantee — every forecast carries its `method`/`status`/confidence interval rather than presenting a number alone
  - 🟡 **Intelligence page (`/intelligence`, new navbar item)** — product-centric "market & pricing intelligence" (modelled on `sample_idea/intelligence_mockup.html`). Landing: family-grouped product cards → per-card should-cost `Sparkline` + trend, lazy-loaded via IntersectionObserver from `/api/costing/evolution`. Detail `/intelligence/:costModelId` (one `/api/costing/brief` call), Tab 1 "Market & Pricing" wired read-only: should-cost **index** history (rebased base 100) + `MultiLineChart` **stub** forecast band (dashed, ±1.5%, `splitIndex`; clearly labelled illustrative — no forecast engine), index-component/driver decomposition table, stored (Redis-cached) AI narrative + forward signals, derived cycle-position + snapshot cards. Tab 2 "Product Intelligence" is a **flagged placeholder**. No backend change.
  - 🔴 **Dependency (flagged):** expert-reviewed narrative / product-reference **persistence** — narratives are Redis-cached only (`services/ollama.py`, 7-day TTL), never DB-stored or reviewed. A `ProductIntelligence` / `NarrativeReview` model (product/cost-model ref, authored text, `reviewed_by`, `review_status`, `reviewed_at`) is the prerequisite for operational review tracking (Tab 2)
  - 🟢 **Scrum 64 (Forecast tab shell → new IA, honest stub)** — `ForecastArea` rebuilt to the new IA with real data, no fabricated forward numbers: a composite headline-commodity index (`GET /api/indexes/public-quarterly`, each series rebased to base 100 and averaged) charted as real history. The dashed ±1.5% forecast stub that used to sit here has been **removed entirely** now that a real engine exists (per-`(commodity, region)` projections don't have a 1:1 mapping onto this page's synthetic multi-index composite, so no inline replacement was attempted — the subtitle now points at the Index Library / product buy-window verdict for a real forecast instead). Stat cards (products / flagged / avg gap / exposure), a flat portfolio should-cost/actual/gap table from `GET /api/portfolio/summary`, and per-commodity QoQ index-movement cards are unchanged
  - 🔴 Follow-up: wire `ForecastArea.jsx`'s composite chart onto the real per-series projections (e.g. show one real forecasted line per headline commodity instead of removing the band outright) — deferred as a page-redesign-sized piece of work, not attempted in this pass
  - 🟢 Tests `tests/test_index_projection.py` (10): fitted/hold/no-history/insufficient-points, re-run creates a new vintage and leaves the first intact, fitted output pinned against a hand-computed OLS fit, endpoint permission gates. Full suite 218 passed (verified live from inside WSL — see note below)

- 🟢 **Scrum 22** — Opportunistic buy windows (spot vs contract signal)
  - 🟢 Per-product signal: current should-cost vs 4-quarter average — "cheap now" or "expensive now" — `GET /api/portfolio/buy-windows` computes, per model, current should-cost vs the mean should-cost of the prior 4 quarters (from `calculate_evolution`); `_buy_signal` → `cheap`/`neutral`/`expensive`/`insufficient` at a ±3% threshold, with `deviation_pct` and `avg_4q`
  - 🟢 Requires spot-price data stored at product level — **not needed**: the should-cost itself (index-driven) is the spot-vs-recent-contract read, so no pricing-model change was required (the audit's cheaper path). Signal is `insufficient` when <2 prior quarters of history exist
  - 🟢 Recommendation shown in cost model view and dashboard — Dashboard gets a "Buy Windows" view (4th toggle) with the ranked table + CSV (`components/BuyWindows.jsx`); the product/cost-model view (`ProductDetailArea`) shows a `BuySignalBadge` under the live should-cost (via `GET /api/portfolio/buy-windows/{id}`)
  - 🟢 Tests `tests/test_buy_windows.py` (4): owner 200 + list shape, non-member 403, unauthenticated 401, unknown model 403/404
  - 🟢 **Forward half — lock/hold verdict off the forecast should-cost.** The above is backward-looking only ("cheap vs last year"); a buyer signing a contract needs "what happens next" too. Built on the Scrum 21 projection engine: `get_forward_index_value` (`data_resolver.py`) resolves a future-period value from a team's fixed source/override first, then the latest projection vintage — deliberately never falls through to `scraped_temporal_carry_forward` (that tier exists to stop historical ratios flattening to 1.0; reusing it here would let a flat hold pose as a real forecast)
  - 🟢 `_compute_indexed_cost_forward` / `_compute_advanced_cost_forward` / `calculate_forward_should_cost` (`costing_engine.py`) — siblings of the existing `_compute_indexed_cost(_detailed)`/`_compute_advanced_cost`, not a parameter threaded into them, so the four existing call sites (should-cost/evolution/squeeze/breakdown) stay untouched; hard-fails to `insufficient` the instant one commodity-linked component has no forecast, never a fabricated ratio; an all-fixed formula is deterministically `neutral` ("nothing to forecast" ≠ "missing data"). Forward should-cost is computed **generically** off each cost model's own `FormulaVersion` — works for hand-built and catalog-linked models alike, no `FormulaRegionCoverage` catalog-link requirement
  - 🟢 `GET /portfolio/buy-windows/{cost_model_id}/verdict` + `LockHoldVerdict` schema (`lock`/`hold`/`neutral`/`insufficient`, ±3% threshold, percent only — the underlying values are index levels, not currency, so no fabricated money-saving figure is quoted) — additive sibling of the existing `/buy-windows` endpoints; their response shape is untouched
  - 🟢 Regression test `test_buy_windows_unaffected_by_forecast_storage` — proves forecast storage never perturbs the existing backward signal, because forecasts live in `IndexProjectionRun`/`Point` (Scrum 21), never in `index_values`. **Passed live.**
  - 🟢 Tests `tests/test_buy_windows.py` (+7, 11 total in file, all passing): insufficient-without-projection, horizon/vintage/method echoed, verdict flips across two vintages (upward → `lock`, downward → `hold`), all-fixed-formula → `neutral`, permission gates
  - 🟢 `BuyWindows.jsx` gained `LockHoldBadge`/`LOCK_HOLD_SIGNAL`; `ProductDetailArea.jsx` fetches the verdict endpoint and renders both badges (backward + forward) side by side under the live should-cost
  - 🟢 **Verified live end-to-end** against a real seeded product+cost model in the local dev DB (see below) — projected forecast correctly produced a `lock` verdict (+32.5% projected rise) alongside the existing `cheap` backward signal
  - 🟢 **DB-verification note:** local dev DB access was initially blocked by a decoy — a freshly-provisioned native Windows Postgres 18 service was also listening on `localhost:5432` with no `costadvisor` role, while the actual project DB is WSL Ubuntu's own Postgres 16 (`127.0.0.1:5432` inside WSL, not forwarded to Windows). Ran migration + full test suite from inside WSL using the already-checked-in `backend/venv` (WSL-native, works fine there) — **full suite 218 passed**

- 🟢 **Scrum 23** — Supplier benchmarking (who prices near should-cost, who pads margin)
  - 🟢 Per-supplier view: average gap % across all products + trend over time — `GET /api/suppliers/benchmark?team_id=` aggregates, for every priced quarter of every cost model a supplier holds, gap% = (actual − should_cost)/should_cost×100 (should-cost via the same `_compute_indexed_cost`+`_apply_margin` pipeline as the Excel export, factored into `_should_cost_for_period`); returns `avg_gap_pct`, `latest_gap_pct`, per-quarter `trend`, volume-weighted `exposure`, `n_models`, `n_quarters_priced`
  - 🟢 Ranking table: suppliers ordered by how closely they track should-cost — response sorted by `avg_gap_pct` desc (biggest margin-padder = largest opportunity first); Suppliers page gets a Directory/Benchmarking toggle with a ranked table (colour-tiered `DriftBar` on avg gap%, trend arrow, latest gap%, exposure, CSV export)
  - 🟢 Visible to owner/admin only; seeds Wave 3 trust grading — endpoint gated via `require_team_role(["owner","admin"])` (super-admin bypass); frontend shows a graceful "owner/admin only" message on 403. `Supplier` trust *fields* still deferred to Scrum 31 (this scrum is the benchmarking data it builds on)
  - 🟢 Tests `tests/test_supplier_benchmark.py` (4): owner 200 + `suppliers` shape, admin 200, member 403, non-member 403

- 🟢 **Scrum 24** — Alerts (email & Slack on index moves, new gaps, buy windows)
  - 🟢 User can subscribe to alerts per index or per product — `AlertSubscription` model (team-scoped RLS, per-user), `trigger_type` index_move/gap/buy_window with optional `cost_model_id` (product) or `commodity_id` (index) scope, else portfolio-wide; `GET/POST/PUT/DELETE /api/alerts/subscriptions` (`routers/alerts.py`), scope validated against the team. Frontend `pages/Alerts.jsx` (nav "More" → Alerts) with add-form (trigger/scope/threshold/channel), subscription list (toggle/delete), history, Slack field, "Run now"
  - 🟢 Email alert sent when index moves > configurable threshold — `services/alerts.py` `_index_move_trigger`: latest-two-quarter index level (avg across regions), fires when |QoQ move| ≥ `threshold_pct`; portfolio-wide expands to every commodity referenced by the team's formulas
  - 🟢 Email alert sent when a new gap exceeds a threshold — `_gap_trigger`: current should-cost (`calculate_should_cost`) vs latest actual, fires when |gap%| ≥ threshold (direction reported); buy-window trigger reuses `_buy_signal`. `send_alert_email` via SMTP (`email.py`)
  - 🟢 Slack webhook support (team-level setting) — `teams.slack_webhook_url`; `GET/PUT /api/alerts/slack-webhook` (PUT owner/admin, https-only, member sees `configured` bool not the URL); `_deliver` posts to the webhook for `channel='slack'` subscriptions
  - 🟢 Alert history visible in-app; alerts recorded in AuditLog — `AlertEvent` ledger (message/detail/channel/delivered/`dedup_key`) → `GET /api/alerts/history`; `dedup_key` (trigger:target:quarter:direction) makes an identical condition fire once. `evaluate_team_alerts` runs on demand via `POST /api/alerts/evaluate` (owner/admin) and via Celery `app.tasks.alerts.evaluate_all_alerts` (wire into the beat schedule for nightly). Subscription create/delete + Slack change audit-logged
  - 🟢 Migration `al1a2b3c4d5e` (subscriptions + events + `teams.slack_webhook_url` + RLS). Tests `tests/test_alerts.py` (6): subscription CRUD, invalid-scope 422, Slack admin-only + member-masked + non-https 422, evaluate owner-ok, non-member 403, history shape. Live-verified: seeded team fires 14 alerts (10 gap + 4 index-move), dedup → 0 on re-run
  - 🔴 Follow-up: register `evaluate_all_alerts` in the Celery beat schedule (`celeryconfig`) for automatic nightly runs — today it runs on demand via the endpoint

- 🟢 **Scrum 25** — Intra-team collaboration (notes, flags, shared negotiation position)
  - 🟢 Users can leave notes on a cost model (threaded, timestamped) — new `CostModelNote` model (`cost_model_notes`, team-scoped RLS, `parent_note_id` self-FK for one-level threading; migration `nt1a2b3c4d5e`); `GET/POST/DELETE /api/cost-models/{id}/notes` (`routers/collaboration.py`). Frontend `components/NotesPanel.jsx` (threaded list, reply, delete-own, @mention highlight) mounted in `ProductDetailArea`
  - 🟢 Flag a model as "in negotiation", "agreed", "under review" — `cost_models.negotiation_state` column (`none`/`in_negotiation`/`under_review`/`agreed`); `PUT /api/cost-models/{id}/flag` (gated on `costing.edit`, 422 on invalid state); exposed on `CostModelOut`; selectable status badges in `ProductDetailArea`
  - 🟢 Notes and flags visible to all team members; recorded in AuditLog — team-scoped read (`costing.view`); note create/delete + flag change all `log_event`-audited (`cost_model_note` / `cost_model_flag`)
  - 🟢 @mention teammate in a note triggers email notification — `@email` tokens parsed, resolved against team members, `send_mention_email` (best-effort, after commit) links to `/portfolio/{id}`
  - 🟢 Permissions: any member (view) can post a note; only `costing.edit` can change the flag or delete another member's note (author can delete own). Tests `tests/test_collaboration.py` (5): create+thread, delete-own, flag set/invalid/read-back, member-can-note-not-flag, non-member 403/404

- 🟢 **Scrum 26** — Index-provider API integration (stretch — Fastmarkets, Argus, ICIS). Backend/API only this pass (scope decision) — no frontend UI yet
  - 🟢 Team can configure a credential for a supported index provider — new `TeamProviderCredential` table (`team_id, provider` unique), Fernet-encrypted JSON blob (`services/provider_credentials.py`, mirrors the Google Calendar refresh-token encryption pattern with its own separate key `PROVIDER_CREDENTIAL_ENCRYPTION_KEY`). `TeamIndexSource` gets a `"provider_credential"` source type with **zero new columns** — reuses `scrape_config` to carry `{provider, series_id}`; the secret itself never touches that row, so N commodities sharing one vendor subscription share one credential to rotate
  - 🟢 `app/services/providers/` adapter package: `ProviderAdapter` interface + one concrete `FastmarketsAdapter` (explicitly commented as an illustrative REST contract — no live paid credentials exist in this environment to verify against; the interface/error-classification seam is the real deliverable). `PROVIDER_REGISTRY`/`KNOWN_PROVIDERS` mirror the existing `SCRAPER_REGISTRY` pattern; Argus/ICIS are listed as known-but-unsupported rather than hidden or crashing
  - 🟢 `GET/POST/DELETE /api/indexes/provider-credentials` + `GET .../providers` + `POST .../{id}/verify` — CRUD gated on team **owner/admin** (stricter than plain `indexes.edit`, mirrors the Scrum 23 supplier-benchmark precedent for sensitive data); list/get responses have no field to leak the secret through (`TeamProviderCredentialOut` never carries it)
  - 🟢 Provider-fetched values land in `IndexOverride` exactly like `scrape_url` values already do (extracted the shared `_replace_overrides_from_points` helper out of `_scrape_and_replace_overrides` so both paths use identical interpolate/replace/audit logic) — they already win over scraped `IndexValue` via the existing priority chain, **no resolver/engine change needed**; only the provenance label needed adding (`resolve_index_values`/`get_single_index_value_detailed` now emit `source="provider"` instead of `"team_override"` when `IndexOverride.source_file` starts with `"provider:"` — zero new queries, the object was already loaded)
  - 🟢 Nightly job pulls licensed index data — `fetch_provider_sources` weekly Celery task (kept separate from `scrape_team_sources`: different failure domain, and it updates `TeamProviderCredential.status`); registered in `celeryconfig.py` beat schedule
  - 🟢 Falls back to existing scraper/upload flow if provider API is unavailable — a missing/expired/rejected credential surfaces its reason via the same `scrape-now`/`scrape_warning` response shape the URL-scrape path already uses, and (because the fetch happens *before* any override mutation, same ordering as the existing scrape path) **never touches existing override data** — degrade, don't null out
  - 🟢 Adding/rotating/removing a credential are audit-logged (`create`/`rotate`/`delete` on `team_provider_credential`, following the codebase's actual verb+noun `log_event` convention) — audit payload carries only `{provider, rotated}` metadata, never the secret
  - 🟢 Tests `tests/test_provider_credentials.py` (15) + a new RLS case in `tests/test_rls.py`: owner/admin gating, audit-logged with no plaintext leakage anywhere in the response or audit rows, rotate reuses the same row, missing/unregistered-provider give clean errors (never a 500), a provider value resolves and wins over a pre-existing scraped value with `source="provider"`, deleting a credential degrades a source without touching its existing overrides, `FastmarketsAdapter` unit-tested against a mocked `httpx.AsyncClient` (success fixture, 401→`rejected`, expired-token body→`expired`) — full suite 234 passed, verified live (migration applied + downgrade/upgrade cycle) from inside WSL
  - 🔴 Frontend UI (Team Settings credential panel, new dropdown option in `AddIndexModal`/`IndexDetailPanel`) — deliberately out of scope this pass, ticket's acceptance criteria are all backend

---


- 🔴 **Scrum 27** — Multi-tiered "Lego" formulas (sub-models nested into parent models)
  - 🔴 A FormulaVersion can reference another CostModel as a component
  - 🔴 Costing engine resolves nested models recursively (guard against cycles)
  - 🔴 UI shows nested breakdown: top-level components expand to reveal sub-model detail
  - 🔴 Export and brief generation handle nested structure correctly

- 🟢 **Scrum 27b** — Sheet round-trip mechanism (export a filtered slice → edit offline → reimport → diff → apply). Unrelated to Scrum 27 above (Lego formulas) despite the adjacent number — this is the ticket the backlog notes below label "SCRUM-73 (Scrum 27 — sheet round-trip)"; recorded as "27b" here to avoid colliding with the real Scrum 27. A referenced reference implementation (`newDocsFolder/pipeline/sync_decisions.py`) does not exist in this repo (confirmed by search) — built fresh, wired to one real payload instead of pure unused infrastructure
  - 🟢 Generic mechanism, one registered payload — `app/services/sheet_roundtrip/` (`base.py`/`excel_io.py`/`diff.py` are payload-agnostic; `formula_coverage_price.py` is the one registered `SheetPayloadSpec`) mirrors the existing `providers/` ABC+registry shape (Scrum 26) — adding a second payload is a new spec + one registry entry, not a mechanism change
  - 🟢 Payload: `FormulaRegionCoverage` base-price/currency/margin_pct/base_year/base_quarter editing, filterable by subfamily/needs_review — the ticket's own example ("export the unreviewed blocks for one subfamily") maps directly onto this. Key columns (`code`, `region`) vs. editable (pricing) vs. readonly (trust-layer: `data_confidence`/`coverage_tier`/`needs_review`) are three distinct classes, each locked/styled differently in the export
  - 🟢 Export produces a styled `.xlsx` with the column split **distinguishable in the file itself** — not just colored (`PatternFill`/`Font` conventions copied from `suppliers.py`'s export-excel, the only other styled-`.xlsx` writer in the repo) but genuinely locked: real openpyxl cell/sheet protection (new to this codebase), only editable cells unlocked. A code comment states plainly this is a UX guard against fat-fingering, not a security boundary — the import/diff step is the real authority
  - 🟢 Rows re-key by business-key column values (`code`+`region`), not position — a reordered sheet still matches correctly. Header matching is by normalized label text (`file_parser._read_file`'s existing normalization, reused as-is), decoupling display wording from column identity; no header-row-scanning needed since the export always puts headers on row 1 (a justified scope reduction vs. the ticket's inspiration text, which had to guess at a foreign format)
  - 🟢 Diffing always re-queries live DB state at import time, never a cached export-time snapshot — reimporting an unmodified export produces an empty changeset for free, and two overlapping exports each diff correctly against whatever's actually in the database when reimported (the ticket's explicit "concurrent edits are normal, not an edge case")
  - 🟢 Four diff kinds, all reported, never silently absorbed: `change` (a real editable-column edit — the only kind ever appliable), `rejected_readonly_edit` (a key/readonly column was edited), `invalid_value` (unparseable per-column validation, mirroring `parse_coverage_price_upload`'s existing rules), `unmatched_key` (the row no longer exists in the live slice)
  - 🟢 Import (`POST /api/sheets/{payload_key}/import`) only ever computes and persists a diff — **never mutates the payload table**. Applying (`POST /api/sheets/import-runs/{id}/apply`) is a separate, explicit call that re-verifies each row's live value still matches the diff's `old_value` before writing it (optimistic concurrency — a stale row is skipped and reported under `skipped_stale`, never blindly overwritten) and is idempotent on already-applied diffs
  - 🟢 `sheet_import_runs`/`sheet_import_row_diffs` (migration `srt1a2b3c4d5e`, platform-level, no RLS — same reasoning as `index_projection_runs`) persist every run so it's inspectable after the fact via `GET /api/sheets/import-runs/{id}` / `?payload_key=`, independent of whether it was ever applied
  - 🟢 Frontend: "Review & Apply Price Changes" panel in `Formulas.jsx` (`components/SheetRoundTripPanel.jsx`) — filter form, export-download, reimport-and-diff table (rejected/invalid/unmatched rows visually distinct from real changes), apply button, recent-runs list. Sits alongside the pre-existing "Import Prices" bulk-upload panel (a different workflow, not a replacement)
  - 🟢 Tests `tests/test_sheet_roundtrip.py` (14, all passing): one or more per acceptance criterion (filtered export + genuine cell-lock verification, empty-changeset-on-unmodified-reimport, named diff + import-never-mutates + apply-does, reorder-still-rekeys, readonly-edit-rejected-and-never-applied, run-persisted-and-listable), plus the concurrency behavior (stale row skipped, not overwritten) and extras (invalid value, unmatched key, permission gates, apply idempotency). Full suite 248 passed, verified live (migration + downgrade/upgrade cycle) from inside WSL

- 🟢 **Scrum 28** — Complex mathematical formulas (non-linear, thresholds, conditional logic)
  - 🟢 Formula components support: min/max bounds, step functions, yield/conversion factors — expressed through the advanced expression evaluator (not new `FormulaComponent` columns): `safe_eval_expr` now whitelists `min`/`max`/`abs`/`round`/`clamp(x,lo,hi)`/`step(x,threshold,below,above)`, so bounds/step/yield factors are written inline (e.g. `clamp(0.75*ACN+FC, 0, 900)`, `step(ACN,100,0,1)`)
  - 🟢 Expression editor or structured form for defining non-linear relationships (advanced free-form expression mode shipped in Scrum 14b — UI editor + variable mapping; `detectVars` now excludes the reserved function names via `utils/formulaFns.js` so `min`/`max`/etc. aren't treated as variables)
  - 🟢 Costing engine validates and evaluates complex expressions deterministically — `_eval_node` extended with whitelisted `Call` (fixed function set, no attrs/kwargs), `IfExp` ternary, `Compare` (incl. chained `a<b<c`), and `BoolOp` (`and`/`or`) + `Mod`/`Not`; conditional/threshold logic like `ACN if ACN < 100 else 100` now evaluates. Injection stays blocked (unknown calls / attribute access / builtins → `ValueError`)
  - 🔴 Pairs with Scrum 27 (Lego) — designed together (Lego nesting is still Scrum 27)
  - 🟢 Tests `tests/test_safe_eval.py` (8): baseline arithmetic unchanged, min/max/abs/round, clamp bounds, step, ternary/chained/boolean thresholds, mod, injection + unknown-call + undefined-var all raise

- 🟢 **Scrum 28b** — Link priced cost models to the library recipe, not a copy. Unrelated to Scrum 28 above (complex expressions) despite the adjacent number — this is the ticket the backlog notes below label "SCRUM-73 (Scrum 28 — link priced cost models...)"; recorded as "28b" here to avoid colliding with the real Scrum 28
  - 🟢 A cost model records which catalog combo it was priced from and whether it's frozen or live — `FormulaVersion.source_coverage_id` (FK → `formula_region_coverage.id`, `ON DELETE SET NULL`) + `link_mode` (`pinned`/`tracking`/`NULL`); both `NULL` = not catalog-linked, today's exact pre-scrum behavior, which is what makes backward compatibility trivial (`get_effective_lines` short-circuits to the frozen snapshot the instant `link_mode != "tracking"`). Migration `lnk1a2b3c4d5e`
  - 🟢 One shared resolver is the only place that branches on mode — `services/formula_resolver.get_effective_lines(db, fv, cost_model)` returns `(EffectiveLine[], fallback_reason)`: pinned/unlinked builds from the frozen `FormulaComponent` snapshot; tracking calls the same `flatten_components` the `/resolve` endpoint uses, live, at the cost model's **current** region, rebasing weights over the recipe's own weight sum (mirrors `evaluate_weighted_template`'s rebasing) — this is what makes a tracking breakdown's `depth`/`via_template_id`/`line_region` match `/resolve` for the same template+region *by construction*, not by a second synced copy
  - 🟢 All 6 costing-engine entry points route through it (`_compute_indexed_cost(_detailed)`, `calculate_evolution`, `calculate_brief`, `calculate_price_change`, `_compute_indexed_cost_forward`) — no product-facing inconsistency between should-cost/breakdown/Evolution/Brief/Price-Change/forward-should-cost for the same formula version. `calculate_should_cost` switches its internal call to the already-tested `_compute_indexed_cost_detailed` purely to reuse its `data_gaps` list
  - 🟢 **The `commodity_id IS NULL` ambiguity fix (benefits every cost model, not just catalog-linked ones)** — `FormulaComponent.component_type` (`index`/`fixed`/`NULL`) disambiguates "deliberately a fixed line" from "was supposed to be index-linked but the name match failed": `cost_models.py`'s `_resolve_component_fields` infers `component_type` server-side when the caller doesn't send one explicitly (existing callers unaffected), and `_compute_indexed_cost_detailed` emits an explicit `DataGap` ("index-linked component has no bound commodity") only for the former, never the latter. `FormulaComponentItem` also gained an explicit `commodity_id` field — a caller that already resolved one (e.g. via `/resolve`) no longer has to force a second, fragile exact-name re-match; a supplied id that doesn't exist is rejected (400) rather than silently stored
  - 🟢 Provenance carried end to end — `FormulaComponent` gained `component_type`/`depth`/`via_template_id`/`line_region`/`is_proxy` (provenance only, never read by calculation); `ComponentBreakdown`/`FormulaComponentOut` expose them; `clone_cost_model` copies all of it plus `source_coverage_id`/`link_mode` onto the clone (cloning must produce an equivalent formula, not silently drop the link)
  - 🟢 Graceful fallback, never silent or a 500 — a version saved `link_mode="tracking"` always had a `source_coverage_id` at save time (`FormulaVersionCreate` validator requires both or neither); the *only* way to see one without the other afterward is the FK's `ON DELETE SET NULL` firing because the linked coverage (or its template) was deleted. `get_effective_lines` treats exactly that state as the broken-link case and surfaces `"tracking link unavailable (combo deleted) — showing last-known formula"` as a `DataGap`, computing from the frozen snapshot rather than failing
  - 🟢 Visibility — `get_visible_template`/`get_visible_coverage` (extracted from `routers/formulas.py`'s private helper into the service layer so `cost_models.py` can reuse it without a router-to-router import) reject a `source_coverage_id` pointing at another team's private template (400)
  - 🟢 **Two pre-existing bugs found and fixed while extending these exact functions**: `create_cost_model` and `clone_cost_model` never `db.flush()`ed after adding `FormulaComponent` rows before building the response — with `autoflush=False` session-wide, the create/clone response always echoed an empty `components: []` even though the rows persisted correctly at commit (only visible on a subsequent `GET`). Both now flush before serializing, so the response actually reflects what was just written
  - 🟢 Frontend (`CostModelBuilder.jsx`) — `loadTemplateIntoModel` now carries `commodity_id`/`component_type`/`depth`/`via_template_id`/`line_region`/`is_proxy` through to component state instead of discarding them, sends `effective_weight_pct` at full precision (dropped a `Math.round(x*10)/10` that fought the `parts/totalParts` renormalization at save for no reason), and defaults a loaded catalog recipe to **pinned** (a saved formula must not drift out from under you by default; tracking is an opt-in toggle next to "Load Catalog Formula ▾", shown only once a combo is linked). A read-only "Linked to `<template>` · Tracking/Pinned" badge shows next to the formula-mode label in view mode. **Correctness fix required by the new explicit-`commodity_id`-priority design**: the Reference Index dropdown's `onChange` now also updates `commodity_id`/`component_type` in lockstep with the selected name — previously it only touched `commodity_name`, so editing the dropdown after a catalog load would have silently kept pointing at the old `commodity_id` (the backend now trusts an explicit id over the name)
  - 🟢 Tests `tests/test_cost_model_link.py` (11): source_coverage_id+link_mode round-trip through create/get, must-be-set-together validation, tracking should-cost changes after a live template edit while a pinned sibling doesn't, tracking breakdown provenance matches `/resolve` for a chained (depth>0) template, broken-index-link-vs-deliberately-fixed gap distinction, non-round weights survive at full precision, unlinked (`link_mode=NULL`) should-cost regression-pinned to exact numbers, propagation across Evolution/Brief/Price-Change for the same tracking version, graceful fallback when the linked coverage is deleted, cross-team coverage linking rejected, clone preserves link + provenance. Full suite 259 passed, verified live (migration + downgrade/upgrade cycle) from inside WSL

- 🟡 **Scrum 29** — Negotiation aid system (guided advisor with auto-generated script and materials)
  - 🔴 "Prepare negotiation" flow: enter known supplier position, get counter-argument suggestions (no such flow/endpoint — the guided advisor is unbuilt; note `workspace/NegotiateArea.jsx` IS now real (Scrum 65, wired to `/api/portfolio/summary` + `/api/costing/brief`), but it's the brief flow, not a position→counter→floor advisor)
  - 🟡 Auto-generates talking points from the gap, drivers, and index movement (`services/narrative.py` produces rule-based + LLM talking points for the brief — but not as a distinct counter-argument advisor)
  - 🔴 Produces a structured negotiation brief: your position, likely counter, recommended floor
  - 🔴 Output exportable as PDF alongside the standard cost brief
  - 🟡 **Audit note (this pass):** narrative generation is the only real piece; the guided advisor (position/counter/floor + script) is unbuilt. (The Negotiate workspace page itself is now real — Scrum 65 — so it is no longer demo-only; Scrum 29 is specifically the advisor layer on top.)

- 🔴 **Scrum 30** — Extract pricing from PDFs (supplier quotes and price lists)
  - 🔴 User uploads a supplier PDF; system extracts product name, price, date, currency
  - 🔴 Extracted data shown for review before committing to ActualPrice records
  - 🔴 Handles tabular and free-text price formats; shows confidence per extracted value
  - 🔴 Falls back gracefully — unrecognised formats prompt manual entry

- 🟢 **Scrum 30b** — Negotiation position engine (defensible target, attributed ask, unexplained remainder). Unrelated to Scrum 30 above (PDF price extraction) despite the adjacent number — this is the ticket the backlog notes above label "SCRUM-72 (Scrum 30 — negotiation position engine)"; recorded as "30b" here to avoid colliding with the real Scrum 30. Same collision-avoidance pattern as Scrums 27b/28b
  - 🟢 **The core arithmetic insight**: `evaluate_weighted_template` (`formula_resolver.py`, Scrum 58 — "the attribution service" the ticket refers to, though nothing in the repo calls it that) already consumes 100% of every line's verified index movement by construction (`Σ contribution_abs = should_cost` at any period, including the base period). This means the gap between a supplier's ask and our target can **never** be legitimately re-explained by re-crediting the same lines' movements — doing so would double-count evidence already spent building the target. The only thing that could support part of an ask is genuinely new information not already inside the target (a documented negotiation note/index dossier) — confirmed by repo-wide search that no such quantitative evidence model exists anywhere in this checkout (the ticket's own `W3-A DB-7 / W3-B` references are, like other Wave-3 cross-references in CLAUDE.md, forward-looking hooks into work that hasn't landed here). So `attributed_components` is structurally always `0` today, and the entire ask lands in the unexplained remainder — the honest, mathematically sound answer, not a shortfall, and exactly what the ticket's "a buyer who walks in with a number containing an unsupportable component loses the room" describes
  - 🟢 `GET /api/formulas/{template_id}/negotiation-position` (new, `backend/app/services/negotiation_position.py` + `backend/app/schemas/negotiation_position.py`) — combo (`template_id` × `region` × `year`/`quarter`) + a supplier's quoted price in. Reuses `evaluate_weighted_template` **directly, unmodified** — no `_apply_margin`/`_component_base` from `costing_engine.py` (that's the CostModel-path convention of stripping margin out and re-applying it; the catalog convention bakes margin in as a recipe line, and mixing the two produces an ask wrong by the margin, exactly as the ticket warns)
  - 🟢 Response: `target` (literally `FormulaEvaluateOut`, the existing `/evaluate` shape — no duplicate schema), `normalization` (currency/unit/Incoterm basis + adjustment applied, or an explicit note when one side's basis wasn't declared or no correction data was available — never a silent guess), `position.ask` (`normalized_supplier_price − should_cost`), `position.attributed_components` (every line, `attributed_amount`/`evidence` always `0.0`/`None` today — the real structural seam a future evidence model would plug into without breaking the identity), `position.unexplained_remainder`. Identity `Σ attributed_amount + unexplained_remainder == ask` holds by construction and is asserted in tests
  - 🟢 **No supplier-cost data, no fabrication** — a prior fabricated "supplier's likely counter" (hardcoded price ladder / tornado / counter-proposal playbook) was already removed once (`NegotiateArea.jsx:15-18`, commit `03e0856`) for inventing data; this engine never attempts to predict a counter, only decomposes what the buyer already has (a real quote) against real attribution
  - 🟢 **Comparability, scoped to what the data actually has**: `FormulaRegionCoverage` has `currency` but no stored `unit`/`incoterm` (confirmed by research) — rather than migrate the Scrum 58 coverage model, the endpoint takes `combo_unit`/`combo_incoterm` as optional request-time params alongside `supplier_currency`/`supplier_unit`/`supplier_incoterm`/`incoterm_adjustments` (confirmed scope decision). Currency always normalizes via the existing `fx_converter.get_fx_rate` (called directly, not through `convert_price`, so a missing rate is visible and reported as a note rather than silently left unconverted); unit via `unit_converter.convert_price_per_unit` only when both sides are declared; Incoterm via `incoterm_normalizer.normalize_price` (the non-lane variant — a bare combo has no `destination_region` for `FreightLane` lookup), which is a documented no-op without an adjustments dict, so a declared mismatch with no adjustment data is reported as an explicit note rather than silently comparing unnormalized numbers under a false claim of correction
  - 🟢 **Movement-only fallback, never an error** — a combo with lines but no `base_price` anchor still evaluates (`evaluable=True`, `index_level_pct` populated, `should_cost=None`) per `evaluate_weighted_template`'s existing behavior; the position response sets `insufficient=True` with a stated reason and `ask=None`, HTTP 200 throughout
  - 🟢 Proxy (`is_proxy`) and no-data (`has_data=False`, rides flat) lines are marked distinctly on every attributed line, reusing fields `evaluate_weighted_template` already produces — never presented at the same strength as a directly-indexed line
  - 🟢 Every claim traceable without re-running the engine — each line carries `component_id`, `commodity_id`/`commodity_name`, `base_value`/`current_value`/`ratio`, `depth`/`via_template_id`/`via_template_name`/`line_region` (enriched the same way `/resolve` enriches, in two batch lookups)
  - 🟢 Audit-logged (`negotiation_position_generated` on `formula_template`) following the exact `/brief` precedent — "assembling a negotiation position surfaces sensitive cost intelligence"
  - 🟢 No migration, no frontend — pure computation over existing engine + FX/unit/Incoterm utilities; AC explicitly states the output is inspectable via the API alone
  - 🟢 Tests `tests/test_negotiation_position.py` (12): identity (`attributed_total + unexplained_remainder == ask`), traceability, proxy/no-data marking, evidence always `None`, no-base-price movement fallback (200, not an error), fully-unevaluable combo still 200s, currency normalization (known rate + missing-rate note), unit normalization (both declared + one-sided note), Incoterm mismatch (no adjustments → note; with adjustments → real correction, pinned against `normalize_price`), a chained (`component_type="formula"`, depth>0) combo evaluates correctly, permission/visibility/invalid-period gates, audit logged. Full suite 271 passed, verified live from inside WSL (no migration this scrum — no schema change)

- 🟢 **Scrum 31** — Supplier trust & margin grading (reputation score from collected data). Real ticket text lives at `sample_idea/scrum32/prompt.txt` ("Supplier trust & margin grading (depends on alias canonicalisation)") — same story as this pre-existing TODO entry under a different source-tracker number, unlike every other numbering mismatch this session; updated in place rather than filed as a colliding "32b"
  - 🟢 Score computed from: gap trend (drift), pricing volatility (consistency), implied margin (magnitude) — `services/supplier_trust.py`. Deterministic, no ML: `magnitude_score = 100 − avg(|gap%|)×2`, `consistency_score = 100 − stdev(gap%)×2`, `drift_score` from a linear-regression slope of gap% over quarters (reuses `index_projection.py`'s existing pure-Python OLS fitter rather than a second copy), composite `0.5×magnitude + 0.3×consistency + 0.2×drift` → a letter grade A–F. `_should_cost_for_period` (Scrum 23's benchmark helper) extracted from `routers/suppliers.py` into `costing_engine.should_cost_for_period` so both the live benchmark and the persisted scorer share one should-cost pipeline, never two driftable copies
  - 🟢 **The ticket's stated hard dependency — confirmed absent, decision made explicitly**: a producer/alias-canonicalisation entity (`SCRUM-77`: `producer`/`producer_alias`/`producer_region`, `suppliers.producer_id`) that this story was meant to "sit after" doesn't exist anywhere in this repo (no `docs/WAVE3_PLAN.md`, no such model — confirmed by search, matching every other Wave-3 cross-reference this session). Scored by raw `Supplier.id`/`name` instead — already the correct RLS boundary regardless of aliasing (`suppliers.team_id` is `NOT NULL`, answering the ticket's own "is this a team fact or a platform fact" question: team fact, never shared). The gap is stated, not hidden: every response from this endpoint family carries `"resolution": "raw_supplier_name"`, and the Suppliers page renders it as a visible caption
  - 🟢 Grain: per (supplier, product), falling back to per (supplier, subfamily) pooling when a single product's priced history is too thin on its own (`MIN_QUARTERS = 4`, matching the existing Scrum 22 buy-window insufficient-data threshold) — only the products that were individually insufficient get pooled; a sibling product under the same subfamily with plenty of its own data keeps its own row untouched
  - 🟢 Persisted (`SupplierTrustScore`, migration `st1a2b3c4d5e`, team-scoped RLS — direct membership, same shape as `cost_model_notes`) with the full input breakdown (`avg_gap_pct`, `stdev_gap_pct`, `slope_pct_per_quarter`, the three sub-scores, `n_quarters`) stored alongside the score — "a disputed score can be explained rather than re-derived," per the ticket's own AC. Recompute upserts in place by `(supplier_id, grain, grain_key)` — `grain_key` is a non-null stringified id specifically because Postgres treats every `NULL` as distinct in a unique constraint, which would have silently defeated upsert-in-place had the nullable `product_id`/`subfamily_id` columns been part of the key directly
  - 🟢 Suppliers with too little history (no sufficient product- or subfamily-grain pool) return `insufficient_data=True`, `score=None` — never a fabricated low score
  - 🟢 `POST /api/suppliers/{id}/trust-score/compute` + `POST /api/suppliers/trust-scores/compute-all` (owner/admin, matches `/benchmark`'s existing gate exactly) + `GET /api/suppliers/{id}/trust-score` + `GET /api/suppliers/trust-scores` (read-only rollup, mirrors `/benchmark`'s `{"suppliers": [...]}` shape)
  - 🟢 Grade shown on the Suppliers page (Benchmarking view) — a new "Trust Grade" A–F badge column with a hover breakdown per grain, and a "Compute trust scores" button. Not surfaced in the negotiation brief this pass — that integration wasn't part of this ticket's own 4 acceptance criteria (all API/persistence-level); a real, separate follow-up if wanted
  - 🟢 Tests `tests/test_supplier_trust.py` (8): score formula regression-pinned (hand-computed example, exact score/grade), a flat-or-improving series gets full drift credit, sufficient history persists a real score, insufficient history (no subfamily) returns the explicit insufficient state, subfamily pooling (two thin siblings pooled cross the threshold; a third, sufficient sibling keeps its own row), recompute upserts in place (same row identity, no duplicates), the `resolution` flag is always present, permission/RLS gates. Full suite 290 passed, verified live (migration + downgrade/upgrade cycle) from inside WSL

- 🟢 **Scrum 31b** — Quote & price-list extraction service (structured fields, confidence, confirmed before landing). Unrelated to Scrum 31 above (supplier trust & margin grading) despite the adjacent number — this is the ticket CLAUDE.md's own backlog notes already cross-reference as "SCRUM-69 (Scrum 31 quote extraction)" (and, confusingly, the readiness scorecard once tracked the same idea as "Scrum 30 — PDF price extraction" — both rows removed from the scorecard now that this is shipped). Recorded as "31b" here, same collision-avoidance pattern as Scrums 27b/28b/30b
  - 🟢 **Why not `ActualPrice`**: `ActualPrice` is one confirmed scalar price per `(cost_model_id, year, quarter)`, requiring an already-disambiguated `CostModel` before a row can even exist. A quote extraction needs the opposite — multiple candidate lines per document, fields that may be genuinely absent (never defaulted), a not-yet-resolved product reference, a confidence + locator per field, and a review gate before anything is a fact — so a new pair of tables was built rather than shoehorning this into `ActualPrice`
  - 🟢 **Data model** (migration `qt1a2b3c4d5e`, all team-scoped RLS — direct membership on the two headers, transitive-through-parent on the two line tables, same shapes as `cost_model_notes` and `formula_template_components`): `QuoteExtractionRun`/`QuoteExtractionLine` (the draft — persisted immediately on upload, `fields` JSONB of `{field: {value, confidence, locator}}`, a field **absent** from the dict means not found, never a null placeholder) and `QuoteRecord`/`QuoteRecordLine` (the ticket's own "the quote record" — real typed columns, created lazily on a run's first confirmed line, never touched by the extraction step itself)
  - 🟢 **Extraction engine** (`services/quote_extraction.py`, `pdfplumber` — no LLM: `llm_enabled` defaults `False` in production and Ollama is best-effort/Tailscale-only, a core extraction path can't silently degrade to nothing; regex/keyword heuristics are also fully unit-testable without a live model) — table mode (a page's `extract_tables()` output with a recognizable price column yields one line per row, satisfying multi-product/multi-tier) with a full-text fallback (single-line, regex over page text) when no usable table exists. Confidence tiers `CONF_LABELED`(0.9, explicit column/label)/`CONF_CONTEXTUAL`(0.6, strong pattern + context)/`CONF_WEAK`(0.35, bare match). Reuses existing vocabularies directly: `app.constants.incoterms.is_valid`/`normalize` for Incoterm matching, `unit_converter`'s known units for unit aliases. Absence cascades honestly (e.g. "valid for 30 days" with no quote date found leaves `valid_until` absent too — can't compute from nothing)
  - 🟢 **Bug caught and fixed during testing**: matching Incoterm codes case-insensitively made deprecated codes collide with common English words (a document that says "valid **for** 30 days" was matching the deprecated Incoterm "FOR"). Fixed by matching only literal uppercase occurrences — real documents write Incoterm codes in caps almost universally, so this eliminates the false-positive class at a negligible recall cost
  - 🟢 No blob storage — the PDF is parsed and discarded like every other upload in this repo (confirmed decision); the extracted plain text is persisted instead, so a locator's snippet stays independently verifiable without needing the original file back
  - 🟢 `POST /api/quotes/extract` (multipart, gated `prices.import`) → draft run + lines; `POST /api/quotes/lines/{id}/confirm` (optional per-field overrides, gated `prices.edit`) → writes the permanent `QuoteRecordLine`, copying `field_confidence` forward so confidence/locator survive onto the permanent record too, not just the draft; `POST .../reject`; `GET /api/quotes/records`. No new RBAC migration — reuses the existing `prices.*` permission keys (quotes are pricing data; a `quotes.*` category would need a full permissions/plan/role-seeding migration for a distinction this ticket's scope doesn't need)
  - 🟢 **Negotiation-position wiring (AC6)** — extended the **existing** Scrum 30b `GET /api/formulas/{template_id}/negotiation-position` rather than building a parallel engine: `supplier_price` became optional, a new optional `quote_line_id` resolves a confirmed `QuoteRecordLine`'s price/currency/unit/incoterm as the supplier-side inputs (400 if neither or both are given; 400 if the line has no price). `compute_negotiation_position` itself needed zero changes — pure input substitution in the router
  - 🟢 Frontend — new page `pages/QuoteExtraction.jsx` (account "More" menu, `/quotes`): upload → per-line review table (extracted fields as chips with a confidence dot + hover locator, edit-before-confirm, confirm/reject) → a compact negotiation-position preview (catalog formula + region + period → target/ask/unexplained remainder) for a just-confirmed line → a confirmed-records list. Bespoke component, not `FileUpload.jsx` (that component's contract is a dry-run double-POST to the same endpoint; this flow persists a real draft on the first call, same reasoning that made Scrum 27b's `SheetRoundTripPanel.jsx` bespoke too)
  - 🟢 Tests `tests/test_quote_extraction.py` (11): structural failure (`ValueError` on unreadable bytes, real `pdfplumber.open` path, no mocking), multi-tier table → multiple lines, absent-fields-not-defaulted including the cascading-absence case, confidence + locator present on every field, the Incoterm/English-word regression pinned, draft persists with nothing in the quote record yet, confirm/reject state machine (double-confirm rejected, override wins, reject leaves no record line), permission/RLS gates, full round-trip (confirm → compute a real negotiation position off the confirmed line → `ActualPrice` row count unchanged), and both negotiation-position validation cases (neither/both of `supplier_price`/`quote_line_id`; a priceless confirmed line). Full suite 282 passed, verified live (migration + downgrade/upgrade cycle) from inside WSL

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

### Wave 3 refined backlog (SCRUM-70…156) — teammate's ticket numbering, cross-mapped to the scrums above

> This is the teammate's parallel refinement pass over Wave 3, with real acceptance criteria, dependency chains, and known gotchas. It references a foundational drop (**Index Data Layer v2**: `newDocsFolder/`, `docs/WAVE3_PLAN.md`, `docs/CONTENT_MODEL.md`, producer/alias entity, `index_seasonal_factor`, volatility-calibration table, forecast/vintage storage) that is **not present in this repo checkout** — confirmed absent by direct search. Until that drop merges here, every ticket below that names it as a dependency is blocked at the data-model level, not just unscheduled. Two tickets (SCRUM-71, SCRUM-74-collab) were already shipped this session before this backlog arrived — flagged inline so they aren't rebuilt.

- 🟢 **SCRUM-70/71 → Scrum 24 (Alerts)** — **already shipped** this session (`services/alerts.py`, subscriptions, index-move/gap/buy-window triggers, email+Slack, history). No action.
- 🟢 **SCRUM-74 (collaboration half) → Scrum 25** — **already shipped** (`CostModelNote`, `negotiation_state` flag, @mentions). No action. (Note: "SCRUM-74" is reused across this backlog for several unrelated tickets — collaboration, provider credentials, the estimator, and data-quality validation all carry the same number in the source list; treat by title, not by number.)
- 🔴 **SCRUM-71 (buy-window lock/hold verdict)** — the forward half of Scrum 22. Backward half (`_buy_signal`, ±3% trailing-4Q) is shipped and stays as-is. Needs: a should-cost **forecast** at combo grain (blocked on SCRUM-70's projection service existing first), a `kind`/`is_forecast` marker on index rows (today `_available_index_range` takes `max()` over `IndexValue` with no kind filter — forward data would silently corrupt the "trailing" window the instant it's loaded), and a verdict schema (horizon, forecast vintage, `insufficient` state, not-money-just-percent). **Sequencing hazard flagged in the ticket itself: do not land before the forecast-storage subtask.**
- 🟢 **SCRUM-72 (Scrum 30b — negotiation position engine)** — shipped (see "Scrum 30b" above for detail). Built on `evaluate_weighted_template`/`formula_resolver.py` directly (the combo-level attribution engine) rather than `calculate_brief` (which is CostModel-scoped, not combo-scoped) — target/ask/unexplained-remainder, incoterm/fx/unit normalization via the existing utilities, and the margin-is-a-line-not-additive convention respected throughout. "Likely counter" stays out, exactly as this note anticipated.
- 🔴 **SCRUM-72 (Scrum 29 partial — component-level non-linear fields)** — the expression-evaluator half (`clamp`/`step`/`min`/`max`/ternary/thresholds) is **already shipped**. What's left: per-`FormulaComponent` structured min/max/yield-factor fields (vs. writing them inline in an expression), if that structured form is still wanted alongside the expression path.
- 🟢 **SCRUM-73 (Scrum 27b — sheet round-trip)** — shipped (see "Scrum 27b" above for detail). `file_parser.py`'s dry-run/update-only contract was indeed the right local precedent for validation rules; the diff-then-apply-as-two-calls, reorder-safe re-keying, and rejection (not silent absorption) of read-only-column edits are all implemented and tested.
- 🟢 **SCRUM-73 (Scrum 28b — link priced cost models to the library recipe, not a copy)** — shipped (see "Scrum 28b" above for detail). `FormulaVersion.source_coverage_id`/`link_mode` + `services/formula_resolver.get_effective_lines` are exactly the "priced `CostModel` recording which template+region it resolved from" this ticket called for; `depth`/`via_template_id`/`line_region` are now carried end to end instead of dropped, and the exact-name-match silent-flat-ride-on-a-miss is closed via `component_type` + explicit `commodity_id`.
- 🔴 **SCRUM-73 (Scrum 31 — supplier trust & margin grading)** — scoring layer over `GET /suppliers/benchmark` (shipped, Scrum 23). **Hard-blocked** on a producer/alias canonicalisation entity (`producer` + `producer_alias` + `producer_region`, owned by a ticket not in this backlog) that doesn't exist here — scoring off raw `suppliers.name` today would silently split one real supplier's history across several aliases.
- 🔴 **SCRUM-73 (Scrum 33 — multi-source index validation, redefined)** — reframed from "compare two live sources" to "surface declared/structural contradictions already in the drop" (`_issues.csv`, `proxy_status` self-contradictions, `ambiguous` resolution states, agency/unit/incoterm mismatches). **Hard-blocked** on the Index Data Layer v2 resolution layer (SCRUM-74/DB-5) which isn't in this repo; two schema constraints (`CommodityIndex.provider` `String(64)` too short, `FREQUENCIES` vocab missing values the drop uses) are called out as load-time failures to fix as part of this work, whenever it starts.
- 🔴 **SCRUM-69 (Scrum 18 extension — sheet-based advanced import/export)** — folded reference to structured-export/BI/ERP scope; explicitly **not Wave 3** except as a "keep the format machine-readable" constraint on SCRUM-73's round-trip mechanism.
- 🟢 **SCRUM-74 (Scrum 26 — team-supplied provider credentials)** — shipped, backend/API only (see Scrum 26 above for detail). Built on `TeamIndexSource`'s current `(team_id, commodity_id, region)` key rather than waiting on the referenced region-key migration — confirmed absent from this repo, same treatment as the "W3-A" dependency in Scrum 21/22; the new `TeamProviderCredential` table's own key (`team_id, provider`) is independent of that grain either way, so no re-migration risk there regardless.
- 🟢 **SCRUM-69 (Scrum 31b quote extraction)** — shipped (see "Scrum 31b" above for detail). `pdfplumber` chosen for the PDF-parsing decision; no blob storage (extracted text persisted instead) for the storage decision; lands in a new `QuoteRecord`/`QuoteRecordLine` pair, never `ActualPrice`, exactly as this note anticipated.
- 🔴 **SCRUM-74 (Scrum 32 estimator — cost-structure proposal service)** — AI-drafted weighted-line proposals for combos with no recipe. **Blocked** on a persisted review/provenance layer (`ai_draft` state distinct from `imported`/`human_approved`) that doesn't exist — today `routers/ai.py` → `ollama.py` is prompt → Redis cache → discarded, nothing persists or is reviewable.
- 🔴 **SCRUM-75 / INT-1 — Intelligence derivation service** (parent of SCRUM-132/133/134/135/155/156) — one engine deriving should-cost series, component breakdown, %-change, cycle position, seasonality, and volatility percentile, all at **formula × region combo grain** (a `FormulaRegionCoverage` row), not per-`CostModel`. `formula_resolver.evaluate_weighted_template` already does one period at this grain — the work is the multi-period extension.
  - 🔴 **SCRUM-132 (series/components/%-change core)** — buildable now on top of `evaluate_weighted_template`; no drop dependency. Base-100-at-base-period, per-line contribution summing to level, un-priceable lines → `data_gaps` not dropped.
  - 🔴 **SCRUM-133 (cycle position: percentile + 3 verdicts + flat-series case)** — buildable now; fixes an existing real bug where `IntelligenceDetailArea.jsx:94-98` hardcodes "24-month" over a window it doesn't actually use, and the mockup's window disagrees with its own chart label. One constant must drive both the verdict text and the label.
  - 🔴 **SCRUM-134 (derived-payload API + read-path decision)** — buildable now; must decide denormalised-endpoint vs. materialised-rows vs. documented query-budget **before** building (explicitly deferred once already in the Content Model doc for the editorial half — don't repeat the mistake here). Composes with a separate `GET /formulas/{code}/intelligence` editorial+dimensions read (SCRUM-76/CON-7, not in this repo) — this ticket owns only the derived-numbers half.
  - 🔴 **SCRUM-135 (test fixtures by combo shape, not by product)** — buildable now alongside 132–134; 8 named shapes (fully-resolved, proxy-backed, no-series, no-lines, no-base-price, fixed-cost-heavy, flat-series, chained) each need a dedicated fixture, pinning invariants (base=100, contributions sum to level) rather than exact values since seed data is still moving.
  - 🔴 **SCRUM-155 (seasonality: weight-blended 12-month profile)** — **hard-blocked** on `index_seasonal_factor` (SCRUM-69, per-series derived table) which doesn't exist in this repo; the drop's `INDEX_SEASONALITY`/`INDEX_SEASON_NOTES` are a cache of that computation, not an independent source to read directly.
  - 🔴 **SCRUM-156 (volatility percentile vs. platform calibration)** — **hard-blocked** on the stored calibration ladder (SCRUM-74/DB-7) and monthly-grain index values (SCRUM-74/DB-6 — `index_values` is quarterly today); also needs the ladder-step calculation derived from the ladder's actual length (the mockup hardcodes `×5`, which breaks silently if the ladder is ever recalibrated to a different size).

**Foundation-readiness gate:** SCRUM-72(negotiation engine), 73(recipe-link, round-trip), 69(quote extraction), and SCRUM-132/133/134/135 of the INT-1 family are buildable in this repo **today**, no external drop required. Everything else in this backlog names a dependency (producer/alias entity, Index Data Layer v2 resolution layer, seasonal-factor table, volatility calibration table, forecast/vintage storage, per-team credential storage, AI-draft review/provenance layer) that does not exist in this checkout and must land first — whether that happens depends on whether the teammate's parallel drop merges into this repo.

---

## All-waves readiness scorecard (🟡/🔴 items only)

Every non-🟢 item across all three waves, scored **/10 = Ease (0–5, how workable with the CURRENT codebase — reuse available, no missing foundation) + Value (0–5, product/negotiation impact)**. Sorted high to low within each wave. Use this to pick the next build, not as a priority mandate — a 10/10 that isn't wanted yet is still a 10/10.

### Wave 1
| Item | Ease | Value | /10 | Why |
|---|---|---|---|---|
| Scrum 17 — Inspectable numbers | 4 | 5 | **9** | Engine already computes every intermediate (ratio, contribution, FX, unit, incoterm) inside `_compute_indexed_cost`/`formula_resolver`; this is a schema+UI surface job, not new math. High trust/credibility value — the negotiation brief's whole pitch is "auditable numbers." |
| Scrum 16 — Onboarding | 4 | 4 | **8** | "Load example data" reuses `seed_all.py`/`seed_staminachem.py` logic almost verbatim; checklist is state the app already tracks (has a cost model? has actuals? has a brief?). Solid but not core-loop-critical since the flow already works once someone's past onboarding. |
| Scrum 12 — Landing page (remaining) | 5 | 2 | **7** | Code is 100% done; remaining items are a Cloudflare dashboard click + a stats footnote. Trivially easy, but it's ops not code, and low product value beyond marketing polish. |
| Scrum 9 — OAuth hardening | 3 | 4 | **7** | PKCE + per-request `state` store/validate is a contained, well-understood change; refresh-token rotation + `SameSite=Strict` (blocked by cross-subdomain app/API split) is the harder half. Real security exposure today (state discarded, 72h no-rotation token) makes this higher-value than it looks. |
| Scrum 11 — SOC 2 (Sentry slice only) | 4 | 2 | **6** | `add sentry-sdk` + set the Railway DSN is a 10-minute fix for the code slice; the rest of the scrum (uptime monitoring, branch protection, IR plan, DPA list) is pure ops/process, not something to "build." Scored on the buildable slice only. |
| Scrum 10 — Data-security story | 2 | 4 | **6** | The RLS gap (`roles`/`team_member_roles`/`team_invites` with no policy) is an easy migration; the login/logout audit needs a `team_id`-nullable migration + design decision first. The written docs (TLS confirmation, EU residency, backup/retention, restore drill) aren't code at all — score reflects the mixed nature, real value if selling to enterprise IT. |

### Wave 2 (catalog) — all scrums 🟢; only data/engine follow-ups remain
| Item | Ease | Value | /10 | Why |
|---|---|---|---|---|
| Per-region proxy layer (Scrum 57 follow-up) | 3 | 4 | **7** | Needs a new `(commodity, region)` table + resolver changes — bounded scope, clear precedent (mirrors the existing proxy fields), fixes a real fidelity loss (20 of 32 multi-region commodities currently share one representative feed). |
| FD-1 remainder (free-tier feeds with no scraper) | 2 | 5 | **7** | This is *the* reason ~51 of 76 catalog rows show "No data" despite both sync buttons working. High value (it's the visible gap in every demo), but each of ~30 feeds needs its own series-ID mapping to a real provider — no shortcut, genuinely a multi-day scrum. |
| Base-price anchors (real prices for 676 combos) | 1 | 5 | **6** | Import tooling + editor are fully built and waiting; the blocker is that nobody has the actual price data. Can't be "worked" in the codebase sense — it's a data-acquisition task, scored low on ease for that reason despite trivial code effort once data exists. |
| SEED-2 rebuild to 2026-07 workbook | 2 | 2 | **4** | Deliberately deferred — needs a matching combos handoff from whoever owns that workbook. Low urgency: the catalog works today with the old-shell inconsistency clearly flagged, not silently wrong. |

### Wave 3 (Scrums 19–33, ✅ = already 🟢 this session)
| Item | Ease | Value | /10 | Why |
|---|---|---|---|---|
| Scrum 27 — Lego formulas (nested cost models) | 3 | 4 | **7** | `formula_resolver.py`'s chaining (depth cap, cycle detection, weight flattening) already solves the hard recursion problem for *templates*; extending it to `CostModel`-references-`CostModel` reuses that pattern closely. Touches the core costing engine, so real regression risk — not a quick win despite the reusable pattern. |
| Scrum 33 — Multi-source index validation | 2 | 3 | **5** | Redefined (per the teammate's backlog) from "compare two live sources" to "surface contradictions already in the data" — cheaper than the original framing, but still hard-blocked on a resolution layer (SCRUM-74/DB-5) that isn't in this repo. Can't start until that lands. |
| Scrum 32 — AI cost modeler (retroactive estimation) | 1 | 3 | **4** | Ollama infra (`ollama.py`, prompt→cache pattern) exists, but nothing persists or is reviewable today — `routers/ai.py` is prompt-in, cache-out, discarded. Needs a whole review/provenance state machine before the AI part is even useful, which is most of the work. |

**Read this table alongside the Wave-3 refined backlog above** — several rows here (27, 29, 30, 31, 32, 33) are the same work the teammate's SCRUM-70…156 tickets scope in more detail; where they disagree on blockers, the refined backlog is more current (it was written against the actual missing-drop state).

---

## Product Roadmap

> Delivery-wave re-sequencing (tracker): **Wave 2 = catalog track (Scrums 55–68)**; the former intelligence/depth scrums (19–33) are now **Wave 3**. The thematic prose below predates that and describes the original product intent.

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
