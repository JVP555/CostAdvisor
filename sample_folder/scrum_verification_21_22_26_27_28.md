# Verification Report — Scrums 21, 22, 26, 27, 28

**Date:** 2026-08-23
**Method:** Each scrum was independently re-checked against the actual code and, where a test file exists, the tests were re-run live against the real development database (not just re-reading old notes). Everything below reflects what's actually in the repository today.

**Bottom line:** 4 of the 5 scrums are done and working exactly as previously recorded, with no gaps found. The 5th (Scrum 27) is confirmed to be genuinely not started yet — that's expected and already known, not a surprise.

---

## Scrum 21 — Predictive index forecasting

**Verdict: ✅ Done, matches what was recorded, no problems found.**

**What this feature does:** For any tracked commodity price (like oil, ammonia, gas) in a specific region, the system can now look at its price history and draw a straight trend line through it, then say "if this trend continues, here's roughly where the price is headed" — along with an honest confidence range, not just a single guessed number.

**Backend changes (what happens behind the scenes):**
- A real forecasting calculator was built that looks at a commodity's price history and fits a trend line to it, using plain math (no fancy AI/ML library needed).
- It's honest about uncertainty: if the price has been flat lately, or there isn't enough history to trust a trend, it says so plainly instead of making up a confident-sounding number.
- Every time a forecast is generated, it's saved permanently with a timestamp — so you can always look back and see "what did we predict last month?" without it being overwritten.
- Three new backend actions: generate a forecast for one commodity, generate forecasts for everything at once, and fetch the latest forecast for something.
- A background job automatically refreshes all forecasts once a week, with no one needing to click anything.
- All 10 automated tests for this feature pass.

**Frontend changes (what the user sees):**
- The Index Library page has a "⟳ Project forecasts" button that triggers a refresh of all forecasts.
- The Forecast page used to show a fake, made-up dashed line predicting the future — that fake line has been removed. It now shows only real historical data, and is honest that it doesn't yet show a real forecast (a note explains why — the real forecasting engine works per single commodity, while this page blends several commodities together).
- The Intelligence page (a per-product dossier) still has a placeholder forecast band, but it's clearly labeled as an illustrative stub, not real data.

**What's honestly still missing (on purpose, not hidden):**
- The Forecast page's chart doesn't yet show a real forecasted line — just history. Wiring the real per-commodity forecasts into that specific chart is flagged as future work.
- A separate feature (saving and expert-reviewing AI-written market commentary) still doesn't exist — confirmed absent, exactly as documented.

---

## Scrum 22 — Opportunistic buy windows ("is now a good time to buy?")

**Verdict: ✅ Done, matches what was recorded, no problems found. All 11 tests pass.**

**What this feature does:** For each product, tells the buyer whether right now looks like a cheap or expensive time to be locking in a price — both by looking backward (compared to the recent past) and forward (compared to where prices are forecasted to go).

**Backend changes:**
- **Looking backward:** compares today's calculated cost to the average of the last 4 quarters, and labels it "cheap now," "expensive now," "normal," or "not enough data yet." This didn't need any new pricing data — it cleverly reuses the should-cost history the system already calculates, avoiding a data requirement the original idea worried about.
- **Looking forward (built in a later pass):** uses the forecasting engine from Scrum 21 to compare today's cost to the forecasted cost a year from now, and gives a "lock in now" / "wait and see" verdict. Built carefully as new, separate logic so the existing should-cost calculations elsewhere in the app were not touched or risked.
- Deliberately never uses a "flatlined" fallback number to fake a forecast — if there's no real forecast, it says so rather than pretending.
- A dedicated test confirms that adding this forecasting feature didn't quietly change any of the existing backward-looking numbers.

**Frontend changes:**
- The main Dashboard gained a "Buy Windows" view — a ranked list of every product showing this signal, exportable to a spreadsheet.
- Each product's detail page now shows two small badges side-by-side under its live cost: one backward-looking ("cheap/expensive") and one forward-looking ("lock in/wait"), each hiding gracefully if there isn't enough data.

**No blockers found.**

---

## Scrum 26 — Connecting to paid data providers (Fastmarkets, Argus, ICIS)

**Verdict: ✅ Done (backend only, by design), matches what was recorded, no problems found. 16 automated tests pass (15 + 1 security/isolation test).**

**What this feature does:** Lets a team plug in their own paid subscription to a commodity-data vendor (like Fastmarkets), so that instead of relying only on free/scraped data, they can pull in their own licensed, more accurate numbers.

**Backend changes:**
- Each team can now securely store one login/API-key per vendor — like a private lockbox, one per (team, vendor) pair, so all the commodities they track from that vendor share a single credential to manage.
- That credential is scrambled (encrypted) before being saved, using its own dedicated secret key — it is never sent back out in any screen or API response, and never written into the activity/audit log in plain text. Only "which vendor" and "was it just rotated" get logged.
- A small, extensible plug-in system for vendors — one is fully built and working (Fastmarkets), and two more (Argus, ICIS) are listed as "known, not built yet" rather than silently unsupported.
- New actions so a team's owner or admin (only) can add, replace, remove, or test a credential — locked down more strictly than ordinary settings, since a paid vendor login is more sensitive than a public web link.
- Numbers pulled in from a paid vendor land in exactly the same place as manually-entered or scraped numbers already do, so the rest of the app doesn't need any changes — it's just labeled "provider" instead of "scraped," so users can always tell where a number came from.
- A weekly automatic job refreshes data from all connected vendors.
- If a credential stops working (expired, revoked, etc.), the feed simply stops refreshing rather than crashing or deleting existing data — a real safety net, not a hard failure.

**Frontend changes:** **None — and that's intentional.** This was scoped as a backend-only feature from the start (a settings screen to manage these credentials was explicitly left for later), and a check of the entire frontend codebase confirms there's genuinely nothing referencing this feature there yet.

**Security check (extra scrutiny given this handles paid vendor logins):** Confirmed clean — the secret is properly encrypted, can never appear in any API response (the response format simply has no field for it), and the audit trail never records the secret itself.

---

## Scrum 27 — "Lego" formulas (letting one product's cost formula use another product as a building block)

**Verdict: 🔴 Confirmed not started — 0% built. This matches what was already recorded; nothing was quietly finished or broken.**

**What this feature would do (if built):** Let a buyer build a cost formula for one product that includes another whole priced product as one of its ingredients (e.g., "Product A's cost = 60% raw material X + 40% the cost of Product B"), with the system automatically recalculating everything if Product B's price changes.

**What actually exists today:** Nothing at the "priced product" level. There's a similar-sounding but genuinely different feature already built one level up, in the shared catalog of formula templates — one catalog recipe can reference another catalog recipe as an ingredient (with safety checks against infinite loops). But that's templates referencing templates in the shared library, not one customer's actual priced product referencing another customer's actual priced product. The real "Lego" feature described by this ticket doesn't exist in the code or on any screen.

**Backend changes:** None.
**Frontend changes:** None.

**Note for whoever builds this later:** The catalog-template version already built gives a solid pattern to copy (safety checks for "does this create an infinite loop" and "how many levels deep are we allowed to go"), but it will need its own version of those safety checks, since a real product-to-product reference could loop back on itself in ways the template-only version doesn't currently check for.

---

## Scrum 28 — Complex math in formulas (thresholds, min/max limits, if/else logic)

**Verdict: ✅ Done, matches what was recorded, no problems found. 12 automated tests pass (the ticket's notes say "8" because one test covers 5 similar cases at once — same coverage, just counted differently).**

**What this feature does:** Lets someone writing an advanced cost formula use more powerful math — not just addition and multiplication, but "cap this value between a floor and a ceiling," "switch to a different number once a threshold is crossed," and "if this condition is true, use A, otherwise use B."

**Backend changes:**
- The existing formula calculator (used since an earlier scrum for advanced, typed-out formulas) was extended — not replaced — to understand: minimum/maximum/absolute-value/rounding, a "clamp between a floor and ceiling" function, a "step change at a threshold" function, if/else logic, comparisons (including chained ones like "is X between 10 and 20"), and AND/OR logic.
- Very important safety check confirmed: even with all this new power, the calculator still cannot run arbitrary code — it only understands this specific safe list of math operations, nothing else. Attempts to sneak in anything outside that list are still correctly rejected. This was double-checked carefully since making a calculator "smarter" is exactly the kind of change that can accidentally open a security hole, and it didn't happen here.
- This same calculator is reused everywhere formulas are evaluated (advanced product formulas and one other calculated-index feature) — it's one shared piece of logic, not copied and duplicated.

**Frontend changes:**
- No new screens or input boxes were needed — people already had a free-text box for writing advanced formulas from an earlier scrum, and it now simply accepts more powerful expressions.
- One small fix: the part of the app that scans a typed formula to figure out which words are "variables you need to define" was updated to correctly ignore the new function names (like `clamp` or `step`) so they aren't mistakenly flagged as undefined variables needing a mapping.

**Confirmed:** this is a genuine extension of the existing formula calculator from an earlier scrum, not a rebuilt or duplicated one.

---

## Summary table

| Scrum | Feature | Status | Backend | Frontend | Tests |
|---|---|---|---|---|---|
| 21 | Predictive index forecasting | ✅ Done | Yes | Yes | 10/10 pass |
| 22 | Opportunistic buy windows | ✅ Done | Yes | Yes | 11/11 pass |
| 26 | Provider API integration (Fastmarkets etc.) | ✅ Done (backend-only, by design) | Yes | None (intentional) | 16/16 pass |
| 27 | "Lego" nested formulas | 🔴 Not started | None | None | — |
| 28 | Complex math in formulas | ✅ Done | Yes | Minor fix only | 12/12 pass |
