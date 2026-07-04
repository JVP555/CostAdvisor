# Incoterms (in plain words)

## What it is

An **Incoterm** is a 3-letter code that says **where the cost and risk pass from the seller to the buyer.** It's basically the line on the map where 'my problem' becomes 'your problem.'

## Why it matters

Here's the thing worth landing first: a big share of our users are category managers in procurement, and Incoterms are the language they price in. When one of them looks at a quote, the Incoterm is right there in their head next to the number — it's not a footnote to them, it's half the price. So if you get why Incoterms matter, you've basically got a window into how our user reasons about a quote. That's the real payoff here.

The way I'd picture the problem it solves: two quotes can show the **same price** and still not be comparable at all.

```
Supplier A:  EUR 1.00 / kg   EXW   -> you pay freight, insurance, and duties on top
Supplier B:  EUR 1.00 / kg   DDP   -> delivered to your door, all-in
```

Same number on the page. But Supplier B is clearly the cheaper deal. The Incoterm is the only reason you can tell. A category manager sees that gap instantly — it's the first thing they check. So a price without an Incoterm is really an incomplete price, and that's why we store the Incoterm right next to every price in the app.

## The two worth knowing

- **EXW** (Ex Works) — collect it at the factory. The buyer does everything from there.
- **DDP** (Delivered Duty Paid) — delivered to your door. The seller does everything.

Every other Incoterm sits somewhere between these two — so if you anchor on these ends, the rest just fill in the middle.

## The named place

One thing I should spell out: an Incoterm almost always comes with a **place**. 'FOB **Rotterdam**' means cost and risk pass once the goods are on the ship in Rotterdam. The place isn't decoration — it's part of what the code means. That's why we store two things together: the **code** (FOB) and the **named place** (Rotterdam).

## Watch this first (10 min)

**Incoterms for beginners | Global Trade Explained** — https://youtu.be/4LuSSdzK6aM

It walks through all of them with a map, which honestly makes the whole thing click faster than any text will.

## The full list (reference — no need to memorize)

| Code | Short meaning |
|---|---|
| EXW | Collect at seller's factory |
| FCA | Seller hands goods to your carrier |
| FAS | Alongside the ship |
| FOB | On board the ship |
| CFR | Seller pays freight to destination port |
| CIF | CFR + insurance |
| CPT | Seller pays carriage to a named place |
| CIP | CPT + insurance |
| DPU | Delivered and unloaded |
| DAP | Delivered, not unloaded |
| DDP | Delivered to your door, duties paid |

It's worth not assuming you'll need all eleven of them day to day — in practice the two ends (**EXW** and **DDP**) cover most of what you'll actually see.
