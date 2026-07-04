"""Load the Scrum 57 index metadata + proxy mapping from the reference workbook.

Reads sample_idea/scrum57/seed-data-reference.xlsx (the 158 feeds) and loads them
against the region-agnostic (commodity, region) shape:

- Feed names bake region in ("Iron scrap · China"); we reconcile that to a base
  commodity ("Iron scrap") — region is NOT written onto the index (it lives on
  index_values). So the 158 feeds collapse to ~59 CommodityIndex rows.
- Metadata (access_tier / frequency / role / retrieval_status / free source /
  proxy_logic) is index-level per the spec. Where a commodity's regional feeds
  disagree (20 of 32 multi-region commodities do), we take a representative feed
  by a fixed region priority (documented below). Per-region proxy fidelity is a
  follow-up for FD-1 (SCRUM-80).
- The 2 hard-blocked feeds (ilmenite, rutile) are marked retrieval_status=blocked,
  never dropped.

Idempotent: upserts by (case-insensitive) name. Run:  python -m seed_index_metadata
Seeded reference commodities are identifiable by `retrieval_status IS NOT NULL`.
"""
import re
import sys
from pathlib import Path

import openpyxl
from sqlalchemy import func

from app.constants.index_metadata import (
    ACCESS_TIERS, FREQUENCIES, ROLES, RETRIEVAL_STATUSES, validate_proxy_logic,
)
from app.database import SessionLocal, bypass_rls_var
from app.models.index_data import CommodityIndex

DEFAULT_XLSX = Path(__file__).resolve().parents[1] / "sample_idea" / "scrum57" / "seed-data-reference.xlsx"

# Which regional feed's metadata represents the (region-agnostic) index when
# regions disagree. Broadest signal first, then the major markets.
REGION_PRIORITY = ["Global", "EU", "NA", "APAC", "CN", "IN", "LA", "MEA"]


def base_name(name: str) -> str:
    """Strip the ' · Region' label a feed name carries → the base commodity name."""
    return re.split(r"\s*·\s*", str(name))[0].strip()


def to_proxy_logic(retrieval: str, prose) -> dict | None:
    """Build the structured proxy_logic spec. The reference only gives analyst
    prose, so we store it in `note` and leave the executable params for SCRUM-67.
    Pure 'free' feeds need no proxy → None."""
    prose = (str(prose).strip() if prose else "")
    if retrieval not in ("good_proxy", "weak_proxy", "blocked") or not prose:
        return None
    return validate_proxy_logic({
        "base_index": None, "operation": None, "spread": None,
        "spread_unit": None, "recalibration": None, "note": prose,
    })


def pick_representative(feeds: list[dict]) -> dict:
    """Choose the feed whose metadata represents the index, by region priority."""
    order = {r: i for i, r in enumerate(REGION_PRIORITY)}
    return sorted(feeds, key=lambda f: order.get(f["region"], len(order)))[0]


def _read_feeds(xlsx_path: Path) -> list[dict]:
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    rows = list(wb["Indexes"].iter_rows(values_only=True))
    hdr = rows[0]
    idx = {name: i for i, name in enumerate(hdr)}
    feeds = []
    for r in rows[1:]:
        def g(col):
            v = r[idx[col]]
            return None if v is None else (v.strip() if isinstance(v, str) else v)
        feeds.append({
            "index_id": g("Index ID"),
            "name": g("Name"),
            "base": base_name(g("Name")),
            "category": g("Category"),
            "region": str(g("Region")) if g("Region") is not None else "",
            "access": g("Access"),
            "frequency": g("Frequency"),
            "role": g("Use"),
            "retrieval": g("Retrieval"),
            "free_source": g("Free source"),
            "free_source_url": g("Free source URL"),
            "proxy": g("Proxy logic"),
        })
    return feeds


def build_commodities(feeds: list[dict]) -> dict[str, dict]:
    """Collapse feeds → one metadata dict per base commodity (representative feed)."""
    groups: dict[str, list[dict]] = {}
    for f in feeds:
        groups.setdefault(f["base"], []).append(f)
    out = {}
    for base, group in groups.items():
        rep = pick_representative(group)
        out[base] = {
            "category": rep["category"],
            "access_tier": rep["access"],
            "frequency": rep["frequency"],
            "role": rep["role"],
            "retrieval_status": rep["retrieval"],
            "free_source_name": rep["free_source"],
            "free_source_url": rep["free_source_url"],
            "proxy_logic": to_proxy_logic(rep["retrieval"], rep["proxy"]),
            "regions": sorted({f["region"] for f in group}),
        }
    return out


def load(db, xlsx_path: Path = DEFAULT_XLSX) -> dict:
    feeds = _read_feeds(xlsx_path)
    commodities = build_commodities(feeds)

    created = updated = 0
    for name, meta in commodities.items():
        # Sanity-check vocab so bad reference data fails loudly rather than silently.
        assert meta["access_tier"] in ACCESS_TIERS, meta["access_tier"]
        assert meta["frequency"] in FREQUENCIES, meta["frequency"]
        assert meta["role"] in ROLES, meta["role"]
        assert meta["retrieval_status"] in RETRIEVAL_STATUSES, meta["retrieval_status"]

        ci = db.query(CommodityIndex).filter(func.lower(CommodityIndex.name) == name.lower()).first()
        if ci is None:
            ci = CommodityIndex(name=name)
            db.add(ci)
            created += 1
        else:
            updated += 1
        ci.category = meta["category"] or ci.category
        ci.access_tier = meta["access_tier"]
        ci.frequency = meta["frequency"] or ci.frequency
        ci.role = meta["role"]
        ci.retrieval_status = meta["retrieval_status"]
        ci.free_source_name = meta["free_source_name"]
        ci.free_source_url = meta["free_source_url"]
        ci.proxy_logic = meta["proxy_logic"]

    blocked = [n for n, m in commodities.items() if m["retrieval_status"] == "blocked"]
    region_combos = sum(len(m["regions"]) for m in commodities.values())
    return {
        "feeds": len(feeds),
        "commodities": len(commodities),
        "created": created,
        "updated": updated,
        "blocked": sorted(blocked),
        "region_combos": region_combos,
    }


def main():
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    if not xlsx.exists():
        raise SystemExit(f"Reference workbook not found: {xlsx}")
    bypass_rls_var.set(True)  # platform reference data — no user context
    db = SessionLocal()
    try:
        report = load(db, xlsx)
        db.commit()
    finally:
        db.close()
    print(f"Loaded {report['feeds']} feeds → {report['commodities']} commodities "
          f"({report['created']} created, {report['updated']} updated) across "
          f"{report['region_combos']} region combos.")
    print(f"Blocked (marked, not dropped): {report['blocked']}")


if __name__ == "__main__":
    main()
