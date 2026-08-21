# Scrum 18 — Data Import & Export (Wave 1)

**Status:** 🔴 Not started

## Goal
Make data import forgiving and obvious (no silent failures, clear column mapping guidance), and ensure every table/chart in the app has a clean export. Consolidate the existing scattered CSV/Excel upload logic into a consistent pattern.

## What Already Exists
- `backend/app/services/file_parser.py` — CSV/Excel parsing (openpyxl + pandas)
- `POST /api/prices` — upload actual prices via CSV
- `POST /api/volumes` — upload actual volumes via CSV
- `POST /api/indexes/upload` — super-admin bulk load of index data
- `frontend/src/components/FileUpload.jsx` — file upload UI component
- `frontend/src/utils/exportCsv.js` — CSV export utility

## Import — What Needs to Improve

### Forgiving Import
Current state: uploads fail silently or with a generic 422 if column names don't match exactly.

Target state:
- Accept common column name variants (e.g., `price`, `Price`, `unit_price`, `Price (EUR/kg)` all map to the price field)
- Return a preview of parsed rows before committing ("We found 24 rows — here's the first 3, does this look right?")
- Return per-row errors instead of failing the whole file (e.g., "Row 7: invalid quarter format '2024-Q1', expected year=2024 quarter=1")
- Accept both CSV and Excel (`.xlsx`) for all upload endpoints

### Consolidate Upload Logic
Currently each router has its own parsing logic. Centralise into `file_parser.py`:
- `parse_prices_file(file) → List[ParsedPrice]`
- `parse_volumes_file(file) → List[ParsedVolume]`
- `parse_index_overrides_file(file) → List[ParsedOverride]`

### Download Templates
Every upload dialog should offer a "Download template" link that returns a pre-formatted CSV/Excel with the correct columns and an example row.
- `GET /api/prices/template` → returns `actual_prices_template.csv`
- `GET /api/volumes/template` → returns `actual_volumes_template.csv`
- `GET /api/indexes/values/template` → returns `index_overrides_template.csv`

## Export — What Needs to Be Added

### "Export" button on every data table
- Actual Prices table → CSV
- Actual Volumes table → CSV
- Index Values table → CSV
- Evolution results → CSV (period, should-cost, actual price, gap, component costs)
- Squeeze results → CSV
- Cost model formula (components, weights, base values) → CSV

### Consolidate Export Logic
`exportCsv.js` exists — ensure all export buttons use it consistently rather than ad-hoc solutions.

## Key Files
| File | Change |
|------|--------|
| `backend/app/services/file_parser.py` | Forgiving parsing, per-row errors, variant column names |
| `backend/app/routers/prices.py` | Preview endpoint, template endpoint |
| `backend/app/routers/volumes.py` | Preview endpoint, template endpoint |
| `backend/app/routers/indexes.py` | Template endpoint |
| `frontend/src/components/FileUpload.jsx` | Preview step before commit |
| `frontend/src/utils/exportCsv.js` | Ensure all tables use it |
| `frontend/src/pages/Pricing.jsx` | Export button |
| `frontend/src/pages/Evolution.jsx` | Export button |

## Acceptance Criteria
- [ ] Every upload shows a row-count preview before committing
- [ ] Per-row errors returned with row number and description
- [ ] Common column name variants accepted without failing
- [ ] Both CSV and `.xlsx` accepted for all uploads
- [ ] "Download template" available at every upload dialog
- [ ] Export CSV button on every data table and result view
- [ ] Exported CSV column names are human-readable (not internal field names)
