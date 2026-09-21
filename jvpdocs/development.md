# CostAdvisor — Development File Tracker

Track every tracked file: path, last commit, lines changed in that commit.
**Update this file after every commit.**

Format: `file` — `hash short-message` (±N lines)

---

## How to regenerate this file

```bash
git log --pretty=format:"COMMIT %h %s" --numstat HEAD > /tmp/gitlog.txt
python3 jvpdocs/_gen_dev.py   # see script below (regenerates this file)
```

Or update manually after each commit by adding the changed files at the top of their section.

---

## Root

| File | Last Commit | ±Lines |
|------|-------------|--------|
| `.gitignore` | `4c6b73e feat(scrum-8): real admin console with search, soft-delete, audit log` | 8 |
| `Dockerfile.backend` | `78b946b First Public Commit` | 12 |
| `Dockerfile.frontend` | `78b946b First Public Commit` | 12 |
| `README.md` | `c0fd949 docs: add architecture README` | 66 |
| `docker-compose.yml` | `78b946b First Public Commit` | 0 |
| `start.sh` | `78b946b First Public Commit` | 44 |

---

## backend/

| File | Last Commit | ±Lines |
|------|-------------|--------|
| `backend/.dockerignore` | `78b946b First Public Commit` | 33 |
| `backend/.env.example` | `78b946b First Public Commit` | 33 |
| `backend/Dockerfile` | `58d5a3e Install curl in Dockerfile for Tailscale` | 3 |
| `backend/alembic.ini` | `78b946b First Public Commit` | 37 |
| `backend/celeryconfig.py` | `78b946b First Public Commit` | 24 |
| `backend/entrypoint-worker.sh` | `47e5e5a Fix tailscale flag syntax` | 2 |
| `backend/entrypoint.sh` | `97ae050 Fix HTTPS redirects behind proxy` | 2 |
| `backend/fix_seed_user.py` | `2a61276 Fixed login auth page` | 26 |
| `backend/pytest.ini` | `8877632 Pre-Deploy build` | 6 |
| `backend/requirements-dev.txt` | `8877632 Pre-Deploy build` | 4 |
| `backend/requirements.txt` | `8877632 Pre-Deploy build` | 3 |
| `backend/seed_jacobi.py` | `8877632 Pre-Deploy build` | 14 |
| `backend/seed_jacobi_formulas.py` | `78b946b First Public Commit` | 134 |
| `backend/seed_jacobi_purchases.py` | `78b946b First Public Commit` | 177 |
| `backend/seed_team.py` | `e61aad2 Removed redirects SPA rule` | 33 |

### backend/alembic/

| File | Last Commit | ±Lines |
|------|-------------|--------|
| `backend/alembic/env.py` | `8877632 Pre-Deploy build` | 4 |
| `backend/alembic/script.py.mako` | `78b946b First Public Commit` | 23 |

### backend/alembic/versions/

| File | Last Commit | ±Lines |
|------|-------------|--------|
| `f5f3c2044043_initial.py` | `78b946b First Public Commit` | 161 |
| `a1b2c3d4e5f6_restructure_data_model.py` | `78b946b First Public Commit` | 205 |
| `b2c3d4e5f6a7_add_team_index_sources.py` | `78b946b First Public Commit` | 41 |
| `c3d4e5f6a7b8_cleanup_indices.py` | `78b946b First Public Commit` | 171 |
| `d4e5f6a7b8c9_add_formula_version_to_prices.py` | `78b946b First Public Commit` | 29 |
| `e5f6a7b8c9d0_quarter_based_formula_versioning.py` | `78b946b First Public Commit` | 63 |
| `f6a7b8c9d0e1_add_currency_category_to_commodity.py` | `78b946b First Public Commit` | 24 |
| `g7h8i9j0k1l2_nullable_override_value.py` | `78b946b First Public Commit` | 32 |
| `h8i9j0k1l2m3_enable_rls.py` | `8877632 Pre-Deploy build` | 123 |
| `i9j0k1l2m3n4_account_deletion.py` | `8877632 Pre-Deploy build` | 61 |
| `j0k1l2m3n4o5_add_fixed_value_to_team_index_sources.py` | `b908f20 Bunch of QOL updates and COTERMs fix` | 30 |
| `k1l2m3n4o5p6_add_incoterm_to_cost_model.py` | `b908f20 Bunch of QOL updates and COTERMs fix` | 31 |
| `l2m3n4o5p6q7_add_user_theme.py` | `9fa84af Theme update change` | 26 |
| `m3n4o5p6q7r8_incoterm_on_price_records.py` | `7fd22e8 First part of the INCOTERM rework` | 69 |
| `n4o5p6q7r8s9_landed_cost_adjustments.py` | `7fd22e8 First part of the INCOTERM rework` | 170 |

### backend/app/

| File | Last Commit | ±Lines |
|------|-------------|--------|
| `backend/app/__init__.py` | `78b946b First Public Commit` | 0 |
| `backend/app/config.py` | `8877632 Pre-Deploy build` | 7 |
| `backend/app/database.py` | `8877632 Pre-Deploy build` | 68 |
| `backend/app/main.py` | `7fd22e8 First part of the INCOTERM rework` | 3 |
| `backend/app/observability.py` | `8877632 Pre-Deploy build` | 46 |
| `backend/app/rate_limit.py` | `8877632 Pre-Deploy build` | 40 |
| `backend/app/seed.py` | `8877632 Pre-Deploy build` | 74 |

### backend/app/constants/

| File | Last Commit | ±Lines |
|------|-------------|--------|
| `backend/app/constants/__init__.py` | `7fd22e8 First part of the INCOTERM rework` | 0 |
| `backend/app/constants/incoterms.py` | `7fd22e8 First part of the INCOTERM rework` | 181 |

### backend/app/models/

| File | Last Commit | ±Lines |
|------|-------------|--------|
| `backend/app/models/__init__.py` | `78b946b First Public Commit` | 33 |
| `backend/app/models/actual_volume.py` | `78b946b First Public Commit` | 33 |
| `backend/app/models/audit_log.py` | `78b946b First Public Commit` | 29 |
| `backend/app/models/chemical_family.py` | `78b946b First Public Commit` | 16 |
| `backend/app/models/cost_model.py` | `7fd22e8 First part of the INCOTERM rework` | 6 |
| `backend/app/models/freight_lane.py` | `7fd22e8 First part of the INCOTERM rework` | 31 |
| `backend/app/models/fx_rate.py` | `78b946b First Public Commit` | 27 |
| `backend/app/models/index_data.py` | `7fd22e8 First part of the INCOTERM rework` | 2 |
| `backend/app/models/price_data.py` | `7fd22e8 First part of the INCOTERM rework` | 5 |
| `backend/app/models/product.py` | `78b946b First Public Commit` | 44 |
| `backend/app/models/scenario.py` | `78b946b First Public Commit` | 20 |
| `backend/app/models/supplier.py` | `78b946b First Public Commit` | 24 |
| `backend/app/models/team.py` | `78b946b First Public Commit` | 47 |
| `backend/app/models/user.py` | `9fa84af Theme update change` | 3 |

### backend/app/routers/

| File | Last Commit | ±Lines |
|------|-------------|--------|
| `backend/app/routers/__init__.py` | `78b946b First Public Commit` | 0 |
| `backend/app/routers/account.py` | `8877632 Pre-Deploy build` | 66 |
| `backend/app/routers/admin.py` | `a371858 feat(admin,teams): full team management with single-owner transfer model` | 80 |
| `backend/app/routers/ai.py` | `8877632 Pre-Deploy build` | 5 |
| `backend/app/routers/audit.py` | `61c4931 fix(auth,audit): remove auto team creation; hide admin events from team log` | 8 |
| `backend/app/routers/auth.py` | `61c4931 fix(auth,audit): remove auto team creation; hide admin events from team log` | 12 |
| `backend/app/routers/chemical_families.py` | `78b946b First Public Commit` | 55 |
| `backend/app/routers/cost_models.py` | `7fd22e8 First part of the INCOTERM rework` | 19 |
| `backend/app/routers/costing.py` | `7fd22e8 First part of the INCOTERM rework` | 1 |
| `backend/app/routers/freight_lanes.py` | `7fd22e8 First part of the INCOTERM rework` | 61 |
| `backend/app/routers/fx_rates.py` | `78b946b First Public Commit` | 71 |
| `backend/app/routers/indexes.py` | `b908f20 Bunch of QOL updates and COTERMs fix` | 8 |
| `backend/app/routers/portfolio.py` | `78b946b First Public Commit` | 173 |
| `backend/app/routers/prices.py` | `7fd22e8 First part of the INCOTERM rework` | 19 |
| `backend/app/routers/products.py` | `78b946b First Public Commit` | 113 |
| `backend/app/routers/scenarios.py` | `8877632 Pre-Deploy build` | 148 |
| `backend/app/routers/suppliers.py` | `78b946b First Public Commit` | 435 |
| `backend/app/routers/teams.py` | `a371858 feat(admin,teams): full team management with single-owner transfer model` | 40 |
| `backend/app/routers/volumes.py` | `8877632 Pre-Deploy build` | 6 |

### backend/app/schemas/

| File | Last Commit | ±Lines |
|------|-------------|--------|
| `backend/app/schemas/__init__.py` | `78b946b First Public Commit` | 0 |
| `backend/app/schemas/actual_volume.py` | `78b946b First Public Commit` | 23 |
| `backend/app/schemas/audit_log.py` | `78b946b First Public Commit` | 18 |
| `backend/app/schemas/chemical_family.py` | `78b946b First Public Commit` | 14 |
| `backend/app/schemas/cost_model.py` | `7fd22e8 First part of the INCOTERM rework` | 72 |
| `backend/app/schemas/costing.py` | `7fd22e8 First part of the INCOTERM rework` | 6 |
| `backend/app/schemas/freight_lane.py` | `7fd22e8 First part of the INCOTERM rework` | 39 |
| `backend/app/schemas/fx_rate.py` | `78b946b First Public Commit` | 14 |
| `backend/app/schemas/index_data.py` | `b908f20 Bunch of QOL updates and COTERMs fix` | 4 |
| `backend/app/schemas/price_data.py` | `7fd22e8 First part of the INCOTERM rework` | 47 |
| `backend/app/schemas/product.py` | `78b946b First Public Commit` | 37 |
| `backend/app/schemas/scenario.py` | `78b946b First Public Commit` | 19 |
| `backend/app/schemas/supplier.py` | `78b946b First Public Commit` | 18 |
| `backend/app/schemas/team.py` | `a371858 feat(admin,teams): full team management with single-owner transfer model` | 1 |
| `backend/app/schemas/user.py` | `9fa84af Theme update change` | 1 |

### backend/app/services/

| File | Last Commit | ±Lines |
|------|-------------|--------|
| `backend/app/services/__init__.py` | `78b946b First Public Commit` | 0 |
| `backend/app/services/audit.py` | `78b946b First Public Commit` | 26 |
| `backend/app/services/costing_engine.py` | `7fd22e8 First part of the INCOTERM rework` | 57 |
| `backend/app/services/data_resolver.py` | `b908f20 Bunch of QOL updates and COTERMs fix` | 14 |
| `backend/app/services/file_parser.py` | `7fd22e8 First part of the INCOTERM rework` | 15 |
| `backend/app/services/freight_lane_lookup.py` | `7fd22e8 First part of the INCOTERM rework` | 31 |
| `backend/app/services/fx_converter.py` | `78b946b First Public Commit` | 54 |
| `backend/app/services/fx_sync.py` | `78b946b First Public Commit` | 74 |
| `backend/app/services/incoterm_normalizer.py` | `7fd22e8 First part of the INCOTERM rework` | 96 |
| `backend/app/services/narrative.py` | `78b946b First Public Commit` | 143 |
| `backend/app/services/ollama.py` | `78b946b First Public Commit` | 104 |
| `backend/app/services/scraper.py` | `8877632 Pre-Deploy build` | 12 |
| `backend/app/services/unit_converter.py` | `78b946b First Public Commit` | 35 |
| `backend/app/services/volume_projector.py` | `78b946b First Public Commit` | 50 |

### backend/app/services/scrapers/

| File | Last Commit | ±Lines |
|------|-------------|--------|
| `backend/app/services/scrapers/__init__.py` | `78b946b First Public Commit` | 47 |
| `backend/app/services/scrapers/ecb.py` | `78b946b First Public Commit` | 134 |
| `backend/app/services/scrapers/eia.py` | `8877632 Pre-Deploy build` | 94 |
| `backend/app/services/scrapers/eurostat.py` | `78b946b First Public Commit` | 150 |
| `backend/app/services/scrapers/fred.py` | `8877632 Pre-Deploy build` | 6 |
| `backend/app/services/scrapers/worldbank.py` | `78b946b First Public Commit` | 110 |

### backend/app/tasks/

| File | Last Commit | ±Lines |
|------|-------------|--------|
| `backend/app/tasks/__init__.py` | `78b946b First Public Commit` | 12 |
| `backend/app/tasks/scrape_indexes.py` | `8877632 Pre-Deploy build` | 5 |

### backend/scripts/

| File | Last Commit | ±Lines |
|------|-------------|--------|
| `backend/scripts/warm_cache.py` | `78b946b First Public Commit` | 198 |

### backend/tests/

| File | Last Commit | ±Lines |
|------|-------------|--------|
| `backend/tests/__init__.py` | `8877632 Pre-Deploy build` | 0 |
| `backend/tests/conftest.py` | `8877632 Pre-Deploy build` | 119 |
| `backend/tests/test_audit_log.py` | `8877632 Pre-Deploy build` | 42 |
| `backend/tests/test_rate_limiting.py` | `8877632 Pre-Deploy build` | 11 |
| `backend/tests/test_rls.py` | `8877632 Pre-Deploy build` | 61 |
| `backend/tests/test_tenancy.py` | `8877632 Pre-Deploy build` | 75 |

---

## frontend/

| File | Last Commit | ±Lines |
|------|-------------|--------|
| `frontend/.env.example` | `78b946b First Public Commit` | 5 |
| `frontend/index.html` | `78b946b First Public Commit` | 13 |
| `frontend/package.json` | `78b946b First Public Commit` | 22 |
| `frontend/package-lock.json` | `78b946b First Public Commit` | 1998 |
| `frontend/vite.config.js` | `78b946b First Public Commit` | 19 |
| `frontend/wrangler.jsonc` | `d460ca1 dev: wrangler.jsonc to serve dist as SPA (dev branch only)` | 8 |

### frontend/src/

| File | Last Commit | ±Lines |
|------|-------------|--------|
| `frontend/src/App.jsx` | `8427d1e Added settings tab` | 2 |
| `frontend/src/AuthContext.jsx` | `9fa84af Theme update change` | 18 |
| `frontend/src/ProtectedRoute.jsx` | `78b946b First Public Commit` | 23 |
| `frontend/src/api.js` | `8877632 Pre-Deploy build` | 13 |
| `frontend/src/main.jsx` | `9fa84af Theme update change` | 3 |
| `frontend/src/styles.css` | `95e73ae Added StaminaChem Font` | 71 |

### frontend/src/components/

| File | Last Commit | ±Lines |
|------|-------------|--------|
| `frontend/src/components/AddIndexModal.jsx` | `b908f20 Bunch of QOL updates and COTERMs fix` | 25 |
| `frontend/src/components/DonutChart.jsx` | `78b946b First Public Commit` | 24 |
| `frontend/src/components/EditCellModal.jsx` | `78b946b First Public Commit` | 236 |
| `frontend/src/components/ErrorBoundary.jsx` | `8877632 Pre-Deploy build` | 46 |
| `frontend/src/components/EvoChart.jsx` | `9fa84af Theme update change` | 8 |
| `frontend/src/components/FileUpload.jsx` | `78b946b First Public Commit` | 63 |
| `frontend/src/components/Footer.jsx` | `8877632 Pre-Deploy build` | 33 |
| `frontend/src/components/ImpersonationBar.jsx` | `9fa84af Theme update change` | 4 |
| `frontend/src/components/IncotermAdjustments.jsx` | `7fd22e8 First part of the INCOTERM rework` | 159 |
| `frontend/src/components/IndexDetailPanel.jsx` | `9fa84af Theme update change` | 2 |
| `frontend/src/components/IndexPopupModal.jsx` | `9fa84af Theme update change` | 6 |
| `frontend/src/components/IndexTrendChart.jsx` | `78b946b First Public Commit` | 91 |
| `frontend/src/components/Modal.jsx` | `78b946b First Public Commit` | 46 |
| `frontend/src/components/Navbar.jsx` | `8427d1e Added settings tab` | 192 |
| `frontend/src/components/QuarterPriceList.jsx` | `b908f20 Bunch of QOL updates and COTERMs fix` | 2 |
| `frontend/src/components/TeamSelector.jsx` | `78b946b First Public Commit` | 20 |

### frontend/src/pages/

| File | Last Commit | ±Lines |
|------|-------------|--------|
| `frontend/src/pages/Admin.jsx` | `a371858 feat(admin,teams): full team management with single-owner transfer model` | 200 |
| `frontend/src/pages/AuditTrail.jsx` | `9fa84af Theme update change` | 2 |
| `frontend/src/pages/Brief.jsx` | `9fa84af Theme update change` | 2 |
| `frontend/src/pages/CostModelBuilder.jsx` | `7fd22e8 First part of the INCOTERM rework` | 77 |
| `frontend/src/pages/Dashboard.jsx` | `9fa84af Theme update change` | 8 |
| `frontend/src/pages/Evolution.jsx` | `7fd22e8 First part of the INCOTERM rework` | 27 |
| `frontend/src/pages/FxRates.jsx` | `78b946b First Public Commit` | 127 |
| `frontend/src/pages/Home.jsx` | `78b946b First Public Commit` | 105 |
| `frontend/src/pages/Indexes.jsx` | `9fa84af Theme update change` | 2 |
| `frontend/src/pages/Login.jsx` | `2a61276 Fixed login auth page` | 2 |
| `frontend/src/pages/Pricing.jsx` | `7fd22e8 First part of the INCOTERM rework` | 2 |
| `frontend/src/pages/Privacy.jsx` | `8877632 Pre-Deploy build` | 52 |
| `frontend/src/pages/Products.jsx` | `78b946b First Public Commit` | 192 |
| `frontend/src/pages/Profile.jsx` | `8427d1e Added settings tab` | 230 |
| `frontend/src/pages/Settings.jsx` | `8427d1e Added settings tab` | 182 |
| `frontend/src/pages/Squeeze.jsx` | `9fa84af Theme update change` | 4 |
| `frontend/src/pages/SupplierPurchases.jsx` | `9fa84af Theme update change` | 2 |
| `frontend/src/pages/Suppliers.jsx` | `9fa84af Theme update change` | 2 |
| `frontend/src/pages/Team.jsx` | `a371858 feat(admin,teams): full team management with single-owner transfer model` | 80 |
| `frontend/src/pages/Terms.jsx` | `8877632 Pre-Deploy build` | 60 |

### frontend/src/utils/

| File | Last Commit | ±Lines |
|------|-------------|--------|
| `frontend/src/utils/constants.js` | `7fd22e8 First part of the INCOTERM rework` | 24 |
| `frontend/src/utils/exportCsv.js` | `78b946b First Public Commit` | 15 |
| `frontend/src/utils/quarters.js` | `78b946b First Public Commit` | 13 |
| `frontend/src/utils/theme.js` | `95e73ae Added StaminaChem Font` | 1 |

---

## Commit Reference

| Hash | Message |
|------|---------|
| `78b946b` | First Public Commit |
| `8877632` | Pre-Deploy build |
| `b908f20` | Bunch of QOL updates and COTERMs fix |
| `7fd22e8` | First part of the INCOTERM rework |
| `9fa84af` | Theme update change |
| `95e73ae` | Added StaminaChem Font |
| `8427d1e` | Added settings tab |
| `2a61276` | Fixed login auth page |
| `e61aad2` | Removed redirects SPA rule |
| `47e5e5a` | Fix tailscale flag syntax |
| `97ae050` | Fix HTTPS redirects behind proxy |
| `58d5a3e` | Install curl in Dockerfile for Tailscale |
| `d460ca1` | dev: wrangler.jsonc to serve dist as SPA (dev branch only) |
| `6c94ed8` | chore: add .gitignore + SPA redirect fallback; keep internal docs local-only |
| `c24face` | remove Pages _redirects; Worker SPA fallback handled by wrangler |
| `c0fd949` | docs: add architecture README |
| `4c6b73e` | feat(scrum-8): real admin console with search, soft-delete, audit log |
| `d2e3d47` | fix(admin): stop-impersonation cookie deletion, exclude self from user list |
| `61c4931` | fix(auth,audit): remove auto team creation; hide admin events from team log |
| `a371858` | feat(admin,teams): full team management with single-owner transfer model |
