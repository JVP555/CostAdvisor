import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.formula_template import FormulaTemplate
from app.models.team import TeamMembership
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.formula_template import FormulaTemplateCreate, FormulaTemplateUpdate, FormulaTemplateOut
from app.services.audit import log_event
from app.services.permissions import require_permission, require_platform_permission, has_platform_permission

router = APIRouter()


def _first_team_id(db: Session, user_id: uuid.UUID) -> uuid.UUID | None:
    m = db.query(TeamMembership).filter(TeamMembership.user_id == user_id).first()
    return m.team_id if m else None


def _enrich_with_emails(db: Session, templates: list[FormulaTemplate]) -> list[FormulaTemplateOut]:
    """Batch-load creator emails to avoid N+1 queries."""
    creator_ids = list({t.created_by for t in templates})
    email_map = {
        u.id: u.email
        for u in db.query(User).filter(User.id.in_(creator_ids)).all()
    } if creator_ids else {}
    result = []
    for t in templates:
        out = FormulaTemplateOut.model_validate(t)
        out.creator_email = email_map.get(t.created_by)
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

    audit_team_id = template.team_id or _first_team_id(db, current_user.id)
    if audit_team_id:
        log_event(db, audit_team_id, current_user.id, "delete", "formula_template",
                  str(template_id), previous_value={"name": template.name})

    db.delete(template)
    db.commit()
    return {"status": "deleted"}


@router.get("/can-edit-platform")
def can_edit_platform_formulas(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Used by the frontend to gate platform formula UI without exposing the full permission check."""
    return {"can_edit": has_platform_permission(db, current_user, "formulas.edit")}
