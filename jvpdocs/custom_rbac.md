# Custom RBAC & Platform Feature Flags — Implementation Plan

> **Status:** Deferred — Wave 2 or Wave 3
> Build this when enterprise customers explicitly ask for granular role control or when a tiered pricing model is introduced.

---

## Context

The current system has two layers that already work for Wave 1:

| Layer | Location | Who uses it |
|---|---|---|
| Team self-management | `/team` → `routers/teams.py` | Team owner/admin |
| Platform administration | `/admin` → `routers/admin.py` | Super admin only |

RBAC today is fixed at 3 roles: `owner`, `admin`, `member` stored in `TeamMembership.role`.

This plan extends the system in two phases:
1. **Platform feature flags** — admin controls which features each team can access (needed for tiered pricing)
2. **Custom team roles** — teams define their own roles with granular permissions (needed for enterprise)

---

## Phase 1 — Platform Feature Flags (Simpler, do this first)

### Goal
Super admin can enable/disable specific features per team from the Admin Console.
Enables tiered plans without code changes: Basic, Professional, Enterprise.

### New model: `TeamFeatureFlag`

```python
# backend/app/models/team.py (add to existing file)

class TeamFeatureFlag(Base):
    __tablename__ = "team_feature_flags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    team_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"))
    feature: Mapped[str] = mapped_column(String(64), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    set_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    set_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Unique: one flag entry per team per feature
    __table_args__ = (UniqueConstraint("team_id", "feature"),)
```

### Feature keys (define upfront)

```python
# backend/app/constants/features.py

FEATURES = {
    "pdf_export":        "Export negotiation briefs as PDF",
    "ai_brief":          "AI-enhanced narrative generation",
    "index_scraping":    "Custom URL index scraping",
    "team_invites":      "Send invite emails to new users",
    "volume_import":     "Upload actual volumes",
    "scenario_builder":  "Cost scenario what-if analysis",
    "portfolio_view":    "Portfolio analytics dashboard",
    "audit_export":      "Export audit logs as CSV",
}
```

### Backend changes

**`routers/admin.py`** — add:
```
GET  /api/admin/teams/{team_id}/features          → list flags for a team
POST /api/admin/teams/{team_id}/features/{feature} → enable/disable a flag
```

**Dependency for protected routes:**
```python
# backend/app/dependencies/features.py

def require_feature(feature: str):
    def _check(
        request: Request,
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
    ):
        team_id = get_active_team_id(request)  # from header or cookie
        flag = db.query(TeamFeatureFlag).filter(
            TeamFeatureFlag.team_id == team_id,
            TeamFeatureFlag.feature == feature,
        ).first()
        if flag and not flag.enabled:
            raise HTTPException(status_code=403, detail=f"Feature '{feature}' not enabled for your plan")
    return _check
```

**Usage on any endpoint:**
```python
@router.post("/brief")
def get_brief(
    ...,
    _: None = Depends(require_feature("ai_brief")),
):
```

### Frontend changes
- Admin Console: add "Features" tab in team detail view — toggle switches per feature
- Gate UI elements: `useFeatureFlag("pdf_export")` hook that fetches `/api/teams/{id}/features`
- Show "Upgrade your plan" message when a feature is disabled

### Migration
```bash
alembic revision --autogenerate -m "add_team_feature_flags"
alembic upgrade head
```

### Effort estimate: 2–3 days

---

## Phase 2 — Custom Team Roles (Full RBAC)

### Goal
Team owners can define their own roles (e.g. "Analyst", "Viewer", "Manager") with specific permissions per feature area. Each permission is a capability: `view_brief`, `export_brief`, `edit_formula`, etc.

### New models

```python
# backend/app/models/rbac.py

class TeamRole(Base):
    """Custom role defined by a team owner."""
    __tablename__ = "team_roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("teams.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(64), nullable=False)        # e.g. "Analyst"
    description: Mapped[str | None] = mapped_column(String(256))
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)      # True for built-in owner/admin/member
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class RolePermission(Base):
    """Maps a role to a set of permission keys."""
    __tablename__ = "role_permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("team_roles.id", ondelete="CASCADE"))
    permission: Mapped[str] = mapped_column(String(64), nullable=False)  # e.g. "export_brief"
```

`TeamMembership.role` (currently a plain string) would gain an optional FK to `team_roles.id` while keeping the string fallback for legacy `owner/admin/member`.

### Permission keys (full list)

```python
# backend/app/constants/permissions.py

PERMISSIONS = {
    # Cost models
    "view_cost_models":     "View cost models and formulas",
    "create_cost_models":   "Create and edit cost models",
    "delete_cost_models":   "Delete cost models",

    # Analysis
    "view_evolution":       "View evolution charts",
    "view_brief":           "View negotiation briefs",
    "export_brief":         "Export briefs as PDF",
    "view_squeeze":         "View squeeze/desqueeze analysis",

    # Data
    "upload_actuals":       "Upload actual prices and volumes",
    "manage_indexes":       "Add/edit index overrides",
    "view_audit_log":       "View team activity log",

    # Team
    "manage_members":       "Invite and remove team members",
    "manage_roles":         "Create and assign custom roles",
}
```

### How system roles map to permissions

| Permission | owner | admin | member |
|---|---|---|---|
| view_cost_models | ✅ | ✅ | ✅ |
| create_cost_models | ✅ | ✅ | ❌ |
| delete_cost_models | ✅ | ❌ | ❌ |
| view_brief | ✅ | ✅ | ✅ |
| export_brief | ✅ | ✅ | ❌ |
| upload_actuals | ✅ | ✅ | ❌ |
| manage_indexes | ✅ | ✅ | ❌ |
| view_audit_log | ✅ | ✅ | ❌ |
| manage_members | ✅ | ✅ | ❌ |
| manage_roles | ✅ | ❌ | ❌ |

### Backend changes

**New router: `routers/roles.py`**
```
GET    /api/teams/{team_id}/roles                  → list roles for team
POST   /api/teams/{team_id}/roles                  → create custom role
PUT    /api/teams/{team_id}/roles/{role_id}         → update role name/permissions
DELETE /api/teams/{team_id}/roles/{role_id}         → delete role (cannot delete system roles)
PATCH  /api/teams/{team_id}/members/{user_id}/role  → assign role to member
```

**Permission check dependency:**
```python
def require_permission(permission: str):
    def _check(
        team_id: uuid.UUID,
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user),
    ):
        if current_user.is_super_admin:
            return  # super admin bypasses all
        membership = db.query(TeamMembership).filter(...).first()
        if not _has_permission(db, membership, permission):
            raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")
    return _check
```

**Replaces all existing `require_team_role()` calls** once fully rolled out.

### Frontend changes

**Team Page** — new "Roles" tab:
- List existing roles (system + custom)
- Create role: name + permission checkboxes
- Assign role to member from member list
- Cannot edit/delete system roles

**Throughout the app** — gate UI elements on permissions:
```jsx
const { hasPermission } = usePermissions();
{hasPermission('export_brief') && <button>Export PDF</button>}
```

### Migration strategy
1. Seed `team_roles` with system roles (`owner`, `admin`, `member`) and their permission sets for every existing team
2. Backfill `TeamMembership` to point to the appropriate system role
3. Keep `TeamMembership.role` string as fallback during transition

### Effort estimate: 1–2 weeks

---

## Recommended build order

1. **Phase 1 first** — Feature flags are standalone, low-risk, and unlock pricing tiers immediately
2. **Phase 2 when** — an enterprise prospect asks "can we restrict who exports briefs?" or "can we have a read-only analyst role?" — that's the trigger

---

## Files to create/modify

| File | Change |
|---|---|
| `backend/app/models/team.py` | Add `TeamFeatureFlag` |
| `backend/app/models/rbac.py` | New — `TeamRole`, `RolePermission` |
| `backend/app/constants/features.py` | New — feature key registry |
| `backend/app/constants/permissions.py` | New — permission key registry |
| `backend/app/dependencies/features.py` | New — `require_feature()` dep |
| `backend/app/dependencies/permissions.py` | New — `require_permission()` dep |
| `backend/app/routers/admin.py` | Feature flag management endpoints |
| `backend/app/routers/roles.py` | New — custom role CRUD |
| `backend/app/routers/teams.py` | Replace `require_team_role()` with permission checks |
| `backend/alembic/versions/` | Two new migrations |
| `frontend/src/pages/Team.jsx` | Roles tab |
| `frontend/src/pages/Admin.jsx` | Feature flags tab per team |
| `frontend/src/hooks/usePermissions.js` | New — permission hook |
| `frontend/src/hooks/useFeatureFlag.js` | New — feature flag hook |
