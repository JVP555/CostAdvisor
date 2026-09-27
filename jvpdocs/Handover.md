# Handover — how CostAdvisor actually works

**Snapshot: 2026-09-27 (updated end of day).** Written so somebody who has never seen this repo can be productive in a day.

`CLAUDE.md` is the authoritative, continuously-updated tracker — every scrum, what shipped, what is flagged. It
is long and it is history. **This file is the mental model**: what the system is, how the pieces fit, and the
handful of non-obvious rules that will cost you a day each if you learn them by breaking something.

**Reading order for a new engineer:** this file → `jvpdocs/local-setup.md` (get it running) →
`jvpdocs/remaining-work-plan.md` (what is left and in what order) → `CLAUDE.md` (only when you need the history
of a specific scrum). `DESIGN.md` before touching any UI.

---

## 1. Read this before you touch deploy

**The Railway-connected repo is not this repo, and it is stale.** As of 2026-09-10 it was ~72 commits behind
and frozen at the 2026-08-22 go-live merge; it has drifted further since. Nothing from Scrum 26 onward, and
**none of the 12 "Index Data Layer v2" units**, is live. Do not verify anything infra-related against the live
domains and conclude the code is broken — check whether that code is even deployed first. Syncing it needs
someone with access to the deploy repo and the Railway/Cloudflare dashboards.

### Branches

- **`dev`** — the only branch with the whole picture: code plus `CLAUDE.md`, `AGENTS.md`, `jvpdocs/`,
  `sample_idea/`, `.claude/skills/`. **Do all work here.**
- **`dev-push`, `main-push`, `main`** — sanitised mirrors. A strip step removes the internal docs before push,
  because these are exposed to the Cloudflare Workers Builds pipeline (and `main` is production). If you were
  handed one of these, you cannot see this file — go get `dev`.
- To update a push branch: merge `dev`, resolve every modify/delete conflict by **keeping the deletion**, then
  re-run the strip as a safety net:
  `git rm -r --ignore-unmatch .claude 49.md AGENTS.md CLAUDE.md jvpdocs sample_folder sample_idea`.
  `main` additionally carries its own prod infra — `frontend/wrangler.jsonc`'s Worker name is `costadvisor-web`;
  do not let a merge swap it to `dev`'s `-dev` variant or a push deploys to the wrong Worker.
- Pushing to `main`/`main-push` triggers a real redeploy. Confirm with whoever owns those first.

### Environments

| | Production | Staging |
|---|---|---|
| Landing | costadvisor.org | dev.costadvisor.org |
| App | app.costadvisor.org | app.dev.costadvisor.org |
| API | api.costadvisor.org | api-dev.costadvisor.org |
| Branch | `main` | `dev` |

Frontend: Cloudflare Workers serving the compiled SPA. Backend: FastAPI on Railway. Postgres + Redis + Celery on
Railway, separate per environment. Ollama on a private Hetzner VM, reachable only over Tailscale.

---

## 2. What the product does

A supplier knows their real input costs; the buyer does not. So when the supplier says "oil went up 30%, we need
+20%", the buyer has nothing to push back with. CostAdvisor closes that gap in four steps:

1. **Decompose** a product into cost components, each weighted by its share.
2. **Link** each component to a tracked commodity index, by region and quarter.
3. **Calculate** what the product *should* cost now, given how those indices actually moved.
4. **Compare** against what the supplier is charging. The difference is the negotiation signal.

Everything else in the codebase — the index layer, the catalog, the trust grading, the briefs — exists to make
step 3 defensible enough to put in front of a supplier.

---

## 3. The five things to understand before changing code

### 3.1 There are two costing paths, and one resolver they share

This trips up everyone. The repo prices things two different ways, with two different margin conventions.

**Path A — `CostModel`** (a team's own product, priced against their own formula).
`CostModel → FormulaVersion → FormulaComponent`. Margin is a **separate field**: the engine strips it out to get
a component base, computes indexed cost, then re-applies it (`_component_base` / `_apply_margin`).

**Path B — catalog combo** (a platform `FormulaTemplate` priced in one region).
`FormulaTemplate → FormulaTemplateComponent` + `FormulaRegionCoverage` (one row per template × region × variant,
carrying the base price and period). Margin is **a line inside the recipe**, so weights legitimately sum to
99.9–110 and `evaluate_weighted_template` rebases over the recipe's own weight sum. The level is exactly 100.0
at the base period by construction.

**Mixing the two conventions produces a number wrong by the margin.** `coverage.margin_pct` is descriptive —
applying it on top would double-count.

The bridge between them is `services/formula_resolver.get_effective_lines(db, fv, cost_model)`, which returns
`(EffectiveLine[], fallback_reason)`. A `FormulaVersion` may carry `source_coverage_id` + `link_mode`:

- `link_mode = NULL` (unlinked) or `'pinned'` → build from the frozen `FormulaComponent` snapshot.
- `link_mode = 'tracking'` → resolve the linked catalog recipe **live**, at the cost model's current region.

**All six costing entry points route through it** — `_compute_indexed_cost`, `_compute_indexed_cost_detailed`,
`calculate_evolution`, `calculate_brief`, `calculate_price_change`, `_compute_indexed_cost_forward`. That is why
should-cost, breakdown, Evolution, Brief, Price-Change and the forward should-cost cannot disagree for the same
formula version. **If you add a seventh consumer, route it through `get_effective_lines` too.**

### 3.2 The index resolution chain, in order

`data_resolver.get_single_index_value_detailed(commodity_id, region, year, quarter, team_id)` is where a number
comes from. The order matters and each tier has a reason:

1. **composite** — an index computed live from other indices via an expression (cycle-guarded). A missing
   component yields `None`; it never fabricates a 0.
2. **fixed** — a team's `TeamIndexSource` with a constant value across all periods.
3. **team_override / provider** — `IndexOverride`, exact region then GLOBAL. **A null override is a deliberate
   blank**, not a miss: it returns `None` rather than falling through to the scraped value.
4. **scraped_region** — `IndexValue` at that exact region.
5. **scraped_global** — the GLOBAL sentinel row.
6. **scraped_any_region** — any region with data for that commodity and period.
7. **monthly_actual / monthly_partial_quarter** — the quarter mean of `IndexMonthlyValue` **actual** rows.
   Forecast rows are never used here; one reaching a historical should-cost would be fabrication. A quarter with
   fewer than three months is labelled partial rather than passed off as complete.
8. **scraped_temporal_carry_forward** — the last observation before this period, carried forward. This tier
   exists so a future reference quarter does not flatten every ratio to 1.0.
9. **monthly_carry_forward** — same, from the monthly store.

Tier 7 matters more than it looks: 76 of the 98 commodities the catalog's cost lines reference are
**monthly-only**, so before that tier existed three quarters of the catalog resolved to nothing and rode flat.

A component with no value **rides flat and produces an explicit `data_gaps` entry**. It never silently becomes
zero, and it is never silently omitted.

### 3.3 The index data model has three layers

The 2026-07 drop added a layer above the original one. Both are live.

- **`TypeCode`** — the label a cost line names (`ELEC-EU`, `BRENT`). Resolves to a series, or explicitly does
  not: `resolved` / `no_series` / `ambiguous` are three distinct states with three different remedies (run a
  scrape / buy a feed / decide what the code means). Never collapse them.
- **`CommodityIndex`** — the price series. Drop-loaded rows are identified by `commodity_key IS NOT NULL`.
  **Region is baked into the series key** (`ammonia-eu` vs `ammonia-in`), which is why they were not name-matched
  onto the older region-agnostic rows.
- **`IndexCard`** (display) + **`IndexMonthlyValue`** (the numbers). **Monthly is the source of truth; quarterly
  derives from it** — verified exactly derivable, 0.0000 max difference across all 1,516 quarterly rows.

Two traps: `-ppi` / `-wb` / `-mb` suffixes name a **source**, not a region — do not parse them. And
`is_default_region` is deliberately **not unique**; 18 slugs ship several defaults, so the obvious constraint
rejects the real data.

One number worth carrying in your head: **60 type codes resolve to `brent`, carrying ~25% of all indexed cost
weight.** A breakdown that looks diversified can be one commodity reached through dozens of labels. That is what
`/api/resolution` exists to show.

### 3.4 Tenancy is enforced at the database

Every tenant-facing table has a Postgres RLS policy (`tenant_isolation`). The active team is set per request in
`app/database.py`. **Never write a query that bypasses it.** `bypass_rls_var` exists for Celery tasks, seed
scripts and migrations only — and when you do set it, reset it in a `finally`.

Three tenancy shapes exist, and picking the wrong one is the most common serious bug here:

- **Strict tenant** — `team_id NOT NULL`, membership-scoped. Most things.
- **Platform-readable with team forks** — `team_id IS NULL` visible to all, team rows scoped. Used for
  `formula_templates`, `chemical_families`, `subfamilies`, editorial blocks, dimension terms, market signals.
  Under strict tenant the platform catalog would be invisible to everyone and look like a loader failure.
- **Platform-level, no RLS** — `commodity_indexes`, `producers`, calibration and projection runs. No `team_id`
  at all.

**Two real leaks were caught this way and both had the same cause:** a platform-scoped row has no team to
CASCADE from, so it survives a test's tenant teardown and becomes live data in the next test's run. If you add
a platform-scoped table, clean it up explicitly in tests.

### 3.5 Permissions: the plan ceiling runs *before* roles

`services/permissions.has_permission` evaluates in this order:

1. super-admin bypass
2. **plan ceiling** — a key absent from the team's plan is denied for everyone, whatever role they hold
3. custom team roles (`Role` → `TeamMemberRole`)
4. membership-role fallback (`owner` / `admin` / `member`), **only if no custom role is assigned**

Consequences that have bitten this codebase already:

- **A new permission key must be granted to the Dream Plan** or the team owner is locked out of the feature you
  just shipped. The ceiling runs first.
- **A member with any custom role skips the fallback entirely**, so role grants are not optional extras.
- The fallback used to grant every `*.view` key by splitting on the last dot, which silently opened each new
  sensitive category as it was added. It now checks the category against `MEMBER_READABLE_CATEGORIES` — an
  **opt-in** list, so a new category is closed by default.

Platform-wide permissions are a separate axis: `has_platform_permission` + `UserPlatformRole` (Chemist,
FX Manager, Content Editor, Support Agent). "May you write the library everybody reads" is a different question
from "may you write your own copy".

---

## 4. Repo map

### Backend — `backend/app/`

FastAPI at `main.py`. 41 routers, all prefixed `/api/` except auth (`/auth/`). 69 Alembic migrations.

The services worth knowing by name:

| File | What it owns |
|---|---|
| `costing_engine.py` | should-cost, evolution, brief, squeeze, price-change, forward should-cost. The most complex file in the repo. |
| `formula_resolver.py` | `get_effective_lines`, `flatten_components`, `evaluate_weighted_template`, coverage fallback. The bridge between the two costing paths. |
| `data_resolver.py` | the 9-tier resolution chain above, plus composites and forward values. |
| `permissions.py` | `has_permission`, `has_platform_permission`, the category opt-in list. |
| `resolution.py` / `proxy_derivation.py` | type-code resolution, concentration queries, proxy execution, the swap backlog. |
| `intelligence.py` | combo-grain derivation: level series, cycle position, seasonality blend, volatility percentile. Bounded query budget — 1 query regardless of window length. |
| `trigger_radar.py` | negotiation windows from five feeds; contract notice deadlines. |
| `trust.py` / `supplier_trust.py` | the combo trust grade, and supplier grading resolved through the producer master. |
| `narrative.py` / `ollama.py` | LLM narrative. Best-effort, Tailscale-only, `llm_enabled=False` in production. |
| `incoterm_normalizer.py` / `fx_converter.py` / `unit_converter.py` | the comparability pipeline. Any pricing logic must account for all three. |
| `drop/` | the 2026-07 data-drop reader, normalisation, authority rules, loaders. |
| `sheet_roundtrip/` | export → edit offline → reimport → diff → apply. Payload-agnostic; two registered payloads. |

**Data model spine.** `CostModel → FormulaVersion → FormulaComponent` is the team's formula.
`ChemicalFamily → Subfamily → Product/FormulaTemplate` is the catalog taxonomy.
`FormulaTemplate → FormulaTemplateComponent` + `FormulaRegionCoverage` is the catalog recipe.
`AuditLog` records every mutation and is **append-only**.

### Frontend — `frontend/src/`

React 18 + React Router 6 SPA. Auth in `AuthContext.jsx` (Google OAuth + JWT in HttpOnly cookies). All HTTP goes
through `api.js`. Charts are hand-written SVG components, not a chart library.

Navigation is an 8-tab journey shell: **Dashboard → Indexes → Portfolio → Monitor → Forecast → Negotiate →
Intelligence → Team** (+ Admin for super-admins). Everything else lives in the account menu under "Go to".

Conventions, non-negotiable because the whole app follows them:

- `.ca-*` utility classes from `styles.css` plus inline styles. No CSS-in-JS, no Tailwind.
- **Every colour is a CSS variable.** Four themes switch by `data-theme`; a hardcoded hex breaks three of them.
  Several bugs of exactly this kind have been fixed — including `.ca-table th.right` being used 19 times and
  never defined, and `--danger` being referenced and never defined.
- New files go in `pages/` (full-page views), `components/` (reusable), `utils/` (pure helpers). No new
  top-level directories.
- `formatApiError(e)` for every error path. Raw API errors must not reach the UI.
- Read `DESIGN.md` first. The rules that catch people out: flat cards at rest (no shadow), no coloured
  border-stripes wider than 1px, mono for every number, the 7 commodity category colours are a **data
  vocabulary** and never UI chrome.

---

## 5. Running it

Full instructions in `jvpdocs/local-setup.md`. Prerequisites: Postgres and Redis running locally.

```bash
./start.sh                                  # backend :8000 + frontend :5173
cd backend && pytest                        # full suite
cd backend && alembic upgrade head          # migrations
cd frontend && npm run build                # must be clean before you commit
```

### Test-environment gotchas that silently break RLS

1. **The DB role the app connects as must not be a superuser or have BYPASSRLS.** Postgres silently skips RLS
   for those roles, so every isolation test fails with "team B can see team A's data" while the policy is
   perfectly correct. If your container was created with `POSTGRES_USER=costadvisor`, that user is the cluster
   bootstrap superuser and **cannot demote itself**. Create a second ordinary role, grant it schema privileges,
   and point `DATABASE_URL` / `TEST_DATABASE_URL` at that.
2. **Two Fernet keys must be set** or the provider-credential and Google Calendar tests fail:
   `PROVIDER_CREDENTIAL_ENCRYPTION_KEY`, `GOOGLE_CALENDAR_ENCRYPTION_KEY`. Generate with
   `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.
3. **Python 3.14**: the pinned `pydantic-core` / `psycopg2-binary` / `sqlalchemy` versions have no wheels for it.
   Install newer versions of just those three locally — **do not change `requirements.txt`** without validating
   the real deploy target's Python version.

Against a properly seeded database the suite is green (675 passed / 5 skipped at last full run; the skips are
drop-dependent tests that skip cleanly without the data drop). Against a genuinely fresh database expect ~20
failures in `test_catalog_retarget` / `test_onboarding` / `test_seed_catalog` / `test_seed_combos` — those
assume a pre-seeded DB state (the catalog workbook loaded, a super-admin seed user existing), not code bugs.

---

## 6. Conventions that will bite you

Learned the hard way, each one from a real bug in this repo.

- **Never delete on silence.** A data drop is authoritative for what it covers and silent about the rest. Rows
  it does not mention are reported **stale**, never removed. Every loader is idempotent by comparison, never
  truncate-and-reload.
- **`dry_run` is the caller rolling back**, not a flag threaded through the loader. One code path, so a dry run
  genuinely rehearses the real one.
- **Absent is not the same as empty.** A blank column in a source means "not stated" — write nothing. An early
  loader version treated it as "" and wiped two hand-set base prices.
- **Postgres treats every NULL as distinct in a unique constraint.** This has defeated upsert-in-place twice.
  If a nullable column is part of an upsert key, make it `NOT NULL DEFAULT ''` or fold it with `COALESCE` in a
  partial index.
- **A skipped check must never read as a clean one.** A validation check that finds nothing reports zero; it is
  not simply absent.
- **Never fabricate a number.** This is the product's whole value. A missing value rides flat with an explicit
  gap; a forecast is labelled a forecast with its method and vintage; a proxy is marked as a proxy. A fabricated
  "supplier's likely counter" was deleted for this reason (commit `03e0856`), and a hardcoded ±1.5% forecast
  band was removed twice.
- **Mutations are audited.** New write paths follow the `log_event` pattern. `audit_logs.team_id` is nullable —
  NULL means a platform-level event with no tenant, and the RLS policy keeps those invisible to tenants.
- **Alembic for every schema change.** Never modify tables by hand. Verify the downgrade too — every migration
  here has been up/down/up cycled.
- **Pydantic schemas in `app/schemas/` are the API contract.** Keep them in sync with the ORM models.

---

## 7. Where things stand

**Every feature in every wave is built.** What remains needs an account, a signature, a dashboard or a
dataset — see `jvpdocs/remaining-work-plan.md` §C, or the in-app **What's left** page (account menu).

**Wave 1 (sellable)** — code complete. Remaining: vendor DPAs, incident-response contacts, SMTP
credentials, Search Console verification, field CWV.

**Wave 2 (catalog)** — all scrums shipped. Remaining is data: base-price anchors for the combos, and feed
mapping for the catalog commodities (FD-1).

**Wave 3 (intelligence & depth)** — all shipped, including all 12 units of the Index Data Layer v2 and, as
of this snapshot, the last eight open items: the data-quality console (Scrum 33), real index forecasts
(Scrum 21), supplier price-list import (Scrum 30), per-region sourcing (Scrum 57 follow-up), guided
negotiation prep (Scrum 29), web push, nested "Lego" cost models (Scrum 27) and the AI cost modeler
(Scrum 32).

### What the newest work assumes, in one place

Four things a newcomer will otherwise rediscover the hard way.

1. **Nested cost models contribute composition, not price.** A `component_type='model'` line folds the
   child's lines into the parent with weights multiplied; the parent's `base_price` stays the anchor. Same
   convention as a chained `FormulaTemplate`, and what keeps weights summing to one. Cycles are refused at
   **save** (`assert_valid_nesting`) because a loop is unbounded recursion inside the engine. An
   unresolvable sub-model keeps its weight, rides flat and reports a data gap — dropping it would silently
   rescale everything else.
2. **A stored projection vintage goes stale against its own series.** Two of the five headline series are
   fitted to history that has since been overtaken, so a "projected" quarter can already be a fact.
   Anything consuming `/projections/latest` must drop projected points at or before the newest observation
   and say the vintage is behind — see `forwardOf()` in `ForecastArea.jsx`.
3. **The AI cost modeler never writes a cost model, never invents an index, and never degrades to
   silence.** Promotion is gated on the recipe closing at 100% and every index line binding; an
   unresolvable suggested feed is flagged and blocks promotion by name; an unreachable model returns 503
   rather than an empty draft that reads like a considered answer.
4. **Negotiation prep takes the supplier's position as an input.** The app holds no supplier-cost data and
   will not predict their counter. The should-cost has already consumed every verified index movement, so
   no verdict ever presents a cited driver as grounds for paying more — the verdicts differ only in *how*
   a claim fails. The claim is stored; the verdict is recomputed each read.

### Two migration traps this work hit

- **A CHECK constraint can exist without being on the model class.**
  `ck_formula_components_component_type` was added by a migration and is invisible from
  `app/models/cost_model.py`. If a new enum value inserts fine in your head and fails in Postgres, look for
  a constraint the model never declared.
- **Correcting a migration after it has been applied does nothing.** Alembic has already recorded the
  revision, so the corrected body never runs. Downgrade and re-upgrade — and remember the **test database
  is separate**: `DATABASE_URL="${APP_URL}_test" alembic downgrade -1 && ... upgrade head`.

## 8. Where everything else lives

- `CLAUDE.md` — the full TODO tracker, architecture conventions, security rules, and the readiness scorecard
  (every non-shipped item scored ease + value with reasoning). Read before starting anything.
- `jvpdocs/remaining-work-plan.md` — what is left (nothing buildable), plus a record of the three
  places the plan's own assumptions turned out to be wrong about the data. Worth reading before
  trusting any ticket's description of a dataset.
- `jvpdocs/local-setup.md`, `development.md` — getting it running.
- `jvpdocs/wave1manual.md` — the complete non-code checklist for Wave 1.
- `jvpdocs/security-posture.md`, `eu-data-residency.md`, `backup-retention-policy.md`, `incident-response.md`,
  `vendor-risk.md` — security docs with explicit `[NEEDS CONFIRMATION]` / `[NEEDS ACTION]` placeholders.
- `jvpdocs/indexes-how-to-add.md` — adding a new index or scraper.
- `jvpdocs/custom_rbac.md` — the permission model in detail.
- `DESIGN.md` — the design system. Mandatory before UI work.
- `PRODUCT.md`, `technical-overview.md` — short external-facing summaries.
- `sample_idea/` — raw source material (ticket prompts, data drops, workbooks) most Wave 2/3 scrums were built
  against. Kept for provenance; large, not for browsing.
