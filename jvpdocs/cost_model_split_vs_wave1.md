# Cost-Model Split vs. Wave 1 — what changes, and is it worth doing now?

**Companion to:** `jvpdocs/cost_model_split_roadmap.md` + `cost_model_split_steps.md`
**Question:** of the 9-step workspace ladder, what actually belongs in **Wave 1**, and is the split useful given Wave 1's goal?
**Date:** 2026-06-24

---

## TL;DR

**Wave 1's goal is "Presentable & Sellable"** — *done when a prospect takes a self-serve demo seriously, IT has no blocking objection, and the brief looks usable.* It is **not** "the app does the analysis for you" — that's Wave 2 ("Intelligence").

The 5-area workspace (Monitor / Forecast / Negotiate analytics / benchmarks) is **mostly Wave 2/3 work**. Only a **thin slice is Wave 1-appropriate**, and most of *that* slice is already covered by two Wave 1 scrums still open: **Scrum 16 (onboarding)** and **Scrum 17 (inspectable numbers)**.

**Verdict:** Build **Step 1 (light)** + finish **Scrum 17** + **Scrum 16** now. Treat Forecast / Monitor-intelligence / sensitivity / benchmarks / price-ladder as the **Wave 2 backlog they already are** (Scrums 19–23, 29). Do **not** start the heavy workspace build during Wave 1 — the real Wave 1 blockers are security (9/10/11) and the landing page (12), not the workspace.

---

## Step ladder → Wave mapping

| Step (from ladder) | Maps to scrum | Wave | Wave-1 useful? | Feasibility |
|---|---|---|---|---|
| **1. IA reorg + quick wins** (route `Squeeze`, `Products` in nav, cross-links, "always-live" framing) | 14 (no dead ends), 16 (onboarding) | **1** | **Yes — directly aids presentability/demo** | Trivial for the route/nav fixes; the *full* global workspace shell is bigger and only partly Wave 1 |
| 2. Portfolio grouping / stat cards / triage | 19 (auto gap flagging), 20 (priority matrix) | **2** | Marginal (polish only) | Easy, but it's Wave 2's headline |
| 3. Indexes metadata (provider/frequency/sparkline/"in use") | — (polish); loosely 33 | 1–2 | Minor demo polish | Easy |
| 4. Monitor enrichment (invoice status, drift trend, FOB → implied margin) | 19, 23 (supplier benchmarking) | **2** | No | Moderate (FOB emission is new) |
| 5. Sensitivity/tornado + price ladder | 29 (negotiation aid) | **3** | No (Squeeze already exists for Wave 1) | Engine-only, but a Wave-3 feature |
| 6. Negotiate 8-phase shell + exports | 29 | **3** | No | Large |
| 7. **Forecast engine + area** | 21 (predictive forecasting) | **2** | No | Large — net-new |
| 8. Sector/margin benchmark dataset | 23, 31 (trust grading) | **2–3** | No | Net-new data |
| 9. Counter-playbook + risk register | 29 | **3** | No | Net-new |

**Plus the Wave-1 scrums the ladder didn't name but should drive instead:**

| Wave 1 scrum | Status | Relation to the "split" |
|---|---|---|
| **16 — Self-serve onboarding** | 🔴 (empty-states partial) | This *is* the Wave 1 version of the workspace polish: empty states, "load example data", onboarding checklist, reach a gap insight unaided |
| **17 — Inspectable numbers** | 🔴 | This *is* the Wave 1 version of the Negotiate "itemized FOB→landed breakdown" (Step 6's substance) — index value, weight, ratio, FX/unit/Incoterm, sums-to-total |
| 9 — Hardened OAuth | 🟡/🔴 | Unrelated to the split; **a real Wave 1 blocker** |
| 10 — Data-security story | 🔴 | Unrelated; **real Wave 1 blocker (IT objection)** |
| 11 — SOC 2 groundwork | 🔴 | Unrelated; depends on 10 |
| 12 — Landing page | 🟡 | Unrelated; deploy + SEO pending |

---

## What actually changes for Wave 1

**Do now (cheap, on-theme, advances open Wave 1 scrums):**
1. **Step 1 (light)** — route the existing `Squeeze` page, add `Products` to the nav, and cross-link the per-cost-model pages so the core loop has *no dead ends* (Scrum 14 criterion) and is discoverable. Skip the full global tabbed shell for now.
2. **Scrum 17 — Inspectable numbers** — the should-cost breakdown (index/weight/ratio/contribution + FX/unit/Incoterm, summing exactly). This is the single most demo-credible piece and is genuinely Wave 1. It also *is* the substance behind the mockup's Negotiate "Phase 1 itemized breakdown."
3. **Scrum 16 — Self-serve onboarding** — empty states everywhere, "load example data", a progress checklist, first gap insight without guidance.

**Defer (it's Wave 2/3, not Wave 1):** the global 5-area workspace shell, Monitor intelligence columns, sensitivity/price-ladder UI, the Forecast engine, benchmark datasets, the playbook/risk register. Keep `cost_model_split_steps.md` as the **Wave 2 plan**.

**Don't let the workspace distract from the real Wave 1 finish line:** Scrums **9, 10, 11** (security/SOC2) and **12** (landing live + indexed) are what "IT has no blocking objection" and a public demo actually require.

---

## Is the split useful? (feasibility + usefulness)

- **As a north star: yes.** The 5-lens framing is coherent and the engine already supports it — that's why completion is ~55%, not 40%. It's the right Wave 2 target.
- **As Wave 1 work: mostly no.** Four of five lenses are Wave 2/3 capability ("the app surfaces where to look"). Pulling them into Wave 1 would *lower* the odds of the Wave 1 goal (a secure, polished, sellable core loop) by spending effort on intelligence features before the security story and landing are done.
- **Feasibility of the Wave-1 slice: high.** Routing Squeeze + Products-in-nav are ~1-line fixes; Scrum 17 is pure presentation over the existing engine (the numbers already exist in `calculate_should_cost`/drivers); Scrum 16 is empty-states + a seed-data path.
- **Risk of the heavy slice during Wave 1: high.** Forecast (Step 7) is a net-new engine; benchmarks need new data; the negotiate shell is large — all compete with the genuine Wave 1 blockers.

---

## Recommendation

1. **Now (Wave 1):** Step 1 *light* (route Squeeze, Products in nav, cross-links) → then **Scrum 17** → **Scrum 16**. In parallel, the real Wave 1 finish line is **Scrums 9 / 10 / 11 / 12**.
2. **Wave 2:** adopt `cost_model_split_steps.md` Steps 2, 4, 7 (Portfolio triage, Monitor intelligence, Forecast) — they *are* Scrums 19/21/23.
3. **Wave 3:** Steps 5, 6, 8, 9 (negotiation aid, benchmark/trust grading) — Scrums 29/31.

Net effect on Wave 1 completion: the useful Wave-1 slice nudges the *workspace* figure ~55→60 (Step 1) but, more importantly, closes **Scrum 16 and 17**, which is what actually makes the demo credible — without diverting from the security/landing blockers that define "Wave 1 done."
