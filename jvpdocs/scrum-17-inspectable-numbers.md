# Scrum 17 — Inspectable Numbers

**Status:** 🔴 Not started

## Goal
Every should-cost figure shown in the app must be fully explainable. A user should be able to click into any number and see exactly how it was calculated: which index values were used, at what weights, after which FX conversion, unit conversion, and Incoterm adjustment.

## Why This Matters
Procurement teams use these numbers in supplier negotiations. If a supplier challenges a figure, the user must be able to show the workings — not just the result.

## What Already Exists
- `costing_engine.py` computes component-level costs internally
- `Evolution.jsx` shows the should-cost trend line
- `Brief.jsx` shows top drivers with % change
- The API returns `component_costs` per period in the evolution response

## What Needs to Be Built

### "How was this calculated?" Breakdown Panel
On the Evolution chart and Brief page, clicking a data point (or a "Show workings" link) opens a panel showing:

```
Should-cost: $4.82 / kg (Q1 2025)

Formula: Polypropylene — EXW Germany → CIF Rotterdam

Components:
┌─────────────────┬────────┬──────────────┬──────────────┬────────┬──────────────┐
│ Component       │ Weight │ Base (Q1'24) │ Now (Q1'25)  │ Ratio  │ Contribution │
├─────────────────┼────────┼──────────────┼──────────────┼────────┼──────────────┤
│ Crude Oil Brent │  60%   │ $82.10 / bbl │ $91.40 / bbl │ 1.113  │ $0.31        │
│ EU Natural Gas  │  30%   │ €35.20 / MWh │ €41.80 / MWh │ 1.187  │ $0.21        │
│ Labour Index    │  10%   │  124.5       │  128.9       │ 1.035  │ $0.02        │
└─────────────────┴────────┴──────────────┴──────────────┴────────┴──────────────┘

Indexed cost:  $4.19 / kg
Margin (15%):  +$0.63
─────────────────────────────
Should-cost:   $4.82 / kg

FX applied:    EUR → USD at 1.082 (Q1 2025)
Unit:          No conversion (both kg)
Incoterm adj:  EXW → CIF Rotterdam (+$0.14 / kg via freight lane default)
```

### Backend Changes
- Extend the evolution and should-cost API responses to include a `workings` object per period:
  - `components`: per-component `{name, weight, base_value, current_value, ratio, contribution, index_source}`
  - `indexed_cost`, `margin_type`, `margin_value`, `margin_amount`
  - `fx_rate`, `fx_from`, `fx_to`
  - `unit_conversion` (if applicable)
  - `incoterm_adjustment` (if applicable)

### Frontend Changes
- `Evolution.jsx`: clickable data points → open `WorkingsPanel` component
- `Brief.jsx`: "Show full workings" expandable section
- New `WorkingsPanel.jsx` component: renders the breakdown table

## Key Files
| File | Change |
|------|--------|
| `backend/app/services/costing_engine.py` | Return `workings` dict alongside results |
| `backend/app/schemas/costing.py` | Add `WorkingsOut` schema |
| `backend/app/routers/costing.py` | Include workings in response |
| `frontend/src/components/WorkingsPanel.jsx` | New — breakdown panel component |
| `frontend/src/pages/Evolution.jsx` | Clickable data points |
| `frontend/src/pages/Brief.jsx` | Show workings section |

## Acceptance Criteria
- [ ] Every should-cost figure has an accessible breakdown
- [ ] Breakdown shows: index name, weight, base value, current value, ratio, contribution
- [ ] Breakdown shows: indexed cost, margin, FX rate used, unit conversion, Incoterm adjustment
- [ ] Index source is shown (scraped / team override / fixed)
- [ ] Numbers in the breakdown sum to the displayed should-cost exactly
