"""
Convert a price between Incoterms using bucket-level adjustments.

Each Incoterm declares which of the 6 cost buckets the seller has absorbed
(see app.constants.incoterms.INCOTERMS_2020). Conversion works in two steps:

1. Recover the EXW-equivalent price by stripping out the buckets the seller
   absorbed under `from_incoterm`.
2. Re-add the buckets the seller would absorb under `to_incoterm`.

Pct-typed values are always computed against the EXW base. Flat values are
absolute $/unit in the price's currency. This makes round-trips symmetric:
    normalize(price, A, B) → normalize(_, B, A) returns price exactly.

Bucket amounts come from the price-level `adjustments` first; missing buckets
fall back to a freight-lane default. Unknown/missing Incoterms make this a
no-op so callers can opt in without guarding every code path.
"""

from app.constants.incoterms import INCOTERMS_2020, COST_BUCKETS, normalize as _norm


def _bucket_pct(adj: dict | None) -> float:
    """Return the pct value for a bucket, or 0 if not pct-typed."""
    if adj and adj.get("type") == "pct":
        return float(adj.get("value", 0) or 0)
    return 0.0


def _bucket_flat(adj: dict | None) -> float:
    """Return the flat value for a bucket, or 0 if not flat-typed."""
    if adj and adj.get("type") == "flat":
        return float(adj.get("value", 0) or 0)
    return 0.0


def _seller_totals(incoterm: str, adjustments: dict) -> tuple[float, float]:
    """Sum (pct, flat) of buckets the seller absorbs under this Incoterm."""
    pays = INCOTERMS_2020[incoterm]["seller_pays"]
    pct_total = 0.0
    flat_total = 0.0
    for bucket in COST_BUCKETS:
        if not pays.get(bucket):
            continue
        adj = adjustments.get(bucket)
        pct_total += _bucket_pct(adj)
        flat_total += _bucket_flat(adj)
    return pct_total, flat_total


def merge_adjustments(price_level: dict | None, lane_default: dict | None) -> dict:
    """Price-level adjustments win bucket-by-bucket; lane fills the gaps."""
    merged = dict(lane_default or {})
    for bucket, payload in (price_level or {}).items():
        if payload is not None:
            merged[bucket] = payload
    return merged


def normalize_price(
    price: float,
    from_incoterm: str | None,
    to_incoterm: str | None,
    adjustments: dict | None,
) -> float:
    f = _norm(from_incoterm)
    t = _norm(to_incoterm)
    if not f or not t or f == t:
        return price
    if f not in INCOTERMS_2020 or t not in INCOTERMS_2020:
        return price

    adj = adjustments or {}

    # Recover EXW: price = exw * (1 + pct_from/100) + flat_from
    pct_from, flat_from = _seller_totals(f, adj)
    exw = (price - flat_from) / (1 + pct_from / 100.0)

    # Re-emit under target Incoterm.
    pct_to, flat_to = _seller_totals(t, adj)
    return exw * (1 + pct_to / 100.0) + flat_to


def normalize_with_lane(
    price: float,
    from_incoterm: str | None,
    to_incoterm: str | None,
    price_adjustments: dict | None,
    lane_adjustments: dict | None,
) -> float:
    return normalize_price(
        price,
        from_incoterm,
        to_incoterm,
        merge_adjustments(price_adjustments, lane_adjustments),
    )
