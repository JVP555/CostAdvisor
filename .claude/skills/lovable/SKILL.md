---
name: lovable
description: Ship complete, polished product features the way Lovable does — full vertical slices (UI + API + data) with beautiful SaaS defaults and every state handled, not isolated snippets. Use when building a new end-to-end feature for CostAdvisor and you want it to feel shippable, cohesive, and product-grade across the whole stack.
---

# lovable — full-stack, product-grade vertical slices

Lovable (ex-GPT Engineer) is known for turning a prompt into a *working, polished product feature* — frontend, backend, and data wired end to end, with the finish of a real SaaS app. Channel that completeness and polish.

## What Lovable is known for
- **Vertical slices** — a feature is done when the user can complete the whole flow, not when one layer compiles. UI ↔ API ↔ DB all connected.
- **Beautiful defaults** — cohesive spacing, color, and typography out of the box; no "developer art".
- **Every state polished** — empty, loading, error, success, and edge cases all designed, with clear next actions.
- **Opinionated cohesion** — one design system applied consistently; the app feels like one product, not stitched parts.
- **Real flows** — auth, permissions, validation, and persistence actually work, not stubbed.

## Apply it in THIS repo
A complete CostAdvisor slice usually spans:
- **Frontend**: a `pages/` view + `components/`, calls via `api.js`, auth via `AuthContext.jsx`, errors via `formatApiError()`.
- **Backend**: `routers/` endpoint → `schemas/` (Pydantic contract, kept in sync with the ORM) → `services/` logic → `models/`.
- **Security/tenancy**: gate sensitive actions with `require_permission(...)`; respect Postgres RLS (never bypass it outside seeds/migrations/admin); write an `AuditLog` entry for every mutation.
- **States**: follow the project's empty-state pattern (Scrum 16) — every list/chart gets a non-empty empty state with a clear next action.
- **Migrations**: schema changes go through Alembic only.
- **Costing**: anything touching pricing must account for INCOTERM normalization and FX; the costing engine must stay deterministic (no swallowed exceptions).

## Definition of done (Lovable bar)
- [ ] User can complete the entire flow end-to-end on a fresh team
- [ ] Frontend + router + schema + service + model all consistent
- [ ] Permission-gated + audit-logged where it mutates or exports
- [ ] Empty/loading/error/success states all designed
- [ ] Cohesive with the existing design system and StaminaChem-teal brand
- [ ] Committed after implementation (project rule)
