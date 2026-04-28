from datetime import datetime
from pydantic import BaseModel, field_validator

from app.constants.incoterms import COST_BUCKETS
from app.schemas.cost_model import LandedCostAdjustment


def _validate_adjustments(v: dict) -> dict:
    out = {}
    for bucket, payload in (v or {}).items():
        if bucket not in COST_BUCKETS:
            raise ValueError(f"Unknown cost bucket: {bucket}")
        if payload is None:
            continue
        out[bucket] = LandedCostAdjustment.model_validate(payload).model_dump()
    return out


class FreightLaneIn(BaseModel):
    origin_region: str
    destination_region: str
    mode: str = "sea"
    adjustments: dict

    @field_validator("adjustments")
    @classmethod
    def valid_adjustments(cls, v):
        return _validate_adjustments(v)


class FreightLaneOut(BaseModel):
    id: int
    origin_region: str
    destination_region: str
    mode: str
    adjustments: dict
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}
