# Wave 1 — Remaining Manual Steps

*Last updated 2026-08-22.*

Everything code-buildable in Wave 1 is done (branch `dev-wave1`: Scrums 9,
10-code-slice, 11-code-slice, 16, 17 all shipped and tested). What's left is
genuinely non-code — dashboard clicks, real accounts, legal agreements, and
things that can only be verified against a live deployed environment. This
is the complete checklist. Nothing below is blocked on missing code.

Draft documents referencing several of these items already exist in
`jvpdocs/` (`security-posture.md`, `eu-data-residency.md`,
`backup-retention-policy.md`, `incident-response.md`, `vendor-risk.md`) —
each has one or more `[NEEDS CONFIRMATION]` / `[NEEDS ACTION]` placeholders
that map directly to an item below. Fill those in as each step is done so
the documents stop being drafts.

---

## Scrum 9 — OAuth hardening

- [ ] **Verify `SameSite=Strict` works across the deployed subdomain split**
  before flipping `ca_token`/`ca_refresh` cookies from `SameSite=None` to
  `SameSite=Strict` in production. `app.dev.costadvisor.org` and
  `api-dev.costadvisor.org` share the registrable domain `costadvisor.org`,
  so `Strict` *should* work for XHR between them — but this was deliberately
  left unflipped because a wrong guess would silently break every login in
  prod, and it can't be verified without a real cross-subdomain request in a
  deployed environment.
  **How to test:** deploy to staging, flip `samesite="none" if is_prod else
  "lax"` → `samesite="strict" if is_prod else "lax"` in
  `backend/app/routers/auth.py` (both cookie-setting call sites: `/callback`
  and `/auth/refresh`) on a throwaway branch, log in against
  `dev.costadvisor.org`, and confirm the session persists across a page
  reload and an XHR call to the API subdomain. If it works, merge the flip
  into `main`/`dev`; if not, this stays `None` and that's the documented
  reason why.

## Scrum 10 — Data-security story

- [ ] **Confirm Railway Postgres connection-level TLS** (private-network
  encryption for API → Postgres/Redis) and record the exact statement in
  `jvpdocs/security-posture.md` §2. Check the Railway project's networking
  docs/dashboard for what "private network" actually guarantees.
- [ ] **Confirm Railway Postgres encryption-at-rest** — get Railway's
  provider statement (dashboard, docs, or support) and record it in
  `jvpdocs/security-posture.md` §3.
- [ ] **Confirm the actual deployment region** for the production (`main`)
  and staging (`dev`) Railway projects, and for the Cloudflare Workers
  config. Record it in `jvpdocs/eu-data-residency.md`. If it's not already
  EU, that document's migration-plan template needs to be filled in with
  real numbers (dump size, expected downtime) instead of left as a
  template.
- [ ] **Confirm Railway's automated-backup configuration** (frequency,
  retention window, whether point-in-time recovery is available on the
  current plan) and record it in `jvpdocs/backup-retention-policy.md`. If
  the current plan tier doesn't include daily backups with a real retention
  window, decide whether to upgrade the plan or add a supplementary
  `pg_dump` cron to off-platform storage.
- [ ] **Actually perform a restore drill** and log the result in the table
  in `jvpdocs/backup-retention-policy.md`: restore the latest snapshot into
  a fresh isolated database, verify row counts on a few key tables, time
  the whole thing. This is the one item on this list that's a real
  "prove it," not just paperwork — a backup policy nobody has tested is a
  guess, not a policy.
- [ ] **(Lower priority, no current trigger)** If a real GDPR erasure
  request ever arrives, either run the manual SQL script described in
  `jvpdocs/backup-retention-policy.md` or build the proper
  `POST /api/admin/users/{id}/erase` endpoint described there first — don't
  build it speculatively ahead of an actual request.

## Scrum 11 — SOC 2 groundwork

- [ ] **Create a real Sentry account + project**, then set `SENTRY_DSN` in
  Railway's env vars for both `main` and `dev`. The code path is already
  live (`app/main.py` conditionally applies `SentryAsgiMiddleware`) — it's
  inert until this one env var is set. Verify by triggering a test
  exception in staging and confirming it shows up in the Sentry dashboard.
- [ ] **Set up uptime monitoring with alerting** against
  `api.costadvisor.org` (or a dedicated `/health` route if one exists) and
  `costadvisor.org` — any of Better Uptime, UptimeRobot, Pingdom, or
  Railway's own health-check alerting. Point alerts at whichever channel
  the team actually watches (email/Slack/PagerDuty).
- [ ] **Enable GitHub branch protection on `main`**: require a PR + at least
  one review before merge, disallow direct pushes. This can be done via the
  GitHub UI (Settings → Branches → Add rule) or `gh api
  repos/JVP555/CostAdvisor/branches/main/protection` — ask explicitly if you
  want this run via `gh` from here, since it's a change to shared repo
  policy and not something to do silently.
- [ ] **Name real people** for the four roles in
  `jvpdocs/incident-response.md`'s role table (incident commander,
  engineering lead, customer communication, compliance/legal) — the plan
  isn't operationally usable with `_TBD_` in it.
- [ ] **Obtain and countersign DPAs** for every vendor in
  `jvpdocs/vendor-risk.md`: Railway, Cloudflare, Hetzner, Google, the actual
  SMTP provider in production (check what `smtp_host` is actually set to —
  it isn't fixed in code), and Sentry once it's enabled. This is a
  legal/business action, not something resolvable from the codebase.
- [ ] **Confirm which SMTP provider is actually configured in production**
  (`smtp_host`/`smtp_user` in the deployed env vars) and update the vendor
  row in `jvpdocs/vendor-risk.md` with the real provider name.

## Scrum 12 — Landing page

- [ ] **Deploy the landing page live** at `www.costadvisor.org` — the
  Cloudflare dashboard custom-domain wiring step. Code side (the
  self-contained `landing/index.html`, `wrangler.jsonc`, staging config for
  `dev.costadvisor.org`) is done; this is the production cutover the user
  has deliberately deferred.
- [ ] **Confirm Google Search Console shows the page indexed** — requires
  the page to be live first (previous item), then a Search Console
  verification + a wait for Google to crawl it.
- [ ] **Measure field Core Web Vitals** (LCP < 2.5s target) using real user
  data (Search Console's Core Web Vitals report, or CrUX) — can only be
  measured once the page has real traffic post-deploy.
- [ ] **Formally verify the three proof-point stats** now on the landing
  page (McKinsey 13%, AlixPartners ~50%, Bain 8–12%) against their primary
  published sources before treating them as verified marketing claims
  rather than "commonly cited, not yet source-checked" figures. `CLAUDE.md`
  has carried a "verify before using" flag on these since the roadmap was
  written; adding the Bain stat to the page (done this pass) doesn't
  discharge that flag — it's still a research/citation-hunting task, not a
  code one.

---

## Suggested order

If picking these up in one sitting: Sentry DSN (5 minutes, unlocks real
error visibility for everything else) → Railway region/TLS/encryption/backup
confirmations (a few dashboard checks, unlocks finishing the three draft
docs) → restore drill (the one that actually takes real effort) → uptime
monitoring → branch protection → DPAs/vendor confirmation (slowest, depends
on external parties) → landing page production cutover (whenever the user
is ready to go live) → SameSite=Strict verification (only relevant once
there's a staging environment to test against) → stat verification
(lowest urgency, marketing polish).
