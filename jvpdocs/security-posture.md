# CostAdvisor — Security Posture

*Prepared for enterprise IT / security review. Last updated 2026-08-22.*

This document describes how CostAdvisor protects customer data today. It is
written to be handed to a prospect's IT or security team as part of a
procurement/vendor-security review. Every claim below is backed by a specific
control in the codebase or infrastructure — file references are included so
engineering can verify each point on request.

One item in this document is still marked **[NEEDS CONFIRMATION]** —
production's backup frequency/retention window, pending one more dashboard
check. See `jvpdocs/wave1manual.md`.

---

## 1. Architecture summary

| Layer | Provider | Notes |
|---|---|---|
| Frontend (SPA + landing) | Cloudflare Workers | Static assets, edge-served |
| Backend API | Railway | FastAPI, Python |
| Database | Railway PostgreSQL | Per-environment (prod/staging fully separate) |
| Background jobs | Railway (Redis + Celery) | Nightly scrapes, alert evaluation |
| AI narrative generation | Self-hosted Ollama on a private Hetzner VM | Reachable only over Tailscale — never exposed to the public internet |

Production (`main` branch → `costadvisor.org` / `api.costadvisor.org`) and
staging (`dev` branch → `dev.costadvisor.org` / `api-dev.costadvisor.org`) run
on **completely separate databases and secrets** — no credential or data
sharing between environments.

## 2. Encryption in transit

- **Frontend:** Cloudflare terminates TLS for every request to the landing
  page and the app SPA; Cloudflare enforces HTTPS (HTTP requests are
  redirected).
- **Backend API:** Railway provisions and terminates TLS for
  `api.costadvisor.org` / `api-dev.costadvisor.org`; the API is not reachable
  over plain HTTP from the public internet.
- **Database connections:** the API connects to Railway PostgreSQL over
  Railway's private network (`postgres.railway.internal`), never over the
  public internet. Confirmed via Railway's own documentation: private-network
  traffic between services is encrypted end-to-end with **WireGuard**
  (ChaCha20/Curve25519/BLAKE2s) — this is automatic, not something the
  application configures. The production database additionally runs on
  Railway's TLS-enabled Postgres image (`postgres-ssl:18`), a second layer
  at the Postgres protocol level itself.
- **AI / Ollama:** the narrative-generation service runs on a private Hetzner
  VM and is reachable **only over Tailscale** (a WireGuard-based encrypted
  mesh network) — it has no public IP and is never exposed to the internet.
  Confirmed in `backend/app/services/ollama.py` / `CLAUDE.md`.
- **Third-party API calls:** all outbound scraper/data calls (ECB, EIA,
  Eurostat, FRED, World Bank, Frankfurter/Google OAuth) use HTTPS endpoints
  only — no plaintext HTTP calls exist between services (`app/config.py`'s
  `*_api_base` settings are all `https://`).

## 3. Encryption at rest

- **Database:** Railway PostgreSQL. Confirmed via Railway's own support
  documentation: *"All customer data within Railway projects is encrypted
  at rest... at the lowest level, so if somebody were to gain physical
  access to the disk your data resides in, they would not be able to view
  the data without the decryption key."* This applies automatically to the
  managed Postgres offering — nothing the application configures.
- **Secrets at rest:** the JWT signing secret, Google OAuth client
  credentials, SMTP credentials, and the Google-Calendar Fernet encryption
  key are stored as environment variables in Railway's secret manager
  (production/staging) or a gitignored local `.env` file (development) — never
  committed to source control (`backend/app/config.py`, `.gitignore`).
- **Per-record encryption:** demo-host Google Calendar refresh tokens are
  Fernet-encrypted at the application layer before being stored
  (`services/google_calendar.py`, `google_calendar_encryption_key` setting) —
  this is in addition to, not instead of, database-level protection.
- **Refresh tokens (Scrum 9):** only the SHA-256 hash of a session refresh
  token is ever persisted (`RefreshToken.token_hash`,
  `backend/app/routers/auth.py:_hash_token`) — the raw token exists only in
  the HttpOnly cookie on the user's browser and is never stored server-side.

## 4. Multi-tenant isolation (Row-Level Security)

Every tenant-facing table is scoped by `team_id` and enforced at the
**database layer**, not just the application layer, via PostgreSQL Row-Level
Security:

- Session-level GUCs `app.current_user_id` and `app.bypass_rls` are set per
  request (`backend/app/database.py`) from the authenticated user's JWT.
- A `tenant_isolation` policy on every tenant-scoped table restricts visible
  rows to those belonging to a team the current user is a member of, unless
  `app.bypass_rls` is explicitly set (used only by Celery background tasks,
  seed scripts, and migrations — never by a user-facing request).
- Policies use `FORCE ROW LEVEL SECURITY`, so even the application's own
  database role cannot read across tenants by mistake — a bug in a query
  cannot leak another team's data.
- Coverage: `products`, `suppliers`, `cost_models`, `formula_versions`,
  `formula_components`, `actual_prices`, `actual_volumes`, `index_overrides`,
  `team_index_sources`, `audit_logs`, `cost_scenarios`, `custom_fx_rates`,
  `formula_templates` (platform rows visible to all, team rows isolated),
  `chemical_families`, `subfamilies`, `formula_template_components`,
  `formula_region_coverage`, `cost_model_notes`, `alert_subscriptions`,
  `alert_events`, and — as of the most recent hardening pass — `roles`,
  `team_member_roles`, and `team_invites`
  (`alembic/versions/h8i9j0k1l2m3_enable_rls.py`,
  `rls1f2a3b4c5d_fix_rls_formula_and_custom_fx.py`,
  `rls2a3b4c5d6e_close_rbac_rls_gap.py`, and subsequent per-feature RLS
  migrations).
- `team_memberships` is the one deliberate exception — it's the table the
  membership subqueries themselves read from, so it can't depend on itself.
- Proven, not just asserted: `backend/tests/test_rls.py` runs cross-tenant
  queries directly against Postgres (bypassing all application code) and
  asserts a session authenticated as Team A can never see Team B's rows.

## 5. Access control

- Google OAuth 2.0 with **PKCE (S256)** and a per-request, cookie-validated
  `state` parameter (both checked before any network call to Google) —
  `backend/app/routers/auth.py`.
- Access tokens are short-lived (15 minutes); refresh tokens (7-day expiry)
  **rotate on every use** — the previous refresh token is immediately revoked
  and cannot be replayed (`RefreshToken.replaced_by_id` chain).
- Session cookies are `HttpOnly` and `Secure` in production; JWTs are never
  exposed to JavaScript or stored in `localStorage`.
- Fine-grained RBAC: 38 permissions across 11 resource categories, plan-tier
  ceilings, and team-scoped custom roles (`app/services/permissions.py`) —
  every resource endpoint checks `require_permission()` before reading or
  writing.
- Super-admin actions (impersonation, cross-team support) are gated behind
  `require_super_admin`, always audit-logged, and the acting super-admin is
  excluded from acting on their own account.
- Invite-only signup: new accounts must have a pending team invite or an
  accepted platform access request — enforced in the OAuth callback before an
  account is created.

## 6. Audit logging

Two separate, append-only audit trails, deliberately kept apart because they
have different data-availability guarantees:

- **`AuditLog`** (team-scoped, RLS-protected) — every mutation a user makes
  inside a team: cost model changes, exports, role changes, impersonation
  start/stop, brief generation, and more. Requires a real `team_id` and
  `user_id` (both `NOT NULL`).
- **`AuthEvent`** (platform-level, no `team_id`) — login success, login
  failure (with a reason: signup disabled / access pending / access
  rejected / access needed), and logout. Added specifically because a login
  attempt has no team yet and may not even resolve to a real user, so it
  can't live in `AuditLog`'s NOT-NULL schema. Readable via the super-admin-only
  `GET /api/admin/auth-events` endpoint, mirroring the existing
  `/api/admin/audit-logs` endpoint.
- Both are **append-only** at the application layer — no update or delete
  endpoint exists for either table.

## 7. Data residency

See `jvpdocs/eu-data-residency.md` for the full statement and migration plan.
Summary: **confirmed — production is hosted in US East (Virginia)**, not the
EU. See that document for what this means for EU-based prospects.

## 8. Backup & retention

See `jvpdocs/backup-retention-policy.md` for the full policy, including
backup frequency, retention windows, the GDPR right-to-erasure path, and the
restore-drill log.

## 9. Determinism & integrity of calculations

The costing engine (`app/services/costing_engine.py`) — the component that
produces the should-cost figures customers rely on for negotiation — is
covered by regression tests asserting **identical output on repeated calls**
with the same inputs (`backend/tests/test_brief.py`), and calculation paths
do not swallow exceptions silently.

## 10. Incident response & vendor risk

See `jvpdocs/incident-response.md` and `jvpdocs/vendor-risk.md`.

---

*Open items before this document can be considered final and shared
externally: see `jvpdocs/wave1manual.md`.*
