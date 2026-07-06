import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.formula_template import (
    FormulaTemplate,
    FormulaTemplateComponent,
    FormulaRegionCoverage,
)
from app.models.index_data import CommodityIndex
from app.models.region import Region
from app.models.team import TeamMembership
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.formula_template import (
    FormulaTemplateCreate,
    FormulaTemplateUpdate,
    FormulaTemplateOut,
    FormulaComponentsReplace,
    FormulaComponentOut,
    FormulaCoverageIn,
    FormulaCoverageOut,
    FormulaResolveOut,
    ResolvedLineOut,
)
from app.services.audit import log_event
from app.services.formula_resolver import (
    FormulaChainError,
    assert_valid_chain_input,
    flatten_components,
    resolve_coverage,
)
from app.services.permissions import require_permission, require_platform_permission, has_platform_permission

router = APIRouter()


def _first_team_id(db: Session, user_id: uuid.UUID) -> uuid.UUID | None:
    m = db.query(TeamMembership).filter(TeamMembership.user_id == user_id).first()
    return m.team_id if m else None


def _enrich_with_emails(db: Session, templates: list[FormulaTemplate]) -> list[FormulaTemplateOut]:
    """Batch-load creator emails + taxonomy names to avoid N+1 queries."""
    from app.models.chemical_family import ChemicalFamily
    from app.models.subfamily import Subfamily

    creator_ids = list({t.created_by for t in templates})
    email_map = {
        u.id: u.email
        for u in db.query(User).filter(User.id.in_(creator_ids)).all()
    } if creator_ids else {}
    family_ids = list({t.family_id for t in templates if t.family_id is not None})
    family_map = {
        f.id: (f.code, f.name)
        for f in db.query(ChemicalFamily).filter(ChemicalFamily.id.in_(family_ids)).all()
    } if family_ids else {}
    sub_ids = list({t.subfamily_id for t in templates if t.subfamily_id is not None})
    sub_map = {
        s.id: s.name
        for s in db.query(Subfamily).filter(Subfamily.id.in_(sub_ids)).all()
    } if sub_ids else {}

    result = []
    for t in templates:
        out = FormulaTemplateOut.model_validate(t)
        out.creator_email = email_map.get(t.created_by)
        if t.family_id in family_map:
            out.family_code, out.family_name = family_map[t.family_id]
        out.subfamily_name = sub_map.get(t.subfamily_id)
        result.append(out)
    return result


@router.get("/", response_model=list[FormulaTemplateOut])
def list_formulas(
    team_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_permission(db, current_user, team_id, "formulas.view")
    templates = (
        db.query(FormulaTemplate)
        .filter(
            or_(FormulaTemplate.team_id == None, FormulaTemplate.team_id == team_id)  # noqa: E711
        )
        .order_by(FormulaTemplate.team_id.nullsfirst(), FormulaTemplate.name)
        .all()
    )
    return _enrich_with_emails(db, templates)


@router.post("/", response_model=FormulaTemplateOut, status_code=201)
def create_formula(
    data: FormulaTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.team_id is None:
        require_platform_permission(db, current_user, "formulas.edit")
    else:
        require_permission(db, current_user, data.team_id, "formulas.edit")

    template = FormulaTemplate(
        team_id=data.team_id,
        created_by=current_user.id,
        name=data.name,
        description=data.description,
        expression=data.expression,
        variables=data.variables,
    )
    db.add(template)
    db.flush()

    audit_team_id = data.team_id or _first_team_id(db, current_user.id)
    if audit_team_id:
        log_event(db, audit_team_id, current_user.id, "create", "formula_template",
                  str(template.id),
                  new_value={"name": data.name, "platform": data.team_id is None})

    db.expunge(template)
    db.commit()

    refreshed = db.query(FormulaTemplate).filter(FormulaTemplate.id == template.id).first()
    out = FormulaTemplateOut.model_validate(refreshed)
    out.creator_email = current_user.email
    return out


@router.put("/{template_id}", response_model=FormulaTemplateOut)
def update_formula(
    template_id: uuid.UUID,
    data: FormulaTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = db.query(FormulaTemplate).filter(FormulaTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Formula template not found")

    if template.team_id is None:
        require_platform_permission(db, current_user, "formulas.edit")
    else:
        require_permission(db, current_user, template.team_id, "formulas.edit")

    prev = {"name": template.name, "expression": template.expression}
    if data.name is not None:
        template.name = data.name
    if data.description is not None:
        template.description = data.description
    if data.expression is not None:
        template.expression = data.expression
    if data.variables is not None:
        template.variables = data.variables

    audit_team_id = template.team_id or _first_team_id(db, current_user.id)
    if audit_team_id:
        log_event(db, audit_team_id, current_user.id, "update", "formula_template",
                  str(template.id), previous_value=prev,
                  new_value={"name": template.name})

    db.flush()
    db.expunge(template)
    db.commit()

    refreshed = db.query(FormulaTemplate).filter(FormulaTemplate.id == template_id).first()
    out = FormulaTemplateOut.model_validate(refreshed)
    out.creator_email = current_user.email
    return out


@router.delete("/{template_id}")
def delete_formula(
    template_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = db.query(FormulaTemplate).filter(FormulaTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Formula template not found")

    if template.team_id is None:
        require_platform_permission(db, current_user, "formulas.delete")
    else:
        require_permission(db, current_user, template.team_id, "formulas.delete")

    # A template chained into another formula can't be deleted — the visible
    # pre-check gives a friendly message; the FK (no ondelete) backstops
    # references RLS hides from this caller.
    ref = (
        db.query(FormulaTemplateComponent)
        .filter(FormulaTemplateComponent.input_template_id == template_id)
        .first()
    )
    if ref:
        raise HTTPException(
            status_code=409,
            detail="This formula is used as an input by another formula — remove that reference first",
        )

    audit_team_id = template.team_id or _first_team_id(db, current_user.id)
    if audit_team_id:
        log_event(db, audit_team_id, current_user.id, "delete", "formula_template",
                  str(template_id), previous_value={"name": template.name})

    db.delete(template)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This formula is used as an input by another formula — remove that reference first",
        )
    return {"status": "deleted"}


@router.get("/can-edit-platform")
def can_edit_platform_formulas(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Used by the frontend to gate platform formula UI without exposing the full permission check."""
    return {"can_edit": has_platform_permission(db, current_user, "formulas.edit")}


# ── Weighted components + per-region coverage + resolver (Scrum 58) ──────────

def _get_visible_template(
    db: Session, template_id: uuid.UUID, team_id: uuid.UUID | None = None
) -> FormulaTemplate:
    """Fetch a template the caller may read (RLS enforces this at the DB too;
    the explicit team check keeps a team from addressing another team's
    template through a team_id they *are* a member of)."""
    template = db.query(FormulaTemplate).filter(FormulaTemplate.id == template_id).first()
    if not template or (
        team_id is not None
        and template.team_id is not None
        and template.team_id != team_id
    ):
        raise HTTPException(status_code=404, detail="Formula template not found")
    return template


def _require_template_edit(db: Session, current_user: User, template: FormulaTemplate) -> None:
    if template.team_id is None:
        require_platform_permission(db, current_user, "formulas.edit")
    else:
        require_permission(db, current_user, template.team_id, "formulas.edit")


@router.get("/{template_id}/components", response_model=list[FormulaComponentOut])
def list_components(
    template_id: uuid.UUID,
    team_id: uuid.UUID,
    region: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Without a region: the template-level (region-NULL) lines the API
    manages. With one: that exact region's seeded line set (no fallback —
    use /resolve for resolved views)."""
    require_permission(db, current_user, team_id, "formulas.view")
    _get_visible_template(db, template_id, team_id)
    return (
        db.query(FormulaTemplateComponent)
        .filter(
            FormulaTemplateComponent.template_id == template_id,
            FormulaTemplateComponent.region == region if region is not None
            else FormulaTemplateComponent.region.is_(None),
        )
        .order_by(FormulaTemplateComponent.sort_order)
        .all()
    )


@router.put("/{template_id}/components", response_model=list[FormulaComponentOut])
def replace_components(
    template_id: uuid.UUID,
    data: FormulaComponentsReplace,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Replace the template's weighted lines as a block (weights sum to 100)."""
    template = _get_visible_template(db, template_id)
    _require_template_edit(db, current_user, template)

    # Referenced commodity indexes must exist (friendlier than the FK error).
    commodity_ids = {c.commodity_id for c in data.components if c.commodity_id is not None}
    if commodity_ids:
        found = {
            row[0]
            for row in db.query(CommodityIndex.id).filter(CommodityIndex.id.in_(commodity_ids)).all()
        }
        missing = commodity_ids - found
        if missing:
            raise HTTPException(status_code=400, detail=f"Unknown commodity index id(s): {sorted(missing)}")

    # Chained inputs: must be visible, scope-compatible, acyclic, within depth.
    for comp in data.components:
        if comp.component_type != "formula":
            continue
        if comp.input_template_id == template_id:
            raise HTTPException(status_code=400, detail="A formula cannot use itself as an input")
        input_t = db.query(FormulaTemplate).filter(
            FormulaTemplate.id == comp.input_template_id
        ).first()
        if not input_t:
            raise HTTPException(status_code=404, detail="Input formula template not found")
        # A platform formula resolved by any team must never pull in one
        # team's private formula; a team formula may chain platform or its own.
        if template.team_id is None and input_t.team_id is not None:
            raise HTTPException(
                status_code=400,
                detail="A platform formula can only use platform formulas as inputs",
            )
        if template.team_id is not None and input_t.team_id not in (None, template.team_id):
            raise HTTPException(
                status_code=400,
                detail="A team formula can only use platform or same-team formulas as inputs",
            )
        try:
            assert_valid_chain_input(db, template_id, comp.input_template_id)
        except FormulaChainError as e:
            raise HTTPException(status_code=400, detail=str(e))

    # Only the template-level (region-NULL) set is API-managed; the seeded
    # per-region combo recipes (Scrum 60) are owned by the seed loader and
    # must survive an API edit.
    db.query(FormulaTemplateComponent).filter(
        FormulaTemplateComponent.template_id == template_id,
        FormulaTemplateComponent.region.is_(None),
    ).delete(synchronize_session=False)

    rows = [
        FormulaTemplateComponent(
            template_id=template_id,
            name=c.name,
            component_type=c.component_type,
            commodity_id=c.commodity_id,
            input_template_id=c.input_template_id,
            weight_pct=c.weight_pct,
            is_proxy=c.is_proxy,
            sort_order=c.sort_order if c.sort_order else i,
        )
        for i, c in enumerate(data.components)
    ]
    db.add_all(rows)
    db.flush()

    audit_team_id = template.team_id or _first_team_id(db, current_user.id)
    if audit_team_id:
        log_event(db, audit_team_id, current_user.id, "update", "formula_template_components",
                  str(template_id),
                  new_value={"count": len(rows), "names": [r.name for r in rows]})

    # Response built before commit — the transaction-local RLS GUCs reset on
    # commit, so a post-commit re-query can come back empty.
    out = [FormulaComponentOut.model_validate(r) for r in rows]
    for r in rows:
        db.expunge(r)
    db.commit()
    return out


@router.get("/{template_id}/coverage", response_model=list[FormulaCoverageOut])
def list_coverage(
    template_id: uuid.UUID,
    team_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_permission(db, current_user, team_id, "formulas.view")
    _get_visible_template(db, template_id, team_id)
    return (
        db.query(FormulaRegionCoverage)
        .filter(FormulaRegionCoverage.template_id == template_id)
        .order_by(FormulaRegionCoverage.region)
        .all()
    )


@router.put("/{template_id}/coverage/{region}", response_model=FormulaCoverageOut)
def upsert_coverage(
    template_id: uuid.UUID,
    region: str,
    data: FormulaCoverageIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create or update the combo (this formula priced in this region)."""
    template = _get_visible_template(db, template_id)
    _require_template_edit(db, current_user, template)

    # Explicit check instead of leaning on the free-text safety net — a typo'd
    # region on a curated pricing row should fail, not auto-register a region.
    if not db.query(Region).filter(Region.code == region).first():
        raise HTTPException(status_code=400, detail=f"Unknown region code: {region}")

    row = db.query(FormulaRegionCoverage).filter(
        FormulaRegionCoverage.template_id == template_id,
        FormulaRegionCoverage.region == region,
    ).first()
    created = row is None
    if created:
        row = FormulaRegionCoverage(template_id=template_id, region=region)
        db.add(row)
    row.base_price = data.base_price
    row.currency = data.currency
    row.margin_pct = data.margin_pct
    row.base_year = data.base_year
    row.base_quarter = data.base_quarter
    db.flush()

    audit_team_id = template.team_id or _first_team_id(db, current_user.id)
    if audit_team_id:
        log_event(db, audit_team_id, current_user.id,
                  "create" if created else "update", "formula_region_coverage",
                  f"{template_id}:{region}",
                  new_value={"base_price": data.base_price, "margin_pct": data.margin_pct})

    out = FormulaCoverageOut.model_validate(row)
    db.expunge(row)
    db.commit()
    return out


@router.delete("/{template_id}/coverage/{region}")
def delete_coverage(
    template_id: uuid.UUID,
    region: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = _get_visible_template(db, template_id)
    _require_template_edit(db, current_user, template)

    row = db.query(FormulaRegionCoverage).filter(
        FormulaRegionCoverage.template_id == template_id,
        FormulaRegionCoverage.region == region,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="No coverage for this region")

    audit_team_id = template.team_id or _first_team_id(db, current_user.id)
    if audit_team_id:
        log_event(db, audit_team_id, current_user.id, "delete", "formula_region_coverage",
                  f"{template_id}:{region}")

    db.delete(row)
    db.commit()
    return {"status": "deleted"}


@router.get("/{template_id}/resolve", response_model=FormulaResolveOut)
def resolve_formula(
    template_id: uuid.UUID,
    region: str,
    team_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resolve a formula for a region: the coverage combo (with fallback
    exact → parent region → GLOBAL → Europe) plus the flattened effective
    component lines (chained formulas expanded, weights scaled)."""
    require_permission(db, current_user, team_id, "formulas.view")
    _get_visible_template(db, template_id, team_id)

    cov, resolved_region = resolve_coverage(db, template_id, region)
    try:
        lines = flatten_components(db, template_id, region=region)
    except FormulaChainError as e:
        # Should be unreachable for API-written data (write-time guards), but
        # seed scripts write directly — surface it rather than 500.
        raise HTTPException(status_code=400, detail=str(e))

    # Enrich with display names in two batch lookups.
    commodity_ids = {l["commodity_id"] for l in lines if l["commodity_id"] is not None}
    commodity_names = {
        row.id: row.name
        for row in db.query(CommodityIndex.id, CommodityIndex.name)
        .filter(CommodityIndex.id.in_(commodity_ids)).all()
    } if commodity_ids else {}
    template_ids = {l["via_template_id"] for l in lines}
    template_names = {
        row.id: row.name
        for row in db.query(FormulaTemplate.id, FormulaTemplate.name)
        .filter(FormulaTemplate.id.in_(template_ids)).all()
    } if template_ids else {}

    return FormulaResolveOut(
        template_id=template_id,
        region_requested=region,
        region_resolved=resolved_region,
        coverage=FormulaCoverageOut.model_validate(cov) if cov else None,
        lines=[
            ResolvedLineOut(
                **l,
                commodity_name=commodity_names.get(l["commodity_id"]),
                via_template_name=template_names.get(l["via_template_id"]),
            )
            for l in lines
        ],
    )
