"""Lookup helpers for freight lanes. Kept in services so the costing engine
doesn't have to import a router (which would pull in auth, rate-limit, etc.)."""

from sqlalchemy.orm import Session

from app.models.freight_lane import FreightLane


def get_lane(
    db: Session,
    origin_region: str | None,
    destination_region: str | None,
    mode: str = "sea",
) -> FreightLane | None:
    if not origin_region or not destination_region:
        return None
    return db.query(FreightLane).filter(
        FreightLane.origin_region == origin_region,
        FreightLane.destination_region == destination_region,
        FreightLane.mode == mode,
    ).first()


def get_lane_adjustments(
    db: Session,
    origin_region: str | None,
    destination_region: str | None,
    mode: str = "sea",
) -> dict | None:
    lane = get_lane(db, origin_region, destination_region, mode)
    return lane.adjustments if lane else None
