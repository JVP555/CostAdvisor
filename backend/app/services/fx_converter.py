"""FX rate lookup and currency conversion. Custom team rates take priority over platform defaults."""
import uuid
from sqlalchemy.orm import Session

from app.models.fx_rate import FxRate
from app.models.custom_fx_rate import CustomFxRate


def get_fx_rate(
    db: Session,
    from_ccy: str,
    to_ccy: str,
    year: int,
    quarter: int,
    team_id: uuid.UUID | str | None = None,
) -> float | None:
    """Look up FX rate. Custom team override takes priority over platform rate."""
    if from_ccy == to_ccy:
        return 1.0

    # 1. Custom team override (priority)
    if team_id:
        custom = db.query(CustomFxRate).filter(
            CustomFxRate.team_id == team_id,
            CustomFxRate.from_currency == from_ccy,
            CustomFxRate.to_currency == to_ccy,
            CustomFxRate.year == year,
            CustomFxRate.quarter == quarter,
        ).first()
        if custom:
            return float(custom.rate)
        inv_custom = db.query(CustomFxRate).filter(
            CustomFxRate.team_id == team_id,
            CustomFxRate.from_currency == to_ccy,
            CustomFxRate.to_currency == from_ccy,
            CustomFxRate.year == year,
            CustomFxRate.quarter == quarter,
        ).first()
        if inv_custom and float(inv_custom.rate) != 0:
            return 1.0 / float(inv_custom.rate)

    # 2. Platform default
    rate = db.query(FxRate).filter(
        FxRate.from_currency == from_ccy,
        FxRate.to_currency == to_ccy,
        FxRate.year == year,
        FxRate.quarter == quarter,
    ).first()

    if rate:
        return float(rate.rate)

    # Try the inverse
    inverse = db.query(FxRate).filter(
        FxRate.from_currency == to_ccy,
        FxRate.to_currency == from_ccy,
        FxRate.year == year,
        FxRate.quarter == quarter,
    ).first()

    if inverse and float(inverse.rate) != 0:
        return 1.0 / float(inverse.rate)

    return None


def convert_price(
    db: Session,
    value: float,
    from_ccy: str,
    to_ccy: str,
    year: int,
    quarter: int,
    team_id: uuid.UUID | str | None = None,
) -> float:
    """Convert a price from one currency to another. Returns original if no rate found."""
    rate = get_fx_rate(db, from_ccy, to_ccy, year, quarter, team_id=team_id)
    if rate is None:
        return value
    return value * rate
