# Scrum 11 — SOC 2 Groundwork

**Status:** 🔴 Not started

## Goal
Lay the technical and process foundation required to begin a SOC 2 Type I audit. This is not the audit itself — it is putting the controls in place so the audit is passable.

## SOC 2 Trust Service Criteria Relevant to CostAdvisor
- **Security (CC)** — access controls, encryption, monitoring
- **Availability (A)** — uptime, incident response
- **Processing Integrity (PI)** — correct, complete, timely processing
- **Confidentiality (C)** — protection of confidential customer data

## Work Items

### Access Controls (CC6)
- [ ] Enforce MFA on all internal tooling accounts (Railway, Cloudflare, GitHub, Google Workspace)
- [ ] Principle of least privilege: review Railway access, GitHub repo access — only need-to-know
- [ ] Document user provisioning / deprovisioning process
- [ ] Super-admin accounts require justification and are logged (ties to Scrum 8)

### Encryption (CC6.7)
- [ ] TLS in transit — all services (ties to Scrum 10)
- [ ] Encryption at rest — Railway Postgres (ties to Scrum 10)
- [ ] Document key management (JWT secret rotation schedule)

### Logging & Monitoring (CC7)
- [ ] Enable Sentry (`sentry_dsn` config already exists — wire it up in production)
- [ ] Set up uptime monitoring (e.g., Better Uptime or Railway health checks on `/health`)
- [ ] Ensure `AuditLog` captures all security-relevant events (ties to Scrum 10)
- [ ] Define alerting: who gets paged for 5xx spikes, auth failures, scraper failures

### Change Management (CC8)
- [ ] Enforce branch protection on `main`: require PR + review before merge
- [ ] No direct commits to `main`
- [ ] Document deployment process (push to `dev` → test → merge to `main`)

### Incident Response
- [ ] Write a one-page incident response plan: detect → contain → notify → remediate → post-mortem
- [ ] Define breach notification timeline (72 h for GDPR)

### Vendor Risk
- [ ] Document third-party processors: Railway (hosting), Cloudflare (CDN), Hetzner (Ollama), Google (OAuth), Backblaze (backups once implemented)
- [ ] Confirm each has a DPA (Data Processing Agreement)

### Processing Integrity (PI1)
- [ ] Costing engine outputs must be deterministic — add regression tests for known input → output pairs
- [ ] Error handling: no silent failures in `costing_engine.py` calculation paths; raise with context

## Key Files
| File | Change |
|------|--------|
| `backend/app/observability.py` | Ensure Sentry wired correctly for production |
| `backend/tests/` | Add costing engine determinism regression tests |
| `backend/app/services/costing_engine.py` | Harden error paths |
| `jvpdocs/incident-response.md` | New — incident response plan |
| `jvpdocs/vendor-risk.md` | New — third-party processor list |

## Acceptance Criteria
- [ ] Sentry capturing errors in production
- [ ] Uptime monitoring with alerting configured
- [ ] Branch protection on `main` enforced
- [ ] Costing engine has determinism regression tests
- [ ] Incident response plan written
- [ ] Vendor DPA list complete
- [ ] All items from Scrum 10 security story completed (prerequisite)
