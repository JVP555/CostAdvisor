# Remaining work — plan

**Written 2026-09-27; every buildable item on it has since been built.** What follows is the record of what
was planned, what actually shipped, and what is left — which is nothing a coding session can close.

`CLAUDE.md` stays the authoritative per-scrum tracker. This file is the forward view.

---

## Where it ended up

| Bucket | Then | Now |
|---|---|---|
| **A. Mocked, unbuilt** | 6 | **0** — all six built and wired; every mockup deleted |
| **B. Backend shipped, no screen** | 2 | **0** — both wired |
| **C. Not a coding task** | 6 | **7** — unchanged in kind; one added (VAPID keys in production) |
| **D. Deliberately not doing** | 3 | 3 |

Eight features, in the order the plan recommended:

| # | Feature | Where it lives now |
|---|---|---|
| B1 | Index data-quality console (Scrum 33) | `/validation` |
| B2 | Real index forecasts (Scrum 21 follow-up) | `/forecast` |
| A3 | Supplier price-list import (Scrum 30) | `/price-lists` |
| A5 | Per-region sourcing (Scrum 57 follow-up) | `/index-sourcing` |
| A4 | Negotiation prep (Scrum 29) | `/negotiate/:id/prep` |
| A6 | Web push (PWA extras) | Profile → Push notifications |
| A1 | Nested cost models (Scrum 27) | the cost-model builder |
| A2 | AI cost modeler (Scrum 32) | `/ai-cost-modeler` |

---

## What the plan got wrong

Worth more than the parts it got right, because these are the shapes that recur.

**The data disagreed with the ticket three times, and each time the real finding was better than the
planned one.**

1. **Per-region sourcing (A5).** The plan said the series shows one representative region's sourcing for all
   of its regions, so add a `(commodity, region)` table. Measured live: `access_tier`, `frequency`,
   `retrieval_status` and `free_source_name` are null on **all 121** drop-loaded series, while all 132 cards
   beneath them carry access, frequency or agency. The series is not showing the wrong region's sourcing —
   it is showing none, and every per-region fact the drop supplied was invisible. So the feature became a
   read, not a table. **And the plan's "make the Index Library chip per-region" is impossible**: that chip
   reads `retrieval_status`, which has no per-card equivalent in the drop. Said out loud in the payload
   (`retrieval_status_is_series_level`) so nobody builds toward it.
2. **Forecasts (B2).** A stored projection vintage goes stale against its own series — two of five headline
   series are fitted to history ending 2026 Q2 while 2026 Q3 has since been observed, so their first
   "projected" quarter is already a fact. **Anything else that consumes projections needs the same guard**:
   drop projected points at or before the newest observation, and say the vintage is behind rather than
   quietly shortening the horizon.
3. **Validation console (B1).** Findings are not always two-sided. A declared drop issue states a problem
   with no counterpart, so a detail view that always renders two panels shows an empty one that reads as
   missing data.

**Two plan instructions were wrong on their own terms and were overridden deliberately:**

- *"Do not build a second staging model — reuse `EstimatorProposal`"* (A2). The rules were reused; the table
  could not be. It is keyed `(template_id, region)` with `template_id` NOT NULL and approves into the
  catalog; the AI modeler is about a team's own product and approves into a `FormulaVersion`. Sharing one
  table would have meant two approve paths behind one row.
- *"`VITE_VAPID_PUBLIC_KEY`"* (A6). The key is public by definition, so it is served from
  `/api/push/config` instead — rotating the pair then needs no SPA rebuild.

**Three bugs were found by testing the new code, not by reading it:**

- A CHECK constraint on `formula_components.component_type` that **is not declared on the model class**, so
  reading the model says there is none. Found by the insert failing.
- Depth double-counted in the nesting recursion (the recursive call already carries it).
- The price-list matcher's code-token check never fired for hyphenated product codes — and most product
  codes are hyphenated, so that branch looked like it worked while doing nothing.

---

## C. Not a coding task

These are what now stand between the product and a paying customer. Also rendered in-app at `/preview`
("What's left" in the account menu), grouped by who can unblock each one.

1. **Sync the deploy repo.** The Railway-connected repo has been frozen since the 2026-08-22 go-live merge.
   Nothing from Scrum 26 onward, none of the 12 Index Data Layer units, and none of this work is live.
   Re-verify anything infra-related against the live domains only *after* that sync.
2. **SMTP credentials.** No provider chosen; invites, welcome mails, demo confirmations and every alert
   email fail silently.
3. **VAPID keys in production.** Push is built and verified locally. Without `VAPID_PUBLIC_KEY` /
   `VAPID_PRIVATE_KEY` the app reports push as unconfigured — deliberately, but it also means nobody is
   notified.
4. **Vendor DPA list + named incident-response contacts.** The last two open items on
   `security-posture.md`; until they land it cannot go to a prospect.
5. **Base-price anchors.** 199 of 200 platform combos have no base-period price, so they yield an index
   level and never a currency figure. The per-region editor and the bulk CSV import are both built.
6. **FD-1 feed mapping.** The 2026-07 drop renamed commodities to short type-codes that do not match the old
   `SCRAPER_REGISTRY` keys — that mismatch, not a missing scraper, is why the library shows "No data".
   Verify each series ID live against its source before committing to it; two candidates failed that check
   and were correctly left out rather than guessed.
7. **Google Search Console verification + field Core Web Vitals.** Both need real production traffic.

---

## D. Deliberately not doing

Recorded so nobody re-opens them as oversights.

1. **Predicting the supplier's counter** (Scrum 29's first bullet). Impossible honestly without
   supplier-cost data, and already removed once for fabricating it. The shipped prep flow takes their
   position as an *input* instead.
2. **Statistical cross-checking of two independent readings of one series** (Scrum 33's out-of-scope note).
   We mostly hold one reading per series.
3. **Branch protection on `main`.** Three people on a private repo. Revisit when the team grows.

---

## Smaller follow-ups left in the code

Not blockers, and each is recorded where it belongs in `CLAUDE.md` rather than only here.

- **Scrum 28's last red**: per-`FormulaComponent` structured min/max/yield fields, as opposed to writing
  them inline in an expression. Only worth building alongside a redesign of the component editor — the
  expression evaluator already does bounds and thresholds.
- **`seed_index_metadata.py`** still collapses 158 feeds onto one representative. It is marked SUPERSEDED
  but still runs, and that residue is the real remainder of the Scrum 57 limitation.
- **`proxy_derivation.derive_value` is live and idle**: all 128 series carrying `proxy_logic` have a null
  `operation` and null `base_index`. A configuration gap, not a code gap — worth knowing before anyone
  plans engine work there.
