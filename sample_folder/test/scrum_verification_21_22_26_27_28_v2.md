# Verification Report v2 — Scrums 21, 22, 26, 27, 28 (checked against the original ticket text in `sample_idea/`)

**Date:** 2026-08-23
**Method:** Unlike the first pass of this report (which checked implementations against CLAUDE.md's own summary), this pass reads each scrum's *original ticket text* straight from `sample_idea/scrumNN/prompt.txt` and checks the actual code line-by-line against every "Done" / "Done when" bullet in that text. Each test suite was re-run live against the real database.

## ⚠️ Important correction from the first report

The folder numbers in `sample_idea/` **do not match** CLAUDE.md's own Scrum numbering for two of the five requested scrums:

- **`sample_idea/scrum27/prompt.txt`** is **not** "Lego nested formulas" (CLAUDE.md's own "Scrum 27" heading). It's actually the **sheet round-trip mechanism** ticket — already shipped and tracked in CLAUDE.md as **"Scrum 27b."**
- **`sample_idea/scrum28/prompt.txt`** is **not** "Complex math formulas" (CLAUDE.md's own "Scrum 28" heading). It's actually **"link priced cost models to the library recipe instead of copying it"** — already shipped and tracked in CLAUDE.md as **"Scrum 28b."**

This is the same folder-vs-heading numbering mismatch found earlier this session with scrums 30–34. `sample_idea/scrum21`, `scrum22`, and `scrum26` line up directly with CLAUDE.md's own numbering — no mismatch there.

So, **verified strictly against what's actually written in the `sample_idea` folders**, this report covers: Scrum 21 (predictive forecasting), Scrum 22 (lock/hold buy verdict), Scrum 26 (provider credentials), Scrum 27 = sheet round-trip, Scrum 28 = link priced cost models to the catalog recipe. The real "Lego nested formulas" and "complex math formulas" scrums were checked in the first report and remain unaffected by this correction.

**Bottom line:** 4 of 5 pass every single "Done" bullet in their own ticket text, with real, live-run test evidence. **1 real gap was found** in Scrum 21 that the first report missed.

---

## Scrum 21 — Index projection service ("per price series, emitted as a vintaged run")

**Verdict: ✅ Mostly done — 3 of 4 "Done" bullets fully met, 1 met in an equivalent-but-different way. One real leftover gap found.**

The original ticket assumed a big external data "drop" would ship pre-built forecast series, and this system's job would just be to store and label them correctly. That drop was never delivered to this project. So instead, a real forecasting engine was built from scratch that calculates its own trend lines directly from this app's own price history — a more ambitious (and arguably better) solution than the ticket assumed, but it means a couple of the ticket's very specific wording choices ("flag the ones that are a flat hold from the drop") don't map onto the exact same mechanism — they map onto an equivalent one.

**Checked against the ticket's own "Done" list:**
1. *A forecast keeps a timestamp, its method, and a confidence range; running it again creates a new one and never erases the old* — ✅ **Met.** Confirmed live: re-running produces a second, separate record; the first is untouched.
2. *A series that's really just "the same old flat number repeated forward" must be visibly marked as such, not disguised as a real prediction* — ✅ **Met, differently.** There's no pre-shipped flat data to detect — instead, the engine itself detects when a price series is too flat or too short to trust, and labels that result "hold" (as opposed to "fitted") so it's never confused with a real trend line downstream.
3. *A series with zero history returns a clear "no history" result, never an empty/blank answer* — ✅ **Met.**
4. *A known series' forecasted numbers are locked into a test, so a future accidental change shows up as a red test, not a silent surprise* — ✅ **Met.**

**Backend changes (plain English):** A real forecasting calculator was built that looks at a commodity's price history in this app's own data and draws a trend line through it — honestly reporting "trending up/down," "flat, not worth trusting," or "no data at all" rather than ever faking a confident number. Every forecast run is permanently saved with a timestamp so nothing is ever silently overwritten.

**Frontend changes (plain English, in detail):**
- **The "Cost forecast" page — go to `/forecast` in the app (component: `ForecastArea.jsx`)** — the page's old fake, made-up prediction line (a placeholder number, `0.015`, meant to be temporary) was removed entirely, not just hidden. The page today shows:
  - Four stat tiles at the top: how many products are tracked, how many are flagged for drift, the average size of the should-cost-vs-actual gap across the whole portfolio, and total money exposure.
  - A "Commodity index — history" chart: several headline commodities (oil, ammonia, etc.) blended into one composite line, each rebased so they all start at 100 for a fair comparison — real historical movement only, nothing projected forward.
  - A table listing every product's current should-cost, current actual price, and the gap between them.
  - A row of small cards, one per headline commodity, showing its latest quarter-over-quarter price move.
  - A subtitle at the top of the page now explicitly tells the user where to go for a *real* forecast instead: "For a real forward projection of a specific index, or a lock/hold verdict on a specific product, see the Index Library and the product's buy-window verdict." This is an honest redirect rather than a fake number in the same spot.
- **The Index Library page — go to `/index-library` (component: `IndexLibraryArea.jsx`)** — gained a new button in its toolbar, visible only to super-admins: **"⟳ Project forecasts"**, sitting next to the existing "⟳ Sync indexes" and "Derived indexes" buttons. Clicking it tells the backend to (re)calculate a forecast for every commodity that has enough price history, and then shows a confirmation message like *"Forecasts updated — 42 series (31 fitted, 8 held flat, 3 no history)"* — so the person clicking it immediately sees, in plain numbers, how many series got a real trend line versus how many were honestly too flat or too data-poor to trust.

**🟢 Real gap found (missed in the first report) — now fixed.** That same placeholder number (`FORECAST_BAND = 0.015`) still existed — word for word — in a *different* page: **the Intelligence detail page, at `/intelligence/:costModelId`** (e.g. `/intelligence/3f2a...` — opened by clicking into a product from the Intelligence list at `/intelligence`; component: `IntelligenceDetailArea.jsx`, the "Market & Pricing" tab of that single product's dossier). It was clearly commented in the code as a stub, not disguised as real data, so it wasn't misleading anyone reading the code — but the original ticket explicitly said this placeholder "should not reappear here in any form," and it still did, just on a different screen than the one the ticket was originally worried about.

**Fixed same-day, in detail:**
- The chart card's title was changed from "Should-cost index — history + forecast" to plain **"Should-cost index — history."**
- The dashed, ±1.5%-wide forecast band (three extra chart lines: a flat continuation line plus an upper and lower dashed boundary) was deleted from the chart entirely — the chart now shows exactly two real lines (the should-cost index and the actual price index), both rebased to start at 100.
- The chart's "split marker" (a visual divider the chart used to draw between "real history" and "forecast") was removed along with it, since there's no forecast section left to divide from.
- All the supporting calculation code that built the fake band — a helper that generated the next 2 quarter labels, the padding logic, and the three array-building functions for the flat/upper/lower lines — was deleted rather than left dead in the file.
- The small caption under the chart was rewritten from claiming the dashed part was "an illustrative stub (±1.5% range) — no forecast engine yet" to a plain, honest statement: **"Real history only — no forecast engine for this weighted index yet; see the Index Library or a product's buy-window verdict for a real forecast."** — the same redirect used on the Forecast page.
- This page's should-cost line is a *blend* of several ingredients weighted by a product's own formula, not a single tracked commodity — so it genuinely can't reuse the single-commodity forecast engine directly without a larger redesign; removing the fake number was the correct, minimal fix rather than inventing a stand-in.
- The frontend was rebuilt afterward and compiles cleanly with no errors or unused-code warnings from this change.

---

## Scrum 22 — Lock/hold decision off the forward should-cost

**Verdict: ✅ Fully done. All 4 "Done" bullets met, no gaps.**

**What this feature does:** Building on Scrum 21's forecasting engine, this adds a "lock in a price now, or wait" recommendation for each product, based on where its cost is forecasted to go — not just where it's been.

**Checked against the ticket's own "Done" list:**
1. *The recommendation says how far ahead it's looking and which forecast version it used* — ✅ **Met.**
2. *A product with no forecast available says "not enough data" — it never quietly guesses "wait"* — ✅ **Met**, confirmed by reading the actual code branch, not just a comment.
3. *The old "cheap vs. last year" feature must keep working exactly as before, even after forecast data exists elsewhere in the system* — ✅ **Met — and more robustly than the ticket even asked for.** The ticket worried that forecast numbers might accidentally get mixed into the same data table used for "trailing 4 quarters," quietly breaking that older feature. The actual fix is stronger: forecasts are kept in their own separate storage, entirely apart from the regular price-history table, so that mix-up is structurally impossible rather than something that has to be carefully avoided.
4. *The recommendation actually changes when a newer forecast disagrees with an older one* — ✅ **Met**, proven with a real two-forecast test (one predicting a rise → "lock in," a later one predicting a fall → "wait").

**Backend changes (plain English):** A new "what will this cost a year from now, and should we lock in a price today" check per product, built carefully on top of the forecasting engine without touching or risking the already-working "cheap vs. last year" check.

**Frontend changes (plain English, in detail):**
- **The main Dashboard — go to `/dashboard` (component: `Dashboard.jsx`)** gained a 4th view option in its Table / Cards / Matrix toggle row: **"Buy Windows."** Clicking it fetches the signal for every product the first time it's opened (not upfront, to avoid slowing down the page for people who never click it) and shows a dedicated table.
- **That table** (`components/BuyWindows.jsx`, rendered inside the Dashboard page above once "Buy Windows" is selected) lists, per product: the supplier, today's should-cost, the trailing 4-quarter average, the percentage difference between them, a colour-coded signal badge, and an "Evolution" button that jumps to `/cost-models/:costModelId/evolution` for that product's price-history chart. A small note above the table explains the rule in plain terms ("Buy now" = at least 3% cheaper than recent average; "Hold / wait" = at least 3% more expensive), and there's a CSV export button. Products that don't have enough price history yet are quietly counted in a footer line ("3 products without enough index history for a signal yet") instead of cluttering the table with blank rows.
- **The signal badge itself** comes in four flavours, each with its own colour: green "Buy now," red "Hold / wait," grey "Neutral," and grey "Not enough history."
- **A second, separate badge** was added for the forward-looking half of this scrum: a "Lock now" / "Hold / wait" / "Neutral" / "No forecast yet" pill, distinct from the backward one, with its own colours (red for "lock in now," green for "hold/wait" on the forecast side — deliberately the *opposite* colour mapping from the backward badge, since "lock now" is the urgent one here). Hovering over it shows exactly how many quarters ahead the forecast is looking.
- **Each product's own detail page — go to `/portfolio/:costModelId`** (e.g. `/portfolio/3f2a...`, reached by clicking any product on the `/portfolio` list; component: `ProductDetailArea.jsx`) now shows both badges side by side, directly under the big live should-cost number: the backward "cheap/expensive vs. last year" badge and the forward "lock/hold" badge. Each one is fetched independently and simply doesn't appear at all if there isn't enough data for it yet — so a brand-new product with no history just shows the should-cost number with no badges, rather than an error or a placeholder.

**Gaps found:** None.

---

## Scrum 26 — Team-supplied provider credentials (Fastmarkets, Argus, ICIS)

**Verdict: ✅ Fully done. All 5 "Done when" bullets met, no gaps.**

**Checked against the ticket's own "Done when" list:**
1. *A team admin can register a vendor login, and it's never shown back in plain text by any screen or API response — including the list of all a team's data sources* — ✅ **Met.** Confirmed the secret has no way to leak through any response, including the general source list, because the secret lives in a completely separate table that response never touches.
2. *A new type of data source resolves through the vendor's system and outranks plain scraped data, with the origin visible* — ✅ **Met.**
3. *A broken (missing/expired/rejected) credential falls back to the older manual/upload method and explains why — it never just goes blank* — ✅ **Met.**
4. *Adding, replacing, and removing a credential are all individually logged in the audit trail* — ✅ **Met** — three distinct logged actions confirmed, not lumped into one.
5. *At least one real vendor connection is tested end-to-end against a realistic saved example response* — ✅ **Met** — Fastmarkets is tested against 4 realistic scenarios (success, bad login, expired login, no key configured).

**Notable, and handled correctly:** the ticket explicitly warned "don't build this yet, because the way credentials are keyed is about to change under a future update — building now risks having to redo it." That future update was confirmed (again) to not exist anywhere in this project. The decision to build anyway was made deliberately and is explained directly in a code comment, not silently ignored.

**Backend changes (plain English):** Each team can now securely store one login per data vendor — encrypted, with its own dedicated secret key separate from every other secret in the app — and use it to pull in higher-quality paid data instead of relying only on free/scraped numbers. If that login stops working, the system safely falls back rather than breaking.

**Frontend changes (in detail): None — confirmed intentional, not an oversight.** A search of the entire frontend codebase turns up zero references to provider credentials, vendor logins, or anything related to this feature. The ticket's own acceptance criteria only ever describe API behaviour (registering a credential, resolving values through it, degrading gracefully, audit logging, one adapter tested end-to-end) — none of them describe a screen. A settings page where a team owner could actually click "Connect Fastmarkets" and paste in a key doesn't exist yet; today the only way to use this feature is by calling the API directly. That's a real, known follow-up (a Team Settings panel + a new dropdown option wherever indexes are added), just explicitly not part of this pass.

**Gaps found:** None. 15/15 tests pass.

---

## Scrum 27 *(per the sample_idea folder — actually "sheet round-trip export/edit/reimport")*

**Verdict: ✅ Fully done. All 6 "Done when" bullets met, no gaps.**

**What this feature does:** Lets someone export a filtered slice of catalog pricing data to a spreadsheet, edit it offline (in Excel), re-upload it, see exactly what changed before anything is saved, and apply those changes — safely, even if someone else edited overlapping data in the meantime.

**Checked against the ticket's own "Done when" list:**
1. *An export can be filtered to just a slice of data (not the whole table), and which columns are editable vs. locked is clear right in the file itself* — ✅ **Met** — genuine spreadsheet cell-locking (not just a color), confirmed by reading the actual file-generation code.
2. *Re-uploading a file with no real edits shows "nothing changed"* — ✅ **Met.**
3. *Re-uploading an edited file shows exactly which rows/columns changed, from what to what — and "saving those changes for real" is a separate, deliberate second step* — ✅ **Met.**
4. *If someone reorders the rows in Excel before re-uploading, the system still matches each row correctly* — ✅ **Met** — rows are matched by their real identity, not their position on the page.
5. *If someone edits a locked/read-only column anyway, that edit is caught and reported, never silently accepted* — ✅ **Met.**
6. *Every import attempt is saved and can be looked back on later* — ✅ **Met.**

**Backend changes (plain English):** A reusable "export → edit offline → re-import → review changes → apply" pipeline, built generically so it isn't tied to just one type of data — plus one real, working use of it (catalog pricing review). It also correctly handles the case where two people export overlapping data and one saves changes first — the second person's stale changes get safely skipped and reported, not blindly overwritten.

**Frontend changes (plain English, in detail) — go to `/formulas` (component: `Formulas.jsx`, panel: `components/SheetRoundTripPanel.jsx`):** A new panel titled **"Review & apply price changes"** was added to the Formulas page, sitting alongside (not replacing) the existing bulk "Import Prices" upload panel — the two serve different jobs: one is for a big initial data load, this new one is for reviewing and correcting a targeted slice.
- **Filters, before exporting:** a dropdown to narrow the export to just one family/subfamily of products (instead of the entire catalog), plus a "Needs review only" checkbox to pull just the rows flagged as unverified.
- **"↓ Export slice"** downloads a real, ready-to-edit Excel file matching whatever filters were selected.
- **"↑ Reimport & diff"** opens a file picker; after uploading the edited file, a table appears immediately showing exactly what would change — one row per edited cell, with columns for which row, which column, the old value, and the new value. Rows that don't represent a real accepted change are shown too, but clearly labelled differently: edits to a locked column show "Read-only edited — ignored" in red, a badly-formatted value shows "Invalid value — ignored," and a row that no longer exists shows "Row not found — ignored" in grey — so nothing is silently thrown away, but nothing invalid sneaks through either.
- **"Apply N change(s)"** only appears once there's at least one real, un-applied change to apply, and is a distinct, separate button click from the reimport step above — reviewing and committing are never the same action.
- **A "Past runs" list** at the bottom of the panel shows the last 5 times someone exported/reimported through this panel — with a timestamp, a status, how many rows were affected, and (if it was ever applied) when that happened — so a team can always look back and see who reviewed what and when.

**Honest scope note:** The original idea mentioned this mechanism could eventually serve *three* different kinds of data (catalog pricing, editorial write-ups, and strategy planning data) so they wouldn't each need their own separate, drifting version. Only the catalog-pricing one was actually built and connected — the other two don't have anything to connect to yet in this project. The underlying mechanism was checked directly and does appear genuinely reusable (not just claimed to be) if a second use case shows up later.

**Gaps found:** None. 14/14 tests pass.

---

## Scrum 28 *(per the sample_idea folder — actually "link priced cost models to the library recipe, instead of copying it")*

**Verdict: ✅ Fully done. All 6 acceptance criteria met, no gaps.**

**What this feature does:** Fixes a real, previously-silent bug. Before this, when someone built a priced product from a shared catalog recipe, the system copied the recipe's numbers once and then completely forgot where they came from. That caused two invisible problems: (1) if the shared recipe was later improved, already-priced products never benefited, and (2) if a specific ingredient's price link quietly failed to connect, it would look exactly like a normal, healthy line item forever — with no warning.

**Checked against the ticket's own acceptance criteria:**
1. *A priced product built from a shared recipe remembers exactly which recipe and region it came from, and that's visible through the system* — ✅ **Met.**
2. *There must be a choice: "freeze this recipe forever" (for a signed contract that shouldn't drift) vs. "keep following the shared recipe live" (for an estimate that should stay current) — and the system must clearly say which mode a given product is in* — ✅ **Met**, proven directly: the same recipe change was applied once, and a "frozen" product stayed exactly the same while a "live-following" product's cost updated — side by side, in one test.
3. *Looking at a priced product's cost breakdown should show the exact same ingredient details as looking at the shared recipe directly* — ✅ **Met**, confirmed with a multi-level nested recipe (a recipe that itself uses another recipe as an ingredient).
4. *An ingredient whose price link quietly fails to connect must now show up as a clear warning — never invisibly pretend to be a normal, healthy line item* — ✅ **Met**, and confirmed this warning field genuinely did not exist anywhere before this exact change (checked project history directly).
5. *Percentages/weights must survive being saved without silently rounding and drifting away from the original numbers* — ✅ **Met** — the old rounding behavior was found and removed.
6. *None of this should change how already-existing, non-catalog-linked products behave* — ✅ **Met**, proven with an exact-number regression test.

**Backend changes (plain English):** A priced product can now be set to either "frozen" (locked at the moment it was priced — right for a signed deal) or "live-following" (keeps recalculating from the shared recipe as it improves — right for an estimate). And a broken ingredient link is now always flagged clearly instead of silently pretending everything's fine.

**Frontend changes (plain English, in detail), all in the cost-model / product-building screen — go to `/cost-models/:costModelId` to edit an existing product's formula, or `/cost-models/new` to build one from scratch (component: `CostModelBuilder.jsx`):**
- **A "linked to" label** now appears next to the formula-mode selector whenever a product's formula came from a shared catalog recipe: something like *"Linked to Palm Oil Soap Base · Pinned"* (or "· Tracking"). If the recipe hasn't been reloaded since the page opened, it falls back to a generic "Catalog-linked" label rather than showing nothing or a broken name.
- **A real two-button toggle** — "Pinned" / "Tracking" — now sits right next to the "Load Catalog Formula ▾" dropdown, but only appears once a product is actually linked to a catalog recipe (it's invisible for hand-built formulas, since the choice doesn't apply to them). Clicking either button visibly switches which one is highlighted and changes the saved mode.
- **The default when first loading a catalog recipe is "Pinned" (frozen), not "Tracking."** The reasoning shown directly in the code: a formula that was just saved shouldn't start silently drifting by default — a team has to deliberately opt into "Tracking" mode if they want their priced product to keep following the shared recipe as it improves.
- **A quiet but important bug fix:** the dropdown used to pick which commodity index a line item points to used to only update the displayed name when changed — the underlying ID it actually saved could still be pointing at the old commodity behind the scenes. That's fixed: choosing a new index from the dropdown now updates both the name shown on screen and the real ID that gets saved, together.
- **Percentages are no longer rounded off before saving.** Previously, a line item's weight (e.g. "33.333...%") got rounded to one decimal place before being sent to the server — a small but real loss of precision every time a catalog recipe was loaded into a product. That rounding step was removed; the exact, full-precision number is now sent as-is.

**Gaps found:** None. 11/11 tests pass. (One thing flagged as informational only, not a defect: the ticket mentions a future data-model change that would make the ingredient-name-matching problem worse — that future change still doesn't exist in this project, but it doesn't weaken anything shipped here.)

---

## Summary table

| Scrum (sample_idea folder) | Real subject | Verdict | Real gaps found |
|---|---|---|---|
| 21 | Index projection / forecasting engine | ✅ Done | 1 — old `FORECAST_BAND` placeholder found on a different page, **now fixed** |
| 22 | Lock/hold buy verdict (forward-looking) | ✅ Done | None |
| 26 | Provider (Fastmarkets/Argus/ICIS) credentials | ✅ Done, backend-only by design | None |
| 27 | Sheet round-trip export/edit/reimport | ✅ Done | None |
| 28 | Link priced cost models to catalog recipe | ✅ Done | None |
