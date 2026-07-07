# CostAdvisor — Technical Overview (Interview Cheat-Sheet)

A plain-English walkthrough of *what the project is*, *what each piece of technology is used for*, and *why it's there*. Written the way you'd want to be able to explain it in an interview: for every tool, "what is it used for" — not just "we use X."

---

## 1. What is CostAdvisor, in one paragraph?

CostAdvisor is a **buyer-side "should-cost" intelligence platform for procurement teams**. A supplier knows their true input costs; the buyer doesn't. So when a supplier says *"oil went up 30%, we need +20%"*, the buyer can't push back. CostAdvisor closes that gap: you **decompose** a product into raw-material components (each weighted by its share of cost), **link** each component to a tracked commodity index (oil, ammonia, gas…) by region and quarter, **calculate** what the product *should* cost today given how those indices moved, and **compare** it against the supplier's actual price. The gap is the negotiation signal, and the output is a transparent, auditable cost brief you put in front of the supplier.

It's **multi-tenant** (each customer team's data is isolated), uses **Google OAuth** to sign in, and is deployed across **Cloudflare** (frontend) and **Railway** (backend + database + jobs).

---

## 2. The tech stack at a glance — what each thing is for

### Backend (Python)
| Technology | What it is | What it's used for here |
|---|---|---|
| **FastAPI** (`0.115`) | Async Python web framework | Serves the whole REST API. All app routes are under `/api/`, auth under `/auth/`. Entry point: `app/main.py`. |
| **Uvicorn** | ASGI server | Runs the FastAPI app (`uvicorn app.main:app`). |
| **SQLAlchemy 2.0** | ORM (object-relational mapper) | Maps Python classes ↔ Postgres tables. **All** DB access goes through the ORM — never raw string-interpolated SQL (SQL-injection safety). |
| **Alembic** | DB migration tool | Every schema change is a versioned migration. Tables are *never* edited by hand. |
| **psycopg2** | Postgres driver | The actual TCP connection to Postgres. |
| **Pydantic 2** + **pydantic-settings** | Validation & settings | `app/schemas/` defines the request/response contracts — all user input is validated here *before* it reaches services or the DB. Config is loaded from env vars via `pydantic-settings`. |
| **Celery + Redis** | Task queue + broker | Background/scheduled jobs: nightly scrapes of commodity indices, FX sync, live FX pulls. Redis is also the cache for AI narratives. |
| **Authlib** + **python-jose** | OAuth client + JWT | `Authlib` drives the Google OAuth handshake; `python-jose` signs/verifies the JWT session token. |
| **httpx** | Async HTTP client | Outbound calls: scraping data sources, calling the Ollama AI endpoint, calling the Frankfurter FX API. |
| **BeautifulSoup4** | HTML parser | Parses scraped HTML pages from data providers (ECB, EIA, etc.). |
| **pandas** + **openpyxl** | Data / Excel tooling | Parsing user-uploaded CSV/`.xlsx` files of prices, volumes, FX rates, index overrides (`file_parser.py`). |
| **slowapi** | Rate limiter | Protects public/expensive endpoints (e.g. brief generation, public landing-page data feeds). |
| **google-api-python-client** + **google-auth-oauthlib** | Google APIs | The demo-scheduling feature: creates Google Calendar events + Google Meet links for booked demos. |
| **Sentry** (via `observability.py`) | Error monitoring | Captures backend errors in production (wired but needs the DSN env var set). |

### Frontend (JavaScript)
| Technology | What it is | What it's used for here |
|---|---|---|
| **React 18** | UI library | The whole single-page app (SPA). |
| **React Router 6** | Client-side routing | Maps URLs → page components (`/cost-models/:id`, `/portfolio`, etc.). |
| **Vite 6** | Build tool + dev server | Fast dev server (proxies `/api` and `/auth` to `localhost:8000`) and production bundler (`npm run build` → `dist/`). |
| **Axios** | HTTP client | One configured instance in `api.js`; every backend call goes through it (also centralises error formatting). |
| **Custom chart components** | — | No third-party charting lib. `EvoChart.jsx`, `DonutChart.jsx`, `SeriesChart.jsx`, etc. are hand-built SVG. (The public landing page is the exception — it uses Chart.js from a CDN.) |

### Data & Infra
| Technology | What it's used for |
|---|---|
| **PostgreSQL** | Primary datastore. Separate DB per environment. Enforces multi-tenancy at the DB level via Row-Level Security. |
| **Redis** | Celery broker + result backend, and the cache for AI-generated narratives (7-day TTL). |
| **Cloudflare Workers** | Serves the compiled React SPA and the static landing page. |
| **Railway** | Hosts the FastAPI backend, Postgres, and Redis/Celery. |
| **Ollama (llama3.1:8b)** | Self-hosted LLM on a private Hetzner VM, reachable **only over Tailscale** — generates the cost-brief narratives. |

---

## 3. How the pieces fit together (request lifecycle)

1. **User signs in** with Google OAuth → backend issues a JWT stored in an `HttpOnly` cookie (`ca_token`).
2. **Frontend** (React SPA on Cloudflare) makes an API call via Axios to the FastAPI backend on Railway.
3. FastAPI's `get_current_user` dependency reads the cookie-JWT, identifies the user, and **sets the tenant context** (a Postgres session variable) so Row-Level Security scopes every query to that user's team.
4. The **router** validates input via a Pydantic schema, calls a **service** (business logic), which uses the **SQLAlchemy ORM** to hit Postgres.
5. For heavy/derived work (should-cost, evolution, briefs), the router calls the **costing engine**.
6. Nightly, **Celery** tasks scrape fresh index/FX data into the DB so should-cost stays current.

---

## 4. The backend, layer by layer (`backend/app/`)

The code follows a strict layered structure — this is worth calling out in an interview because it shows separation of concerns:

- **`routers/`** — HTTP endpoints. Thin. Handle auth/permission checks and delegate to services. (~30 routers: `auth`, `cost_models`, `costing`, `indexes`, `fx_rates`, `admin`, `portfolio`, `products`, `suppliers`, `teams`, `demo`, …)
- **`services/`** — the business logic. This is where the real work lives.
- **`models/`** — SQLAlchemy ORM table definitions.
- **`schemas/`** — Pydantic request/response contracts (the API's public shape).
- **`tasks/`** — Celery background jobs.
- **`constants/`** — static reference data (INCOTERMS, index metadata vocabularies).

### The service layer — the important files
- **`costing_engine.py`** — *the heart of the app, and the most complex file.* Does should-cost calculation, evolution tracking (how cost changed over time), squeeze/desqueeze, and brief data. Must be **deterministic** — same inputs always produce the same numbers, no swallowed exceptions (it's the thing customers negotiate on, so it has to be auditable).
- **`data_resolver.py`** — resolves the right index / price / volume value for a given model at a given quarter (with a region fallback chain: specific region → GLOBAL → any).
- **`fx_converter.py` / `fx_sync.py`** — currency conversion. Checks team custom FX rates first, then platform defaults, then live rates.
- **`incoterm_normalizer.py`** — normalises landed cost by INCOTERM (FOB vs CIF vs DDP…). **INCOTERM is a first-class pricing dimension here**, not a label — any pricing math must account for it.
- **`unit_converter.py`** — unit conversions (e.g. €/kg ↔ $/tonne).
- **`scraper.py` + `scrapers/`** — orchestrates nightly scrapes from ECB, EIA, Eurostat, FRED, World Bank, Frankfurter (FX).
- **`narrative.py` + `ollama.py`** — AI narrative generation for the brief (rule-based talking points + LLM prose via Ollama).
- **`permissions.py`** — the RBAC engine (`has_permission()`).
- **`file_parser.py`** — forgiving CSV/Excel upload parsing.
- **`audit.py`** — writes append-only `AuditLog` records for security-relevant events.
- **`regions.py`** — a `before_flush` SQLAlchemy listener that auto-registers any new region code so the region foreign key never rejects a write.

---

## 5. The data model (what the core tables are)

The central hierarchy is the **cost formula**:

```
CostModel  →  FormulaVersion  →  FormulaComponent  →  (references) CommodityIndex
```

- **`CostModel`** — a product's should-cost model for a supplier/region.
- **`FormulaVersion`** — a versioned formula (supports renegotiation history; each version can be simple *parts + weights* or an advanced free-form *expression*).
- **`FormulaComponent`** — one weighted input, optionally linked to a commodity index for live pricing.
- **`CommodityIndex` / `IndexValue` / `IndexOverride`** — tracked indices, their quarterly values, and team-specific overrides.
- **`ActualPrice` / `ActualVolume`** — what the supplier actually charged and how much was bought (drives the gap and total-impact numbers).
- **`FxRate` / `CustomFxRate` / `FxPair` / `FxDailyRate`** — platform FX rates, team overrides, configurable pairs, and daily live series.
- **`FreightLane`** — shipping cost adjustments for landed cost.
- **Taxonomy:** `ChemicalFamily → Subfamily → Product`, and `Region` (a first-class self-referential reference table with subregions).
- **Tenancy & auth:** `Team`, `TeamMembership`, `User`, `TeamInvite`, `PlatformAccessRequest`.
- **RBAC:** `Permission`, `Role`, `Plan`, `PlanPermission`, `TeamMemberRole`, `UserPlatformRole`.
- **`AuditLog`** — append-only record of all mutations and security events.
- **Demo scheduling:** `DemoHost`, `DemoBlockedSlot`, `DemoRequest`.

---

## 6. The concepts an interviewer will probe

### Multi-tenancy via Postgres Row-Level Security (RLS)
This is the most important architectural decision to be able to explain. Instead of remembering to add `WHERE team_id = ...` on every query (error-prone; one miss = a data leak between customers), tenancy is enforced **at the database**:
- Every tenant-facing table has an RLS policy (`tenant_isolation`).
- On each request, `get_current_user` sets a Postgres session variable (`app.current_user_id`) via a SQLAlchemy `after_begin` event listener in `database.py` (`SET LOCAL`).
- Postgres then automatically filters every query to that user's team.
- There's a deliberate **bypass** (`app.bypass_rls`) used *only* by Celery tasks, seed scripts, and migrations — never in normal request paths. *"A tenancy leak is the worst bug we can ship."*

### Authentication (Google OAuth + JWT)
- Sign-in is **Google OAuth** (scope `openid email profile` only).
- Session is a **JWT in an `HttpOnly`, `Secure` cookie** — never in `localStorage` (protects against XSS token theft).
- Sign-up is **invite-only with admin approval**: the OAuth callback gates new users unless they have an accepted access request or a pending team invite.
- (Hardening still in flight: PKCE, `state` validation, short-lived access + rotating refresh tokens — tracked as Scrum 9.)

### Role-Based Access Control (RBAC) + Plans
Three-layer permission resolution in `has_permission()`:
1. **Super-admin** bypass → 2. **Plan ceiling** (your subscription tier caps what's possible, even for a team owner) → 3. **Custom team-scoped roles** → 4. fallback to the raw `membership.role`.
- 38 granular permissions across categories (products, cost_models, indexes, fx_rates, briefs, …).
- Roles are **team-scoped** (created per team); Plans (Free, Dream Plan) set the ceiling.

### The costing engine
- Deterministic and auditable by mandate.
- Two formula modes: **simple** (parts + weights + base price + base quarter) and **advanced** (free-form expression like `0.92*[(0.75*ACN+1500)*(1-h)+h*AA/0.8]+FC`).
- Advanced expressions are evaluated by a **safe AST whitelist** (`safe_eval_expr`) — no `eval`/`exec`, no function calls or attribute access → no code injection.

### Background jobs (Celery)
- `scrape_all` — runs every registered commodity scraper + FX sync (nightly).
- `scrape_one` — a single commodity.
- `scrape_team_sources` — team-configured URL sources → `IndexOverride`.
- `scrape_fx_live` — daily live FX pull (Frankfurter API, ECB-backed) into the daily rate series.

### AI narratives (Ollama)
- Brief narratives are generated by **llama3.1:8b** on a self-hosted Ollama box, reachable only over **Tailscale** (never exposed publicly).
- Results are cached in **Redis** (7-day TTL). In production `llm_enabled=False`, so `ollama_generate()` returns cached results and never blocks on the model.

---

## 7. Frontend structure (`frontend/src/`)

- **`AuthContext.jsx`** — holds auth state (Google OAuth + JWT), active team, login errors.
- **`api.js`** — the single Axios instance; `formatApiError()` keeps raw API errors out of the UI.
- **`pages/`** — full-page views. Core workflow pages map to the value loop: `CostModelBuilder`, `Evolution`, `Brief`, `Squeeze`, plus `Dashboard`, `Pricing`, `Products`, `Suppliers`, `Admin`.
- **`pages/workspace/`** — the newer information architecture: `MonitorArea` (triage), `PortfolioArea`, `IntelligenceArea`, `ForecastArea`, `IndexLibraryArea` (single home for indexes + FX), `NegotiateArea`.
- **`components/`** — reusable UI (charts, modals, `RegionSelect`, `FileUpload`, `ImpersonationBar`).
- **`utils/`** — pure helpers (`quarters.js` — quarter granularity is the default time unit everywhere; `exportCsv.js` — anything on screen is exportable).

---

## 8. Deployment (two environments, same shape)

| | Production | Staging |
|---|---|---|
| Website | costadvisor.org | dev.costadvisor.org |
| API | api.costadvisor.org | api-dev.costadvisor.org |
| Branch | `main` | `dev` |

- Push to `main` → production deploy; push to `dev` → staging deploy.
- **Frontend**: Cloudflare Workers serving the compiled React SPA.
- **Backend**: FastAPI on Railway. **DB**: separate Postgres per environment. **Jobs**: Redis + Celery on Railway.
- **Completely separate databases and secrets per environment** — never shared.

---

## 9. Security & compliance story (SOC 2 direction)

- **Tenant isolation**: Postgres RLS on every tenant table (defense-in-depth beyond app-layer checks).
- **Encryption**: at rest (Railway Postgres) and in transit (HTTPS/TLS everywhere; no unencrypted inter-service calls; Ollama Tailscale-only).
- **Secrets**: env vars via Railway's secret manager in deployed envs, `.env` locally (gitignored — never committed).
- **Auth hardening**: OAuth + JWT in `HttpOnly`/`Secure` cookies; invite-only signup.
- **Auditability**: `AuditLog` is **append-only** — logins, role changes, exports, admin/impersonation actions are recorded and never deleted or updated.
- **Least privilege**: production data access goes through the authenticated, logged admin console — never direct DB queries.

---

## 10. Likely interview questions — quick answers

- **"Why RLS instead of filtering in code?"** — Defense in depth. A single forgotten `WHERE team_id` is a cross-customer data leak; pushing isolation into the database means it's enforced even if application code has a bug.
- **"Why FastAPI?"** — Async, fast, first-class Pydantic validation (the API contract *is* the validation layer), automatic OpenAPI docs.
- **"Why a custom charting layer instead of a library?"** — Full control over the should-cost/evolution visuals and no heavy dependency in the SPA bundle; the marketing landing page (separate) uses Chart.js.
- **"How do you keep the costing numbers trustworthy?"** — The engine is deterministic (same input → same output), has regression tests anchoring exact numbers, evaluates advanced formulas via a safe AST (no `eval`), and every figure is meant to be inspectable (index value, weight, ratio, FX rate, INCOTERM adjustment).
- **"How does data get in and out?"** — Forgiving CSV/`.xlsx` import (column-name variants tolerated, per-row errors, row-count preview before commit) and CSV export on every table/result view.
- **"Where does the live commodity/FX data come from?"** — Nightly Celery scrapers hit free public sources (ECB, EIA, Eurostat, FRED, World Bank) plus the Frankfurter API for FX; teams can also override values or point at their own URL sources.
- **"Where does the AI fit?"** — Only for the *narrative* of the brief (llama3.1:8b via Ollama over Tailscale), cached in Redis. The numbers are computed deterministically — the LLM never invents figures.

---

*Reference: see `CLAUDE.md` at the repo root for the full architecture guide, working rules, and roadmap.*
