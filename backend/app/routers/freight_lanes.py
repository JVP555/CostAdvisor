"""
Freight lane defaults — global, broad-region pairs (Europe / NA / Asia / Latam).

Lanes are not team-scoped: they're shared seed data used as fallback values
when a price-level adjustment is missing. Anyone authenticated can read; only
update routes mutate them. Future per-team overrides would go in a separate
table.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.freight_lane import FreightLane
from app.routers.auth import get_current_user
from app.schemas.freight_lane import FreightLaneIn, FreightLaneOut
from app.services.freight_lane_lookup import get_lane

router = APIRouter()


@router.get("/", response_model=list[FreightLaneOut])
def list_lanes(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(FreightLane).order_by(
        FreightLane.origin_region, FreightLane.destination_region, FreightLane.mode
    ).all()


@router.get("/lookup", response_model=FreightLaneOut | None)
def lookup_lane(
    origin_region: str,
    destination_region: str,
    mode: str = "sea",
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return get_lane(db, origin_region, destination_region, mode)


@router.put("/{lane_id}", response_model=FreightLaneOut)
def update_lane(
    lane_id: int,
    data: FreightLaneIn,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    lane = db.query(FreightLane).filter(FreightLane.id == lane_id).first()
    if not lane:
        raise HTTPException(status_code=404, detail="Lane not found")
    lane.origin_region = data.origin_region
    lane.destination_region = data.destination_region
    lane.mode = data.mode
    lane.adjustments = data.adjustments
    db.commit()
    db.refresh(lane)
    return lane


