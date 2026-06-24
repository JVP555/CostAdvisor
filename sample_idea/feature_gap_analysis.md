# CostAdvisor — Feature Gap Analysis

**Reference (source of truth):** `sample_idea/costadvisor_mockup.html` (+ supporting `sample_idea/full_shadow_formula_library.html`)
**Method:** Direct codebase inspection. Every classification below was verified against actual backend (`backend/app/...`) and frontend (`frontend/src/...`) source, not against `CLAUDE.md`, the TODO list, or comments. Where documentation claimed a feature was done but code did not back it, the code wins.
**Date:** 2026-06-23

---

## 1. Executive Summary

### What the mockup actually is
The mockup reframes CostAdvisor as a **5-area workspace** built around a single idea: a buyer-owned *shadow formula* whose *should-cost is always live*, and from which everything else flows.

| Mockup area | Purpose |
|---|---|
| **Indexes** | Index library, grouped by type, with provider/frequency/region metadata, 2-yr sparklines and "in use" status |
| **Portfolio** | Products grouped by family, with ref codes, ship-from/ship-to, formula status, live should-cost |
| **Monitor** | Should-cost vs last actual: movement gap, drift, invoice status, implied margin, sector benchmark, trigger radar |
| **Forecast** | Portfolio-wide forward should-cost under Bear/Base/Bull index assumptions, per-product projection table |
| **Negotiate** | Quick **cheat sheet** + **8-phase full analysis** (historical → formula → index intel → sensitivity/tornado → margin benchmark → strategy/playbook → risk register → forward outlook) |

### Overall completion estimate: **~40% of demonstrated functionality**
- **Foundational engine & data plumbing: ~65% done.** The hard core the mockup depends on already exists and is solid: should-cost from weighted index-linked components, period baselines, FX + unit + Incoterm/landed-cost normalization, evolution (should-cost vs actual gap over time), per-component decomposition, drivers ranking, AI narrative, gap × volume impact, a portfolio summary endpoint that ranks by exposure, and a full index-data layer with team overrides and scraping.
- **Demonstrated end-product features: ~35% done.** Roughly: Indexes ~60%, Portfolio ~50%, Monitor ~35%, Negotiate ~30%, Forecast ~5%.

### Major gaps (in descending importance)
1. **Forecast (the entire area) is essentially absent.** There is no forward-projection engine, no Bear/Base/Bull index-assumption modelling, and no portfolio forward aggregation. `CostScenario` exists but stores a static cost *breakdown* (`{"Raw Materials": 0.68, ...}`), not a forecast scenario. (Verified: `models/scenario.py`, `routers/scenarios.py`, no forecast code anywhere in `backend/app`.)
2. **The Negotiate "full analysis" workspace is mostly missing.** Sensitivity/tornado, margin benchmark, negotiation strategy/price-ladder/counter-playbook, risk register, and forward outlook do not exist. Only Phase 0 (historical gap) and Phase 1 (formula) have strong analogues (`Evolution.jsx`, `CostModelBuilder.jsx`, `Brief.jsx`).
3. **Monitor lacks its intelligence columns.** Movement gap, drift flagging and exposure-ranked triage exist (`routers/portfolio.py`, `Dashboard.jsx`), but invoice status, implied margin, sector benchmark, and the trigger radar (renegotiation-clause proximity) are all absent.
4. **The "should-cost is always live" workflow framing is not realized.** The shadow formula, base period, and live should-cost all exist, but they are reached through per-cost-model pages, not surfaced as the always-on spine the mockup centers on.
5. **Presentation-layer data is missing on existing views:** family/supplier/region **grouping**, product **ref codes**, index **provider/frequency** fields, formula **status badges**, "in use" markers.

### Highest-priority missing features (most product-defining, build first)
1. **Sensitivity / tornado analysis** (Negotiate Phase 3) — pure function of the existing engine; high negotiation value, low data cost. *(Score 8)*
2. **Negotiation strategy: price ladder + counter-proposal playbook** (Negotiate Phase 5 + cheat sheet) — the literal demo payload. *(Score 8)*
3. **Forecast engine + Forecast area** — biggest net-new capability, defines the "Intelligence" promise. *(Score 13)*
4. **Monitor enrichment** (invoice status, implied margin, grouping, drift trend) — turns the dashboard into the triage screen shown. *(Score 8)*
5. **Margin benchmark + sector benchmark dataset** — needs net-new reference data and a confidence model. *(Score 8)*

> **Structural note (not scored as a feature):** The information architecture differs fundamentally. The mockup is a 5-tab workspace; the app is `Dashboard + Indexes + FX Rates + Formulas + Suppliers + Team + Admin` (`components/Navbar.jsx`) with analysis on per-cost-model routes (`App.jsx`). `Squeeze.jsx` exists and its `/api/costing/squeeze` backend works, but the page is **not routed in `App.jsx`** — it is currently unreachable.

---

## 2. Feature Comparison Table

Significance: 1 minor · 2 small · 3 moderate · 5 important · 8 major · 13 very large/core · 21 critical product-defining.

| Feature | Current Status | Required Changes (non-UI) | Significance | Notes |
|---|---|---|---|---|
| **Shadow formula (buyer-owned, weighted index-linked components)** | **Fully implemented** | None | 13 | `CostModel→FormulaVersion→FormulaComponent` (`models/cost_model.py`), engine `_compute_indexed_cost` (`costing_engine.py`). |
| **Starting point / agreed baseline (locked)** | **Fully implemented** | None | 5 | `FormulaVersion.base_year/base_quarter`; `_effective_base_price`. |
| **Live should-cost (formula × index movements)** | **Fully implemented** | None | 13 | `calculate_should_cost`; portfolio computes it per model. |
| **Index data: quarterly history, regions, overrides, scraping** | **Fully implemented** | None | 8 | `models/index_data.py`, `routers/indexes.py`, `services/scraper*`. Exceeds mockup (inline edit, team sources). |
| **Indexes — group by type (Commodity/Energy/Macro/Logistics), collapsible** | **Missing** | Use existing `CommodityIndex.category` for grouping + type filter API/agg | 3 | Field exists; UI groups flat by material×region (`Indexes.jsx`). |
| **Indexes — Provider column (ICIS/Platts/…)** | **Missing** | Add `provider` field to `CommodityIndex`; migration; seed | 2 | No provider field today. |
| **Indexes — Frequency column (daily/weekly/monthly)** | **Missing** | Add `frequency` field; migration; seed | 2 | No frequency field today. |
| **Indexes — 2-yr sparkline per row** | **Partial** | Reuse `IndexTrendChart`; expose per-row series | 2 | Trend chart exists in detail panel, not inline. |
| **Indexes — "vs base / vs Q1 2024" delta column** | **Partial** | Compute % vs anchor period in `resolve_index_values` | 2 | Cell coloring vs base exists; no explicit % column. |
| **Indexes — "In use" status (linked to a formula)** | **Partial** | Surface `_resolve_commodity_ids`/impact as a flag in list | 3 | Backend can resolve usage; not shown as status. |
| **Portfolio — live should-cost per product** | **Fully implemented** | None | 8 | `routers/portfolio.py /summary`; `Dashboard.jsx`. |
| **Portfolio — group by family/supplier/region (collapsible)** | **Missing** | Add grouping to `/summary` response or client; uses `chemical_family` | 5 | Dashboard is a flat sortable table. |
| **Portfolio — product ref codes (CA-OLEO-001)** | **Missing** | Add `reference` field to `Product`; migration; generator | 3 | `product.formula` (chemical formula) is reused as "reference". |
| **Portfolio — ship-from / ship-to columns** | **Partial** | Surface `region` + `destination_*` distinctly | 2 | Data exists on `CostModel`; Dashboard shows producing region only. |
| **Portfolio — formula status (Draft/Complete) badge** | **Partial** | Expose `has current_formula` as status field | 2 | Inferable; not surfaced as a badge. |
| **Portfolio — stat cards & family/status/group filters** | **Missing** | Aggregation endpoint for counts; filter params | 3 | No portfolio-level stats/filters. |
| **Monitor — should-cost vs last actual, movement gap** | **Fully implemented** | None | 8 | `/summary` gap, gap_pct; `Dashboard.jsx`. |
| **Monitor — exposure-ranked triage** | **Fully implemented** | None | 5 | `/summary` sorts by exposure (this is Wave-2 "Scrum 19" logic, already partly built). |
| **Monitor — drift trend bar** | **Partial** | Add trailing-gap series per model | 2 | `flag_price_drift` boolean only. |
| **Monitor — invoice status (received/awaited)** | **Missing** | Derive from `ActualPrice` presence for current period; status field | 3 | Not computed/shown. |
| **Monitor — implied margin column** | **Missing** | New calc: (actual − FOB cost)/actual; needs FOB cost model | 5 | Engine margin ≠ implied-vs-FOB margin. |
| **Monitor — sector benchmark range (in-range/above)** | **Missing** | **New reference dataset** + lookup by sector/volume/region | 8 | No benchmark data anywhere. |
| **Monitor — trigger radar (renegotiation-clause proximity %)** | **Missing** | New `clause_threshold` per model; proximity calc | 5 | No clause/threshold model. |
| **Forecast — forward should-cost projection (4/8 qtr)** | **Missing** | New forecasting engine (index extrapolation → should-cost) | 13 | No forward-projection code exists. |
| **Forecast — Bear/Base/Bull index assumptions (editable)** | **Missing** | New scenario-assumption model + apply pipeline | 8 | `CostScenario` is a cost breakdown, not a forecast. |
| **Forecast — per-product projection table (12M change/impact/driver)** | **Missing** | Forecast + volume + driver attribution per product | 8 | Depends on forecast engine. |
| **Forecast — portfolio aggregation + chart + Excel/PDF export** | **Missing** | Aggregate forecast across portfolio; report generation | 5 | No portfolio forward aggregation. |
| **Negotiate — Phase 0: historical gap (price vs should-cost chart)** | **Fully implemented** | None | 5 | `Evolution.jsx` + `calculate_evolution`. |
| **Negotiate — Phase 1: formula builder (+ Incoterm/landed)** | **Fully implemented** | None | 8 | `CostModelBuilder.jsx`, `IncotermAdjustments`, `incoterm_normalizer`. |
| **Negotiate — Phase 1: FOB→fixed→logistics→landed itemized breakdown** | **Partial** | Structured cost-build output (Scrum 17 "inspectable numbers") | 5 | Landed cost computed; itemized display not produced. |
| **Negotiate — Phase 2: index-movement chart + argument cards** | **Partial** | Indexed-to-100 movement series + net-movement narrative | 3 | Component decomposition + drivers exist; not this exact view. |
| **Negotiate — Phase 3: sensitivity / tornado (±20% index move)** | **Missing** | New per-component sensitivity calc on the engine | 8 | High value, low data cost; engine-only. |
| **Negotiate — Phase 3: annual impact at settlement prices** | **Partial** | Gap×volume exists (`squeeze`); needs price-ladder targets | 3 | `Squeeze.jsx` is **unrouted**; ladder targets missing. |
| **Negotiate — Phase 4: margin benchmark by volume bracket + confidence** | **Missing** | Benchmark dataset + implied-margin calc + confidence model | 8 | Entirely net-new. |
| **Negotiate — Phase 5: price ladder (open/target/walk-away)** | **Missing** | Derive targets from should-cost + flex rules; persist | 8 | Core demo artifact; absent. |
| **Negotiate — Phase 5: counter-proposal playbook (counter→response→stance)** | **Missing** | Rules/AI generation of counters + stance tagging | 8 | Maps to Wave-3 "negotiation aid". |
| **Negotiate — Phase 6: risk register (severity/likelihood/mitigation)** | **Missing** | New risk model + (optional) AI suggestions | 5 | No risk entity. |
| **Negotiate — Phase 7: forward outlook (Bear/Base/Bull EV, 12M savings)** | **Missing** | Depends on Forecast engine + EV calc | 5 | Blocked by Forecast. |
| **Negotiate — cheat-sheet vs full mode + phase navigation + exports** | **Partial** | Mode/stage state + Excel/deck exports | 5 | `Brief.jsx` ≈ one fixed report; PDF export exists; no mode/phases/Excel/deck. |
| **Negotiation brief / AI narrative / PDF export** | **Fully implemented** | None | 8 | `calculate_brief`, `narrative.py`/`ollama.py`, print masthead. |
| **Platform formula vs User formula (parallel on one product)** | **Partial / different** | Allow a platform + parallel user formula per product | 3 | `FormulaTemplate` is a platform/team **library**, not parallel formulas. |
| **CSV export across views** | **Fully implemented** | None | 2 | `utils/exportCsv`, per-page exporters. |
| **Excel model / executive deck exports** | **Missing** | Excel/PPTX generation pipeline | 3 | Only CSV + brief PDF exist. |

---

## 3. Missing & Partial Features — Detailed Breakdown

### 3.1 Forecast area (Missing — highest net-new effort)
**Evidence:** No forecast/projection/bear/bull code in `backend/app` (verified by search). `routers/scenarios.py` + `models/scenario.py` only CRUD a `CostScenario` whose `breakdown` is a static composition map. No frontend Forecast page; `scenario`/`forecast` appear in the frontend only as an audit-log filter label.
**Required non-UI work:**
- **Forecasting engine:** trailing-trend extrapolation per index (the mockup uses per-index %/quarter assumptions), feeding `_compute_indexed_cost` forward N quarters.
- **Scenario-assumption model:** persist Bear/Base/Bull index deltas; editable "Custom scenario".
- **Per-product + portfolio aggregation:** project should-cost × volume per product, roll up to annualized portfolio spend; 12M change %/€ and key-driver attribution.
- **Data:** depends on volumes (`ActualVolume` exists) and forward index assumptions (new).
- **Reporting:** Excel/PDF forecast report (new generation pipeline).
- **Auth:** new `forecast.view`/`export` permission keys consistent with `services/permissions.py`.
**Significance: 13** — large, defines the "Intelligence" promise; multiple new models, engine paths, and a report pipeline.

### 3.2 Negotiate full-analysis phases (mostly Missing)
- **Phase 3 — Sensitivity/Tornado (Missing, Score 8):** Add a function that perturbs each component's index by ±X% and recomputes should-cost (reuses `_compute_indexed_cost`). No new data; deterministic; new `/api/costing/sensitivity` endpoint + schema. Highest value-per-effort.
- **Phase 4 — Margin benchmark (Missing, Score 8):** Needs (a) **implied margin** = (actual − landed FOB cost)/actual — requires an explicit FOB cost figure the engine doesn't currently emit; (b) a **sector/volume-bracket benchmark dataset** (net-new reference data, "expert est." with source counts/confidence). New model + seeding + confidence scoring.
- **Phase 5 — Strategy: price ladder + playbook (Missing, Score 8):** Derive `open = should-cost`, `target`, `walk-away` from should-cost plus flexible-weight rules; persist negotiation position (writes back to "starting point" per mockup). Counter-proposal playbook = rules/AI generating counters with HOLD/CAN-FLEX stances (Wave-3 "negotiation aid"). Touches audit (`AuditLog`) for position changes.
- **Phase 6 — Risk register (Missing, Score 5):** New `NegotiationRisk` entity (risk, severity, likelihood, mitigation); optional AI-suggested risks from index volatility.
- **Phase 7 — Forward outlook (Missing, Score 5):** Bear/Base/Bull expected-value of savings; blocked by the Forecast engine.
- **Cheat-sheet vs full mode + phase navigation + Excel/deck exports (Partial, Score 5):** `Brief.jsx` is a single fixed report (verdict, gap, decomposition, drivers, narrative, PDF). No two-mode structure, no 8-phase stepper, no Excel model or executive deck.
- **Phases 0–2 are the bright spot:** Phase 0 (historical gap chart) = `Evolution.jsx`/`calculate_evolution`; Phase 1 (formula builder, Incoterm/landed) = `CostModelBuilder.jsx` + `incoterm_normalizer.py`; Phase 2 (index intel) is partially covered by component decomposition + driver `index_change_pct`.

### 3.3 Monitor enrichment (Partial)
**Implemented:** should-cost vs last actual, movement gap (`gap`/`gap_pct`), drift/index flags, exposure-ranked triage, CSV export (`routers/portfolio.py`, `Dashboard.jsx`).
**Missing/Partial:**
- **Invoice status (Missing, Score 3):** derive "received/awaited" from `ActualPrice` presence for the current period.
- **Implied margin (Missing, Score 5):** depends on emitting an FOB cost (see 3.2 Phase 4).
- **Sector benchmark in-range/above (Missing, Score 8):** needs the benchmark dataset.
- **Trigger radar / clause proximity (Missing, Score 5):** new per-model clause threshold + proximity calc against index movement.
- **Family grouping + alert/watch/on-track sub-headers (Missing, Score 3):** data (`chemical_family`) exists; grouping not applied.
- **Drift trend bar (Partial, Score 2):** only a boolean flag today.

### 3.4 Portfolio view (Partial)
**Implemented:** per-product live should-cost, actual, gap%, exposure, flags (`/summary` + `Dashboard.jsx`); product CRUD with family (`Products.jsx`).
**Missing/Partial:** family/supplier/region **grouping** (Score 5), **ref codes** (Score 3 — add `Product.reference`), **ship-from/ship-to** as distinct columns (Score 2), **formula-status badges** (Score 2), **portfolio stat cards + filters** (Score 3). Note `Products.jsx` is not in the nav (`Navbar.jsx`).

### 3.5 Indexes view (Partial)
**Implemented:** quarterly grid by material×region, inline overrides, team sources/scraping, health indicators, filters, CSV export, detail panel (`Indexes.jsx`, `routers/indexes.py`).
**Missing/Partial:** **group-by-type collapsible** + type filter (Score 3 — `category` exists, unused for grouping), **provider** field (Score 2), **frequency** field (Score 2), inline **sparkline** (Score 2), explicit **vs-base delta %** (Score 2), **"in use"** status (Score 3).

### 3.6 Cross-cutting
- **Platform vs User parallel formula (Partial, Score 3):** the mockup shows a platform formula and a parallel buyer formula on one product; the app has a `FormulaTemplate` **library** (platform `team_id IS NULL` vs team-scoped), not two coexisting formulas per cost model.
- **Squeeze page unreachable (defect, Score 1):** `Squeeze.jsx` + `/api/costing/squeeze` are functional but the route is absent from `App.jsx`; the underlying gap×volume impact is what the mockup's "annual impact" needs.
- **Excel/PPTX exports (Missing, Score 3):** only CSV and the brief PDF exist.

---

## 4. Recommended Development Priority

Ordering balances **product importance × user value** against **dependencies × technical effort**. Phase A items are cheap because they reuse the existing engine; Phase C items unlock the largest net-new value but cost the most.

### Phase A — High value, low effort (engine reuse, little/no new data)
1. **Route the Squeeze page** in `App.jsx` (trivial; restores existing gap×volume impact). *(1)*
2. **Sensitivity / tornado** endpoint + view (Negotiate Phase 3). Pure engine perturbation; no new data. *(8)*
3. **Monitor enrichment — invoice status + drift trend + family grouping.** All derivable from existing `ActualPrice`/`chemical_family`. *(5)*
4. **Indexes presentation — group-by-`category`, type filter, vs-base delta, "in use" flag.** Uses fields/relations that already exist. *(3)*
5. **Portfolio grouping + formula-status badge + ship-to column.** Reshape existing `/summary` data. *(5)*

### Phase B — Important, moderate effort (some new data/models)
6. **Price ladder + negotiation position** (Negotiate Phase 5 cheat-sheet core) — derive open/target/walk-away from should-cost; persist + audit. *(8)*
7. **Implied margin + FOB cost emission** from the engine (feeds Monitor + Phase 4). *(5)*
8. **Product ref codes**, **provider/frequency** index fields (small migrations + seeding). *(3)*
9. **Trigger radar** — per-model clause threshold + proximity. *(5)*
10. **Risk register** entity + view (Negotiate Phase 6). *(5)*

### Phase C — Major / product-defining (new engines & datasets)
11. **Forecast engine + Forecast area** (forward projection, Bear/Base/Bull assumptions, per-product + portfolio aggregation, report export). Prereq for Negotiate Phase 7. *(13)*
12. **Sector / margin benchmark dataset + confidence model** (Monitor benchmark + Negotiate Phase 4). Net-new reference data. *(8)*
13. **Counter-proposal playbook** (rules/AI counters with stances) — Wave-3 negotiation aid. *(8)*
14. **Negotiate workspace shell** — cheat-sheet vs full 8-phase mode, phase navigation, Excel model + executive-deck exports. *(8)*
15. **Platform + parallel user formula** per product (data-model change to `FormulaVersion` ownership). *(5)*

### Dependency notes
- Phase 4 (margin benchmark) and Monitor implied-margin both depend on the engine emitting an explicit **FOB cost** (item 7).
- Negotiate Phase 7 (forward outlook) depends on the **Forecast engine** (item 11).
- Counter-proposal playbook and AI risk suggestions can reuse the existing Ollama path (`services/narrative.py`, `services/ollama.py`).
- Everything in Phase A/B builds on the already-solid `costing_engine.py`, `routers/portfolio.py`, and `routers/indexes.py` — no foundational rework required.

---

### Appendix — Files inspected for verification
Backend: `services/costing_engine.py`, `services/data_resolver.py` (refs), `services/incoterm_normalizer.py` (refs), `routers/costing.py`, `routers/portfolio.py`, `routers/indexes.py`, `routers/scenarios.py`, `models/cost_model.py`, `models/product.py`, `models/index_data.py`, `models/scenario.py`, `main.py` (router registration).
Frontend: `App.jsx`, `components/Navbar.jsx`, `pages/Dashboard.jsx`, `pages/Indexes.jsx`, `pages/Products.jsx`, `pages/Evolution.jsx`, `pages/Brief.jsx`, `pages/Squeeze.jsx`, `pages/CostModelBuilder.jsx` (targeted), plus repo-wide searches for forecast/sensitivity/benchmark/risk/ladder/trigger/scenario.
