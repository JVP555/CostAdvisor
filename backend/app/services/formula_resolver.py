"""Formula x region resolver (Scrum 58).

Two jobs:

1. Coverage resolution — given a template and a requested region, find the
   "combo" (per-region pricing row) to use. Fallback order: exact region →
   the region's parent chain (a subregion like NWE prices closer to Europe
   than to a world number) → GLOBAL → Europe.

2. Chain flattening — expand components of type "formula" (a template used as
   an input of another template) into effective index/fixed lines, scaling
   weights multiplicatively (60% of a sub-formula's 50% line = 30%). Tiered
   with a hard depth cap and cycle detection; the same walk doubles as the
   write-time guard when a chained component is saved.

All queries run through the caller's RLS-scoped session, so a team resolving
a formula can only ever see platform templates and its own.
"""
from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models.formula_template import (
    FormulaRegionCoverage,
    FormulaTemplate,
    FormulaTemplateComponent,
)
from app.models.region import Region

# Maximum number of formula-as-input hops the resolver will follow
# (product → intermediate → raw covers real tiering; the cap is a guard
# against runaway nesting, not a modelling target).
MAX_CHAIN_DEPTH = 3

# Terminal fallbacks after the requested region and its ancestors: the GLOBAL
# sentinel first, then Europe (the catalog's most complete region).
_TERMINAL_FALLBACKS = ("GLOBAL", "Europe")


class FormulaChainError(ValueError):
    """A formula chain is circular or deeper than MAX_CHAIN_DEPTH."""


def region_fallback_chain(db: Session, region: str) -> list[str]:
    """Ordered region codes to try: exact → ancestors → GLOBAL → Europe."""
    chain = [region]
    seen = {region}
    node = db.query(Region).filter(Region.code == region).first()
    while node and node.parent_id:
        node = db.get(Region, node.parent_id)
        if node and node.code not in seen:
            chain.append(node.code)
            seen.add(node.code)
    for code in _TERMINAL_FALLBACKS:
        if code not in seen:
            chain.append(code)
            seen.add(code)
    return chain


def resolve_coverage(
    db: Session, template_id: uuid.UUID, region: str
) -> tuple[FormulaRegionCoverage | None, str | None]:
    """Return (coverage row, region it was resolved at), or (None, None)."""
    rows = {
        c.region: c
        for c in db.query(FormulaRegionCoverage)
        .filter(FormulaRegionCoverage.template_id == template_id)
        .all()
    }
    for code in region_fallback_chain(db, region):
        if code in rows:
            return rows[code], code
    return None, None


def flatten_components(
    db: Session,
    template_id: uuid.UUID,
    _depth: int = 0,
    _path: tuple[uuid.UUID, ...] = (),
    _scale: float = 1.0,
) -> list[dict]:
    """Expand a template's components into effective index/fixed lines.

    Each returned dict carries the line's own weight, its effective weight
    after chain scaling, and which template it came from (for drill-down).
    Raises FormulaChainError on a cycle or a chain deeper than MAX_CHAIN_DEPTH.
    """
    if template_id in _path:
        raise FormulaChainError("Circular formula chain detected")
    if _depth > MAX_CHAIN_DEPTH:
        raise FormulaChainError(
            f"Formula chain exceeds the maximum depth of {MAX_CHAIN_DEPTH}"
        )

    components = (
        db.query(FormulaTemplateComponent)
        .filter(FormulaTemplateComponent.template_id == template_id)
        .order_by(FormulaTemplateComponent.sort_order)
        .all()
    )

    lines: list[dict] = []
    for c in components:
        if c.component_type == "formula":
            lines.extend(
                flatten_components(
                    db,
                    c.input_template_id,
                    _depth=_depth + 1,
                    _path=_path + (template_id,),
                    _scale=_scale * float(c.weight_pct) / 100.0,
                )
            )
        else:
            lines.append({
                "component_id": c.id,
                "name": c.name,
                "component_type": c.component_type,
                "commodity_id": c.commodity_id,
                "weight_pct": float(c.weight_pct),
                "effective_weight_pct": float(c.weight_pct) * _scale,
                "is_proxy": c.is_proxy,
                "depth": _depth,
                "via_template_id": template_id,
            })
    return lines


def assert_valid_chain_input(
    db: Session, parent_template_id: uuid.UUID, input_template_id: uuid.UUID
) -> None:
    """Write-time guard for a component that uses another formula as input.

    Walks the input's chain as if it already hung under the parent (depth 1,
    path seeded with the parent), so both cycles back to the parent and chains
    that would exceed MAX_CHAIN_DEPTH raise before anything is saved.
    """
    flatten_components(
        db, input_template_id, _depth=1, _path=(parent_template_id,)
    )
