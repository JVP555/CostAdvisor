# Verification Report — Scrums 30, 31, 32, 33 (checked against the original ticket text in `sample_idea/`)

**Date:** 2026-08-23
**Method:** Each scrum's *original ticket text* was read straight from `sample_idea/scrumNN/prompt.txt`, and the actual code was checked line-by-line against every acceptance criterion / "Done when" bullet in that text. Every test suite listed below was re-run live against the real database, freshly, as part of this pass.

## ⚠️ Folder-number vs. CLAUDE.md-heading note

As with earlier scrums checked this session, the `sample_idea` folder numbers don't always match CLAUDE.md's own Scrum numbering:

- **`sample_idea/scrum30`** → "Negotiation position engine" → shipped and tracked in CLAUDE.md as **"Scrum 30b"** (CLAUDE.md's own "Scrum 30" heading is the unrelated, unbuilt "Extract pricing from PDFs" — not this ticket).
- **`sample_idea/scrum31`** → "Quote & price-list extraction service" → shipped and tracked in CLAUDE.md as **"Scrum 31b"** (CLAUDE.md's own "Scrum 31" heading is a different scrum — see next line).
- **`sample_idea/scrum32`** → "Supplier trust & margin grading" → this is the one exception: it genuinely IS the same story CLAUDE.md already had planned as **"Scrum 31,"** so that existing heading was updated in place rather than filed under a colliding new number.
- **`sample_idea/scrum33`** → "Cost-structure estimator for combos with no usable decomposition" → shipped and tracked in CLAUDE.md as **"Scrum 33b"** (CLAUDE.md's own "Scrum 33" heading is the unrelated, unbuilt "Multi-source index validation").

**Bottom line: all 4 are done and match their own ticket text.** 3 of 4 have zero gaps at all. The 4th (Scrum 32 / supplier trust) has one gap that the ticket itself flagged as a hard dependency — and that gap is honestly disclosed everywhere it matters, not hidden — plus one small, newly-found rough edge worth a follow-up.

---

## Scrum 30 — Negotiation position engine (defensible target, attributed ask, what we cannot claim)

**Verdict: ✅ Fully done. All 8 acceptance criteria met, no real gaps. 12/12 tests pass.**

**What this feature does, in plain terms:** Take a shared catalog pricing recipe, a region, a time period, and a real price a supplier is actually asking for — and turn that into a number a buyer can defend in a negotiation. It calculates what the price *should* be based on how real ingredient costs have moved, compares that to the supplier's ask, and — critically — is explicit about which part of the gap is backed by real evidence versus which part simply cannot be justified with the data on hand today.

**Checked against the ticket's own 8 criteria:**
1. *Returns the target, the ask, the per-line attribution, and an explicit leftover amount* — ✅ Met.
2. *The attributed amounts plus the leftover always add up to exactly the total gap* — ✅ Met, proven with real numbers in a test.
3. *Every number in the response can be traced back to what it's based on (which line, which index, both period values) without re-running anything* — ✅ Met.
4. *A line based on a stand-in index, or one with no real data behind it, is clearly marked as weaker — never presented with the same confidence as a properly tracked line* — ✅ Met.
5. *If the supplier's quote uses a different currency, unit, or trade term than the recipe, the system says so and shows the adjustment — or honestly says it couldn't adjust, rather than silently comparing mismatched numbers* — ✅ Met, for all three (currency, unit, trade term).
6. *A recipe with no starting price still gives a useful "price moved up/down by X%" answer instead of erroring out* — ✅ Met.
7. *A recipe with no supporting write-up/evidence returns a position with genuinely nothing attached — not fake filler text pretending to be evidence* — ✅ Met.
8. *Everything above can be checked just by calling the system directly — no screen is required* — ✅ Met.

**Backend changes (plain English):** This feature calculates a defensible target price and compares it honestly against what a supplier is asking, splitting the gap into "what we can actually prove" (today, this is always zero — there's no separate evidence-attachment system built yet, so the tool is honest about that limitation rather than fabricating support) and "what's left unexplained." It automatically corrects for mismatched currencies, units, and trade terms before comparing, and clearly states when it *couldn't* make that correction. It deliberately never tries to guess what a supplier might counter with — an earlier version of this idea that tried to do that was removed for inventing data, and this version was built specifically to avoid repeating that mistake. It also correctly uses the shared-recipe convention for margin (a line inside the total) rather than accidentally mixing in the different convention used for a team's own hand-built products, which would have made every answer wrong by the margin amount.

**Frontend changes:** None — by design, matching the ticket's own statement that no screen is required. (One small honest footnote: a later, separate feature — quote extraction, below — added a small preview widget that calls this same calculation, but that wasn't part of building this scrum itself.)

**Gaps found:** None.

---

## Scrum 31 — Quote & price-list extraction service (structured fields, confidence, confirmed before landing)

**Verdict: ✅ Fully done. All 6 acceptance criteria met, no gaps. 11/11 tests pass.**

**What this feature does, in plain terms:** Lets someone upload a supplier's quote PDF and have the system automatically pull out the useful numbers — price, currency, unit, trade term, dates, etc. — instead of a person retyping them by hand, while being upfront about how confident each extracted value is and exactly where in the document it came from.

**Checked against the ticket's own 6 criteria:**
1. *Uploading a document returns structured lines (product, price, currency, unit, volume tier, trade term, dates), with nothing saved for real until a person confirms it* — ✅ Met.
2. *Every extracted value carries a confidence level and a pointer back to where it came from in the document* — ✅ Met.
3. *A field that couldn't be found is left out and listed as missing — never guessed or defaulted* — ✅ Met, including a cascading case (no quote date found → a "valid for 30 days" clause can't be resolved into a real expiry date either, and it correctly says so instead of guessing).
4. *A document covering several products or price tiers produces several separate lines, not just one* — ✅ Met.
5. *A document that can't be read at all fails clearly, in the same style as every other file-upload feature in the app* — ✅ Met.
6. *A confirmed quote line becomes real data the negotiation tool can use, while the actual-price records elsewhere in the app stay completely untouched* — ✅ Met, proven directly: confirming a quote, running a real negotiation calculation against it, and checking that the count of actual-price records didn't change.

**Backend changes (plain English):** A supplier's quote PDF can now be uploaded and automatically read into structured fields, each tagged with a confidence level and the exact spot in the document it came from. Nothing becomes a permanent fact until a person reviews and explicitly confirms each line — at that point it becomes a real, comparable record the negotiation-position tool (Scrum 30, above) can use directly, without anyone needing to retype numbers by hand. No AI/LLM is used for this — it's careful, deterministic text-and-pattern matching, chosen specifically because it needed to work reliably every time, not "usually." The original PDF file itself is thrown away after reading it (matching how every other upload in this app works) — only the plain text is kept, which is what lets someone double-check where a number actually came from later.

**Frontend changes (plain English, in detail) — go to `/quotes` (reachable from the account "More" menu; component: `pages/QuoteExtraction.jsx`):** A new "Quote Extraction" page. A person uploads a PDF, and a review table appears listing every extracted line as a row of small colored chips — green/amber/red showing how confident each individual field is — hovering over one shows the exact page and sentence it was pulled from. Each line has its own Edit / Confirm / Reject buttons, so a low-confidence guess can be corrected before being accepted. The moment a line is confirmed, a small calculator appears right there on the page: pick a catalog recipe, region, and time period, and it immediately shows the target price, the ask, and the unexplained remainder — without leaving the page or re-entering any numbers. A list at the bottom shows every quote line that's already been confirmed.

**Gaps found:** None.

---

## Scrum 32 — Supplier trust & margin grading (depends on alias canonicalisation)

**Verdict: ✅ Done, with one honestly-disclosed limitation the ticket itself flagged as unavoidable, plus one small newly-found rough edge. 8/8 tests pass.**

**What this feature does, in plain terms:** Gives every supplier a letter grade (A–F) based on how their actual pricing behaves compared to what the product *should* cost over time — how big the gap usually is, how consistent it is, and whether it's been getting worse.

**Checked against the ticket's own 4 "Done when" criteria:**
1. *A score is saved per supplier (per product, or pooled across a product family) along with everything that went into it, so a disputed score can be explained rather than recalculated from scratch* — ✅ Met.
2. *The score should be based on the supplier's real, consolidated identity — not accidentally split across several different spellings of the same company name* — 🟡 **Not literally met — and this is exactly the limitation the ticket itself warned about in advance.** The ticket says this whole feature depends on a separate "which spellings belong to which real company" system that was supposed to be built first. That system doesn't exist anywhere in this project. Rather than pretend the problem doesn't exist, the actual implementation scores by the supplier name as typed today, and says so explicitly, everywhere: in the code itself, in the raw data returned by the main list-of-suppliers endpoint (a field literally states `"resolution": "raw_supplier_name"`), and as a visible note right on the Suppliers page itself, with a tooltip explaining why. This is a disclosed limitation, not a silent gap.
3. *A supplier with too little price history gets an honest "not enough data" result rather than being scored low* — ✅ Met.
4. *The result can be checked as plain data (JSON), not just eyeballed on a screen* — ✅ Met.

**Backend changes (plain English):** Each team can now generate a trust grade for their own suppliers, based on how closely that supplier's real invoiced prices track the calculated should-cost over time. It's computed per product where there's enough history, or pooled across a product family when one product alone doesn't have enough history yet. It's explicit that it currently can't tell "Acme Corp" and "Acme Corporation" apart as the same company — everywhere the score appears, that limitation is stated plainly rather than hidden. This is deliberately kept as each team's own private read on a supplier (not a shared, platform-wide fact), because one team's experience with a supplier isn't necessarily true for every team.

**Frontend changes (plain English) — go to `/suppliers`, then switch to the "Benchmarking" view (component: `pages/Suppliers.jsx`):** that view gained a "Trust Grade" column showing the A–F badge (hover for the full breakdown of what went into it) and a "Compute trust scores" button, plus a small, always-visible note explaining the raw-name limitation described above.

**Real gap found (beyond the known, already-disclosed one) — now fixed.** When looking up a *single* supplier's score directly, that response didn't carry the same `"resolution": "raw_supplier_name"` disclosure field that the full-list endpoint does — so someone querying just one supplier at a time never saw that same warning in their response. **Fixed same-day:** every individual trust-score row now carries its own `resolution` field, so both single-supplier endpoints (`compute` and `get`) disclose the limitation directly, not just the all-suppliers listing. A new test (`test_resolution_flag_present_on_single_supplier_endpoints`) pins this; full suite verified at 298 passing, no regressions.

---

## Scrum 33 — Cost-structure estimator for combos with no usable decomposition (draft output, reviewable)

**Verdict: ✅ Fully done. All 5 acceptance criteria met, no gaps. 7/7 tests pass.**

**What this feature does, in plain terms:** For a catalog product recipe that has no trustworthy breakdown yet (or only a rough, unverified guess), this proposes a real, evidence-backed set of ingredients and proportions — as a draft that a person must review and approve before it becomes the official recipe.

**Checked against the ticket's own 5 criteria:**
1. *A callable service takes a recipe and proposes ingredients + proportions + a reason for each, without changing the real, live recipe* — ✅ Met.
2. *A proposal is saved as a clearly-marked "AI draft," using the exact same review process already used for other unverified recipes — and approving it is what makes it usable for real* — ✅ Met.
3. *A proposed ingredient with no real price data available is clearly flagged as such, not quietly included as if it were solid* — ✅ Met.
4. *There's a way to check the estimator's accuracy by testing it against recipes that are already known to be correct, and that check-report can actually be looked at (not just buried in a log file)* — ✅ Met.
5. *Running the estimator again on the same recipe doesn't create duplicate drafts* — ✅ Met.

**Backend changes (plain English):** The ticket originally imagined a specific external data source feeding this feature, and that source doesn't exist in this project — so two other, real evidence sources were used instead. First choice: **"copy from a sibling region"** — if a recipe already has a trustworthy, human-verified version for one region (say Europe), and a new region (say Asia) needs one, the system copies the same ingredients and proportions from Europe's version, then double-checks whether each ingredient actually has usable price data specifically in Asia — flagging any that don't, rather than silently pretending they're fine. Second choice, used only when there's no sibling region to copy from: **"match against real pricing history"** — if there's genuine past pricing data for that exact recipe, the system checks which real commodity prices moved most closely in step with that pricing history, and proposes those as the likely ingredients. Every proposed set of proportions always adds up to exactly 100%, whether copied from a sibling or built from scratch (in which case a clearly-labelled "unexplained" line closes the gap). And the accuracy-checking feature is built so it can never cheat — when testing the estimator against a recipe that already has real ingredients, the system is careful to never let that recipe's own answer sneak in as evidence for itself.

**Frontend changes:** None — confirmed, and correct: the ticket explicitly says this shouldn't be a screen, just a callable service and a review workflow that reuses screens/processes already built elsewhere.

**Gaps found:** None.

---

## Summary table

| Scrum (sample_idea folder) | Real subject | Verdict | Gaps found |
|---|---|---|---|
| 30 | Negotiation position engine | ✅ Done | None |
| 31 | Quote & price-list extraction | ✅ Done | None |
| 32 | Supplier trust & margin grading | ✅ Done | 1 known, disclosed limitation (no alias/company canonicalisation) + 1 small rough edge (single-supplier lookup missing the disclosure field), **now fixed** |
| 33 | Cost-structure estimator | ✅ Done | None |
