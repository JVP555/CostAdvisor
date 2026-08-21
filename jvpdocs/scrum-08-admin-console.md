# Scrum 8 — Real Admin Console

**Status:** 🟢 Completed

## Goal
Replace any ad-hoc super-admin tooling with a secure, audited admin console that lets authorised staff manage tenants, users, and platform data without ever touching the database directly.

## What Already Exists
- `backend/app/routers/admin.py` — super-admin endpoints exist but are minimal
- `User.is_super_admin` flag controls access
- `AuditLog` model is in place for recording events
- `frontend/src/pages/Admin.jsx` — basic admin page exists

## What Needs to Be Built

### Backend
- Tenant management endpoints: list all teams, view members, suspend/reactivate a team
- User management: search users, reset display name, force-logout (invalidate session), soft-delete account
- Impersonation: allow super-admin to act as a tenant user for support (already has `ImpersonationBar.jsx` on frontend — wire up the backend)
- All admin actions must write to `AuditLog` with `event_type = "admin_action"`
- Gate every endpoint on `user.is_super_admin`; return 403 otherwise

### Frontend (`frontend/src/pages/Admin.jsx`)
- Tenant list with member counts, created date, status
- User search + detail drawer (memberships, last login, theme)
- Impersonation button → sets impersonation context, shows `ImpersonationBar`
- Audit log viewer filtered to admin events

## Key Files
| File | Change |
|------|--------|
| `backend/app/routers/admin.py` | Expand endpoints |
| `backend/app/schemas/admin.py` | Add request/response schemas |
| `frontend/src/pages/Admin.jsx` | Full rebuild of UI |
| `frontend/src/components/ImpersonationBar.jsx` | Wire to backend impersonation API |

## Acceptance Criteria
- [ ] Super-admin can list, search, and view all tenants and users
- [ ] Impersonation works end-to-end; `ImpersonationBar` is visible while impersonating
- [ ] Every admin action appears in `AuditLog`
- [ ] Non-super-admin users get 403 on all `/api/admin/*` routes
- [ ] No direct DB access required for any routine support task
