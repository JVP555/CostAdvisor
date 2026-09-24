# Handover

**Snapshot date: 2026-09-24.** This is a point-in-time orientation doc for whoever picks this up next — it is not maintained going forward the way `CLAUDE.md` is. For the authoritative, continuously-updated status of every scrum, read `CLAUDE.md`'s TODO section (it is long, but it is the source of truth — this file is just a map to it).

## Read this first: the branch structure

- **`dev`** is the only branch with the complete picture — full code, `CLAUDE.md`, `AGENTS.md`, `jvpdocs/`, `sample_idea/`, `.claude/skills/`. Do all work here.
- **`dev-push`, `main-push`, `main`** are sanitized mirrors: a "strip internal docs" step removes `CLAUDE.md`/`AGENTS.md`/`.claude/skills/`/`jvpdocs/`/`sample_folder/`/`sample_idea/` before these branches are pushed, because they're the ones exposed to the Cloudflare Workers Builds pipeline (and, for `main`, is also production). **If you're handed one of these branches instead of `dev`, you will not see this file, `CLAUDE.md`, or any of the planning docs** — go get `dev`.
- To bring a push branch up to date with `dev`: merge `dev` in (expect modify/delete conflicts on exactly the stripped-file list — resolve every one by keeping the deletion), then re-run the strip as a safety net (`git rm -r --ignore-unmatch .claude 49.md AGENTS.md CLAUDE.md jvpdocs sample_folder sample_idea`) in case anything new was added. `main` additionally carries its own prod-specific infra (`frontend/wrangler.jsonc`'s Worker name, currently `costadvisor-web` — do not let a merge silently swap this to `dev`'s `-dev` variant, or a push to `main` will deploy to the wrong Cloudflare Worker).
- Push to `main`/`main-push` triggers a real Cloudflare/Railway redeploy. Confirm with whoever owns those before pushing casually.

## The one thing to internalize before touching deploy

**The actual Railway-connected repo is stale — confirm what's live before assuming a recent commit is deployed.** As of 2026-09-10 it was ~72 commits behind `dev`, frozen at the initial 2026-08-22 go-live merge. It has almost certainly drifted further since. Concretely: nothing from Scrum 26 onward (provider credentials, sheet round-trip, cost-model linking, negotiation position engine, quote extraction, supplier trust grading, cost-structure estimator, this session's 3 features) and **none of Wave 3's "Index Data Layer v2" (all 12 units)** is live. Someone with access to the real deploy repo/Railway/Cloudflare dashboards needs to manually sync it — this is not something fixable from a coding session alone.

## What shipped this session

1. **Provider Credentials frontend UI** (Scrum 26 was backend-only until now) — `ProviderCredentialsSection.jsx`, wired into Team → Settings, plus a new source-type option in `AddIndexModal.jsx`. No backend changes; the API was already built and tested.
2. **Negotiation Position UI + PDF export** (Scrum 30b was API-only until now) — a new panel in `FormulaDetailModal.jsx` (supplier price → target/ask/unexplained-remainder breakdown) with a print-isolation CSS utility so it can export cleanly from inside a modal that has no dedicated print route.
3. **3 new FRED-backed commodity scrapers** (`CU`→Copper, `CORN`→Corn, `LNG-JKM`→LNG Asia) — closes part of the FD-1 "catalog shows No data" gap. **Key finding, worth knowing**: the 2026-07 catalog drop renamed commodities to short type-codes (`CU`, `CORN`, …) that don't match the old `SCRAPER_REGISTRY` keys (`Copper`, `Urea`, …) at all — that mismatch, not a missing scraper, is why most catalog rows show "No data" despite scrapers existing. Only 3 of ~30+ affected commodities are fixed; see "What's next" below.

All three are on `dev` (and now `dev-push`/`main-push`/`main`), commit range `491a0d4..728b849`. Verified: frontend build clean; backend suite 658 passed / 20 failed (pre-existing, see below) / 7 skipped.

## Test environment gotchas discovered this session

If you set up a fresh local/CI Postgres for this repo, two things will silently break RLS-dependent tests:

1. **The DB role the app connects as must NOT be a superuser or have BYPASSRLS.** Postgres RLS policies are silently skipped for superusers and BYPASSRLS roles regardless of what the app sets — every RLS-isolation test will fail with "team B can see team A's data" even though the policy is correct. If you create your Postgres container with `POSTGRES_USER=costadvisor`, that user becomes the cluster's bootstrap superuser and can't even demote itself (`ALTER ROLE ... NOSUPERUSER` fails with "must be SUPERUSER"). Fix: create a second, ordinary role, grant it privileges on the schema, and point `DATABASE_URL`/`TEST_DATABASE_URL` at that role instead.
2. **Two Fernet encryption keys must be set** (`PROVIDER_CREDENTIAL_ENCRYPTION_KEY`, `GOOGLE_CALENDAR_ENCRYPTION_KEY`) or the provider-credentials and Google Calendar tests fail — generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.
3. If your sandbox only has Python 3.14 available: the pinned `pydantic-core`/`psycopg2-binary`/`sqlalchemy` versions in `requirements.txt` don't have prebuilt wheels for it and fail to build from source. Installing newer versions of just those three (`pydantic>=2.11`, `psycopg2-binary>=2.9.11`, `sqlalchemy>=2.0.54`+`alembic>=1.20`) unblocks it — **for local test-running only**, do not change the actual `requirements.txt` pins without separately validating the real deploy target's Python version.

The 20 remaining test failures after fixing the above (`test_catalog_retarget.py`, `test_onboarding.py`, `test_seed_catalog.py`, `test_seed_combos.py`) are **not code bugs** — they're tests that assume a specific pre-seeded DB state (the real catalog-drop workbook already loaded, plus a `jil@staminachem.com` or super-admin seed user existing) that a genuinely fresh database doesn't have. Confirmed zero overlap with any file touched this session.

## What's next — pick from here, don't guess

CLAUDE.md's "All-waves readiness scorecard" section (search for that heading) has every non-shipped item scored Ease+Value out of 10, with reasoning. As of this snapshot, the highest-value easy wins **not yet done**:

- **FD-1 remainder** (Ease 2, Value 5) — most of the ~30+ catalog commodities still have no scraper wired to their new short-code name. This session mapped 3 (Copper/Corn/LNG-Asia via FRED); the same pattern (verify a real series ID live against the source's API before committing to it — two attempts this session, World Bank Pink Sheet and Eurostat's Labour Cost Index, failed live verification and were correctly left out rather than guessed) can be repeated for the rest.
- **Per-region proxy layer** (Ease 3, Value 4) — Scrum 57's known limitation: 20 of 32 multi-region commodities lose per-region proxy fidelity because index metadata takes one representative feed. Needs a new `(commodity, region)` table + resolver change, clear precedent to follow.
- **Base-price anchors for 676 catalog combos** (Value 5, but Ease 1 — **this is a data-acquisition problem, not a coding one**). All the tooling (per-region editor, bulk CSV import) is built and waiting; nobody has the actual prices yet.
- **Scrum 27 (Lego formulas)** and **Scrum 32 (AI cost modeler)** are the two largest remaining unbuilt features — both scored lower on ease specifically because they're bigger, riskier lifts (core costing-engine recursion; a whole review/provenance state machine), not because they're low-value.

## What's blocked on something other than code

- **SMTP credentials** (`SMTP_HOST`/`USER`/`PASSWORD`/`EMAIL_FROM`) — deliberately deferred at the user's request; needs a real provider account (Gmail/SendGrid/Mailgun/SES) chosen first. Until set, invites/welcome/demo/alert emails all silently fail to send.
- **Incident response plan** and **vendor DPA list** — Scrum 11's two remaining 🔴 items, pure process/paperwork.
- **Google Search Console verification** and a **field Core Web Vitals measurement** — need real production traffic first.
- **SOC 2 branch protection on `main`** — deliberately deferred (only 3 people on the repo today); revisit once the team grows.

## Where to look for more

- `CLAUDE.md` — the full TODO tracker (every scrum, what shipped, what's flagged, the readiness scorecard) and the architecture/security conventions. Read this before starting anything.
- `jvpdocs/wave1manual.md` — the complete non-code checklist for Wave 1 (dashboard clicks, real accounts, the restore drill, legal agreements).
- `jvpdocs/security-posture.md`, `eu-data-residency.md`, `backup-retention-policy.md`, `incident-response.md`, `vendor-risk.md` — draft security docs with `[NEEDS CONFIRMATION]`/`[NEEDS ACTION]` placeholders where a real signature or dashboard check is the only thing missing.
- `sample_idea/` — the raw source material (ticket prompts, data drops, workbooks) most Wave 2/3 scrums were built against. Kept for provenance; large and one-off, not something to browse casually.
