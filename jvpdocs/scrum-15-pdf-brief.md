# Scrum 15 — Polished Exportable Deliverable (PDF Brief)

**Status:** 🔴 Not started

## Goal
Generate a clean, professional PDF negotiation brief that a procurement manager can print or email to a supplier. Must include: verdict, gap analysis, ranked cost drivers, evolution chart, and narrative.

## What Already Exists
- `Brief.jsx` renders the brief in the browser
- `costing_engine.calculate_brief()` returns gap, top_drivers, narrative
- `utils/exportCsv.js` — CSV export utility (not PDF)
- Evolution chart rendered in `EvoChart.jsx`

## PDF Content Layout

```
Page 1 — Cover
  Logo + "Negotiation Brief"
  Product | Supplier | Period | Prepared by | Date

Page 2 — Verdict
  Should-cost vs. Actual (summary table)
  Gap per unit + Total financial impact
  One-paragraph narrative (from narrative.py)

Page 3 — Cost Driver Analysis
  Ranked table: Index | Weight | Base Value | Current Value | Change % | Impact $
  Bar chart: contribution of each driver to total gap

Page 4 — Evolution Chart
  Should-cost vs. Actual price over time (quarterly)
  Squeeze/desqueeze zones highlighted

Page 5 (optional) — Data Sources
  Index sources, override dates, FX rates used
```

## Technical Approach Options

### Option A: Browser `window.print()` with print CSS
- Simplest — add `@media print` styles to `Brief.jsx`
- No new dependency
- Limitation: chart rendering quality depends on browser

### Option B: Server-side PDF with `weasyprint` or `reportlab`
- Backend generates PDF from Jinja2 HTML template
- Returns as binary download
- More reliable layout, better for charts

### Option C: `react-pdf` / `@react-pdf/renderer` on the frontend
- Pure frontend PDF generation
- Good for dynamic content; charts need to be redrawn as SVG

**Recommendation**: Option A (print CSS) as MVP, Option C for polished output.

## Work Items
- Add `GET /api/costing/brief/pdf?cost_model_id=&from_year=&from_quarter=&to_year=&to_quarter=` endpoint (if server-side)
- OR add print-optimised CSS and an "Export PDF" button that calls `window.print()` (MVP)
- Ensure `EvoChart.jsx` renders cleanly in print/PDF context (SVG-based)
- Brand the PDF with CostAdvisor logo and colour scheme

## Key Files
| File | Change |
|------|--------|
| `frontend/src/pages/Brief.jsx` | Export button + print CSS |
| `frontend/src/components/EvoChart.jsx` | Print-safe SVG rendering |
| `backend/app/routers/costing.py` | PDF endpoint (if server-side) |
| `backend/requirements.txt` | Add `weasyprint` or keep pure frontend |

## Acceptance Criteria
- [ ] "Export PDF" button on the Brief page
- [ ] PDF contains: verdict, gap, top drivers table, evolution chart, narrative
- [ ] PDF is legible when printed in black and white
- [ ] Customer logo / branding can be added
- [ ] File is named sensibly (e.g., `brief-product-supplier-Q12025.pdf`)
