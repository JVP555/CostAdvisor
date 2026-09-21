# Scrum 16 — Self-Serve Onboarding

**Status:** 🔴 Not started

## Goal
A new user who signs up without any help should reach their first meaningful insight (a should-cost vs. actual gap) within one session. Achieved through: empty states with guidance, example data, and a clear step-by-step path.

## What Already Exists
- All core pages exist (`CostModelBuilder`, `Evolution`, `Brief`, `Indexes`)
- Seed scripts (`seed_jacobi.py`, `seed_jacobi_formulas.py`, `seed_jacobi_purchases.py`) that load example data — currently manual / super-admin only

## The Onboarding Journey

```
Sign up (Google OAuth)
  → Dashboard: "Welcome! Here's how to get started" checklist widget
  → Step 1: Create your first product
  → Step 2: Create a cost model (product + supplier)
  → Step 3: Add commodity components
  → Step 4: Load example index data (or confirm real data exists)
  → Step 5: Run your first should-cost
  → Step 6: Upload actual prices → see the gap
```

## Work Items

### Empty States
Every page that can be empty needs a friendly message + call-to-action instead of a blank table:
- Dashboard: "You have no cost models yet — create one to get started"
- Cost Models list: "Create your first cost model"
- Evolution chart with no data: "Add commodity components to your formula to see the should-cost trend"
- Brief with no actuals: "Upload actual prices to see the gap between should-cost and what you paid"
- Indexes: "No index data for this commodity in this region — add an override or enable scraping"

### Example Data
- Expose a "Load example data" button for new teams (only shown if team has 0 cost models)
- Calls a new endpoint `POST /api/onboarding/load-example-data` which runs the Jacobi seed logic for the requesting team
- Removes itself once real data exists

### Onboarding Checklist (Dashboard widget)
A persistent checklist widget on the Dashboard:
- [ ] Create a product
- [ ] Create a cost model
- [ ] Add a commodity component
- [ ] Run a should-cost
- [ ] Upload actual prices
- [ ] Generate a negotiation brief

Persisted server-side (or in `localStorage`) so it survives page reload. Disappears once all steps are complete.

### Tooltips / Inline Help
- Key UI elements get `title` attributes or small `?` icons linking to a tooltip explaining the concept (e.g., "What is an INCOTERM?", "What is a formula component?")

## Key Files
| File | Change |
|------|--------|
| `frontend/src/pages/Dashboard.jsx` | Onboarding checklist widget |
| `frontend/src/pages/CostModelBuilder.jsx` | Empty states |
| `frontend/src/pages/Evolution.jsx` | Empty state |
| `frontend/src/pages/Brief.jsx` | Empty state |
| `frontend/src/pages/Indexes.jsx` | Empty state |
| `backend/app/routers/onboarding.py` | New — example data loader endpoint |
| `backend/app/main.py` | Register onboarding router |

## Acceptance Criteria
- [ ] Every list/chart page has a non-empty empty state with a clear next action
- [ ] "Load example data" works for a brand-new team and produces a runnable should-cost
- [ ] Onboarding checklist tracks real progress and disappears when done
- [ ] A new user can reach a gap insight without external guidance
