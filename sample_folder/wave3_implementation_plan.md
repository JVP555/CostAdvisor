# Wave 3 index + content layer — plan for Scrums 74, 69, 75–80

## Context

`sample_idea/costadvisor-data/` has landed with the full July drop: 12 CSVs in `tables/`, 33 JSONs in `raw/`, two (empty) decision forms in `decisions/`, plus `README.md` and `DROP_2026-07_ANALYSIS.md`. This unblocks the eight tickets that were previously waiting on it — SCRUM-74 (five subtasks), 69, 75, 76, 77, 78, 79, 80.

Three data-analysis passes verified every claim the tickets and the DROP analysis make. Most hold. **Several load-stopping defects are not in DROP's list at all**, and two of DROP's own claims are wrong in ways that would break a loader. Those are captured in the Data Traps table below — it is the highest-value output of this research and should be read before writing any loader code.

**Two decisions already settled with the user:**
- A cost line points at a **type-code**; the series is reached through it. The resolution chain becomes a real queryable join.
- The empty `decisions/` basis columns load as **nullable**, and any cross-series arithmetic returns an explicit "basis not declared" state rather than a silently-wrong number.

**Standing instruction from the data's own README:** *"This is a snapshot. Row counts will change. The shape will not. Build against the shape, not the numbers."* Every test asserts on shape and invariants, never on row counts.

---

## Architecture: additive, not a rewrite

`DROP_2026-07_ANALYSIS.md` §1 is explicit — *"Nothing was replaced. The costing engine stays exactly as it is. New layers were added around it. If you find yourself deleting something that already works, stop."*

So the three layers arrive **alongside** the existing costing path, which keeps working untouched:

```
NEW  type_code           191 rows   resolution/proxy_status/swap_priority/ideal_index
        │ resolves_to (FK)
     commodity_indexes    (existing) ← becomes the price-series layer; gains
        │                              value_kind, base_period, agency, quoted_*
        ├── NEW index_card      132 rows   region/region_label/is_default_region
        └── NEW index_monthly_value        monthly grain; quarterly is DERIVED

FormulaTemplateComponent gains type_code_id (nullable FK) alongside the
existing commodity_id — additive, so data_resolver / costing_engine /
evaluate_weighted_template are not touched by this migration.
```

`IndexValue` (quarterly) stays exactly as it is. The new monthly table is the source of truth for the drop's series; quarterly views derive from it — verified exactly derivable (0.0000 max difference across all 1,516 quarterly rows).

---

## Data Traps — read before writing any loader

Ordered by how silently they fail.

| # | Trap | Impact | Handling |
|---|---|---|---|
| 1 | **`region='NA'` parses as NaN** in pandas defaults | Silently loses North America on 17 `index_commodities` + 18 `index_feeds` rows | `na_filter=False` / `keep_default_na=False` on every read |
| 2 | **Literal ASCII `·` instead of U+00B7** in 74 `combo_ids` + 412 `combo_lines` rows; **36 formula_ids appear in both styles** | Any dedupe or grouping on `combo_id` splits those formulas in two. Not in DROP's list | Normalise `'\\u00b7' → '·'` as the first read step |
| 3 | **Margin stated twice and disagreeing on 146 combos (13.8%)** — `combos.margin_pct` header vs the margin line's `weight_pct`, by −10…+10pts. Error propagates into `formulas.margin_pct_min/max`. Not in DROP's list | Wrong margin on 1 in 7 combos | **The line is authoritative** (weights sum to exactly 100 including it). Reconcile from the line, rewrite the header |
| 4 | **`proxy_status` diverges on 736 lines = 18.14% of all cost weight**; 103 of 191 type-codes affected, and 103 are not even internally uniform | `w_proxy`/`w_direct`/`coverage_tier` were all computed from the **line-level** value; adopting registry truth silently moves 461 combos | **Two columns, no winner.** Keep line-level (`is_proxy_line`) and registry-level (`type_code.proxy_status`) separately |
| 5 | **`type_code='fixed'` is a sentinel on 1,317 lines** and is absent from `type_codes.csv` | A naive FK check reports 1,317 broken references | Special-case before FK resolution; these are the margin + fixed-cost lines |
| 6 | **`loadable` is a pricing-completeness flag, not a schema flag** — exactly `(n_lines>0) AND no line resolution in {no_series, ambiguous}` | Filtering on it drops 197 combos for a *data-purchase* reason while admitting all 115 taxonomy-broken ones | Two orthogonal gates: schema-valid, and priceable |
| 7 | **`GLOBAL` does not exist anywhere in the data.** DROP #5 calls the 23 `GL` combos "a one-line fix" — false. `db_region` is blank on **all 1,079** rows and `region_basis.csv` is entirely empty | All 8 regions are unmapped, not just GL | Region mapping is a decision-form dependency, not a patch |
| 8 | **U+2212 MINUS SIGN** (not hyphen) in 13 `change_pct` values | `float()` throws | Sanitise; also affects log encoding on cp1252 |
| 9 | **Region is NOT parseable from the series key** — matches the card's region in only 66/85 cases; 23 of 28 `multi` cards sit on a region-tokened series. `-ppi`/`-wb`/`-mb` are *sources*, not regions | Parsing the key assigns wrong regions | **Region belongs on the card, not the series.** Series identity stays the opaque `commodity_key` |
| 10 | **`is_default_region` has 18 slugs with multiple defaults** (`lci-na` has 4) | `UNIQUE(slug) WHERE is_default` rejects the data | Do not enforce unique |
| 11 | **`feed_key` has two formats** — `slug\|region` (102) and bare slug (30 stubs) | Parsing assumes one | Branch on presence of `\|`; bare ⟺ `card_status='stub'` |
| 12 | **`no_series` still has a valid `resolves_to`** — it means "the target has no *numbers*", not "no target". Only the 3 `ambiguous` rows are blank | Modelling `resolves_to` as nullable-for-no_series is wrong | `resolves_to` NOT NULL for 188/191; nullable only for `ambiguous` |
| 13 | **`families.csv` has no code column at all**, and is *derived* (`n_formulas`/`n_combos` are counts). Row 1 is blank (root cause: `FOD-SORB-LIQ`, which also explains 3 other listed issues) | DROP #1 says the loader "expects codes" — there are none to supply | Synthesise slugs; regenerate from the **140-pair union** of formula- and combo-level taxonomy, not the shipped 132 |
| 14 | **`record_shape` is the discriminated-union tag.** The 17 `flat` records are one cohort behind ~6 of DROP's separately-listed problems (GL region, `·` in formula_id, absent margin, no synthesis route, series-shaped type codes) | Treating them as 6 problems means 6 partial fixes | Branch once on `record_shape` |
| 15 | **`volatility_pct` is editorial and self-contradictory** — `elec-cn` carries 12 on one card and 55 on another, same series. Not recomputable (r=0.34) | DB-7 must not import it | Recompute. Expect **48 cards' displayed numbers to visibly change** — that is a correct diff, not a regression |
| 16 | **The shipped volatility ladder does not fit this data** — max quantile deviation 14.1 against the actual 91-series distribution. 21 rungs, so the mockup's hardcoded ×5 step is accidentally correct today | A recalibration silently returns wrong percentiles | Derive step as `100/(len−1)`; **regenerate** the ladder in DB-7 |
| 17 | **`INDUSTRY_RULES.json` is unusable** — every regex serialised to `{}`. `_manifest.json` records 2,398 bytes; the file is 488 | ~1.9KB of regex source lost upstream | Cannot be recovered from this drop. Industry mapping becomes a decision-file task |
| 18 | **Three functionality vocabularies with ~zero overlap**: the 41-term taxonomy, a separate 22-term family/subfamily scheme (0 exact matches, 1 case-insensitive), and 880 distinct free-text names | A single "functionality" facet would have disjoint halves | Needs a 3-way crosswalk in the decision file, not a lookup |
| 19 | **Polymorphic arrays in `CURATED_CONTENT`**: `compliance[]` = 367 dicts + 31 bare strings; `applications[]` = 965 dicts + 53 nulls; `spec[]` = 118 strings + 1 dict; `substitution` body under `body` or `desc` | A typed loader throws mid-file | Normalise per-array before validation |
| 20 | **No `as_of_date`/`expires_at` fields exist anywhere** — the vantage date lives only in prose (220/249 entries say "June 2026") | SCRUM-76 cannot read expiry; it must synthesise | Store a synthesised `as_of_date`, and record that it was inferred |
| 21 | **HTML is not zero** — `AUTO_GROUPS.json` has 2,440 `<div>`, `INDEXES.json` 494 `<strong>`, `CURRENT_EVENTS_OUTLOOK` 104 markdown bolds | 76's "no HTML, so not a CMS" premise holds for the 5 main files only | Strip/escape on the three exceptions |
| 22 | **`\|\|\|` does not exist**; the only composite key is single-pipe `family\|subfamily` | 76's stated convention is unsupported by the data | Use single pipe |
| 23 | **Orphan rate is 19.6%, not ~15%**, in three kinds: `GRP-*` (36), formula-shaped-but-absent (43), legacy `F16-/F21-/F27-` (4) | A required FK drops a fifth of the content, reporting success | `subject_code` NOT NULL, `template_id` nullable — as the ticket says |
| 24 | **`share: 0` on 2,215 of 2,237 supplier rows (99.0%)** means *not disclosed* | Publishing "BASF — 0% market share" | Store a `disclosed` flag beside the number |
| 25 | **`SUPPLIER_ALIASES.json` covers 20.5% of names / 30.9% of rows** (185 of 901 distinct raw names), and 45 canonical values also appear as raw names | Not idempotent without a fixpoint pass | Treat as a seed, not the canonicalisation |
| 26 | **`_manifest.json` records one extraction failure** — object `"P"`, `computeFlagshipRegionIndex is not defined` | A whole object never extracted | Note as a known gap; nothing to load |

Also worth knowing: `_issues.csv` (1,390 rows) is a **carry-through register, not a work queue** — 97 problem strings over 37 templates, and its `key` column is polymorphic (8 rows key on a bare region name, not a combo id). `tables/_manifest.json.issue_summary` is an exact mirror, so the loader can assert the register round-trips.

---

## Sequence

Twelve work units. Every one is fully unblocked when reached.

### 1. Shared drop reader + settle the authority rules
**New:** `backend/app/services/drop/` — a reader that owns traps 1, 2, 5, 8, 19 in one place, plus the `_issues.csv` carry-through and the two authority rules (margin ← line; proxy_status ← both columns).
**Reuse:** mirror `app/services/sheet_roundtrip/`'s shape — a payload-agnostic mechanism plus registered per-file specs. Three loaders (74, 76, 77) consume this; building it once prevents three drifting copies.
**Done:** every CSV/JSON in the drop reads without a NaN, an escape artefact, or a type error, and `_issues.csv` round-trips against `issue_summary`.

### 2. DB-5 + DB-6 — three-layer schema + monthly grain
**One migration.** New `type_code`, `index_card`, `index_monthly_value`; `commodity_indexes` gains `commodity_key` (unique), `value_kind`, `base_period`, `agency`, `quoted_incoterm`, `quoted_named_place`; `FormulaTemplateComponent` gains nullable `type_code_id`.
Retire the region-split in `seed_index_metadata._new_base_and_region()` (`backend/seed_index_metadata.py:71`) — trap 9.
Tenancy: `commodity_indexes` has no `team_id` and no RLS today; the new tables follow it as platform-level. `IndexOverride`/`TeamIndexSource` key on **`(team_id, commodity_id, region)`** — note the `team_id` prefix the ticket omits.
**Done:** a type-code's full chain to its series is one query; a card sharing a series is representable; quarterly derives from monthly.

### 3. Loader v2
Loads type_codes → index_commodities → index_feeds → index_series, idempotently, with a per-table diff report. Handles traps 6, 7, 12, 13, 14. Preserves `swap_priority` A/B/C and `ideal_index` as distinct values (stop folding them into `retrieval_status` — `seed_index_metadata._new_retrieval()`).
Close first: the Phase-0 call on whether `seed_catalog`/`seed_combos` are retargeted or retired (they currently read two *different* workbook vintages — `scrum57` vs `scrum59`).
**Done:** second run produces an empty diff; the losing `proxy_status` is recorded rather than dropped; both variant combos load (uniqueness key becomes `(formula_id, region, variant)`).

### 4. Resolution + concentration query API
The four questions: what does this type-code resolve to and is it a proxy · which type-codes resolve to this series and what cost-weight share do they carry · why can't this combo be costed (per-line reason) · what breaks if this series is re-sourced.
This is what makes **"60 codes → Brent = 24.8% of all cost weight"** visible — verified exactly against the data.
Distinguish `resolved` / `no_series` / `ambiguous`; never collapse the last two.

### 5. SCRUM-80 — proxy derivation + swap backlog
Small now. The genuinely-missing piece is an **execution call site for `proxy_logic`** — verified written by two seeders, edited via `PUT /api/indexes/{id}/proxy-logic`, displayed in `DerivedIndexesModal.jsx`, and read by no computation. Reuse `compute_composite_value` (`data_resolver.py`) and `PROXY_OPERATIONS`. Add the current/stale/never-had-it distinction (today `scraped_temporal_carry_forward` carries no age, and that final tier **drops the region filter**). Rank the swap backlog by cost weight from #4. Un-hardcode `_NEW_BLOCKED_CODES`.

### 6. SCRUM-79 — trigger radar
Contract + clause model (genuinely absent — zero hits), notice deadline first-class, window store separate from `alert_events`. Consume `_gap_trigger` and `_buy_signal`; don't restate. Index-move feed groups by resolved series via #4 — that is what collapses one Brent move from ~60 near-identical events into one window.
**Fixes a live bug:** `celeryconfig.py`'s `beat_schedule` has five entries and none from `app.tasks.alerts` — alerts have only ever fired via manual POST.
Extend `TRIGGER_TYPES` (closed set today) and the scope columns (`cost_model_id`/`commodity_id` only). Reconcile thresholds behind one accessor. Forecast storage already exists here (`IndexProjectionRun`) — decide it vs the drop's in-band `kind` before DB-6's forecast columns are finalised.

### 7. SCRUM-76 — editorial blocks + versioning + the permission migration
`editorial_block` + `editorial_block_version`: `subject_code` NOT NULL, `template_id` nullable (trap 23), `region` nullable, `body_text`/`body_json`/`body_format`, four-state provenance.
Block-type vocabulary from the data: `functionalities`, `applications`, `suppliers`, `supplierNote`, `compliance`, `macroDrivers`, `substitution`, `supply`, `demand`, `feedstocks`/`reaction`/`note` (synthesis), current-events prose, plus index-keyed `INDEX_NARRATIVES`/`INDEX_SOURCE_META`. Precedence rule needed: `macroDrivers`/`substitution` appear in **both** `CURATED_CONTENT` and `FUTURE_OUTLOOK`.
**Carries the one permission revision** (`content.*` + `dimensions.*`). Follow `q8r9s0t1u2v3_add_formula_templates.py`. ⚠️ `has_permission` applies the **plan ceiling before roles** — new keys must also be granted in Dream Plan or they are silently denied for every non-super-admin team.
Strip author-to-self `supplierNote` text (`internal_note`) and flag prose with weights typed in (54 hits — trap: they drift silently).

### 8. SCRUM-77 — dimensions + alias layer + producer entity
`dimension_term` + `dimension_alias` + one polymorphic assertion join. Nullable `region` reusing `FormulaTemplateComponent.region` semantics. Platform-readable + team-fork RLS (**not** strict-tenant — under strict tenant every platform term is invisible and the facet looks broken).
**Owns the producer entity + alias layer** — pays off the gap Scrum 32 currently discloses as `resolution: "raw_supplier_name"`. `share` needs a disclosed-flag (trap 24).
Decision file (industry mapping, flag adjudication, producer canonicalisation) reuses the shipped `sheet_roundtrip` mechanism. Industry needs a normalisation layer: 204 distinct values against a 19-term taxonomy. Functionality needs the 3-way crosswalk (trap 18). `INDUSTRY_RULES.json` is unrecoverable (trap 17).

### 9. DB-7 — dossier storage + volatility calibration
Structured fields only (no prose — that is 76's). Driver rows carry correlation + lag + signal together. Producer role FKs to **77's** entity. Store the calibration ladder platform-level with a recompute path and a computed-at stamp; **regenerate**, don't import (traps 15, 16). Do not store the recomputable snapshots (`current_value`, `change_pct`, `cycle_pct`, `volatility_pct`).

### 10. SCRUM-69 — `index_seasonal_factor`
`(commodity_id, region, month, factor, method, window_months, computed_at)`, computed from the stored monthly series, idempotent recompute, season-note prose rendered *from* the factors. Regression check against the drop's `INDEX_SEASONALITY.json` for the 91 series with full history — the 30 forecast-only series have no Jan-2023 anchor, so their base is undefined and must be handled explicitly.

### 11. SCRUM-78 — expert sign-off + trust state
`reviewed_by` → users FK (pattern: `models/access_request.py`). Sign-off fingerprint so a combo returns to the queue when inputs move. Cross-library queue endpoint (near-precedent: `sheet_roundtrip/formula_coverage_price.py::query_rows`). Move review onto 76's approve key — today it gates on `formulas.edit`, so the weight author can vouch for their own work. Platform-grain audit without borrowing a tenant (`_first_team_id` currently picks an arbitrary team, or silently skips).
The grade derivation now has **real** inputs from #4: resolution state, proxy status (both columns), and weight closure. `coverage_tier` becomes two columns (shipped worst-retrieval-tier + the drop's P1/P2/P3 proxy density) — never one with a bigger vocabulary.

### 12. SCRUM-75 — intelligence derivation service
Multi-period series over `evaluate_weighted_template` (already the right grain for one quarter) at combo grain — not `calculate_evolution`'s CostModel grain. Components, %-change, cycle position (**three** verdicts at 70/40 + a fourth flat-series case), seasonality from #10, volatility percentile against #9's ladder, trust grade read from #11.
**Fixes a live bug:** `IntelligenceDetailArea.jsx:75-81` computes the percentile over whatever history length exists while hardcoding "24-month", and splits 70/30 two-way. One constant must drive both the verdict text and the label, with a test asserting they agree.
Decide the read path first (denormalised endpoint vs materialised rows vs a documented query budget) — today `IntelligenceArea.jsx` fires one POST per visible card, which does not scale to the platform catalogue.
Carry the margin-inside-100 convention; `coverage.margin_pct` is descriptive and re-applying it double-counts.

---

## Cross-cutting

- **Parallelisable:** #7 (76) is independent of #2–#6 and can run alongside them. #6 (79)'s contract half is independent of everything.
- **Tests assert shape, never counts** — per the data README. Pin invariants (weights sum to exactly 100; base period = 100; contributions sum to level; quarterly = mean of monthly) rather than 1,079 / 5,747 / 191.
- **Not code:** the two `decisions/` forms, and buying the three missing series. On that last point — DROP claims buying `ELEC-US-PPI` + `RG-US` + `NATGAS-US` "fixes 117 of 251 lines", which is exact on line count but **only 30.6% of the no-priceable weight (2.18% of total)**; higher weight-per-line targets are `COCO-WB`, `RG-US`, `FA-US`, `SI-MB`, `LIME-US`.

## Verification

Per work unit: `alembic upgrade head` → `downgrade -1` → `upgrade head`, then the unit's own tests plus the full suite (currently 298 passing) from inside WSL. Loaders additionally: run twice, assert an empty second diff. `#4`'s concentration query is verified against the known answer — 60 codes resolving to Brent carrying 24.8% of indexed cost weight. Frontend untouched until #12; `npm run build` when it is.
