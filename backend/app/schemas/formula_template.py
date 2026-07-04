import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

# Weights must sum to exactly 100 per template; tolerance absorbs float noise
# from the UI, not real imbalance.
WEIGHT_SUM_TOLERANCE = 0.01


class FormulaTemplateCreate(BaseModel):
    team_id: uuid.UUID | None = None
    name: str
    description: str | None = None
    # Optional since Scrum 58: a template can be purely weighted components.
    expression: str | None = None
    variables: dict | None = None


class FormulaTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    expression: str | None = None
    variables: dict | None = None


class FormulaTemplateOut(BaseModel):
    id: uuid.UUID
    team_id: uuid.UUID | None
    created_by: uuid.UUID
    creator_email: str | None = None
    name: str
    description: str | None
    expression: str | None
    variables: dict | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Weighted components (Scrum 58) ────────────────────────────────────────────

class FormulaComponentIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    component_type: Literal["index", "fixed", "formula"]
    commodity_id: int | None = None
    input_template_id: uuid.UUID | None = None
    # Signed percent (a by-product credit can be negative).
    weight_pct: float
    is_proxy: bool = False
    sort_order: int = 0

    @model_validator(mode="after")
    def _check_target_coherence(self):
        if self.component_type == "index" and self.commodity_id is None:
            raise ValueError("an 'index' component requires commodity_id")
        if self.component_type == "formula" and self.input_template_id is None:
            raise ValueError("a 'formula' component requires input_template_id")
        if self.component_type == "index" and self.input_template_id is not None:
            raise ValueError("an 'index' component cannot carry input_template_id")
        if self.component_type == "formula" and self.commodity_id is not None:
            raise ValueError("a 'formula' component cannot carry commodity_id")
        if self.component_type == "fixed" and (
            self.commodity_id is not None or self.input_template_id is not None
        ):
            raise ValueError("a 'fixed' component carries no index or formula reference")
        return self


class FormulaComponentsReplace(BaseModel):
    """Replace-all payload: weighted lines are edited as a block."""
    components: list[FormulaComponentIn]

    @model_validator(mode="after")
    def _check_weights_sum(self):
        if self.components:
            total = sum(c.weight_pct for c in self.components)
            if abs(total - 100.0) > WEIGHT_SUM_TOLERANCE:
                raise ValueError(
                    f"component weights must sum to 100 (got {total:g})"
                )
        return self


class FormulaComponentOut(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID
    name: str
    component_type: str
    commodity_id: int | None
    input_template_id: uuid.UUID | None
    weight_pct: float
    is_proxy: bool
    sort_order: int

    model_config = {"from_attributes": True}


# ── Per-(formula x region) coverage (Scrum 58) ───────────────────────────────

class FormulaCoverageIn(BaseModel):
    base_price: float | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    margin_pct: float | None = Field(default=None, ge=-100, le=100)
    base_year: int | None = Field(default=None, ge=2000, le=2100)
    base_quarter: int | None = Field(default=None, ge=1, le=4)

    @field_validator("currency")
    @classmethod
    def _upper_currency(cls, v):
        return v.upper() if v else v

    @model_validator(mode="after")
    def _base_period_pairs(self):
        if (self.base_year is None) != (self.base_quarter is None):
            raise ValueError("base_year and base_quarter must be set together")
        return self


class FormulaCoverageOut(BaseModel):
    id: uuid.UUID
    template_id: uuid.UUID
    region: str
    base_price: float | None
    currency: str | None
    margin_pct: float | None
    base_year: int | None
    base_quarter: int | None
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Resolver output (Scrum 58) ───────────────────────────────────────────────

class ResolvedLineOut(BaseModel):
    component_id: uuid.UUID
    name: str
    component_type: str
    commodity_id: int | None
    commodity_name: str | None = None
    weight_pct: float
    effective_weight_pct: float
    is_proxy: bool
    depth: int
    via_template_id: uuid.UUID
    via_template_name: str | None = None


class FormulaResolveOut(BaseModel):
    template_id: uuid.UUID
    region_requested: str
    region_resolved: str | None
    coverage: FormulaCoverageOut | None
    lines: list[ResolvedLineOut]
