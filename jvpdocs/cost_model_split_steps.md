# Cost-Model Split — Step-by-Step Completion Ladder

**Companion to:** `jvpdocs/cost_model_split_roadmap.md`
**Baseline:** the workspace is **~55% complete** today (measured as reuse of the existing cost-model engine + endpoints + pages, per the roadmap). Each step below is ordered reuse-first; the **Completion** column is the cumulative figure *after* finishing that step.
**Note:** percentages are effort-/value-weighted planning estimates, not a measured metric — they show relative size and momentum, ending at ~100% of the mockup's demonstrated scope.

---

## The ladder

| Step | What you build | Area(s) | Reuse vs New | Effort | Completion |
|---|---|---|---|---|---|
| **1** | **IA reorg + quick wins** — global 5-area workspace shell (reuse `FxRates`/`Team` tab pattern); **route the unreachable `Squeeze` page**; add **Products** to the nav; make "should-cost is always live" the spine | all 5 | Reuse + glue | S | **55 → 60** |
| **2** | **Portfolio lens** — group by family/supplier/region, product ref codes, formula-status badges, stat cards + filters (reshape `/api/portfolio/summary`) | Portfolio | Reshape existing | S–M | **60 → 65** |
| **3** | **Indexes lens** — group-by-`category` + type filter, provider/frequency columns, inline sparkline, "in use" flag, vs-base % | Indexes | Mostly metadata | S–M | **65 → 69** |
| **4** | **Monitor enrichment** — invoice status (from `ActualPrice`), drift-trend bar, **FOB cost emission → implied margin** | Monitor | New calcs on engine | M | **69 → 74** |
| **5** | **Negotiate analytics** — **sensitivity / tornado** endpoint (perturb `_compute_indexed_cost` ±X%) + **price ladder** (open/target/walk-away from should-cost, persisted & audited) | Negotiate | Engine-only, no new data | M | **74 → 80** |
| **6** | **Negotiate workspace shell** — cheat-sheet ↔ full 8-phase stepper wiring the existing Builder / Evolution / Squeeze / Brief, + Excel/deck exports | Negotiate | Reuse + shell | M | **80 → 84** |
| **7** | **Forecast engine + Forecast area** — forward projection (trailing-trend per index → should-cost N quarters), editable Bear/Base/Bull assumptions, per-product + portfolio aggregation, report export | Forecast | **Net-new (biggest)** | L | **84 → 94** |
| **8** | **Benchmark dataset** — sector / margin-by-volume-bracket reference data + confidence model (feeds Monitor benchmark + Negotiate Phase 4) | Monitor, Negotiate | Net-new data | M–L | **94 → 97** |
| **9** | **Playbook + risk register** — counter-proposal playbook (reuse Ollama narrative path) + negotiation risk register | Negotiate | Net-new | M | **97 → 100** |

---

## Why this order

- **Steps 1–3 are cheap and high-leverage** — they reorganize and expose capability that already exists, so completion climbs fast for little code. Step 1 alone is mostly wiring + a 1-line route fix.
- **Steps 4–6 are engine-only** — new calculations over the existing `costing_engine`, no new datasets. Sensitivity/tornado is the best value-per-effort item in the whole plan.
- **Steps 7–9 are the genuine build** — Forecast is the single largest jump (**+10**) because it's the one area that's truly net-new (~5% today). Benchmarks and the playbook need new data / generation.

## Dependencies
- **Step 4 (FOB emission)** unlocks implied margin (Monitor) **and** the margin benchmark in Step 8.
- **Step 7 (Forecast engine)** unlocks the Negotiate "forward outlook" phase.
- Everything in Steps 1–6 builds on the already-solid `costing_engine.py`, `routers/portfolio.py`, and `routers/indexes.py` — no foundational rework.

## Fast-start option
If you want the biggest visible jump for the least effort: **Steps 1 + 5** (→ ~66% with a working workspace and live tornado/price-ladder negotiation analytics) before committing to the Forecast build in Step 7.
