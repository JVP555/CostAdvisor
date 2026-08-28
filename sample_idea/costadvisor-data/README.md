# CostAdvisor — data files for Wave 3

This is the data behind the Wave 3 tickets. Read this page first.

**This is a snapshot.** The data is still being worked on. Row counts will change.
The shape will not. Build against the shape, not the numbers.

---

## What is in here

| Folder | What it is |
|---|---|
| `tables/` | The main data, as CSV. Start here. |
| `raw/` | Written content: descriptions, notes, outlooks. As JSON. |
| `decisions/` | Two forms that are still empty. Alexis fills them in. See "What is missing". |
| `DROP_2026-07_ANALYSIS.md` | Longer notes on this data, including what is wrong with it. |

---

## How the pieces fit together

A product has a recipe. Each line of the recipe has a weight and names a price.

```
formulas.csv        a product we can cost
      |
combos.csv          that product, priced for one region   <-- the main unit of work
      |
combo_lines.csv     one line of the recipe: weight + a type code
      |
type_codes.csv      the code (e.g. CPO-MY) and which price series it maps to
      |
index_commodities.csv   the price series
      |
index_series.csv    the actual numbers, month by month
```

Read it top to bottom. A recipe line says "70% CPO-MY". `type_codes.csv` says CPO-MY maps
to the `cpo` series. `index_series.csv` has the numbers for `cpo`.

**A "combo" is one formula priced for one region.** Most tickets are about combos, not
about products. If a ticket says "per combo", it means one row of `combos.csv`.

---

## The files in `tables/`

| File | What it holds |
|---|---|
| `formulas.csv` | The products we can cost. One row each. |
| `combos.csv` | One formula priced for one region. Has the margin. |
| `combo_lines.csv` | The recipes. One row per ingredient. Has the weight and the type code. |
| `families.csv` | Family and subfamily names. |
| `type_codes.csv` | Every type code, and which price series it maps to. |
| `index_commodities.csv` | The price series. |
| `index_feeds.csv` | The cards shown in the app. Several cards can share one series. |
| `index_series.csv` | Price history, month by month. |
| `index_series_quarterly.csv` | The same history, grouped by quarter. |
| `index_values.csv` | Quarterly prices. |
| `index_forecasts.csv` | Future price points. |
| `_issues.csv` | Known problems in the data. |
| `_fill_report.csv` | How complete each column is. |
| `_manifest.json` | What was generated, and when. |

Two things about column names:

- `index_series.csv` calls it `series_key`. `index_values.csv` calls it `commodity_key`.
  Same thing, two names.
- `index_series.csv` has a `kind` column. It is either `actual` or `forecast`.
  Do not mix them up in the same average.

---

## Which files your ticket needs

| Ticket | Files |
|---|---|
| SCRUM-74 (index data layer) | `type_codes.csv`, `index_commodities.csv`, `index_feeds.csv` |
| SCRUM-75 (should-cost engine) | `combos.csv`, `combo_lines.csv`, `index_series.csv` |
| SCRUM-70 (forecast) | `index_forecasts.csv`, `index_series.csv`, `raw/FORE.json` |
| SCRUM-76, 78 (content, review) | everything in `raw/` |
| SCRUM-77 (dimensions) | `raw/FUNCTIONALITY_TAGS.json`, `raw/INDUSTRY_TAXONOMY.json` and friends |
| SCRUM-80 (proxies) | `type_codes.csv`, `index_commodities.csv` |

---

## Three things to know before you start

**1. `_issues.csv` is not a bug list for you.**
It is a list of known problems in the data. It is long. That is expected.
Most of it goes away once the two forms in `decisions/` are filled in.
Do not start fixing these.

**2. Two files disagree about `proxy_status`.**
`type_codes.csv` and `combo_lines.csv` both have a column called `proxy_status`.
For some rows they say different things. This is known.
Do not pick one yet. SCRUM-80 decides which one wins.

**3. Some type codes have no price series at all.**
Those recipe lines cannot be priced yet. Three codes cover most of the gap:
`ELEC-US-PPI`, `RG-US` and `NATGAS-US`. We are buying that data.
This is not something to code around.

---

## What is missing

- **The two forms in `decisions/` are empty.** `region_basis.csv` sets the currency and
  Incoterm for each region. `index_basis.csv` sets the unit and currency for each price
  series. Until they are filled in, you cannot safely do maths across two series.
- **Three price series have no numbers.** See point 3 above.

Both are being handled. Neither should stop you starting.

---

## One warning

You may see a file called `PROXY_SWAP_REGISTRY.md` mentioned somewhere.
It is not in this folder on purpose. It was built from an older version of the data
and most of its numbers are now wrong. Ignore it.

---

Questions go to Alexis.
