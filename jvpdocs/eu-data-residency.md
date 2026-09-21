# CostAdvisor — EU Data Residency

*Last updated 2026-08-22.*

## Current state — confirmed: production is US-hosted, not EU

CostAdvisor's infrastructure is hosted on Railway (API + PostgreSQL + Redis)
and Cloudflare (frontend, edge). Confirmed directly from the Railway
dashboard (Postgres service → Settings → Scale → Regions & Replicas):
**production runs in US East (Virginia, USA)**. Staging's region has not
been separately checked yet, but there's no reason to expect it differs.

This means: as of today, CostAdvisor does **not** offer EU data residency.
If an EU-headquartered prospect requires it under GDPR, the migration plan
below is what would need to actually happen — this isn't a formality to
tick off, it's a real infrastructure decision that hasn't been made yet.

## What's true regardless of region

- Production and staging are **fully separate databases with separate
  secrets** — no cross-environment data flow (`CLAUDE.md` deployment table).
- Every tenant table is isolated by PostgreSQL Row-Level Security
  (`jvpdocs/security-posture.md` §4) — region doesn't change the tenant
  isolation guarantee, only where the underlying bytes physically sit.
- Cloudflare serves the frontend at the edge globally; for an EU customer,
  static asset delivery is already low-latency from a nearby Cloudflare PoP
  regardless of where the origin API/database sit. Data-residency concerns
  are about the **database and application backend**, not the CDN edge.
- The one component that must never be EU-only-exposed the *other* direction
  — Ollama (AI narrative generation) — sits on a private Hetzner VM reachable
  only over Tailscale; Hetzner has EU (Germany/Finland) data centers, so this
  component's residency should be checked against whichever Hetzner project
  currently hosts it.

## Migration plan (production is confirmed non-EU — US East, Virginia)

Not yet started — only needed if/when an EU-based prospect requires it:

1. **Target region:** Railway EU-West (Amsterdam).
2. **Cutover approach:** stand up a new EU-region Postgres instance,
   `pg_dump`/`pg_restore` (or Railway's built-in migration tooling) the
   production database across, cut the API's `DATABASE_URL` over during a
   maintenance window, verify row counts match, then decommission the old
   instance.
3. **Expected downtime:** estimate once the dump size is known (a `pg_dump`
   + `pg_restore` round trip; expect low double-digit minutes for the current
   data volume, to be re-estimated closer to the actual migration).
4. **Customer communication:** notify affected customers of the maintenance
   window in advance per the standard support channel.
5. **Rollback plan:** keep the old-region instance read-only and available
   for N days post-cutover in case a rollback is needed.

## Data Processing Agreement (DPA) implications

If a customer's own compliance requirements mandate EU-only processing
(common under GDPR for EU-headquartered buyers), this document — once the
region is confirmed — is the artifact to attach to that customer's DPA
review. See `jvpdocs/vendor-risk.md` for the underlying sub-processor list
(Railway, Cloudflare, Hetzner, Google) that any EU customer's DPA will also
need to reference.
