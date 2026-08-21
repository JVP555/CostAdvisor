# CostAdvisor — Backup & Retention Policy

*Last updated 2026-08-22.*

## Scope

This policy covers the production PostgreSQL database (all customer cost
models, pricing, index, and account data) and the platform-level auth/audit
tables. It does not cover Redis (job queue state only — nothing is
retained there that isn't reproducible from Postgres) or the Ollama VM
(stateless narrative generation, results cached in Redis with a 7-day TTL,
never the source of truth).

## Backup

**[NEEDS CONFIRMATION — see `jvpdocs/wave1manual.md`]**: Railway's managed
PostgreSQL includes automated backups, but the exact configuration
(frequency, retention window, and whether point-in-time recovery is
available on the current plan tier) must be confirmed against the live
Railway project settings and recorded here before this policy is
considered final. Until confirmed, treat the following as the *target*
policy rather than a verified-in-place one:

- **Frequency:** daily automated snapshot, minimum.
- **Retention window:** 30 days of daily snapshots.
- **Point-in-time recovery:** if available on the plan tier, enabled with at
  least a 24-hour recovery window; if not available, daily snapshots are the
  floor and this should be flagged as a gap to close (upgrade plan tier or
  add a supplementary `pg_dump` cron to off-platform storage).

## Retention

- **Active customer data:** retained for the lifetime of the account.
- **Soft-deleted users:** `User.deleted_at` is set (not a hard delete) —
  the row and its audit history remain queryable by super-admins for support
  and compliance purposes, and the user is excluded from the active users
  list (`app/routers/admin.py::delete_user`). A soft-deleted account can be
  restored by a super-admin.
- **Audit trail (`AuditLog`, `AuthEvent`):** append-only, retained
  indefinitely by design — no delete endpoint exists for either table. This
  is a deliberate choice (SOC 2 auditability) and should be stated explicitly
  to any customer asking about audit-log retention.
- **Refresh tokens:** revoked rows are never purged automatically today; they
  are small, inert once revoked, and pose no security risk left in place,
  but a periodic cleanup job (delete `RefreshToken` rows where
  `expires_at < now() - interval '30 days'`) would be a reasonable low-risk
  addition if the table's growth becomes a concern. Not yet built.

## GDPR right-to-erasure

- **What exists today:** a soft-delete path (`User.deleted_at`) via the
  admin console. This satisfies "the user can no longer sign in and is
  excluded from active listings" but **does not** remove the underlying
  personal data (email, display name) from the database.
- **Gap:** there is no hard-delete / true-erasure endpoint today. A GDPR
  erasure request currently requires manual intervention:
  1. A super-admin soft-deletes the account (existing `DELETE
     /api/admin/users/{id}` path).
  2. Engineering runs a manual, reviewed SQL script to null out or remove
     PII fields (email, display_name, avatar_url, google_id) while leaving
     the row's `id` and audit-log foreign keys intact — so audit history
     stays valid without retaining the person's identity.
- **Recommended follow-up (not yet built):** a proper hard-delete/anonymize
  endpoint (`POST /api/admin/users/{id}/erase`) that performs step 2
  programmatically, audit-logs the erasure itself, and is restricted to
  super-admins. Track as a backlog item if/when a real erasure request
  arrives, rather than building it speculatively ahead of need.

## Restore drill

**[NOT YET PERFORMED — see `jvpdocs/wave1manual.md`]**. This policy is not
complete until a real restore has actually been executed and logged. Record
here, once done:

| Date | Performed by | Source snapshot | Target | Result | Notes |
|---|---|---|---|---|---|
| _pending_ | | | | | |

The drill should: restore the most recent production (or a staging clone of
production) snapshot into a fresh, isolated database; run the backend test
suite's smoke checks against it (`pytest tests/ -k smoke` or equivalent
manual verification); confirm row counts on a few key tables match the
source; and record the wall-clock time taken, since that number is what
"our recovery time objective" actually means to a buyer's IT team.
