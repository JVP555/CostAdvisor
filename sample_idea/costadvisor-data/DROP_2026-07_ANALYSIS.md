# What is in this data

Written 31 July 2026. This describes the July data drop that Wave 3 is built on.

Read this before you start a Wave 3 ticket. The tickets were rewritten to match this data.
Anything older describes the June version, which is out of date.

**These numbers are a snapshot.** The data is still being worked on. Counts will change.
The shape will not.

---

## 1. The short version

A lot arrived at once. The scope roughly doubled.

Nothing was replaced. The costing engine stays exactly as it is. New layers were added
around it:

```
        NEW: market intelligence
        categories, product ID cards, suppliers, index write-ups
                    |
        THE CORE (unchanged): formulas -> indexes -> should-cost -> gap
                    |
        NEW: decisions and actions
        strategy levers, diversification projects
```

If you find yourself deleting something that already works, stop. This is additive.

---

## 2. Four questions that had to be answered

The new data disagreed with the old code in four places. Newest data wins each time.

**1. How index prices are keyed.**
Old way: one index called "lab", with a separate region column.
New way: the region is baked into the key, like `lab-eu` and `lab-in`.
The new way wins. This is the big one, and it is why the index work is a rebuild
rather than a load.

**2. Where margin sits.**
Old way: recipe weights add up to 100, then margin is added on top.
New way: margin is one of the lines, and everything adds up to exactly 100.
The new way wins. If you add margin on top as well, you count it twice.

**3. The `FA-US` code.**
It is a reference to a commodity, not an input to another formula.
It affects 16 recipe lines. Those lines cannot be priced yet anyway,
because the series behind it has no numbers.

**4. Which Indexes mockup to follow.**
Use `indexes_mockup.html`. One exception: take the forecast data from the older file,
which has more series. The newer file looks like a bad export, not a decision.

---

## 3. The costing data

These are the CSVs in `tables/`. They are ready to load once the problems in section 5
are fixed.

| File | Rows | What it is |
|---|---|---|
| `families.csv` | 132 | Family and subfamily names. One row is completely blank. |
| `formulas.csv` | 357 | The products we can cost. |
| `combos.csv` | 1,079 | One formula priced for one region. 882 are loadable. |
| `combo_lines.csv` | 5,747 | The recipes. One row per ingredient. |
| `type_codes.csv` | 191 | Maps a recipe line's code to a price series. |
| `index_commodities.csv` | 121 | The price series. 91 have history, 30 are empty. |
| `index_feeds.csv` | 132 | The cards shown in the app. |
| `index_series.csv` | 4,548 | Monthly prices. 3,822 real, 726 forecast. |
| `index_values.csv` | 1,274 | Quarterly prices. |
| `index_forecasts.csv` | 242 | Quarterly forecasts, kept separate on purpose. |
| `_issues.csv` | 1,390 | A list of known problems. Not a bug list for you. |

### Four ideas you need

**A combo is one formula priced for one region.** This is the unit of work.
Most tickets say "per combo". They mean one row of `combos.csv`.

**A type code is not a price series.** A recipe line says `CPO-MY`.
That code maps to the series `cpo`. There are 191 codes and 121 series,
so many codes share a series.

Two things follow from that:

- 66 codes are stand-ins. We do not have the exact price, so we use a close one.
  Together they carry about 45% of the cost weight. Stand-ins are normal here,
  not a fallback.
- 60 codes, carrying about a quarter of all cost weight, map to **Brent crude oil**.
  Today the app cannot see this, because there is no layer that groups codes by
  what they map to. That is what SCRUM-74 builds.

**A card is not a series either.** There are 132 cards over 121 series.
Brent alone backs 4 cards. If you key everything by series, you lose 11 cards.

**None of these numbers are money.** They are index levels, where January 2023 = 100.
So you cannot say "this supplier is charging us 12,000 EUR too much" from this data alone.
You can only say "this is 12% above where it should be".

---

## 4. The written content

Separate from the numbers, there is a large amount of written text in `raw/`.
Nothing in the app can store any of it yet. That is what SCRUM-76 builds.

| File | What it holds |
|---|---|
| `CURATED_CONTENT.json` | The biggest one. Descriptions, applications, suppliers, compliance. |
| `SUPPLY_DEMAND_COMPLIANCE.json` | Where supply comes from, where demand goes, compliance rules. |
| `FUTURE_OUTLOOK.json` | Macro drivers and substitution risk. |
| `SYNTHESIS_ROUTES.json` | How each chemical is made. |
| `CURRENT_EVENTS_OUTLOOK.json` | Dated notes. These expire. |
| `INDEX_SEASONALITY.json` | Seasonal patterns per series. |
| `INDEX_NARRATIVES.json` | Short "why did this move" write-ups. |
| `SUPPLIER_ALIASES.json` | Company name spellings mapped to one canonical name. |
| `FUNCTIONALITY_TAXONOMY.json` | What a chemical does. 41 terms. |
| `INDUSTRY_TAXONOMY.json` | Which industry it serves. 19 terms. |
| `VOLATILITY_PERCENTILE_BREAKPOINTS.json` | Used to rank how volatile a price is. |

### Things that will change how you build this

**1. It keys to the formula code, not to a product.**
Content belongs to `formula_templates.code`. If you hang it off `products`,
teams that have not created that product cannot see it.

**2. There is no HTML in it.** It is plain fields, not documents.
So this is not a CMS. It is a table of small blocks with a type and a body.

**3. About 15% of the content has no matching formula.**
Some keys are orphans, some are group codes. If you make the formula link a
required foreign key, you silently drop a sixth of the content at import,
and the import still reports success. Make the code column required
and the formula link optional.

**4. Some content points at index series, not formulas.**
The index write-ups and seasonal notes use a different key. So the block table
needs to say what kind of thing it is attached to.

**5. Do not import seasonality or the season notes.** They are already calculated
from data we have. Importing them means text and numbers can disagree later. Generate them.

**6. Two files disagree about compliance.** For 120 shared entries they make
different regulatory claims. Nobody has decided which wins. The mockup "decides"
by accident, through a JavaScript bug, and it picks the worse source. Do not copy that.

**7. `share: 0` means "not disclosed", not zero.**
Almost every producer share is 0, and hundreds of notes say explicitly that the number
is not public. If you store 0 and show it, you publish "BASF: 0% market share".

**8. Some of the content has already gone stale.**
80 of 157 supply splits no longer match the source they were built from.
Some write-ups have formula weights typed into the text, like "Brent crude (75% weight)".
When the weight changes, the sentence is wrong and nothing notices.

**9. Some notes are author-to-self text.** They read like internal to-do notes
and would go straight to a customer. They need stripping.

---

## 5. Problems to fix before loading anything

Each of these stops a load dead.

| # | Problem |
|---|---|
| 1 | `families.csv` has plain family names, but the loader expects family codes. It throws on row 1. |
| 2 | Row 1 of `families.csv` is completely blank. Both name columns are required in the database. |
| 3 | 144 combos point at 8 family/subfamily pairs that are not in `families.csv`. The loader exits. |
| 4 | 4 combos differ only by `variant` (for example treated vs untreated talc). The database has a uniqueness rule that rejects the second one. The rule needs to include variant. |
| 5 | 23 combos use region `GL`, which is not mapped. One-line fix: `GLOBAL` already exists. |
| 6 | 17 formula IDs contain the character used to split combo IDs. Any naive split breaks. |
| 7 | 53 `null` entries sit inside `applications` lists. These break a simple loader. |
| 8 | 31 compliance entries are plain strings where an object is expected. |
| 9 | 30 series have forecast points but no history at all. |
| 10 | The Excel version of this data is missing 27 columns the CSVs have. Use the CSVs. |

**One more, and it is not a coding problem.**
251 recipe lines (about 7% of all cost weight) point at series with no numbers.
Buying three of them — `ELEC-US-PPI`, `RG-US` and `NATGAS-US` — fixes 117 of those lines.
This is the single highest-value thing in the whole drop, and it is a purchase, not code.

---

## 6. Where this clashes with code we already have

| Problem | Why it matters |
|---|---|
| `index_values.csv` has no region column, but the database requires one | This is the main price history file, and it cannot be loaded as it stands. Region is only recoverable by joining another file, and 28 cards say `multi`, which is not a region. |
| `coverage_tier` means three different things | The shipped code, the new data, and the mockup each define it differently. All three are useful. The answer is two columns, not one column with a bigger vocabulary. |
| The old margin check allows totals up to 110.5 | New data always sums to exactly 100. The old check passes it happily, then margin gets applied twice. |
| The database stores type codes as if they were indexes | It splits `PHOS-WB` into commodity `PHOS`, region `WB`. But that trailing part is often a data source, not a region. |
| Two seed loaders exist, and one picks files by date | It takes the newest matching spreadsheet it can find. Dropping the new file near the old one silently points the old loader at incompatible data. |
| SCRUM-146 has lost its input | It says "wire this to the seed confidence value". The new pipeline does not produce that value at all. |

---

## 7. What is NOT changing

People misread the mockups on this, so it is worth stating.

- **Admin, Team, Profile, Logout, Dashboard and Alerts are all staying.**
  The mockups did not draw them because they were not about those screens.
  Admin actually gets bigger.
- **Monitor, Forecast and Formulas are not being emptied.** Their mockup panes are blank
  because those pages already exist. The mockup was grouping them, not redesigning them.
- **Portfolio keeps should-cost.** The mockup says "tracked against your contracted price
  rather than the should-cost index". Read that as *as well as*, not *instead of*.
- **The three supplier ideas are not a naming clash.** They are three stages of one
  lifecycle: everyone in the market, then a candidate, then a company we buy from.

---

## 8. The new screens, briefly

You probably do not need this section unless your ticket is about a screen.

- **Categories** — 129 product lines with a market report each. Only 5 have a report today.
  Design for the empty state, because it is the normal case.
- **Strategy** — category strategy, levers, actions. There is no scoring model anywhere in it.
  The quadrant positions were placed by hand.
- **Diversification** — finding and qualifying new suppliers. Pass/fail only, no scoring.
- **Suppliers (market view)** — 167 global producers. Very rich, but the best data in it
  is not shown anywhere, and the "top competitors" list is wrong: it is alphabetical and
  cut off at 15.
- **Intelligence** — the closest match to what we already have. The current page already
  has placeholders waiting for exactly this content. The mockup has known crashes:
  17 tiles crash when clicked, and 53 more crash on the second tab.
- **Indexes** — a card gallery with a detail drawer. The existing spreadsheet stays,
  because that is how teams edit. The new view is for reading.

---

## Questions

Ask Alexis.
