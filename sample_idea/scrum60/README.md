# CostAdvisor — Reference Database Handoff
**Package date:** 2026-06-30
**Status:** MVP-ready, pending expert chemistry review

This package contains the three core reference databases plus supporting artifacts produced during a full retrieval and integrity audit. All files are internally consistent as of this date — they were generated from a single pass and should be treated as a matched set, not mixed with earlier versions from prior handoffs.

---

## What's in this package

| File | Status | Description |
|---|---|---|
| `db_index_feeds.html` | ✅ Final | 158 index feeds, each tagged with data retrieval status |
| `db_formula_combinations.html` | ✅ Final | 676 regional cost-line combinations, corrected and confidence-tagged |
| `formula_master.html` | ✅ Regenerated | 91 product rows, rebuilt programmatically from the combinations data |
| `formula_tier_lookup.json` | ✅ Final | JSON join table: `formula_id → {coverage_tier, data_confidence}` |
| `correction_plan_log.json` | ℹ️ Reference | Audit trail of every cost-line correction made and why |

---

## 1. `db_index_feeds.html`

Each of the 158 index records now carries four new fields:

- **`retrieval_status`** — one of `free`, `good_proxy`, `weak_proxy`, `blocked`
- **`free_source_name`** — the free/public alternative identified (World Bank, EIA, Eurostat, FRED, Methanex, GFEX, SunSirs, etc.)
- **`free_source_url`** — link to that source where applicable
- **`proxy_logic`** — for non-direct sources, the coefficient or relationship used to derive a proxy value

**Distribution:** 51 free · 81 good proxy · 24 weak proxy · 2 blocked (ilmenite, rutile — no viable free alternative exists for either; these remain genuinely subscription-only).

The UI has a Retrieval filter dropdown and live header stats. Use this file as the single source of truth for "can we calculate this without a paid data subscription."

---

## 2. `db_formula_combinations.html`

This is the file that received the most significant rework. Three things happened here, in order:

### a) Weight integrity fix
The original file had **566 of 676 combinations** (84%) where cost-line weights didn't sum to 100% — ranging from -28% to +25% deviation. This was a real, systemic authoring gap (missing raw materials or reactants), not rounding noise — confirmed because every formula's deviation was *constant* across all its regional variants, meaning the error was baked in once per formula, not introduced at the regional level.

**All 676 combinations now sum to exactly 100%.**

### b) Confidence tagging
Every combination carries a new `data_confidence` field: `CONF-HIGH`, `CONF-MED`, or `CONF-LOW`.

- **CONF-HIGH (438 combos / 107 formulas):** oleochemicals, surfactants, resins, solvents, agrochemicals, base chemicals. Missing lines were identified via real process chemistry (e.g. phosgene for polycarbonate, hydrogen for HCl synthesis, salt+limestone for Solvay soda ash) and added explicitly with industry-benchmarked weights.
- **CONF-MED:** specialty polymers, performance chemicals, pigments, fluids, silicones. Missing catalyst/initiator lines added; the underlying single dominant feedstock was proportionally scaled to close the gap.
- **CONF-LOW (99 combos / 83 formulas):** nutrition actives, aroma chemicals, biocides, crop protection chemicals. These are thin, often proprietary specialty markets with no reliable public cost-share data. The fix here is **pure proportional scaling of the existing feedstock line** — mathematically correct, chemically unverified. **Treat every number in this tier as a placeholder, not a fact**, until a domain expert reviews it.

**This confidence tag is a literal review priority queue.** Filter to `CONF-LOW` first.

### c) Expert review tracking
Every combination now also carries:
- **`expert_reviewed`** (boolean, defaults `false`)
- **`reviewed_by`** (string, null until set)
- **`reviewed_at`** (ISO timestamp, null until set)

The UI has a checkbox per row that toggles `expert_reviewed` live, plus a header counter ("Expert reviewed: X / 676") and a filter to isolate unreviewed rows.

> ⚠️ **Known limitation:** review-checkbox state is in-memory only (JS array, not persisted). Refreshing the page resets all checkboxes. This is fine for read-only review sessions but **not yet wired to a backend** — if continuous review tracking across sessions is needed, this needs a database or export/import mechanism before relying on it operationally.

### Coverage tier (carried over from index work)
Each combination also has `coverage_tier`, derived automatically by joining its cost-line index references against `db_index_feeds.html` and taking the worst tier among them (a combination is only as strong as its weakest input). **97 free · 450 good proxy · 122 weak proxy · 7 blocked** (the 7 blocked are all TiO₂ sulfate/chloride process combinations — ilmenite/rutile dependency, no fix possible without a Metal Bulletin subscription).

---

## 3. `formula_master.html`

This file was **completely regenerated**, not edited. Two structural problems made the original unsalvageable as-is:

1. The original covered only **78 of 257 formulas**, across only **15 of 22 families** that exist in the combinations database. Seven entire families (Industrial Gases, Animal & Human Nutrition, Rheology Modifiers, Chelating Agents, Biocides, Aroma Chemicals, Crop Protection) had zero representation.
2. The original had no `formula_id` attributes and used product names that don't map cleanly to the combinations file's naming (e.g. master's "Fatty acids" vs. combos' "Fatty acids saturated C16/C18" + "Fatty acids unsaturated oleic C18:1") — there is no reliable automated join between the two without rebuilding one from the other.

**What changed:** the new file is built programmatically, one row per **subfamily** (91 rows total, vs. the original 78), which is the natural product-level grain in the combinations data. Each row aggregates all formula variants underneath it and shows coverage/confidence badges derived live from the combinations file.

**What was dropped:** the original hand-authored subtitles (e.g. "Lauryl / myristyl alcohol") and the P1/P2/P3 priority tier column. These were business-judgment fields that don't exist anywhere in the combinations data, and a partial carryover (covering only the original 78) would have been inconsistent and confusing applied against the other 179 new rows. **This needs a business pass to re-assign priority tiers and descriptive subtitles** — that's tracked as open work, not something the regeneration could solve.

**Going forward, this file should not be hand-edited again.** Treat `db_formula_combinations.html` as the source of truth and regenerate `formula_master.html` from it whenever the combinations file changes, the same way this version was built. A short script to automate this regeneration would be a reasonable next engineering task if this file needs to update frequently.

---

## 4. `formula_tier_lookup.json`

Flat JSON: `{ formula_id: { name, family, coverage_tier, data_confidence, n_combos } }` for all 257 formulas. Useful if any other tool (e.g. the Intelligence tab UI) needs to pull confidence badges without parsing the full combinations file.

---

## 5. `correction_plan_log.json`

The full rationale log for every line added or reweighted during the integrity fix — which formula, what was missing, what weight was assigned, and why. This is the working document for the expert review pass: each entry is something a domain expert can mark agree/disagree/adjust against, rather than having to reverse-engineer the reasoning from scratch.

---

## Outstanding work (not done in this pass)

- **`index_list.html` is deprecated — do not use.** It's an earlier, smaller snapshot of the index database (139 records vs. the current 158 in `db_index_feeds.html`), missing the full LCI/PPI fixed-cost escalator layer (20 records) plus a handful of other commodity feeds added since. It also has one orphan record (`IDX-CPO-CN`) not present anywhere else. It is **not included in this package** and should be deleted from the project or, if it serves a distinct display purpose, regenerated as an export view of `db_index_feeds.html` rather than maintained separately.
- **Expert chemistry review** of all `CONF-LOW` (83 formulas) and `CONF-MED` (67 formulas) entries — this was always intended to require domain expert sign-off, not automated verification.
- **`formula_master.html` priority tier (P1/P2/P3) and subtitle re-assignment** — business decision, needs input from product/commercial side.
- **Persistence layer for `expert_reviewed` tracking** — currently in-memory only in the browser.
- **MPOB and SunSirs commercial licensing status** — confirmed as needing a direct conversation with each provider before their data can be used in a paying product; not resolved in this package.
- **Iron scrap India (`IDX-FE-MB-IN`)** and **ilmenite/rutile** — no free alternative found; these remain the only genuinely unresolvable gaps in the index database.
