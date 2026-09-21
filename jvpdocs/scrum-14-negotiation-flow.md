# Scrum 14 — End-to-End Win-a-Negotiation Flow

**Status:** 🔴 Not started

## Goal
Ensure a user can go from zero to a complete negotiation brief without hitting dead ends, confusing gaps, or missing data. The full path: create product → add components → link indices → run should-cost → upload actuals → see gap → export brief.

## The Intended Flow
```
1. Create Product (name, unit, chemical family)
2. Create Cost Model (product + supplier + region + currency + incoterm)
3. Add Formula Components (commodity index + weight per component)
4. Set base price + margin on the Formula Version
5. Verify index data exists for chosen commodities (or upload overrides)
6. Upload Actual Prices (from supplier invoices)
7. Run Evolution → chart of should-cost vs. actual over time
8. Run Brief → gap, ranked drivers, narrative
9. Export Brief (PDF or copy)
```

## Current State & Known Gaps

- Steps 1–4: exist in `CostModelBuilder.jsx` — audit for UX friction
- Step 5: `Indexes.jsx` exists but the link between "I need index data for this commodity" and "how do I get it" is unclear for a new user
- Step 6: CSV upload exists (`/api/prices`) — check if the UI makes it obvious what format is expected
- Step 7: `Evolution.jsx` — exists
- Step 8: `Brief.jsx` — exists; check that all data (actuals, volumes) is surfaced
- Step 9: **Missing** — no export of the brief yet (that's Scrum 15)

## Work Items

### Audit & Fix the Happy Path
- Walk through steps 1–8 with fresh data and log every point of confusion or missing feedback
- Ensure required fields are clear at each step (e.g., a cost model with no components shows a prompt, not an empty chart)

### Missing UI Guidance
- If a formula has no components → inline prompt: "Add at least one commodity component to calculate should-cost"
- If no index data exists for a component's commodity in the chosen region/period → show which index is missing and link to the Indexes page
- If no actual prices are uploaded → evolution chart still works but shows "No actual prices — upload from the Actuals tab"

### Volume Data in Brief
- `calculate_brief()` uses volume to compute `total_impact` (gap × volume)
- If no volumes are uploaded, `total_impact` is null — show this clearly in the brief UI with a prompt to upload volumes

### Validation
- `POST /api/costing/brief` currently returns 422 if required data is missing — ensure the frontend catches this and shows a human-readable message, not a raw API error

## Key Files
| File | Change |
|------|--------|
| `frontend/src/pages/CostModelBuilder.jsx` | Empty-state prompts for components |
| `frontend/src/pages/Evolution.jsx` | Missing-data callouts |
| `frontend/src/pages/Brief.jsx` | Volume-missing callout, error handling |
| `frontend/src/pages/Indexes.jsx` | Clearer onboarding for adding data |
| `backend/app/routers/costing.py` | Improve 422 error messages |

## Acceptance Criteria
- [ ] A new user can complete the full flow (steps 1–8) without external help
- [ ] Every empty or missing-data state has a clear message and a next action
- [ ] The brief shows gap, top drivers, and narrative with real data
- [ ] Total impact shows correctly when volumes are present; prompts to upload when absent
- [ ] No raw API errors surface in the UI
