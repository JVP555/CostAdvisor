# CostAdvisor — Backup & Retention Policy

*Last updated 2026-08-22.*

## Scope

This policy covers the production PostgreSQL database (all customer cost
models, pricing, index, and account data) and the platform-level auth/audit
tables. It does not cover Redis (job queue state only — nothing is
retained there that isn't reproducible from Postgres) or the Ollama VM
(stateless narrative generation, results cached in Redis with a 7-day TTL,
never the source of truth).

## Backup — confirmed, live on the production Railway project

- **Point-in-time recovery (PITR):** enabled. Continuous WAL archiving —
  can restore to any recent moment, not just a daily snapshot. (Had to
  regenerate the storage-account credentials once during setup after an
  initial "WAL archive credentials may be invalid" error; resolved cleanly
  after a redeploy.)
- **Volume backups:** scheduled daily, plus on-demand backups available at
  any time. Independent of PITR — kept as belt-and-braces coverage per
  Railway's own recommendation.
- **Restore mechanism (verified safe):** both PITR and volume-backup
  restores can create a **new, standalone Postgres service**, leaving the
  live production database completely untouched — confirmed by actually
  performing one (see Restore drill below). Note: the *volume backup*
  restore path also offers a second, different option that swaps the
  current service's volume in place (a real in-production rollback, not a
  drill) — always use the "restore to new service" option for testing.
- **Region:** US East (Virginia, USA) — same as the primary database (see
  `jvpdocs/eu-data-residency.md`).

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

## Restore drill — performed 2026-08-22

| Date | Performed by | Source | Target | Result | Notes |
|---|---|---|---|---|---|
| 2026-08-22 | Jil Varghese | PITR restore, target `22 Aug 2026 10:35am` | New standalone Postgres service (`Postgres-restored-20260822-0505`) | **Pass** | Recovery time: under 1 minute — new service was queryable essentially instantly after clicking Restore. Row counts confirmed on the restored copy: `users`=7, `cost_models`=20, `audit_logs`=45. Production database was never touched (separate service, separate volume, no connections to the live `CostAdvisor`/`worker` services). Temporary service deleted after verification. |

This is a real, tested result — not the target/hoped-for policy above. Recovery
time objective for a full-database restore is effectively **sub-minute** on
Railway's PITR mechanism, which is materially better than the "estimate once
you've done it" placeholder this section used to carry.
