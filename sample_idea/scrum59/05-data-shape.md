# What the seed data actually looks like

**Why this matters.** You're about to load families, subfamilies, formulas, region combos and indexes — and those words stay abstract until you see the real thing, which is exactly when it's easy to build the wrong structure. So before any of that, here's the concrete shape, pulled straight from the seed files. The *complete* lists live one file over in **`seed-data-reference.xlsx`** (Families / Formulas / Indexes tabs, sortable); this page is just the picture that makes them make sense.

## The shape, in one picture

```
Family            (22 of them)      e.g. F01 Oleochemicals
  Subfamily       (91 total)        e.g. Fatty acids
    Formula       (257 total)       e.g. OLE-FAC-SAT  "Fatty acids saturated C16/C18"
      Combo       (676 total)       the same formula priced in ONE region: OLE-FAC-SAT·EU

Indexes           (158 feeds)       the public prices a formula is built from
```

A **formula** is one should-cost recipe. Its physical form is baked into its id (the `-SAT` / `-LIQ` / `-PWD` suffix). The same formula priced in a given region is a **combo** — add those up across all 257 formulas and you get 676.

## The 22 families

Note the codes jump — F01, F02, then F04… six numbers in the F01–F28 range simply aren't used, so nothing should assume they run 1-2-3.

F01 Oleochemicals, F02 Surfactants, F04 Resins & Polymers, F05 Elastomers, F06 Solvents, F07 Specialty Polymers, F08 Agrochemicals, F10 Performance Chemicals, F11 Pigments & Colorants, F12 Base Chemicals & Intermediates, F13 Advanced Materials, F14 Fluids & Lubricants, F15 Silicones, F16 Phosphorus Chemicals, F18 Superabsorbent Polymers, F22 Industrial Gases, F23 Animal & Human Nutrition, F24 Rheology Modifiers & Thickeners, F25 Chelating Agents, F26 Biocides & Antimicrobials, F27 Aroma Chemicals, F28 Crop Protection Chemicals

## One family, opened up: F01 Oleochemicals

It has 8 subfamilies. Taking the first one, **Fatty acids**, here are its formulas:

| Formula ID | Name | # Regions |
|---|---|---|
| `OLE-FAC-SAT` | Fatty acids saturated C16/C18 | 6 |
| `OLE-FAC-UNS` | Fatty acids unsaturated oleic C18:1 | 4 |

(That `# Regions` is how one formula becomes several combos.)

## What an index feed looks like

Most prices aren't free at source, so each index says how we actually get a live number — `free`, a `good_proxy` / `weak_proxy` recipe, or `blocked`. A few real rows:

| Index ID | Name | Region | Retrieval | How we get it |
|---|---|---|---|---|
| `IDX-BRENT-GLB` | Brent crude · Global | Global | `free` | EIA Brent Spot Price (RBRTE) (direct) |
| `IDX-BO1-NWE` | Base oil Group I SN150 · EU | EU | `good_proxy` | Brent + fixed Gr I spread (~$120-150/t), recalibrate quarterly |
| `IDX-ILM-MB` | Ilmenite ore · Global | Global | `blocked` | no free feed — TiO2 sulfate process feedstock. |
| `IDX-RUT-MB` | Rutile ore · Global | Global | `blocked` | no free feed — TiO2 chloride process feedstock. |

The full 158 (with proxy recipes and which formulas use each) are on the **Indexes** tab of `seed-data-reference.xlsx`.

## Where each Wave 2 story touches this

- **DB-1** builds the family -> subfamily -> product tree above.
- **DB-3** adds the retrieval / proxy fields on each index.
- **DB-4** stores the weighted components behind each formula.
- **SEED-1 / SEED-2** load all of it (and gate the low-confidence rows).

