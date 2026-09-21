# Scrum 10 — Data Security Story for Buyer IT

**Status:** 🔴 Not started

## Goal
Produce a complete, defensible data-security posture that passes corporate enterprise IT review: TLS everywhere, encryption at rest, tenant isolation proof, audit trail, secrets management, EU data residency, and a documented backup/retention policy.

## What Already Exists
- PostgreSQL RLS policies in `alembic/versions/h8i9j0k1l2m3_enable_rls.py`
- `AuditLog` model capturing create/update/delete events
- Secrets via Railway env vars + local `.env` (gitignored)
- Cloudflare enforces HTTPS on the frontend
- Railway enforces HTTPS on the backend API

## Work Items

### TLS / Encryption in Transit
- Verify all Railway internal service-to-service calls (API → Postgres, API → Redis) use TLS — confirm in Railway config
- Document that Ollama is Tailscale-only (already true — just needs to be in the security doc)

### Encryption at Rest
- Confirm Railway Postgres has encryption at rest enabled — document the provider statement
- If not enabled, raise with Railway or migrate to a provider that offers it (e.g., Supabase, Neon)

### Tenant Isolation Evidence
- Write a one-page RLS policy summary: which tables, what the policy checks, how `app.current_user_id` is set per request
- Add a test in `backend/tests/test_rls.py` that proves cross-tenant data is invisible (already partially exists — ensure it covers all tenant-scoped tables)

### Audit Trail
- Ensure all mutations in all routers call `services/audit.py` — audit coverage gap check
- Add `AuditLog` entries for: login, logout, failed login, token refresh, admin impersonation start/stop, cost model export

### Secrets Management
- Document the secret rotation procedure (JWT secret, Google OAuth credentials, API keys)
- Ensure no secrets appear in Railway build logs or environment variable dumps

### EU Data Residency
- Confirm Railway region is EU (currently check: Railway `us-west2` vs EU region) — if not EU, document a plan to migrate or confirm customer data processing agreement
- Cloudflare Workers run at the edge — confirm no US-only data processing for EU customers

### Backup & Retention Policy
- Define and document: backup frequency, retention window, restore procedure, and data deletion (GDPR right-to-erasure)
- Railway Postgres: confirm automated backups are enabled + retention period
- Document that `User.deleted_at` soft-delete exists; add a hard-delete path for GDPR erasure requests

## Deliverable
A `jvpdocs/security-posture.md` document (or customer-facing PDF) that can be handed to an enterprise IT/security team covering all the above points with evidence.

## Key Files
| File | Change |
|------|--------|
| `backend/tests/test_rls.py` | Extend to cover all tenant tables |
| `backend/app/routers/*.py` | Audit coverage gap fill |
| `backend/app/services/audit.py` | Add missing event types |
| `jvpdocs/security-posture.md` | New — customer-facing security doc |

## Acceptance Criteria
- [ ] RLS test covers every tenant-scoped table
- [ ] Audit log covers login, logout, failed login, export, impersonation
- [ ] Written confirmation of TLS in transit and encryption at rest
- [ ] EU data residency confirmed or migration plan documented
- [ ] Backup/retention policy written and tested (restore drill)
- [ ] Security posture document ready to share with enterprise IT
