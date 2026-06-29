import uuid
from datetime import datetime
from pydantic import BaseModel


class FormulaTemplateCreate(BaseModel):
    team_id: uuid.UUID | None = None
    name: str
    description: str | None = None
    expression: str
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
    expression: str
    variables: dict | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
