# How our seed data is shaped

This one's for whoever loads the starting data into the database. Before you touch any code, I want to walk you through the *shape* of it, in plain words.

## The three things we load

We ship the app with a starting set of data. Picture it as three layers, stacked:

```
Families      ->  big buckets        (example: 'Surfactants')
  Subfamilies ->  smaller buckets     (example: 'Fatty Alcohols')
    Products  ->  the actual items     (example: 'C12-14 Alcohol')
```

And then two more sets that hang off the side:

```
Indexes    ->  public prices we track          (example: 'Palm Oil CIF NWE')
Formulas   ->  recipes that turn indexes into a should-cost
```

## The golden rule for loading: re-runnable

Here's the thing about this data: you'll load it **more than once.** Better data keeps arriving, so you'll come back and run the loader again. That's why it needs to be **idempotent** — and the promise that has to hold is simple:

> Running the loader twice gives the same result as running it once. No duplicates.

The way we keep that promise is worth spelling out. Every row carries a **stable key** — a name or code that never changes. On load, the rule is 'update the row with this key, or create it if it's missing.' So we're never just blindly adding rows.

| Layer | Stable key (example) |
|---|---|
| Family | the family name |
| Subfamily | family + subfamily name |
| Product | subfamily + product name |
| Index | the index code |
| Formula | its `formula_id` — the form is already baked in (e.g. `OLE-FAC-SAT`, `SUR-CAPB-LIQ`) |
| Combo (a formula priced in one region) | `formula_id` + region |

## How a formula is shaped

A formula is really just a list of **weighted lines** plus a margin. Here's one:

```
C12-14 Alcohol (Europe):
  60%  ->  Palm Oil index
  10%  ->  Energy index
  30%  ->  other / fixed
  +12% margin
```

Each line points at one index and carries a **weight** — how much of the cost that index explains. The weights add up to 100%, and the margin goes on top.

Two things worth flagging, because they come from how the business actually thinks about price:

- A line can be marked **proxy** — that means 'we don't have the exact index, so we lean on a close stand-in.' That flag is worth keeping around; it's what tells the user how much to trust the number. To a category manager, a proxy-based price is a softer signal than an exact one, and they want to know the difference.
- The same product gets priced differently per **region** — a buyer genuinely pays a different price in Asia than in Europe. Its physical **form** (powder vs liquid) is already part of the `formula_id` itself (the `-SAT` / `-LIQ` / `-PWD` suffix). So a formula's identity is its `formula_id`, and that same formula priced in one region is what we call a **combo** — keyed by `formula_id` + region. Add those up across all 257 formulas and you get the 676 combos.

## What 'good' looks like when you're done

- Run the loader twice -> row counts don't change the second time.
- Update one value in the source -> re-run -> only that row changes.
- Pick three products by hand -> their should-cost matches what the source says it should be.

If those three hold, the intake worked.
