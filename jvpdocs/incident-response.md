# CostAdvisor — Incident Response Plan

*Last updated 2026-08-22.*

## Scope

Any event that compromises the confidentiality, integrity, or availability
of customer data or the platform itself: a security breach, a tenant-isolation
failure, unauthorized access, a data-integrity bug in the costing engine, or
an extended outage.

## Detection

Current detection surfaces:

- **Sentry** — error capture is wired (`app/main.py`'s conditional
  `SentryAsgiMiddleware`) and will report unhandled exceptions once
  `SENTRY_DSN` is set in the deployed environment.
  **[NEEDS ACTION — see `jvpdocs/wave1manual.md`]**: create the Sentry
  project and set the env var; until then, this detection channel is inert.
- **Uptime monitoring** — **[NOT YET CONFIGURED — see
  `jvpdocs/wave1manual.md`]**. No external uptime check exists yet against
  `api.costadvisor.org` / `costadvisor.org`.
- **Audit trail** — `AuditLog` and `AuthEvent` (see
  `jvpdocs/security-posture.md` §6) give a queryable record for
  after-the-fact investigation of who did what, including failed-login
  patterns that might indicate credential stuffing.
- **RLS** — a tenant-isolation failure would most likely first surface as a
  support ticket ("I can see another company's data") rather than an
  automated alert; `backend/tests/test_rls.py` exists precisely to catch this
  class of bug before it ships, not after.

## Response process

1. **Detect** — via Sentry, uptime alert, a support ticket, or direct
   discovery during development.
2. **Contain** — for an active breach: revoke the affected credentials
   immediately (rotate `JWT_SECRET` to invalidate all sessions at once if a
   token-forging risk is suspected; revoke specific `RefreshToken` rows if
   only specific sessions are affected). For a tenant-isolation bug: identify
   the affected table/query, and if actively exploitable, take the affected
   endpoint offline (feature-flag or quick deploy) rather than leaving it live
   while a fix is prepared.
3. **Assess scope** — use the audit trail (`AuditLog`, `AuthEvent`) to
   determine which teams/users/records were actually affected — not just
   which ones were theoretically exposed.
4. **Notify** — see breach-notification timeline below.
5. **Remediate** — fix the root cause, add a regression test that would have
   caught it (the project's own convention — see `backend/tests/test_rls.py`,
   `test_oauth_hardening.py`, `test_auth_events.py` for the pattern of
   "found a real bug while building X, fixed it, added a test"), deploy.
6. **Post-mortem** — write up what happened, why, what caught it (or why
   nothing did), and what changed as a result. Keep it blameless and keep
   it short enough that it actually gets read.

## Breach notification timeline

- **Customers:** notify affected customers without undue delay once the
  scope is understood — a specific SLA (e.g. 72 hours) should be committed
  to in the customer-facing security posture doc once the business has a
  named security/support contact to own that commitment.
- **GDPR (Article 33):** if EU personal data is involved, the relevant
  supervisory authority must be notified within **72 hours** of becoming
  aware of the breach, where feasible. This clock starts at "aware," not
  "root-caused" — don't wait for a full RCA before making the notification if
  the 72-hour window is at risk.

## Roles (fill in with real names/contacts before sharing externally)

**[NEEDS ACTION — see `jvpdocs/wave1manual.md`]**: this plan is not
operationally complete until a real person is named for each role below.

| Role | Responsibility | Owner |
|---|---|---|
| Incident commander | Coordinates response, makes the contain/notify calls | _TBD_ |
| Engineering lead | Root-causes and fixes | _TBD_ |
| Customer communication | Drafts and sends customer notification | _TBD_ |
| Compliance/legal | Owns the GDPR notification decision + timeline | _TBD_ |

## Severity levels

| Level | Definition | Example |
|---|---|---|
| SEV1 | Active data breach or cross-tenant data exposure | RLS bypass discovered in production |
| SEV2 | Full outage, no data exposure | API down, database unreachable |
| SEV3 | Degraded service, no data exposure | Scraper job failing, Ollama unreachable (narrative gracefully falls back) |
| SEV4 | Minor bug, no security/availability impact | Cosmetic UI issue |

SEV1 always triggers the full process above, including the notification
clock. SEV2/SEV3 follow contain → fix → post-mortem without a customer-data
notification step (unless investigation reveals data was in fact affected,
in which case it's reclassified SEV1).
