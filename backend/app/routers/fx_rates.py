import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.fx_rate import FxRate
from app.models.custom_fx_rate import CustomFxRate
from app.routers.auth import get_current_user
from app.schemas.fx_rate import FxRateOut, CustomFxRateOut, CustomFxRateUpsert
from app.services.file_parser import parse_fx_upload
from app.services.permissions import require_permission

router = APIRouter()


def require_super_admin(user: User):
    if not user.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin required")


@router.get("/", response_model=list[FxRateOut])
def list_fx_rates(
    from_currency: str | None = Query(None),
    to_currency: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(FxRate)
    if from_currency:
        query = query.filter(FxRate.from_currency == from_currency)
    if to_currency:
        query = query.filter(FxRate.to_currency == to_currency)
    return query.order_by(FxRate.year, FxRate.quarter).all()


@router.post("/upload")
async def upload_fx_rates(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_super_admin(current_user)

    content = await file.read()
    filename = file.filename or "upload"
    rows = parse_fx_upload(content, filename)

    count = 0
    for row in rows:
        existing = db.query(FxRate).filter(
            FxRate.from_currency == row["from_currency"],
            FxRate.to_currency == row["to_currency"],
            FxRate.year == row["year"],
            FxRate.quarter == row["quarter"],
        ).first()

        if existing:
            existing.rate = row["rate"]
            existing.uploaded_by = current_user.id
        else:
            fx = FxRate(
                from_currency=row["from_currency"],
                to_currency=row["to_currency"],
                year=row["year"],
                quarter=row["quarter"],
                rate=row["rate"],
                uploaded_by=current_user.id,
            )
            db.add(fx)
        count += 1

    db.commit()
    return {"status": "uploaded", "rows_processed": count, "filename": filename}


# ── Custom team FX rates ──────────────────────────────────────────────────────

@router.get("/can-edit-custom")
def can_edit_custom(
    team_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.permissions import has_permission
    return {"can_edit": has_permission(db, current_user, team_id, "fx_rates.edit")}


@router.get("/custom", response_model=list[CustomFxRateOut])
def list_custom_fx_rates(
    team_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_permission(db, current_user, team_id, "fx_rates.view")
    return db.query(CustomFxRate).filter(
        CustomFxRate.team_id == team_id
    ).order_by(CustomFxRate.year, CustomFxRate.quarter).all()


@router.put("/custom", response_model=CustomFxRateOut)
def upsert_custom_fx_rate(
    payload: CustomFxRateUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_permission(db, current_user, payload.team_id, "fx_rates.edit")
    existing = db.query(CustomFxRate).filter(
        CustomFxRate.team_id == payload.team_id,
        CustomFxRate.from_currency == payload.from_currency,
        CustomFxRate.to_currency == payload.to_currency,
        CustomFxRate.year == payload.year,
        CustomFxRate.quarter == payload.quarter,
    ).first()
    if existing:
        existing.rate = payload.rate
        existing.updated_by = current_user.id
    else:
        existing = CustomFxRate(
            team_id=payload.team_id,
            from_currency=payload.from_currency,
            to_currency=payload.to_currency,
            year=payload.year,
            quarter=payload.quarter,
            rate=payload.rate,
            updated_by=current_user.id,
        )
        db.add(existing)
    db.flush()
    rate_id = existing.id
    db.expunge(existing)
    db.commit()
    return db.query(CustomFxRate).filter(CustomFxRate.id == rate_id).first()


@router.delete("/custom/{rate_id}", status_code=204)
def delete_custom_fx_rate(
    rate_id: uuid.UUID,
    team_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_permission(db, current_user, team_id, "fx_rates.edit")
    rate = db.query(CustomFxRate).filter(
        CustomFxRate.id == rate_id,
        CustomFxRate.team_id == team_id,
    ).first()
    if not rate:
        raise HTTPException(status_code=404, detail="Custom FX rate not found")
    db.delete(rate)
    db.commit()


@router.post("/custom/copy-from-default", response_model=dict)
def copy_default_fx_rates(
    team_id: uuid.UUID = Query(...),
    year: int = Query(...),
    quarter: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Copy all platform default rates for a given year/quarter into team custom overrides."""
    require_permission(db, current_user, team_id, "fx_rates.edit")
    defaults = db.query(FxRate).filter(
        FxRate.year == year,
        FxRate.quarter == quarter,
    ).all()
    count = 0
    for d in defaults:
        existing = db.query(CustomFxRate).filter(
            CustomFxRate.team_id == team_id,
            CustomFxRate.from_currency == d.from_currency,
            CustomFxRate.to_currency == d.to_currency,
            CustomFxRate.year == d.year,
            CustomFxRate.quarter == d.quarter,
        ).first()
        if existing:
            existing.rate = d.rate
            existing.updated_by = current_user.id
        else:
            db.add(CustomFxRate(
                team_id=team_id,
                from_currency=d.from_currency,
                to_currency=d.to_currency,
                year=d.year,
                quarter=d.quarter,
                rate=d.rate,
                updated_by=current_user.id,
            ))
        count += 1
    db.commit()
    return {"copied": count, "year": year, "quarter": quarter}
