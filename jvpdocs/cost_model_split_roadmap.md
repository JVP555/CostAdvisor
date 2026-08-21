# Cost-Model Split Roadmap — the 5-area workspace is a reorganization, not a rebuild

**Companion to:** `sample_idea/feature_gap_analysis.md` (the mockup gap analysis)
**Method:** verified against current source (`backend/app/...`, `frontend/src/...`).
**Date:** 2026-06-24

---

## 1. Thesis

The mockup's five areas — **Indexes · Portfolio · Monitor · Forecast · Negotiate** — are **not a new product**. They are the **existing cost model surfaced through five lenses**. One shared spine powers all of them:

> shadow formula (weighted, index-linked components) → **live should-cost** → FX + unit + Incoterm/landed-cost normalization → evolution / gap-vs-actual → ranked drivers → AI narrative brief → portfolio exposure ranking.

That spine is the expensive, hard part, and it **already exists and is solid**. So the right way to measure "how done are we" is **"how much of each lens is already powered by existing engine + endpoints + pages,"** not "how many of the mockup's surface widgets are present." Measured that way, completion is materially higher than the gap analysis's headline **~40%**.

The gap analysis is not wrong — it counts *demonstrated surface features*. This doc counts *capability reuse*. Both are true; they answer different questions. This roadmap reconciles them and lays out the build order.

---

## 2. Area → existing-code map (reframed completion)

Per area: what the lens needs · what already powers it · what's genuinely new · a % grounded in reuse.

### Indexes — **~60%**
- **Powered by:** `frontend/src/pages/Indexes.jsx` + `backend/app/routers/indexes.py` + `models/index_data.py` + `services/scraper*`. Quarterly grid by material×region, inline team overrides, scraping/team sources, health indicators, CSV export, detail trend panel (`IndexTrendChart.jsx`). FX side adds daily history + interactive charts (`FxRates.jsx`, `PriceChart.jsx`).
- **Genuinely new:** group-by-`category` (field exists, unused for grouping), `provider` / `frequency` columns (small migrations), inline per-row sparkline, explicit "vs-base %" column, "in use" flag (resolvable from `_resolve_commodity_ids`).
- Net-new is presentation/metadata, not engine.

### Portfolio — **~55%**
- **Powered by:** `pages/Dashboard.jsx` + `GET /api/portfolio/summary` (`routers/portfolio.py`). Per-product live should-cost, latest actual, gap %, **exposure ranking**, drift/index flags, sortable table + cards, CSV export, row → cost-model/evolution/brief.
- **Genuinely new:** group-by family/supplier/region (collapsible), product **ref codes** (`Product.reference` field), ship-from/ship-to as distinct columns, formula-status badge, portfolio stat cards + filters.
- All reshaping of an existing endpoint's data; no new engine.

### Monitor — **~45%**
- **Powered by:** the same `/api/portfolio/summary` — should-cost vs last actual, movement gap (`gap`, `gap_pct`), exposure-ranked triage, `flag_index_moved` / `flag_price_drift`. This is the "triage screen" core.
- **Genuinely new:** invoice status (derive received/awaited from `ActualPrice` presence for the period — cheap), **implied margin** (needs the engine to emit an explicit FOB cost), **sector benchmark** in-range/above (net-new reference dataset + confidence), **trigger radar** (per-model renegotiation-clause threshold + proximity calc), drift *trend* bar (today a boolean).
- Half here is derivable from existing data; the benchmark + clause models are genuinely new.

### Negotiate — **~50%**
- **Powered by:** the phase backbone already exists across pages.
  - Phase 0 historical gap = `pages/Evolution.jsx` + `calculate_evolution`.
  - Phase 1 formula + Incoterm/landed = `pages/CostModelBuilder.jsx` + `services/incoterm_normalizer.py`.
  - Phase 2 index intel ≈ component decomposition + driver `index_change_pct`.
  - Phase 3 sensitivity ≈ `/api/costing/squeeze` (engine works; `Squeeze.jsx` exists but is **unrouted**).
  - Brief / AI narrative / PDF = `pages/Brief.jsx` + `services/narrative.py` + `ollama.py` + print masthead.
- **Genuinely new:** the tornado *view*, **price ladder** (open/target/walk-away derived from should-cost), margin benchmark (Phase 4), **risk register**, **counter-proposal playbook** (reuse Ollama), and the cheat-sheet ↔ full 8-phase **shell** with phase navigation + Excel/deck exports.
- The analytical substance largely exists; what's missing is the workspace shell + a few engine-only calcs + 1–2 new datasets.

### Forecast — **~5%** (the one genuine gap)
- **Powered by:** essentially nothing. `models/scenario.py` / `routers/scenarios.py` store a static cost *breakdown*, not a forecast. No forward-projection code anywhere in `backend/app`.
- **Genuinely new:** forward-projection engine (trailing-trend extrapolation per index → `_compute_indexed_cost` forward N quarters), editable Bear/Base/Bull index-assumption model, per-product + portfolio aggregation, forecast report export.
- This is the dominant real net-new capability and the bulk of remaining effort.

---

## 3. Corrected overall estimate

| Lens | Completion (reuse-measured) | Dominant gap |
|---|---|---|
| Indexes | ~60% | metadata + grouping (presentation) |
| Portfolio | ~55% | grouping, ref codes, stat cards |
| Monitor | ~45% | benchmark dataset, trigger radar, implied margin |
| Negotiate | ~50% | workspace shell, price ladder, tornado view |
| Forecast | ~5% | the entire forward-projection engine |
| **Engine / data spine** | **~65%** | shared by every lens above |

**Headline:** measured as a **reorganization of existing capability**, the 5-area workspace is **≈ 55% complete**, not 40% — and four of the five areas are mostly *reuse + glue*. **Forecast is the single biggest genuine hole.**

**Why this differs from the gap analysis's ~40%:** that figure counts *demonstrated surface features* (every column, badge, and panel in the mockup). This figure counts *capability already powering each lens*. The delta is almost entirely presentation/IA work (grouping, badges, a tabbed shell, routing the existing Squeeze page) over an engine that's already built — which is cheap relative to its visual footprint.

---

## 4. Target information architecture — global 5-area workspace

End state: top-level tabs **Indexes · Portfolio · Monitor · Forecast · Negotiate**, replacing today's scattered per-cost-model routes as the primary navigation.

How today's routes fold in:
- **Portfolio** ← `Dashboard.jsx` (`/api/portfolio/summary`); rows open a model.
- **Monitor** ← same `/summary` data, filtered/grouped by alert criteria (drift/index flags, gap thresholds) + the new enrichment columns.
- **Indexes** ← `Indexes.jsx` (+ FX history already built).
- **Negotiate** ← hosts the existing per-model phases: `CostModelBuilder` (formula), `Evolution` (historical gap), `Squeeze` (sensitivity — **route it**), `Brief` (narrative/PDF), as a cheat-sheet ↔ full-phase stepper.
- **Forecast** ← net-new area over the new forecast engine.

**Reuse the tab-shell pattern** already proven in `pages/FxRates.jsx` (4 tabs), `pages/Team.jsx`, and `pages/Admin.jsx` — a single workspace route with `const [area, setArea] = useState(...)` and `ca-btn-primary`/`ca-btn-ghost` tab buttons. Per-model analysis opens from a Portfolio/Monitor row into the Negotiate phases.

> This is a larger IA change than today's per-cost-model routing — it's the main structural lift, but it's wiring over existing pages, not new engine work.

---

## 5. Phased build order (reuse-first)

**Phase A — IA reorg + cheap wins** (mostly glue over the existing engine)
- Workspace shell with the 5 area tabs (reuse `FxRates`/`Team` pattern).
- **Route `Squeeze.jsx`** (it works; just absent from `App.jsx`) — restores gap×volume / sensitivity instantly.
- Add **`Products`** to the nav (routed today, not discoverable).
- Surface "should-cost is always live" as the spine of Portfolio/Monitor.
- Reshape `/api/portfolio/summary` consumption for grouping + stat cards.
- Indexes group-by-`category` + type filter.

**Phase B — engine-only enrichments** (small calcs, no new datasets)
- **Sensitivity / tornado** endpoint: perturb each component's index ±X% through `_compute_indexed_cost`; highest value-per-effort.
- **Price ladder**: derive open = should-cost, target, walk-away; persist negotiation position (audit it).
- **Implied margin / FOB emission** from the engine (feeds Monitor + Negotiate margin benchmark).
- Monitor invoice status (from `ActualPrice` presence) + drift *trend* series.

**Phase C — net-new engines & datasets** (the genuine build)
- **Forecast engine + Forecast area** (forward projection, Bear/Base/Bull assumptions, portfolio aggregation, report export). Largest item.
- **Sector / margin benchmark dataset** + confidence model.
- **Counter-proposal playbook** (reuse the Ollama narrative path).
- **Risk register** entity + view.

**Dependencies:** Negotiate forward-outlook ⟵ Forecast engine (Phase C); Monitor implied-margin & Negotiate margin-benchmark ⟵ FOB emission (Phase B).

---

## 6. Corrections to the gap analysis

- **`Pricing.jsx` IS routed** at `/cost-models/:costModelId/pricing` (`App.jsx`) — the gap doc implied otherwise.
- **Confirmed:** `Squeeze.jsx` + `/api/costing/squeeze` are functional but **unrouted** in `App.jsx` (reachable only by manual URL) — a 1-line fix.
- **Confirmed:** `Products.jsx` is routed (`/products`) but **absent from `Navbar.jsx`**.

---

## 7. Bottom line

The product is the cost model. The mockup re-presents it as five lenses, four of which (Indexes, Portfolio, Monitor, Negotiate) are largely **already powered** by the existing engine and endpoints — the remaining work there is presentation, IA, and a handful of engine-only calculations. **Forecast is the one area that is genuinely net-new.** So the honest read is **~55% of the workspace already exists as capability**, and the path to the mockup is *reorganize first (Phase A), enrich cheaply (Phase B), then build Forecast + benchmarks (Phase C)* — not a ground-up rebuild.
