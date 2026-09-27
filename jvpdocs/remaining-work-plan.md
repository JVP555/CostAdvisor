# Remaining work — plan

**Written 2026-09-27; kept current as items land.** Covers everything in `CLAUDE.md` that is still 🔴 or 🟡,
grouped by what is actually blocking it, with an implementation plan for each buildable item.

> **Done so far:** B1 validation console · B2 real forecasts · A3 price-list import. Bucket B is empty.

`CLAUDE.md` stays the authoritative per-scrum tracker. This file is the *forward* view: what is left, in what
order, and what each piece needs. Where the two disagree, `CLAUDE.md` is right about history and this file is
right about intent.

---

## The four buckets

A flat TODO list hides the single most useful fact about this backlog: the remaining items need four
completely different kinds of unblocking.

| Bucket | Count | Who unblocks it |
|---|---|---|
| **A. Mocked, unbuilt** | 5 (was 6) | An engineer. A clickable mockup exists at `/preview/*` for each. |
| **B. Backend shipped, no screen** | 0 (was 2) | ✅ both wired. |
| **C. Not a coding task** | 6 | An account, a signature, a dashboard, or a dataset. |
| **D. Deliberately not doing** | 3 | Nobody — decided against, reasons recorded. |

---

## A. Mocked, unbuilt — `/preview/*`

Each has a design-complete page running on hardcoded fixtures, reachable from the account menu under
**What's next (mockups)**. Every page states the model, endpoints and behaviour it assumes, so the mockup is a
specification rather than a drawing.

**Rule when you wire one: delete its fixtures and its `<PreviewBadge />` in the same commit.** A half-wired page
that still looks mocked is survivable; a fully-mocked page that no longer looks it is not.

### A1. Nested cost models — Scrum 27 · `/preview/nested-formulas`

*Largest remaining feature. Touches the costing engine.*

A `FormulaComponent` that resolves to another `CostModel` instead of a commodity.

The reason this is smaller than it looks: **the hard parts are already solved one layer up.** Chained
*templates* (`component_type='formula'`) already flatten with multiplied weights, already cap at
`MAX_CHAIN_DEPTH = 3`, and already refuse cycles at write time via `assert_valid_chain_input`. Scrum 27 is the
same shape with a `CostModel` as the child.

1. **Migration** — `formula_components.child_cost_model_id`, nullable FK, `ON DELETE RESTRICT` (not SET NULL: a
   deleted child would silently change a price. Refuse the delete and say why, the way deleting a template used
   as an input already 409s).
2. **`component_type` gains `'model'`.** The coherence CHECK on `formula_template_components` is the precedent —
   exactly one of `commodity_id` / `type_code_id` / `child_cost_model_id` set, matching the type.
3. **`formula_resolver.get_effective_lines` recurses.** This is the whole integration: all six costing entry
   points already route through it, so should-cost, breakdown, Evolution, Brief, Price-Change and the forward
   should-cost inherit nesting without touching `costing_engine.py`. Weights rebase over the child's own weight
   sum, mirroring `evaluate_weighted_template`.
4. **Write-time cycle + depth guard**, reusing the template walk. A loop here is unbounded recursion inside the
   engine, not a wrong number, so it must fail at save.
5. **`clone_cost_model` copies the link**, the way it already copies `source_coverage_id` / `link_mode`.
6. **Exports render depth.** Brief and Evolution must not silently flatten a nested model into an opaque line —
   `depth` / `via_template_id` / `line_region` provenance already exists on `FormulaComponent` and should carry
   the sub-model name too.

Endpoints: `GET /api/cost-models/{id}/resolve?depth=full`, `GET /api/cost-models/{id}/nestable` (candidates with
cycles excluded), plus `child_cost_model_id` accepted on the existing formula-version POST.

Risk: this is the one item here that can break working should-costs. A regression test pinning today's exact
numbers for an unnested model is the first thing to write, not the last.

**Pairs with the last 🔴 on Scrum 28** — per-`FormulaComponent` structured min/max/yield fields. The expression
evaluator already does bounds and thresholds inline (`clamp`, `step`, ternaries); the structured form is only
worth building if the two are designed together, which is what that ticket always said.

### A2. AI cost modeler — Scrum 32 · `/preview/ai-cost-modeler`

*Large, but mostly because of the review path, not the model call.*

Product name + sector + rough price in, a suggested component breakdown out, clearly labelled as an estimate,
refined by a human, then promoted to a real `FormulaVersion`.

**Do not build a second staging model.** `services/formula_estimator.py` already does draft-then-approve with
`EstimatorProposal` / `EstimatorProposalLine`, upserting by `(template_id, region)` and only writing real
component rows on approve. Reuse that shape; the difference is the evidence source (an LLM instead of sibling-
region inheritance), not the workflow.

1. **`POST /api/ai/cost-structure`** — prompt Ollama (`llama3.1:8b`, same service `narrative.py` uses), parse a
   structured breakdown, persist as a proposal.
2. **Suggested indexes must resolve** against real `commodity_indexes` rows. An unresolvable suggestion comes
   back flagged, never silently dropped — the user needs to know the model invented a feed name.
3. **Promotion writes `provenance = ai_draft`** from `app/constants/trust.py`'s existing four-state vocabulary,
   so the estimate caveat survives the save and shows on every should-cost built on it.
4. **Degrade when `llm_enabled` is False.** In production it is, and `ollama_generate()` returns `None` on a
   cache miss. The page must fall back to manual entry rather than spin forever.

Risk: an LLM that returns plausible weights summing to 97% and a feed name that does not exist. Both are handled
by refusing to promote until the recipe closes at 100% and every index resolves.

### A3. Supplier price-list import — Scrum 30 — ✅ SHIPPED

*Live at `/price-lists`; the mockup is deleted. Detail in `CLAUDE.md`'s Scrum 30 entry.*

Shipped roughly as planned, with two things the plan did not anticipate. Matching needed a **fourth**
state: `ambiguous` (a fuzzy top score within 0.06 of the runner-up, or two cost models sharing a product
name) is a question, not a weak match, and folding it into `unmatched` would have hidden the one case a
supplier selector actually fixes. And period derivation has a load-bearing preference order — `valid_from`
> `quote_date` > `valid_until` — because a list valid until the end of Q1 usually started in Q4.

<details><summary>Original plan</summary>

*Best effort-to-value ratio of the six. The parser already exists.*

**Not the same thing as `/quotes`.** Scrum 31b already extracts a one-off *quote* into `QuoteRecordLine` to feed
a negotiation position, and deliberately never writes `ActualPrice`. This is the other half: a recurring
supplier price *list* landing as the actual prices every gap in Monitor is measured against.

`services/quote_extraction.py` (pdfplumber, table mode with a full-text fallback, confidence tiers, per-field
locators, no LLM) is reusable almost as-is. The new work is downstream of parsing:

1. **Matching.** Each extracted row must resolve to one of the team's own cost models. Keep `exact` / `fuzzy` /
   `unmatched` as three distinct states — an unmatched row is never committed on a guess, because a price
   attached to the wrong product corrupts a gap silently.
2. **A draft run table** mirroring `QuoteExtractionRun`, so a parse can be reviewed, left, and returned to.
3. **Commit writes through the existing prices path**, so RLS, audit and the `(cost_model, year, quarter)`
   uniqueness behave exactly as manual entry does.
4. **Unreadable PDF falls back to the manual form**, not an error page. The ticket calls this out explicitly.

Reuse the `prices.import` / `prices.edit` permission keys; a new `price_lists.*` category would need a full
permissions/plan/role migration for a distinction this does not need.

</details>

### A4. Negotiation prep — Scrum 29 · `/preview/negotiation-prep`

*No new engine. Everything it needs is already in `BriefResult`.*

The half of Scrum 29 that is still open is the guided advisor. The half that shipped is the position/floor card.

**The design constraint that shapes this whole feature: the app does not predict the supplier's counter.** It
holds no supplier-cost data, and a fabricated counter-proposal playbook was deleted once already (commit
`03e0856`). So the supplier's position is an *input* — the buyer logs what was actually said — and the output is
the evidence answering each claim.

The second constraint is arithmetic, and it is what makes the output strong: `evaluate_weighted_template` already
consumes 100% of every verified index movement, so a driver the supplier cites cannot justify anything *on top
of* the should-cost. It is already in there. Everything above should-cost is unexplained by construction.

1. **`SupplierClaim`** against a cost model and period, so prep survives the call and is reviewable after.
2. **A checker** mapping a claim onto a driver in the resolved recipe. Start by picking from the resolved lines;
   do not start with NLP.
3. **Script assembly is deterministic template text** over `calculate_brief`'s numbers. The LLM may smooth the
   prose; it must never be the source of a figure.
4. **Export reuses `window.print()` + `.ca-print-page`** from `Brief.jsx`. No second export mechanism.

### A5. Per-region sourcing — Scrum 57 follow-up (re-scoped) · `/preview/region-proxies`

**Read this before planning it, because the obvious plan is the one that was declined.**

The original framing was: index metadata (`retrieval_status`, `access_tier`, `frequency`, `proxy_logic`) lives on
`commodity_indexes`, which is region-agnostic, so add a `(commodity, region)` table. That is **superseded**.
Unit 2 of the data drop put region on `IndexCard` rather than on the series, so for every drop-loaded series
(`commodity_key IS NOT NULL`) the per-region facts are already stored. And the one real consumer named in the
original note — `formula_estimator._has_usable_series` — already got a narrower fix that shipped: a
sibling-inherited line resolving only via an unrelated region is now marked as a weaker cross-region signal
rather than presented at the strength of a direct regional match. A second region-nullable table duplicating
`IndexDossier`'s shipped pattern was explicitly rejected.

What is actually left is smaller, and most of it is a screen:

1. **`GET /api/indexes/region-coverage`** — one row per (series, region), derivable from `index_cards` today.
   The read is what is absent, not the data.
2. **The Index Library status chip reads the card's region**, not the series-level representative. On a
   commodity whose regions disagree it currently describes a different region's feed than the number beside it.
   This single change is most of the user-facing value.
3. **`seed_index_metadata.py`** — the pre-drop workbook path — still collapses 158 feeds onto one
   representative. It is marked SUPERSEDED but still runs; that residue is the real remaining data gap.
4. **`proxy_derivation.derive_value` takes a region**, so a proxy that is good in NA and weak in CN stops
   producing equally-trusted numbers.
5. **If a per-region spec must be editable**, extend `IndexDossier` — already region-aware, already shipped.

Worth knowing before anyone plans engine work here: the proxy executor is **live and idle**. All 128 series
carrying `proxy_logic` have a null `operation` and null `base_index`, so nothing is configured for it to run.
That is a configuration gap, not a code gap.

> `CLAUDE.md`'s readiness scorecard still scores this as "needs a new `(commodity, region)` table + resolver
> changes, Ease 3 / Value 4". That row predates the re-scope on the Scrum 57 line and is stale; the work is
> smaller than it says.

### A6. Push notifications — Extras/PWA · `/preview/notifications`

*Smallest item here, and entirely free — VAPID web push needs no paid relay and no Firebase project.*

The installable shell shipped (`manifest.json` + a hand-written `sw.js`, no Workbox). Missing:

1. `push` and `notificationclick` listeners in `sw.js`.
2. A `usePushSubscription` hook: `requestPermission` → `pushManager.subscribe` → POST endpoint + keys.
3. **`PushSubscription` keyed on the user, not the team** — subscriptions are per device. Follow the app-layer
   ownership check `SupportThread` and `AlertSubscription` already use rather than inventing an RLS shape.
   Start hardened; do not repeat the reference implementation's original wide-open policy.
4. `services/push.py` over `pywebpush`. A 404/410 from the relay means the subscription is dead — delete the row,
   do not retry.
5. `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, the public one also reaching the build as `VITE_VAPID_PUBLIC_KEY`.
6. **iOS delivers push only to an installed PWA on 16.4+**, never a plain tab. The UI must say so, or a subscribe
   button appears to work and then never delivers.

`push` becomes a third value on `AlertSubscription.channel` beside `email` and `slack` — not a parallel system.

---

## B. Backend shipped, nothing calls it — ✅ both wired

### B1. Index data-quality validation console — Scrum 33 — ✅ SHIPPED

Live at `/validation` (account menu: **Data quality**). Reading is open to any authenticated user and only
running is super-admin, matching the API's own split, so the Run button is absent rather than present and
403-ing.

One thing the plan got wrong: findings are not always two-sided. A declared drop issue states a problem
with no counterpart — `right_label` is null on the first page of real data — so the detail view renders
only the sides that carry a label.

### B2. Real index forecasts on the Forecast tab — Scrum 21 follow-up — ✅ SHIPPED

The composite was dropped rather than having a forecast bolted onto it; each headline commodity is charted
as itself with its own vintage and prediction interval.

The thing worth carrying forward: **a stored vintage goes stale against its own series.** Two of the five
headline series are fitted to history ending 2026 Q2 while 2026 Q3 has since been observed, so a projected
point can already be a fact. Anything else consuming projections needs the same guard — drop projected
points at or before the newest observation, and say the vintage is behind rather than quietly shortening
the horizon.

## C. Not a coding task

Listed because these, not the features above, are what stands between the product and a paying customer.

1. **Sync the deploy repo.** The Railway-connected repo has been frozen since the 2026-08-22 go-live merge.
   Nothing from Scrum 26 onward, and none of the 12 Index Data Layer units, is live. Re-verify anything
   infra-related against the live domains only *after* that sync.
2. **SMTP credentials.** No provider chosen. Invites, welcome mails, demo confirmations and every alert email
   silently fail.
3. **Vendor DPA list + named incident-response contacts.** The last two open items on `security-posture.md`;
   until they land, that doc cannot go to a prospect.
4. **Base-price anchors.** 199 of 200 platform combos have no base-period price, so they yield an index level
   and never a currency figure. The import tooling is built and waiting on data.
5. **FD-1 feed mapping.** The 2026-07 drop renamed commodities to short type-codes that do not match the old
   `SCRAPER_REGISTRY` keys — that mismatch, not a missing scraper, is why the library shows "No data". Verify
   each series ID live against its source before committing to it; two candidates failed that check and were
   correctly left out rather than guessed.
6. **Google Search Console verification + field Core Web Vitals.** Both need real production traffic.

---

## D. Deliberately not doing

Recorded so nobody re-opens them as oversights.

1. **Predicting the supplier's counter** (Scrum 29's first bullet). Impossible honestly without supplier-cost
   data. Already removed once for fabricating it.
2. **Statistical cross-checking of two independent readings of one series** (Scrum 33's out-of-scope note). We
   mostly hold one reading per series; this is a later mode for the few where we hold two.
3. **Branch protection on `main`.** Three people on a private repo. Revisit when the team grows.

---

## Suggested order

Effort-to-value, with the risky item placed where there is room to absorb a regression.

1. ~~**B1 + B2**~~ — ✅ done.
2. ~~**A3 price-list import**~~ — ✅ done.
3. **A5 per-region proxies** — raises the trustworthiness of every index badge in the catalog.
4. **A4 negotiation prep** — no new engine, and it is the feature the product is named for.
5. **A6 push** — small, self-contained, finishes the PWA story.
6. **A1 nested cost models** — largest, touches the engine. Schedule it when there is room for regression work,
   and pin the existing numbers first.
7. **A2 AI cost modeler** — last. Do it once the estimator's draft/approve path is familiar, since it reuses it.

Nothing in C is on this list because nothing in C is a coding session. They are, however, the higher-priority
items commercially — a feature nobody can receive an email about is worth less than the email.
