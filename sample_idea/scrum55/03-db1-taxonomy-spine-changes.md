# DB-1 · Taxonomy spine: subfamily + platform/team forking

**Estimate:** 8 pts · **Status:** ✅ Done (committed on `dev`, `40ed77b`) · **Reference:** [`02-platform-vs-team.md`](./02-platform-vs-team.md)

---

## Why this exists

Two companies in the same category genuinely build and price the same product
differently — different suppliers, volumes, contracts, sometimes a slightly
different recipe. One rigid shared catalog will never fit everyone.

So we ship a **solid shared starting catalog**, and any team can take a piece of
it and make their **own private copy to edit** however they need — without it
touching ours or anyone else's. This task is the taxonomy that makes that
possible: the extra **subfamily** layer the real catalog needs, plus the
**copy-and-own ("forking")** model underneath it.

---

## Before → after

**Before:** `ChemicalFamily` was flat and global — `id` + a globally-unique
`name`, no parent, no `team_id`, no subfamily. `Product` linked to it via
`chemical_family_id` and already carried a `team_id`.

**After — a forkable three-tier spine:**

```
family  ─▶  subfamily  ─▶  product
(F01–F28)   (91 grain)     (257 grain)
```

Every family and subfamily row is now owned by one of two owners, decided by a
single column, `team_id`:

- `team_id IS NULL` → **platform** row (shipped by us, shared read-only with
  every team — the starting catalog).
- `team_id = <a team>` → that team's **private fork**.

A fork also stores `origin_id`, a back-link to the platform row it was copied
from. That back-link is the one trick that lets a team **rename** their copy
without breaking platform formula/index resolution — the app can always answer
"this team row is really a copy of *that* platform row" by following `origin_id`
(a stable integer id), never the mutable `name`.

> **Heads-up for anyone walking the taxonomy:** family codes (F01–F28) **skip
> numbers** — they are not contiguous. And `code` is **not** globally unique (a
> fork shares its origin's code). Never assume contiguity or code-uniqueness.

---

## What changed, by sub-task

### 1. Models (`family` / `subfamily` + `team_id`, `origin_id`; repoint Product)

- **`app/models/chemical_family.py`** — `ChemicalFamily` (the family tier) gains
  `team_id` (nullable FK → `teams`, `ON DELETE CASCADE`), `origin_id` (nullable
  self-FK → `chemical_families`, `ON DELETE SET NULL`), and `code` (`String(16)`,
  nullable). The old global `unique=True` on `name` is dropped from the column
  (uniqueness is re-scoped in the migration). Adds `subfamilies` and self-ref
  `origin` relationships.
- **`app/models/subfamily.py`** *(new)* — `Subfamily` with `family_id`
  (FK → `chemical_families`, `CASCADE`), `team_id` (nullable), `origin_id`
  (nullable self-FK), `code`, `name`. Same fork shape as the family tier.
- **`app/models/product.py`** — `Product` gains a nullable `subfamily_id`
  (FK → `subfamilies`, `ON DELETE SET NULL`) and **keeps `chemical_family_id`**.
  Nothing is dropped or renamed, so existing products still map to a family.
- **`app/models/__init__.py`** — registers `Subfamily`.
- Schemas updated to expose the new fields: `schemas/chemical_family.py`
  (`code`, `team_id`, `origin_id`, `ChemicalFamilyForkRequest`),
  `schemas/subfamily.py` *(new)*, `schemas/product.py` (`subfamily_id`).

### 2. Migration + backfill (`tx1a2b3c4d5e`)

`alembic/versions/tx1a2b3c4d5e_taxonomy_spine_subfamily_forking.py`, chained off
the prior head `idxfq2b3c4d5e`.

- Adds `team_id` / `origin_id` / `code` to `chemical_families`, creates the
  `subfamilies` table, adds `products.subfamily_id`.
- **Backfill is deliberately trivial and safe:** the family link
  (`chemical_family_id`) is never touched, and `subfamily_id` starts `NULL`, so
  **every product that mapped to a family still does** — no data destroyed, no
  orphaning.
- **Drops the old global `UNIQUE(name)`** (`chemical_families_name_key`) — it
  would break forking, because an un-renamed fork of "Surfactants" would collide
  with the platform "Surfactants". Replaced with **partial unique indexes**:
  - platform names unique among platform rows (`WHERE team_id IS NULL`),
  - team names unique per team (`WHERE team_id IS NOT NULL`),
  - the same pair on `subfamilies`, scoped per parent family.
- Enables **RLS** on both new-owner tables (see sub-task 3).
- Ships a real, correctly-ordered `downgrade()` (drops dependents before
  parents, restores the global unique constraint). Verified reversible with a
  `downgrade -1` → `upgrade head` round-trip.

### 3. RLS policies (platform readable by all; team rows scoped)

Both `chemical_families` and `subfamilies` get `ENABLE` **+ `FORCE`** ROW LEVEL
SECURITY and a `tenant_isolation` policy identical in shape to the existing
`formula_templates` precedent:

```
USING ( bypass_rls
        OR team_id IS NULL                       -- platform: visible to everyone
        OR team_id IN (the caller's team_memberships) )  -- team: only its members
```

- Platform rows (`team_id IS NULL`) are readable by every authenticated team.
- A team fork is visible only to members of that team.
- `bypass_rls` is the escape hatch for Celery tasks, seed scripts, and
  migrations (set via the `app.bypass_rls` GUC) — never used on tenant request
  paths.
- **`FORCE` is load-bearing:** the app connects as the table *owner* and as a
  non-superuser / non-`BYPASSRLS` role, so without `FORCE` the owner would slip
  past the policy. (Confirmed against `pg_roles` during verification.)

### 4. Fork endpoint (copy a platform node → team node, set `origin_id`)

`app/routers/chemical_families.py` and `app/routers/subfamilies.py` *(new)*,
registered in `main.py` at `/api/chemical-families` and `/api/subfamilies`.

- `POST /api/chemical-families/{id}/fork` and `POST /api/subfamilies/{id}/fork`
  copy a **platform** node into a team: new row with `team_id = <target team>`,
  `origin_id = <source id>`, copying `name` / `code` (and the family's
  `custom_attribute_schema`). A forked subfamily keeps `family_id` pointing at
  the platform parent family (readable via RLS).
- **Only platform nodes are forkable** — forking a team row returns **400**.
- **Duplicate forks are blocked** — a second fork of the same platform node into
  the same team returns **409**.
- **Gated on `products.edit`** for the target team, so a non-member cannot fork
  into someone else's team (**403**).
- Team-scoped create/delete were added alongside; platform create/delete stays
  **super-admin** only.

---

## API surface (new / changed)

| Method | Path | Purpose | Gate |
|---|---|---|---|
| `GET` | `/api/chemical-families/?team_id=` | Platform families + the team's forks | authenticated |
| `POST` | `/api/chemical-families/` | Create (platform or team) | super-admin / `products.edit` |
| `POST` | `/api/chemical-families/{id}/fork` | Fork a platform family into a team | `products.edit` |
| `DELETE` | `/api/chemical-families/{id}` | Delete family/fork | super-admin / `products.delete` |
| `GET` | `/api/subfamilies/?family_id=&team_id=` | Platform + team subfamilies | authenticated |
| `POST` | `/api/subfamilies/` | Create (platform or team) | super-admin / `products.edit` |
| `POST` | `/api/subfamilies/{id}/fork` | Fork a platform subfamily into a team | `products.edit` |
| `DELETE` | `/api/subfamilies/{id}` | Delete subfamily/fork | super-admin / `products.delete` |

Fork/create/delete write an `AuditLog` event (`fork` / `create` / `delete` on
`chemical_family` / `subfamily`).

---

## Tests

`backend/tests/test_taxonomy.py` — **8 tests**, all green; full suite **59
passed**, no regressions.

- DB-level RLS isolation for family **and** subfamily (RLS-on session: other
  team's fork invisible, platform row visible).
- Fork creates a team copy **and survives a rename** — mutates `name`, asserts
  `origin_id` unchanged and the origin row still resolves.
- Can't fork a team row (400); duplicate fork (409); foreign-team fork (403).
- Subfamily fork keeps `family_id` at the platform parent.
- Product maps to a family with subfamily optional (create family-only, then
  attach a subfamily via PUT).

---

## Done-when → verification

Independently audited by three parallel review agents against the committed code
and the **live DB / test run** (not the author's summary):

| Criterion | Result |
|---|---|
| A team can fork a platform family/subfamily, rename it, and platform resolution still works (`origin_id` resolves) | ✅ CONFIRMED |
| RLS keeps one team from reading another team's taxonomy | ✅ CONFIRMED (SQL + empirical two-team test) |
| Every existing product still maps to a family after the migration | ✅ CONFIRMED (`chemical_family_id` untouched) |

---

## Known follow-ups (out of scope for DB-1)

- **Non-blocking robustness nit:** the duplicate-fork guard is an app-level
  check-then-insert; there is no DB unique constraint on `(team_id, origin_id)`.
  Under concurrent identical requests the 409 check can race — the partial
  unique index backstops the un-renamed case, but as an `IntegrityError` (500),
  not a clean 409. A `(team_id, origin_id)` unique index would be tidier
  defense-in-depth.
- **Naming:** the existing `ChemicalFamily` model was extended in place rather
  than renamed to `ProductFamily`; it is referenced across ~19 files + a shipped
  migration + seed scripts, and a rename wasn't required by the done-when
  criteria.
- **Next tasks in Scrum 55:** seed the real 22 → 91 → 257 catalog; frontend
  taxonomy UI (browse / fork / rename); repoint a team's products onto their
  forks.
