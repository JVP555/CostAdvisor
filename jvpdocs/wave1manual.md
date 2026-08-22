# CostAdvisor — Production Go-Live Runbook

*Last updated 2026-08-22.*

Everything code-buildable is done. `main-push` (built from the fully
caught-up `dev-push`, with the two Cloudflare Worker names already swapped
to production values) is ready and waiting to become `main`. This is the
literal, ordered sequence to actually go live — every step is either a
command to run or a dashboard click. **You're running Railway/Cloudflare
yourself through their own dashboards/CLI, not through this terminal** —
every step below is written for you to execute there.

Do the steps in order. Steps 1–4 can happen any time before step 5. Steps
6–8 must happen after step 5 (there's nothing to migrate/seed until the
production service exists and is running).

---

## Step 1 — Google Cloud Console: register the production OAuth redirect

1.1. Go to **console.cloud.google.com** → APIs & Services → Credentials →
     open your existing OAuth 2.0 Client ID (the one staging already uses —
     one client can hold multiple redirect URIs, no need for a second one
     unless you want to keep prod/staging fully separate).
1.2. Under **Authorized JavaScript origins**, add the **app** subdomain (not
     the bare domain — that's the landing page, see Step 4):
     ```
     https://app.costadvisor.org
     ```
1.3. Under **Authorized redirect URIs**, add:
     ```
     https://api.costadvisor.org/auth/callback
     ```
1.4. Go to **OAuth consent screen** → check **Publishing status**. If it
     says "Testing," only up to 100 explicitly-whitelisted test users can
     log in — click **Publish App** to move it to "In production." The
     scopes this app uses (`openid`, `email`, `profile`) are non-sensitive,
     so this normally does **not** trigger Google's manual verification
     review — but if Google flags it anyway, follow their on-screen prompts.
1.5. Save.

## Step 2 — Tailscale: generate a production auth key

`backend/entrypoint.sh` runs `tailscale up --auth-key=$TAILSCALE_AUTHKEY`
**unconditionally** before starting the API — the container will fail to
start at all without a valid key, even if you don't care about AI
narratives (`LLM_ENABLED=false`). This is a hard requirement, not optional.

2.1. Go to your Tailscale admin console → **Settings → Keys → Generate auth
     key**.
2.2. Make it **reusable** (Railway may recreate the container on redeploys)
     and **not ephemeral** (so the node doesn't drop off the tailnet
     between restarts).
2.3. Copy the key — you'll paste it as `TAILSCALE_AUTHKEY` in Step 3. This
     new production node joins the **same tailnet** staging already uses,
     so it reaches the same Hetzner Ollama VM — no separate AI server
     needed.

## Step 3 — Railway: set up the production environment

3.1. In the Railway dashboard, create a **production** environment on the
     CostAdvisor project (mirroring staging's shape: its own Postgres,
     Redis, backend service, and Celery worker) if it doesn't already
     exist.
3.2. Point the backend service's deploy source at the **`main`** branch.
3.3. Set these environment variables on the production **backend** service:

| Variable | Value / how to get it |
|---|---|
| `DATABASE_URL` | Auto-injected by Railway once you attach the production Postgres plugin |
| `REDIS_URL` | Auto-injected by Railway once you attach the production Redis plugin |
| `JWT_SECRET` | A new, random secret — **never reuse staging's**. Generate: `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From Step 1 |
| `GOOGLE_CALENDAR_ENCRYPTION_KEY` | Generate: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `APP_URL` | `https://app.costadvisor.org` — the app SPA's own subdomain, **not** the bare domain (that's the landing page, Step 4) |
| `API_URL` | `https://api.costadvisor.org` |
| `ENVIRONMENT` | `production` |
| `ALLOW_SIGNUP` | `true` — this is the invite-only *gate* toggle, not a public-signup toggle: with it `true`, a brand-new account can only complete signup if it has an accepted access request or a pending team invite (Scrum 13b). Setting it `false` would block every new account, invited or not. |
| `SUPPORT_EMAIL` | Your real support address |
| `TAILSCALE_AUTHKEY` | From Step 2 |
| `SENTRY_DSN` | Optional but recommended — create a Sentry project first, then paste its DSN. Code side is already wired (`app/main.py`); this is the only thing making it inert today. |
| `EIA_API_KEY` / `FRED_API_KEY` | Optional — only needed if you want those two commodity scrapers live from day one (both are free, register at their respective sites) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_TLS` / `EMAIL_FROM` | Your real production email provider's credentials (invites, welcome emails, demo confirmations, alerts all go through this) |
| `OLLAMA_URL` | The same Hetzner VM staging uses, addressed by its Tailscale hostname/IP, e.g. `http://<tailscale-hostname>:11434` |
| `OLLAMA_MODEL` | `llama3.1:8b` |
| `LLM_ENABLED` | `true` if you want live AI narrative generation from day one; `false` to disable it (there's no pre-warmed cache yet either way at launch, so `false` means narratives return `None` until you flip it on later) |

3.4. Don't deploy yet — nothing to deploy until Step 5 pushes real code to
     `main`. Just get the variables saved.

## Step 4 — Cloudflare: bind the production custom domains

The bare domain is the **landing page**, not the app — same split already
established for staging (`dev.costadvisor.org` = landing,
`app.dev.costadvisor.org` = the app). Getting the two workers' domain
bindings crossed is the single easiest mistake here and produces a
Cloudflare 522 ("connection timed out") on whichever domain is
misconfigured or unbound, not an obvious "wrong page" error.

4.1. Workers & Pages → the `costadvisor-landing` worker → **Settings →
     Domains & Routes (Custom Domains)** → add `costadvisor.org` (the bare
     apex domain).
4.2. Same worker → also add `www.costadvisor.org`. (A `www` CNAME pointed
     at the apex, proxied through Cloudflare, is a normal setup — you don't
     need a second identical binding if `www` is already a proxied CNAME to
     the apex; either approach works, just don't leave `www` bound to a
     *different* worker than the apex.)
4.3. Workers & Pages → the `costadvisor-web` worker (the app SPA) → same
     screen → add `app.costadvisor.org`. **Not** the bare domain — that's
     reserved for landing per 4.1.
4.4. Confirm DNS: `costadvisor.org`, `www.costadvisor.org`,
     `app.costadvisor.org`, and `api.costadvisor.org` all point at
     Cloudflare (orange-clouded). `api.costadvisor.org` should be a proxied
     CNAME/A record per Railway's own custom-domain instructions for the
     backend service.
4.4. Wait for SSL certificates to provision (usually automatic, a few
     minutes after the domain is added).

## Step 5 — Push the code: the actual go-live trigger

5.1. From your machine:
     ```bash
     git push origin main-push:main
     ```
5.2. This is the moment production actually changes — it triggers Railway
     rebuilding the backend from `main`, and Cloudflare Workers Builds
     rebuilding both `costadvisor-web` and `costadvisor-landing` from `main`.
5.3. Watch both dashboards until each shows a successful deploy before
     moving on.

## Step 6 — Database: migrate, then seed (in this exact order)

6.1. Apply every migration (safe on a completely empty database — it just
     runs the full history in order):
     ```bash
     railway run --environment production alembic upgrade head
     ```
6.2. Verify:
     ```bash
     railway run --environment production alembic current
     ```
     Expected: `ae1a2b3c4d5e (head)`.
6.3. Seed **platform reference data only** — regions, chemical families,
     the commodity index catalog, system scenarios. No personal accounts,
     no demo data:
     ```bash
     railway run --environment production python -c "from app import seed; seed.seed(); seed.seed_update()"
     ```
6.4. **Pre-provision your own account as the first super-admin.** This also
     solves a real chicken-and-egg problem: a genuine first Google login
     against a brand-new production database would otherwise be **blocked**
     by the invite-only signup gate (Scrum 13b) — there's no accepted
     access request or team invite yet for anyone, including you. Run:
     ```bash
     railway run --environment production python -c "
     import uuid
     from app.database import SessionLocal, bypass_rls_var
     from app.models.user import User
     bypass_rls_var.set(True)
     db = SessionLocal()
     db.add(User(id=uuid.uuid4(), google_id='pending-first-login',
                  email='jil@staminachem.com',
                  display_name='Jil Varghese Palliyan', is_super_admin=True))
     db.commit()
     db.close()
     print('done')
     "
     ```
     The account-linking logic already in `/auth/callback`
     (`backend/app/routers/auth.py`) matches this row by email on your
     first real Google login and binds the real `google_id` automatically
     — you land already signed in as super-admin, no separate post-login
     SQL step needed (this collapses the two-step process
     `jvpdocs/local-setup.md` documents for local dev into one pre-login
     step, since for a production launch you already know who the admin
     will be before they ever log in).
6.5. **Optional — the Wave 1 chemical formula catalog** (42 platform
     formula templates + their commodity indexes). Only run this *after*
     6.4 — it looks up the `jil@staminachem.com` row by email and hard-fails
     if it's missing:
     ```bash
     railway run --environment production python seed_shadow_library.py
     ```
6.6. **Optional — the fuller Wave 2 catalog** (367 formulas / 187 index
     feeds from the 2026-07 workbook). Run only if you want the complete
     catalog live at launch; otherwise defer to a follow-up pass once the
     platform is confirmed stable — nothing else depends on this being done
     immediately:
     ```bash
     railway run --environment production python seed_catalog.py
     railway run --environment production python seed_combos.py
     ```
6.7. **Deliberately do NOT run `seed_all.py` directly in production.**
     It also seeds 5 hardcoded dev/test personal accounts (including a
     student email address) and a fictional demo company's prices — neither
     belongs in a real production database. Steps 6.3–6.6 above are the
     production-safe equivalent of what `seed_all.py` does, run
     individually and stripped of the personal/demo pieces. If you later
     want demo data in a specific real team, use the in-app "Load example
     data" button (Scrum 16 — `POST /api/teams/{id}/load-example-data`)
     instead of a raw script; it's idempotent and scoped to one team.

## Step 7 — First login and verification

7.1. Go to `https://app.costadvisor.org`, sign in with the Google account for
     `jil@staminachem.com`.
7.2. Confirm you land signed in **and** already see the Admin tab — that
     proves the Step 6.4 pre-provisioning worked.
7.3. From Admin → Requests, invite your first real teammates (or approve
     their access requests). From this point on, everything is normal
     in-app operation — no more manual database steps for future users.

## Step 8 — Smoke-test the core loop

8.1. Run the full Wave 1 "win a negotiation" flow for real: create a
     product, build a cost model, load a should-cost, add an actual price,
     generate a brief. This is the fastest way to catch anything
     environment-specific (CORS, cookie flags, Tailscale/Ollama
     reachability) that unit tests can't see.
8.2. Check Admin → Audit Log for real login/logout events landing
     (`AuthEvent`, Scrum 10) and Admin → Auth Events if you want the raw
     feed.

---

## Step 9 — Post-launch hardening (doesn't block go-live, don't let it linger)

Draft documents referencing these already exist in `jvpdocs/`
(`security-posture.md`, `eu-data-residency.md`, `backup-retention-policy.md`,
`incident-response.md`, `vendor-risk.md`) — each has explicit
`[NEEDS CONFIRMATION]` / `[NEEDS ACTION]` placeholders that map to an item
below. Fill those in as each is done so the documents stop being drafts.

- [ ] **Confirm `SENTRY_DSN` is actually catching errors** — trigger a test
  exception in production and confirm it shows up in the Sentry dashboard
  (skip if you didn't set it in Step 3).
- [ ] **Set up uptime monitoring with alerting** against
  `api.costadvisor.org`, `app.costadvisor.org`, and `costadvisor.org`
  (Better Uptime, UptimeRobot, Pingdom, or Railway's own health-check
  alerting).
- [ ] **Enable GitHub branch protection on `main`** — **deliberately
  deferred**: only 3 people work on the private repo today, so the risk
  this guards against (an accidental unreviewed push straight to `main`)
  is low. Revisit once the team grows. When ready: require a PR + review
  before merge, disallow direct pushes. GitHub UI (Settings → Branches →
  Add rule) or `gh api repos/JVP555/CostAdvisor/branches/main/protection`
  — ask explicitly if you want this run via `gh` from here, since it's a
  change to shared repo policy.
- [x] **Confirm Railway Postgres connection-level TLS and encryption at
  rest** — done: private-network traffic is WireGuard-encrypted (Railway's
  own docs), the Postgres image is the TLS-enabled `postgres-ssl:18`
  variant, and Railway confirms disk-level encryption at rest by default.
  Recorded in `jvpdocs/security-posture.md` §2–3.
- [x] **Confirm the actual deployment region** — done: production Postgres
  is in **US East (Virginia, USA)**, confirmed via the Railway dashboard
  (Postgres → Settings → Scale → Regions & Replicas) — **not EU**. Recorded
  in `jvpdocs/eu-data-residency.md`, including what this means if an
  EU-based prospect requires data residency.
- [ ] **Confirm Railway's automated-backup configuration** (frequency,
  retention, point-in-time recovery availability) and record it in
  `jvpdocs/backup-retention-policy.md`.
- [ ] **Actually perform a restore drill** against the production backup
  and log the result in the table in `jvpdocs/backup-retention-policy.md`
  — a backup policy nobody has tested is a guess, not a policy.
- [ ] **Name real people** for the four roles in
  `jvpdocs/incident-response.md`'s role table.
- [ ] **Obtain and countersign DPAs** for every vendor in
  `jvpdocs/vendor-risk.md` (Railway, Cloudflare, Hetzner, Google, your real
  SMTP provider, Sentry once enabled) — a legal/business action.
- [ ] **Confirm Google Search Console shows the landing page indexed**, and
  **measure field Core Web Vitals** (LCP < 2.5s) once there's real traffic.
- [ ] **Formally verify the three landing-page proof-point stats**
  (McKinsey 13%, AlixPartners ~50%, Bain 8–12%) against their primary
  published sources before treating them as verified rather than
  "commonly cited, not yet source-checked."
- [ ] **Verify `SameSite=Strict` works** across `app.costadvisor.org` /
  `api.costadvisor.org` before flipping `ca_token`/`ca_refresh` cookies from
  `SameSite=None` — same-registrable-domain subdomains *should* support it,
  but this needs a real cross-subdomain login test in production before
  changing `backend/app/routers/auth.py`; a wrong guess breaks every login.
