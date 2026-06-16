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
from app.models.access_request import PlatformAccessRequest
from app.models.rbac import Plan, Role, TeamMemberRole, UserPlatformRole
from app.config import get_settings
from app.routers.auth import get_current_user, create_jwt
from app.schemas.user import UserOut
from app.schemas.audit_log import AuditLogOut
from app.schemas.access_request import AccessRequestOut
from app.services.audit import log_event
from app.services.email import send_access_granted_email, send_welcome_email

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
    platform_role_names: list[str] = []

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

    # Batch-load platform role assignments to avoid N+1
    user_ids = [u.id for u in users]
    platform_role_rows = (
        db.query(UserPlatformRole).filter(UserPlatformRole.user_id.in_(user_ids)).all()
        if user_ids else []
    )
    platform_role_ids = {r.role_id for r in platform_role_rows}
    roles_by_id = (
        {r.id: r.name for r in db.query(Role).filter(Role.id.in_(platform_role_ids)).all()}
        if platform_role_ids else {}
    )
    platform_roles_by_user: dict = {}
    for row in platform_role_rows:
        platform_roles_by_user.setdefault(row.user_id, []).append(
            roles_by_id.get(row.role_id, "?")
        )

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
            platform_role_names=platform_roles_by_user.get(u.id, []),
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
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    if request.cookies.get("ca_impersonating"):
        raise HTTPException(status_code=400, detail="Already impersonating a user — stop current session first")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.deleted_at:
        raise HTTPException(status_code=400, detail="Cannot impersonate a deleted user")
    if target.is_super_admin:
        raise HTTPException(status_code=400, detail="Cannot impersonate a super admin")

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
        admin_user = db.query(User).filter(User.id == admin_user_id).first()
        impersonated_user = db.query(User).filter(User.id == impersonated_user_id).first()
        team_id = _first_team_id(db, impersonated_user_id) or _first_team_id(db, admin_user_id)
        if team_id:
            log_event(db, team_id, admin_user_id, "admin_impersonate_stop", "user",
                      str(impersonated_user_id),
                      new_value={
                          "by": admin_user.email if admin_user else None,
                          "target_email": impersonated_user.email if impersonated_user else str(impersonated_user_id),
                      })
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

class AdminRoleUpdate(BaseModel):
    role: str


def _get_owner(db: Session, team_id: uuid.UUID) -> TeamMembership | None:
    return db.query(TeamMembership).filter(
        TeamMembership.team_id == team_id,
        TeamMembership.role == "owner",
    ).first()


def _build_members_with_roles(db, team_id, memberships):
    """Batch-load custom roles for all team members to avoid N+1 queries."""
    member_role_rows = db.query(TeamMemberRole).filter(
        TeamMemberRole.team_id == team_id
    ).all()
    role_ids = {r.role_id for r in member_role_rows}
    roles_by_id = (
        {r.id: r.name for r in db.query(Role).filter(Role.id.in_(role_ids)).all()}
        if role_ids else {}
    )
    by_user: dict = {}
    for row in member_role_rows:
        by_user.setdefault(row.user_id, []).append(
            {"id": str(row.role_id), "name": roles_by_id.get(row.role_id, "?")}
        )
    return [
        {
            "user_id": str(m.user_id),
            "role": m.role,
            "email": m.user.email if m.user else None,
            "custom_roles": by_user.get(m.user_id, []),
        }
        for m in memberships
    ]


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
            "plan_id": str(t.plan_id) if t.plan_id else None,
            "members": _build_members_with_roles(db, t.id, members),
        })
    return result


@router.patch("/teams/{team_id}/members/{user_id}")
def admin_update_member_role(
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    data: AdminRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    if data.role not in ("owner", "admin", "member"):
        raise HTTPException(status_code=400, detail="Role must be owner, admin, or member")

    membership = db.query(TeamMembership).filter(
        TeamMembership.user_id == user_id,
        TeamMembership.team_id == team_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")
    if membership.role == data.role:
        return {"status": "no change"}

    if data.role == "owner":
        # Transfer: demote the current owner to admin first
        current_owner = _get_owner(db, team_id)
        if current_owner and current_owner.user_id != user_id:
            current_owner.role = "admin"
            log_event(db, team_id, current_user.id, "admin_update_role", "team_member",
                      str(current_owner.user_id),
                      previous_value={"role": "owner"}, new_value={"role": "admin", "by": current_user.email})
    elif membership.role == "owner":
        raise HTTPException(status_code=400, detail="Transfer ownership to another member before changing the owner's role")

    previous_role = membership.role
    membership.role = data.role
    log_event(db, team_id, current_user.id, "admin_update_role", "team_member", str(user_id),
              previous_value={"role": previous_role}, new_value={"role": data.role, "by": current_user.email})
    db.commit()
    return {"status": "updated"}


@router.delete("/teams/{team_id}/members/{user_id}")
def admin_remove_member(
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    membership = db.query(TeamMembership).filter(
        TeamMembership.user_id == user_id,
        TeamMembership.team_id == team_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")
    if membership.role == "owner":
        raise HTTPException(status_code=400, detail="Transfer ownership before removing the owner")

    log_event(db, team_id, current_user.id, "admin_remove_member", "team_member", str(user_id),
              previous_value={"role": membership.role}, new_value={"by": current_user.email})
    db.delete(membership)
    db.commit()
    return {"status": "removed"}


class PlanAssignRequest(BaseModel):
    plan_id: uuid.UUID | None


@router.put("/teams/{team_id}/plan")
def assign_team_plan(
    team_id: uuid.UUID,
    data: PlanAssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if data.plan_id is not None:
        plan = db.query(Plan).filter(Plan.id == data.plan_id).first()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")
    team.plan_id = data.plan_id
    log_event(db, team_id, current_user.id, "admin_assign_plan", "team", str(team_id),
              new_value={"plan_id": str(data.plan_id) if data.plan_id else None,
                         "by": current_user.email})
    db.commit()
    return {"status": "ok"}


@router.delete("/teams/{team_id}")
def admin_delete_team(
    team_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    # Audit log is cascade-deleted with the team, so we just delete
    db.delete(team)
    db.commit()
    return {"status": "deleted"}


# ── Platform access requests ──────────────────────────────────────────────────

@router.get("/access-requests", response_model=list[AccessRequestOut])
def list_access_requests(
    status: str | None = Query(None),
    search: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    query = db.query(PlatformAccessRequest)
    if status:
        query = query.filter(PlatformAccessRequest.status == status)
    if search:
        term = f"%{search.lower()}%"
        query = query.filter(
            or_(
                PlatformAccessRequest.email.ilike(term),
                PlatformAccessRequest.name.ilike(term),
                PlatformAccessRequest.company.ilike(term),
            )
        )
    requests = query.order_by(PlatformAccessRequest.created_at.desc()).all()

    result = []
    for r in requests:
        reviewer_email = None
        if r.reviewed_by_id:
            reviewer = db.query(User).filter(User.id == r.reviewed_by_id).first()
            reviewer_email = reviewer.email if reviewer else None
        result.append(AccessRequestOut(
            id=r.id,
            email=r.email,
            name=r.name,
            company=r.company,
            status=r.status,
            created_at=r.created_at,
            reviewed_at=r.reviewed_at,
            reviewed_by_email=reviewer_email,
        ))
    return result


@router.post("/access-requests/{request_id}/accept")
def accept_access_request(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    req = db.query(PlatformAccessRequest).filter(PlatformAccessRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Access request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}")

    req.status = "accepted"
    req.reviewed_at = datetime.now(timezone.utc)
    req.reviewed_by_id = current_user.id

    send_access_granted_email(req.email, settings.app_url)
    send_welcome_email(req.email, req.name or "", settings.app_url)

    team_id = _first_team_id(db, current_user.id)
    if team_id:
        log_event(db, team_id, current_user.id, "admin_accept_access_request", "access_request",
                  str(request_id),
                  new_value={"email": req.email, "by": current_user.email})
    db.commit()
    return {"status": "accepted"}


@router.post("/access-requests/{request_id}/reject")
def reject_access_request(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    req = db.query(PlatformAccessRequest).filter(PlatformAccessRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Access request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}")

    req.status = "rejected"
    req.reviewed_at = datetime.now(timezone.utc)
    req.reviewed_by_id = current_user.id

    team_id = _first_team_id(db, current_user.id)
    if team_id:
        log_event(db, team_id, current_user.id, "admin_reject_access_request", "access_request",
                  str(request_id),
                  new_value={"email": req.email, "by": current_user.email})
    db.commit()
    return {"status": "rejected"}


# ── Platform role assignments ─────────────────────────────────────────────────

class PlatformRoleAssignRequest(BaseModel):
    role_id: uuid.UUID


@router.get("/users/{user_id}/platform-roles")
def get_user_platform_roles(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    rows = db.query(UserPlatformRole).filter(UserPlatformRole.user_id == user_id).all()
    role_ids = [r.role_id for r in rows]
    roles = db.query(Role).filter(Role.id.in_(role_ids), Role.team_id == None).all()  # noqa: E711
    return [{"id": str(r.id), "name": r.name} for r in roles]


@router.post("/users/{user_id}/platform-roles")
def assign_platform_role(
    user_id: uuid.UUID,
    data: PlatformRoleAssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    role = db.query(Role).filter(Role.id == data.role_id, Role.team_id == None).first()  # noqa: E711
    if not role:
        raise HTTPException(status_code=404, detail="Platform role not found")
    if role.name == "SuperAdmin":
        raise HTTPException(status_code=400, detail="Use is_super_admin flag to assign SuperAdmin")

    existing = db.query(UserPlatformRole).filter(
        UserPlatformRole.user_id == user_id,
        UserPlatformRole.role_id == data.role_id,
    ).first()
    if existing:
        return {"status": "already_assigned"}

    db.add(UserPlatformRole(user_id=user_id, role_id=data.role_id))

    team_id = _first_team_id(db, user_id) or _first_team_id(db, current_user.id)
    if team_id:
        log_event(db, team_id, current_user.id, "admin_assign_platform_role", "user",
                  str(user_id),
                  new_value={"role": role.name, "by": current_user.email})
    db.commit()
    return {"status": "assigned"}


@router.delete("/users/{user_id}/platform-roles/{role_id}")
def remove_platform_role(
    user_id: uuid.UUID,
    role_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    row = db.query(UserPlatformRole).filter(
        UserPlatformRole.user_id == user_id,
        UserPlatformRole.role_id == role_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Role assignment not found")

    role = db.query(Role).filter(Role.id == role_id).first()
    team_id = _first_team_id(db, user_id) or _first_team_id(db, current_user.id)
    if team_id:
        log_event(db, team_id, current_user.id, "admin_remove_platform_role", "user",
                  str(user_id),
                  previous_value={"role": role.name if role else str(role_id)},
                  new_value={"by": current_user.email})
    db.delete(row)
    db.commit()
    return {"status": "removed"}


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
