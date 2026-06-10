"""Audit trail logging service."""
import uuid
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog
from app.database import impersonating_admin_email_var


def log_event(
    db: Session,
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    event_type: str,
    entity_type: str,
    entity_id: str,
    previous_value: dict | None = None,
    new_value: dict | None = None,
):
    # Tag the entry when the action was performed during an impersonation session.
    admin_email = impersonating_admin_email_var.get()
    if admin_email:
        new_value = {**(new_value or {}), "_impersonated_by": admin_email}

    entry = AuditLog(
        team_id=team_id,
        user_id=user_id,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=str(entity_id),
        previous_value=previous_value,
        new_value=new_value,
    )
    db.add(entry)
