import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel
from jose import jwt, JWTError

from app.database import get_db, bypass_rls_var
from app.models.user import User
from app.models.team import Team, TeamMembership
from app.models.audit_log import AuditLog
from app.config import get_settings
from app.routers.auth import get_current_user, create_jwt
from app.schemas.user import UserOut
from app.schemas.audit_log import AuditLogOut
from app.services.audit import log_event

router = APIRouter()
settings = get_settings()


def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="Super admin required")
    return current_user


def _first_team_id(db: Session, user_id: uuid.UUID) -> uuid.UUID | None:
    """Return the first team this user belongs to, for audit log attribution."""
    m = db.query(TeamMembership).filter(TeamMembership.user_id == user_id).first()
    return m.team_id if m else None


class UserAdminOut(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str | None
    avatar_url: str | None
    is_super_admin: bool
    created_at: str
    last_login_at: str | None
    deleted_at: str | None
    teams: list[dict]

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    display_name: str | None = None
    is_super_admin: bool | None = None


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserAdminOut])
def list_all_users(
    search: str | None = Query(None),
    include_deleted: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    query = db.query(User).filter(User.id != current_user.id)
    if not include_deleted:
        query = query.filter(User.deleted_at == None)  # noqa: E711
    if search:
        term = f"%{search.lower()}%"
        query = query.filter(
            or_(
                User.email.ilike(term),
                User.display_name.ilike(term),
            )
        )
    users = query.order_by(User.created_at).all()

    result = []
    for u in users:
        teams = []
        for m in u.memberships:
            team = db.query(Team).filter(Team.id == m.team_id).first()
            teams.append({
                "team_id": str(m.team_id),
                "team_name": team.name if team else "Unknown",
                "role": m.role,
            })
        result.append(UserAdminOut(
            id=u.id,
            email=u.email,
            display_name=u.display_name,
            avatar_url=u.avatar_url,
            is_super_admin=u.is_super_admin,
            created_at=u.created_at.isoformat() if u.created_at else "",
            last_login_at=u.last_login_at.isoformat() if u.last_login_at else None,
            deleted_at=u.deleted_at.isoformat() if u.deleted_at else None,
            teams=teams,
        ))
    return result


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    if user_id == current_user.id and data.is_super_admin is False:
        raise HTTPException(status_code=400, detail="Cannot revoke your own super admin privileges")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    changes: dict = {}
    if data.display_name is not None:
        changes["display_name"] = {"from": user.display_name, "to": data.display_name}
        user.display_name = data.display_name
    if data.is_super_admin is not None:
        changes["is_super_admin"] = {"from": user.is_super_admin, "to": data.is_super_admin}
        user.is_super_admin = data.is_super_admin

    team_id = _first_team_id(db, user.id)
    if team_id and changes:
        log_event(db, team_id, current_user.id, "admin_update_user", "user", str(user_id),
                  new_value={"changes": changes, "by": current_user.email})

    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}")
def delete_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.deleted_at:
        raise HTTPException(status_code=400, detail="User already deleted")

    user.deleted_at = datetime.now(timezone.utc)

    team_id = _first_team_id(db, user.id)
    if team_id:
        log_event(db, team_id, current_user.id, "admin_delete_user", "user", str(user_id),
                  new_value={"email": user.email, "by": current_user.email})

    db.commit()
    return {"status": "deleted"}


@router.post("/users/{user_id}/restore")
def restore_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.deleted_at = None

    team_id = _first_team_id(db, user.id)
    if team_id:
        log_event(db, team_id, current_user.id, "admin_restore_user", "user", str(user_id),
                  new_value={"email": user.email, "by": current_user.email})

    db.commit()
    return {"status": "restored"}


# ── Impersonation ─────────────────────────────────────────────────────────────

@router.post("/impersonate/{user_id}")
def impersonate(
    user_id: uuid.UUID,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.deleted_at:
        raise HTTPException(status_code=400, detail="Cannot impersonate a deleted user")

    admin_token = create_jwt(current_user.id)
    target_token = create_jwt(target.id)

    is_prod = settings.environment != "development"
    samesite = "none" if is_prod else "lax"

    response.set_cookie("ca_admin_token", admin_token, httponly=True, secure=is_prod,
                        samesite=samesite, max_age=3600 * 24)
    response.set_cookie("ca_token", target_token, httponly=True, secure=is_prod,
                        samesite=samesite, max_age=3600 * 24)
    # Not HttpOnly so the frontend can read it to show ImpersonationBar
    response.set_cookie("ca_impersonating", "1", httponly=False, secure=is_prod,
                        samesite=samesite, max_age=3600 * 24)

    team_id = _first_team_id(db, target.id) or _first_team_id(db, current_user.id)
    if team_id:
        log_event(db, team_id, current_user.id, "admin_impersonate_start", "user", str(user_id),
                  new_value={"target_email": target.email, "by": current_user.email})
    db.commit()

    return {"status": "impersonating", "target_email": target.email, "target_name": target.display_name}


@router.post("/stop-impersonate")
def stop_impersonate(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    admin_token = request.cookies.get("ca_admin_token")
    if not admin_token:
        raise HTTPException(status_code=400, detail="Not currently impersonating")

    # Decode both tokens to log who stopped impersonating whom
    admin_user_id: uuid.UUID | None = None
    impersonated_user_id: uuid.UUID | None = None
    try:
        payload = jwt.decode(admin_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        admin_user_id = uuid.UUID(payload["sub"])
    except (JWTError, KeyError, ValueError):
        pass

    current_token = request.cookies.get("ca_token")
    if current_token:
        try:
            payload = jwt.decode(current_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
            impersonated_user_id = uuid.UUID(payload["sub"])
        except (JWTError, KeyError, ValueError):
            pass

    # Bypass RLS so the audit log insert can succeed without a user context set
    bypass_rls_var.set(True)
    if admin_user_id and impersonated_user_id:
        team_id = _first_team_id(db, impersonated_user_id) or _first_team_id(db, admin_user_id)
        if team_id:
            log_event(db, team_id, admin_user_id, "admin_impersonate_stop", "user",
                      str(impersonated_user_id),
                      new_value={"impersonated_user_id": str(impersonated_user_id)})
        db.commit()

    is_prod = settings.environment != "development"
    samesite = "none" if is_prod else "lax"
    response.set_cookie("ca_token", admin_token, httponly=True, secure=is_prod,
                        samesite=samesite, max_age=3600 * 24)
    # Must pass the same samesite/secure params used when setting, otherwise browsers ignore the delete
    response.delete_cookie("ca_admin_token", httponly=True, secure=is_prod, samesite=samesite)
    response.delete_cookie("ca_impersonating", httponly=False, secure=is_prod, samesite=samesite)

    return {"status": "restored"}


# ── Team management ───────────────────────────────────────────────────────────

class SetTeamRequest(BaseModel):
    team_id: uuid.UUID
    role: str = "member"


@router.post("/users/{user_id}/set-team")
def set_user_team(
    user_id: uuid.UUID,
    data: SetTeamRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    team = db.query(Team).filter(Team.id == data.team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    db.query(TeamMembership).filter(TeamMembership.user_id == user_id).delete()
    db.add(TeamMembership(user_id=user_id, team_id=data.team_id, role=data.role))
    log_event(db, data.team_id, current_user.id, "admin_set_team", "user", str(user_id),
              new_value={"team": team.name, "role": data.role, "by": current_user.email})
    db.commit()
    return {"status": "ok", "team_name": team.name}


@router.post("/users/{user_id}/add-team")
def add_user_to_team(
    user_id: uuid.UUID,
    data: SetTeamRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    team = db.query(Team).filter(Team.id == data.team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    existing = db.query(TeamMembership).filter(
        TeamMembership.user_id == user_id,
        TeamMembership.team_id == data.team_id,
    ).first()
    if existing:
        existing.role = data.role
    else:
        db.add(TeamMembership(user_id=user_id, team_id=data.team_id, role=data.role))

    log_event(db, data.team_id, current_user.id, "admin_add_team", "user", str(user_id),
              new_value={"team": team.name, "role": data.role, "by": current_user.email})
    db.commit()
    return {"status": "ok", "team_name": team.name}


@router.delete("/users/{user_id}/teams/{team_id}")
def remove_user_from_team(
    user_id: uuid.UUID,
    team_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    m = db.query(TeamMembership).filter(
        TeamMembership.user_id == user_id,
        TeamMembership.team_id == team_id,
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Membership not found")
    log_event(db, team_id, current_user.id, "admin_remove_team", "user", str(user_id),
              previous_value={"team_id": str(team_id), "role": m.role},
              new_value={"by": current_user.email})
    db.delete(m)
    db.commit()
    return {"status": "removed"}


# ── Teams ─────────────────────────────────────────────────────────────────────

@router.get("/teams", response_model=list[dict])
def list_all_teams(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    teams = db.query(Team).order_by(Team.created_at).all()
    result = []
    for t in teams:
        members = db.query(TeamMembership).filter(TeamMembership.team_id == t.id).all()
        result.append({
            "id": str(t.id),
            "name": t.name,
            "created_at": t.created_at.isoformat() if t.created_at else "",
            "member_count": len(members),
            "members": [
                {
                    "user_id": str(m.user_id),
                    "role": m.role,
                    "email": m.user.email if m.user else None,
                }
                for m in members
            ],
        })
    return result


# ── Audit logs (cross-team admin view) ────────────────────────────────────────

@router.get("/audit-logs", response_model=list[AuditLogOut])
def list_admin_audit_logs(
    event_type: str | None = Query(None),
    entity_type: str | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """Return audit log entries across all teams (super-admin only)."""
    query = db.query(AuditLog)
    if event_type:
        query = query.filter(AuditLog.event_type == event_type)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)

    logs = query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit).all()

    return [
        AuditLogOut(
            id=log.id,
            team_id=log.team_id,
            user_id=log.user_id,
            user_email=log.user.email if log.user else None,
            event_type=log.event_type,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            previous_value=log.previous_value,
            new_value=log.new_value,
            timestamp=log.timestamp,
        )
        for log in logs
    ]
