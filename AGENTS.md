# AGENTS.md

Quick-start for coding agents working on **CostAdvisor** — buyer-side procurement
should-cost intelligence. FastAPI + Postgres (RLS) backend, React 18 SPA frontend,
multi-tenant, Google OAuth, deployed on Cloudflare (frontend) + Railway (backend).

> The authoritative, detailed spec is `CLAUDE.md`. This file is the fast on-ramp.

## Quick start

Prereqs: **PostgreSQL and Redis running locally.**

```bash
# First-time setup
cd backend && python -m venv venv && source venv/bin/activate && pip install -r requirements-dev.txt
cd frontend && npm install

# Run both (backend :8000, frontend :5173)
./start.sh

# Backend only        cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8000
# Frontend only       cd frontend && npx vite --host

# Migrations
cd backend && alembic upgrade head
cd backend && alembic revision --autogenerate -m "description"

# Seed a fresh DB fully (idempotent, one command)
cd backend && alembic upgrade head && python seed_all.py
```

## Tests

```bash
cd backend && pytest                    # full suite
cd backend && pytest tests/test_rls.py  # single file
cd frontend && npx vite build           # frontend must build clean
```

## Branch → deploy model (READ THIS before touching branches)

| Branch | Contains | Deploys to |
|---|---|---|
| `main` | production | costadvisor.org / api.costadvisor.org |
| `dev` | **canonical dev** — includes `CLAUDE.md`, `sample_idea/`, `.claude/`, `AGENTS.md` | (source of truth, not deployed directly) |
| `dev-push` | `dev` **minus internal docs** (`CLAUDE.md`, `sample_idea/`, `.claude/`, `AGENTS.md`) **plus** deploy fixes (`auth.py` URLs → `settings.app_url`, `landing/wrangler.jsonc` name `costadvisor-landing-dev`) | dev.costadvisor.org / app.dev.costadvisor.org / api-dev.costadvisor.org |
| `dev-backup` | plain mirror of `dev` | safety net |

- **`dev-push` is maintained by REBUILD + force-push, never by `git merge dev`.**
  Reset it to the new `dev` tip, re-apply the strip commit (delete the internal docs)
  and the two deploy edits, then force-push. A merge would resurrect stripped docs.
- **Never push unless the user explicitly says "push" / "deploy".** Push only to `dev`
  (or `dev-push`/`dev-backup` when asked) — **never** directly to `main`.
- **Commit after every implementation** (unless told not to). Commit trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Architecture in one screen

- **Backend** `backend/app/` — FastAPI at `app/main.py`; routes prefixed `/api/`
  (auth is `/auth/`). Layers: `routers/` → `schemas/` (Pydantic contract) →
  `services/` → `models/`. Alembic for all schema changes.
- **Costing engine** `services/costing_engine.py` — should-cost / evolution /
  squeeze / brief. Most complex file; must stay **deterministic** (no swallowed
  exceptions in calc paths). Related: `data_resolver.py`, `formula_resolver.py`,
  `incoterm_normalizer.py`, `fx_converter.py`.
- **Data model** — `CostModel → FormulaVersion → FormulaComponent`; a component can
  reference a `CommodityIndex`. Catalog: `ChemicalFamily → Subfamily → Product` and
  `FormulaTemplate (+ components, + region coverage)`. `AuditLog` records mutations.
- **Frontend** `frontend/src/` — React 18 + Router 6, CSS-variable design system
  (**no Tailwind/shadcn**). Auth in `AuthContext.jsx`. All HTTP via `api.js`
  (`formatApiError()` for errors). Journey nav: Indexes → Portfolio → Monitor →
  Forecast → Negotiate → Intelligence → Team → Admin. Charts are custom components.
- **Jobs** — Redis + Celery (`app/tasks/`). **AI** — Ollama (llama3.1:8b) over
  Tailscale only; `llm_enabled=False` in prod (returns cached or None).

## Multi-tenancy & security (do not violate)

- **Postgres RLS** (`tenant_isolation` policy) enforces team isolation at the DB.
  Never write a query that bypasses it. The only bypass is for seeds / migrations /
  Celery / admin, via `bypass_rls_var.set(True)` (contextvar) in `app/database.py`.
- Gate sensitive actions with `require_permission(...)`; audit-log every mutation.
- Secrets are env vars (`.env` locally, gitignored — **never commit `.env`**).
  Separate DBs/secrets per environment.

## Common mistakes (avoid these)

1. **Bypassing RLS** in a normal query — tenancy leak is the worst bug we can ship.
2. **`git merge dev` into `dev-push`** — wrong; rebuild it instead (see table).
3. **Pushing without being asked**, or pushing to `main`.
4. **Building an API response object after `db.commit()`** — transaction-local RLS
   GUCs reset on commit and lazy relationships detach. Build the response (or
   `db.expunge`) **before** committing. (See renegotiate / override-save fixes.)
5. **Editing `backend/app/routers/auth.py` in text mode** — it uses **CRLF**; a
   Python text-mode write flips it to LF and produces a spurious whole-file diff.
   Edit byte-level (`open(f,'rb')`/`'wb'`) to preserve line endings.
6. **Schema changes by hand** — always Alembic; keep Pydantic schemas in sync.
7. **Ignoring INCOTERM / FX** in any pricing path — both are first-class.
8. **Swallowing exceptions in the costing engine** — calc paths must be deterministic.
9. **Markdown docs in the repo root or elsewhere** — all `.md` docs go in `jvpdocs/`
   (this file and `CLAUDE.md` are the sanctioned root exceptions).
10. **New top-level dirs / new frameworks** — follow the existing layer structure
    (`routers/services/models/schemas/tasks`, `pages/components/utils`).

## Key files

- `CLAUDE.md` — full project spec + scrum/wave TODO (start here for context).
- `backend/app/main.py`, `backend/app/database.py` (RLS contextvars).
- `backend/app/services/costing_engine.py`, `formula_resolver.py`.
- `backend/seed_all.py` — one-command DB seed (idempotent).
- `frontend/src/api.js`, `frontend/src/AuthContext.jsx`.
- `landing/index.html` — self-contained marketing page (StaminaChem brand).

## Env setup notes

- Backend env (`backend/.env`): DB URI, JWT secret, Google OAuth creds, Ollama URL,
  Fernet keys (`GOOGLE_CALENDAR_ENCRYPTION_KEY`), `APP_URL`, `sentry_dsn`.
- Frontend uses `VITE_API_BASE_URL` (empty in dev → Vite proxy forwards `/api` &
  `/auth` to :8000; set to the deployed API in prod).
