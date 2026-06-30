---
name: bolt
description: Move from idea to a running prototype fast, the way Bolt.new does — scaffold a working full-stack slice end to end, then refine. Use when speed matters: spiking a new page/feature, validating an approach, or standing up a runnable skeleton quickly using the repo's existing stack and run scripts.
---

# bolt — fast prototype-first full-stack scaffolding

Bolt.new (StackBlitz) is known for going prompt → running app in one shot: it scaffolds the whole project and gets something live immediately, then iterates. Channel that bias toward a **runnable result fast**, refined afterward.

## What Bolt is known for
- **Running first** — get a working skeleton on screen before polishing; momentum over perfection on the first pass.
- **Full scaffold** — wires the whole slice (routes, components, data) so it actually runs, not a fragment.
- **Tight iteration loop** — small visible steps; run, look, adjust.
- **Pragmatism** — sensible defaults, real libraries already in the project, no premature abstraction.

## Apply it in THIS repo
- **Run it the project's way**: `./start.sh` (backend :8000 + frontend :5173), or `uvicorn app.main:app --reload` / `npx vite --host` individually. Prereqs: Postgres + Redis running.
- **Reuse what's here** — React 18 + Router 6, `api.js`, `AuthContext.jsx`, existing chart/components and CSS tokens; FastAPI routers/schemas/services/models. Don't add new frameworks or top-level dirs to go fast.
- **Scaffold a vertical** quickly: stub the router endpoint + Pydantic schema, wire a `pages/` view through `api.js`, get the round-trip working against the local DB, *then* harden.
- **Verify as you go**: `cd backend && pytest` (or a single file, e.g. `pytest tests/test_rls.py`); `cd frontend && npx vite build` for a clean frontend build.

## The Bolt rhythm
1. Smallest runnable end-to-end slice first (it renders, it fetches, it shows *something*).
2. Look at it running; fix the obvious.
3. Layer in states, permissions, audit, polish (hand off to the `lovable` skill for the product-grade pass).
4. Commit once the slice works (project rule).

## Guardrails (fast ≠ careless)
- Never bypass RLS; never commit `.env`; never push unless asked.
- Pricing paths still need INCOTERM/FX correctness even in a prototype — flag clearly if a spike skips them.
- Don't leave swallowed exceptions in the costing engine.
