import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.team import Team, TeamMembership
from app.models.invite import TeamInvite
from app.models.rbac import Role, RolePermission, Permission, TeamMemberRole
from app.routers.auth import get_current_user
from app.schemas.team import TeamCreate, TeamOut, TeamMemberOut, InviteRequest, RoleUpdate
from app.schemas.invite import TeamInviteOut
from app.schemas.rbac import (
    RoleOut, RoleDetailOut, RoleCreate, RoleUpdate as RbacRoleUpdate,
    MemberRoleAssign, MemberRoleOut, PermissionOut,
)
from app.services.audit import log_event
from app.services.email import send_invite_email

router = APIRouter()


def require_team_role(db: Session, user: User, team_id: uuid.UUID, roles: list[str]) -> TeamMembership:
    """Check that user has one of the required roles on the team."""
    membership = db.query(TeamMembership).filter(
        TeamMembership.user_id == user.id,
        TeamMembership.team_id == team_id,
    ).first()
    if not membership or membership.role not in roles:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return membership


@router.post("/", response_model=TeamOut)
def create_team(
    data: TeamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    team = Team(name=data.name, created_by=current_user.id)
    db.add(team)
    db.flush()
    membership = TeamMembership(user_id=current_user.id, team_id=team.id, role="owner")
    db.add(membership)
    db.commit()
    db.refresh(team)
    return team


@router.get("/", response_model=list[TeamOut])
def list_teams(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    team_ids = [m.team_id for m in current_user.memberships]
    return db.query(Team).filter(Team.id.in_(team_ids)).all()


@router.get("/{team_id}", response_model=TeamOut)
def get_team(
    team_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_team_role(db, current_user, team_id, ["owner", "admin", "member"])
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


@router.get("/{team_id}/members", response_model=list[TeamMemberOut])
def list_members(
    team_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_team_role(db, current_user, team_id, ["owner", "admin", "member"])
    memberships = db.query(TeamMembership).filter(TeamMembership.team_id == team_id).all()
    result = []
    for m in memberships:
        user = db.query(User).filter(User.id == m.user_id).first()
        result.append(TeamMemberOut(
            user_id=m.user_id,
            role=m.role,
            joined_at=m.joined_at,
            email=user.email if user else None,
            display_name=user.display_name if user else None,
        ))
    return result


@router.post("/{team_id}/invite")
def invite_member(
    team_id: uuid.UUID,
    data: InviteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_team_role(db, current_user, team_id, ["owner", "admin"])

    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    role = data.role if data.role in ("admin", "member") else "member"
    email = data.email.strip().lower()

    # Block inviting someone already on the team
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        existing_membership = db.query(TeamMembership).filter(
            TeamMembership.user_id == existing_user.id,
            TeamMembership.team_id == team_id,
        ).first()
        if existing_membership:
            raise HTTPException(status_code=400, detail="User is already a member of this team")

    # Block duplicate pending invite
    existing_invite = db.query(TeamInvite).filter(
        TeamInvite.team_id == team_id,
        TeamInvite.invited_email == email,
        TeamInvite.status == "pending",
        TeamInvite.expires_at > datetime.now(timezone.utc),
    ).first()
    if existing_invite:
        raise HTTPException(status_code=400, detail="A pending invite has already been sent to this email")

    invite = TeamInvite(
        team_id=team_id,
        invited_email=email,
        invited_by_id=current_user.id,
        role=role,
    )
    db.add(invite)
    db.flush()  # populate invite.id before sending email

    email_sent = send_invite_email(
        to_email=email,
        team_name=team.name,
        role=role,
        invited_by_name=current_user.display_name or "",
        invited_by_email=current_user.email,
    )

    log_event(db, team_id, current_user.id, "invite", "team_member", str(invite.id),
              new_value={"email": email, "role": role, "email_sent": email_sent})
    db.commit()
    return {"status": "invited", "email": email, "email_sent": email_sent}


@router.get("/{team_id}/invites", response_model=list[TeamInviteOut])
def list_team_invites(
    team_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_team_role(db, current_user, team_id, ["owner", "admin"])
    invites = db.query(TeamInvite).filter(
        TeamInvite.team_id == team_id,
        TeamInvite.status == "pending",
    ).order_by(TeamInvite.created_at.desc()).all()
    result = []
    for inv in invites:
        inviter = inv.invited_by
        result.append(TeamInviteOut(
            id=inv.id,
            invited_email=inv.invited_email,
            role=inv.role,
            invited_by_name=inviter.display_name if inviter else None,
            invited_by_email=inviter.email if inviter else "",
            created_at=inv.created_at,
            expires_at=inv.expires_at,
            status=inv.status,
        ))
    return result


@router.delete("/{team_id}/invites/{invite_id}")
def revoke_invite(
    team_id: uuid.UUID,
    invite_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_team_role(db, current_user, team_id, ["owner", "admin"])
    invite = db.query(TeamInvite).filter(
        TeamInvite.id == invite_id,
        TeamInvite.team_id == team_id,
    ).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite.status != "pending":
        raise HTTPException(status_code=400, detail="Invite is not pending")

    invite.status = "revoked"
    log_event(db, team_id, current_user.id, "invite_revoked", "team_member", str(invite_id),
              new_value={"email": invite.invited_email, "role": invite.role})
    db.commit()
    return {"status": "revoked"}


@router.patch("/{team_id}/members/{user_id}")
def update_member_role(
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    data: RoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    caller = require_team_role(db, current_user, team_id, ["owner", "admin"])
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

    # Admins may only toggle between admin and member — never touch owner
    if caller.role == "admin":
        if data.role == "owner" or membership.role == "owner":
            raise HTTPException(status_code=403, detail="Only the owner can transfer ownership or change the owner's role")

    if data.role == "owner":
        # Transfer: demote current owner to admin first
        current_owner = db.query(TeamMembership).filter(
            TeamMembership.team_id == team_id,
            TeamMembership.role == "owner",
        ).first()
        if current_owner and current_owner.user_id != user_id:
            current_owner.role = "admin"
            log_event(db, team_id, current_user.id, "update_role", "team_member",
                      str(current_owner.user_id),
                      previous_value={"role": "owner"}, new_value={"role": "admin"})
    elif membership.role == "owner":
        raise HTTPException(status_code=400, detail="Transfer ownership to another member before changing the owner's role")

    previous_role = membership.role
    membership.role = data.role
    log_event(db, team_id, current_user.id, "update_role", "team_member", str(user_id),
              previous_value={"role": previous_role}, new_value={"role": data.role})
    db.commit()
    return {"status": "updated"}


@router.delete("/{team_id}/members/{user_id}")
def remove_member(
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_team_role(db, current_user, team_id, ["owner", "admin"])
    membership = db.query(TeamMembership).filter(
        TeamMembership.user_id == user_id,
        TeamMembership.team_id == team_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Membership not found")
    if membership.role == "owner":
        raise HTTPException(status_code=400, detail="Transfer ownership before removing the owner")
    log_event(db, team_id, current_user.id, "remove", "team_member", str(user_id),
              previous_value={"role": membership.role})
    db.delete(membership)
    db.commit()
    return {"status": "removed"}


# ── Team-scoped roles ─────────────────────────────────────────────────────────

@router.get("/{team_id}/roles", response_model=list[RoleOut])
def list_team_roles(
    team_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_team_role(db, current_user, team_id, ["owner", "admin", "member"])
    roles = db.query(Role).filter(Role.team_id == team_id).order_by(Role.name).all()
    return [
        RoleOut(id=r.id, team_id=r.team_id, name=r.name, description=r.description,
                permission_count=len(r.permissions))
        for r in roles
    ]


@router.post("/{team_id}/roles", response_model=RoleDetailOut, status_code=201)
def create_team_role(
    team_id: uuid.UUID,
    data: RoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_team_role(db, current_user, team_id, ["owner", "admin"])
    if db.query(Role).filter(Role.team_id == team_id, Role.name == data.name).first():
        raise HTTPException(400, detail="Role name already exists in this team")
    role = Role(team_id=team_id, name=data.name, description=data.description)
    db.add(role)
    db.flush()
    for perm_id in data.permission_ids:
        perm = db.query(Permission).filter(Permission.id == perm_id).first()
        if perm:
            db.add(RolePermission(role_id=role.id, permission_id=perm_id))
    db.commit()
    db.refresh(role)
    return _role_detail_out(role)


@router.get("/{team_id}/roles/{role_id}", response_model=RoleDetailOut)
def get_team_role(
    team_id: uuid.UUID,
    role_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_team_role(db, current_user, team_id, ["owner", "admin", "member"])
    role = db.query(Role).filter(Role.id == role_id, Role.team_id == team_id).first()
    if not role:
        raise HTTPException(404, detail="Role not found")
    return _role_detail_out(role)


@router.put("/{team_id}/roles/{role_id}", response_model=RoleDetailOut)
def update_team_role(
    team_id: uuid.UUID,
    role_id: uuid.UUID,
    data: RbacRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_team_role(db, current_user, team_id, ["owner", "admin"])
    role = db.query(Role).filter(Role.id == role_id, Role.team_id == team_id).first()
    if not role:
        raise HTTPException(404, detail="Role not found")

    if data.name is not None and data.name != role.name:
        if db.query(Role).filter(Role.team_id == team_id, Role.name == data.name).first():
            raise HTTPException(400, detail="Role name already exists in this team")
        role.name = data.name
    if data.description is not None:
        role.description = data.description

    db.query(RolePermission).filter(RolePermission.role_id == role_id).delete()
    for perm_id in data.permission_ids:
        if db.query(Permission).filter(Permission.id == perm_id).first():
            db.add(RolePermission(role_id=role_id, permission_id=perm_id))

    db.commit()
    db.refresh(role)
    log_event(db, team_id, current_user.id, "update_role_permissions", "role", str(role_id),
              new_value={"name": role.name, "permission_count": len(data.permission_ids)})
    return _role_detail_out(role)


@router.delete("/{team_id}/roles/{role_id}")
def delete_team_role(
    team_id: uuid.UUID,
    role_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_team_role(db, current_user, team_id, ["owner", "admin"])
    role = db.query(Role).filter(Role.id == role_id, Role.team_id == team_id).first()
    if not role:
        raise HTTPException(404, detail="Role not found")
    if role.name in ("Owner", "Admin", "Member"):
        raise HTTPException(400, detail="Cannot delete the default team roles")
    assignments = db.query(TeamMemberRole).filter(TeamMemberRole.role_id == role_id).count()
    if assignments > 0:
        raise HTTPException(400,
            detail=f"Cannot delete role with {assignments} active assignment(s). Remove assignments first.")
    db.delete(role)
    db.commit()
    return {"status": "deleted"}


# ── Member-role assignments ───────────────────────────────────────────────────

@router.get("/{team_id}/member-roles", response_model=list[MemberRoleOut])
def list_member_roles(
    team_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_team_role(db, current_user, team_id, ["owner", "admin"])
    memberships = db.query(TeamMembership).filter(TeamMembership.team_id == team_id).all()
    result = []
    for m in memberships:
        user = db.query(User).filter(User.id == m.user_id).first()
        role_rows = db.query(TeamMemberRole).filter(
            TeamMemberRole.user_id == m.user_id,
            TeamMemberRole.team_id == team_id,
        ).all()
        assigned_roles = []
        for rr in role_rows:
            r = db.query(Role).filter(Role.id == rr.role_id).first()
            if r:
                assigned_roles.append(RoleOut(
                    id=r.id, team_id=r.team_id, name=r.name, description=r.description,
                    permission_count=len(r.permissions),
                ))
        result.append(MemberRoleOut(
            user_id=m.user_id,
            display_name=user.display_name if user else None,
            email=user.email if user else None,
            membership_role=m.role,
            assigned_roles=assigned_roles,
        ))
    return result


@router.post("/{team_id}/member-roles")
def assign_member_role(
    team_id: uuid.UUID,
    data: MemberRoleAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_team_role(db, current_user, team_id, ["owner", "admin"])
    # Validate target user is a team member
    m = db.query(TeamMembership).filter(
        TeamMembership.user_id == data.user_id,
        TeamMembership.team_id == team_id,
    ).first()
    if not m:
        raise HTTPException(404, detail="User is not a member of this team")
    # Validate role belongs to this team
    role = db.query(Role).filter(Role.id == data.role_id, Role.team_id == team_id).first()
    if not role:
        raise HTTPException(404, detail="Role not found in this team")
    # Check for existing assignment
    existing = db.query(TeamMemberRole).filter(
        TeamMemberRole.user_id == data.user_id,
        TeamMemberRole.team_id == team_id,
        TeamMemberRole.role_id == data.role_id,
    ).first()
    if existing:
        raise HTTPException(409, detail="Role already assigned to this member")
    db.add(TeamMemberRole(user_id=data.user_id, team_id=team_id, role_id=data.role_id))
    db.commit()
    return {"status": "assigned"}


@router.delete("/{team_id}/member-roles")
def remove_member_role(
    team_id: uuid.UUID,
    data: MemberRoleAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_team_role(db, current_user, team_id, ["owner", "admin"])
    row = db.query(TeamMemberRole).filter(
        TeamMemberRole.user_id == data.user_id,
        TeamMemberRole.team_id == team_id,
        TeamMemberRole.role_id == data.role_id,
    ).first()
    if not row:
        raise HTTPException(404, detail="Assignment not found")
    db.delete(row)
    db.commit()
    return {"status": "removed"}


# ── Helper ────────────────────────────────────────────────────────────────────

def _role_detail_out(role: Role) -> RoleDetailOut:
    return RoleDetailOut(
        id=role.id, team_id=role.team_id, name=role.name, description=role.description,
        permissions=[
            PermissionOut(id=p.id, key=p.key, label=p.label,
                          category=p.category, action=p.action)
            for p in role.permissions
        ],
    )