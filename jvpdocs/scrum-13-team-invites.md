# Scrum 13 — Working Team Invites

**Status:** 🔴 Not started

## Goal
Allow team owners/admins to invite colleagues by email. The invitee receives an email, clicks a link, signs in with Google, and lands directly in the correct team — without needing a super-admin to manually add them.

## What Already Exists
- `TeamMembership` model with roles (`owner`, `admin`, `member`)
- `Team` and `User` models
- Google OAuth login flow
- `support_email` config in `config.py`
- `frontend/src/pages/Team.jsx` — team management page

## What Needs to Be Built

### Backend

**New model: `TeamInvite`**
```
id: UUID
team_id: UUID (FK teams)
invited_email: str
role: str (default "member")
token: str (unique, secrets.token_urlsafe(32))
invited_by: UUID (FK users)
expires_at: datetime (now + 7 days)
accepted_at: datetime | None
```

**New endpoints (add to `routers/teams.py` or new `routers/invites.py`):**
- `POST /api/teams/{team_id}/invites` — create invite, send email (role: owner/admin only)
- `GET /api/invites/{token}` — public endpoint; returns invite details (team name, inviter name, role) — used by the frontend before login
- `POST /api/invites/{token}/accept` — authenticated; creates `TeamMembership`, marks invite accepted; fails if token expired or already accepted

**Email sending:**
- Add `sendgrid` or `resend` (or SMTP via `smtplib`) to `requirements.txt`
- Add `email_provider_api_key` to `config.py`
- Simple transactional email: "You've been invited to join {team} on CostAdvisor"

### Frontend
- Team page: "Invite member" button → modal with email + role selector → shows pending invites list
- `/invite/{token}` public route: show invite details → "Accept invite" → triggers Google login if not authenticated → `POST /api/invites/{token}/accept` → redirect to dashboard

## Key Files
| File | Change |
|------|--------|
| `backend/app/models/team.py` | Add `TeamInvite` model |
| `backend/app/routers/teams.py` | Invite endpoints |
| `backend/app/services/email.py` | New — email sending service |
| `backend/app/config.py` | Add email config vars |
| `backend/alembic/versions/` | New migration for `team_invites` table |
| `frontend/src/pages/Team.jsx` | Invite UI |
| `frontend/src/App.jsx` | Add `/invite/:token` public route |

## Acceptance Criteria
- [ ] Owner/admin can send an invite email to any address
- [ ] Invitee receives an email with a working link
- [ ] Invite link works for 7 days; expired links show a clear error
- [ ] Accepting an invite as a new user creates the account and joins the team
- [ ] Accepting an invite as an existing user joins the team without creating a duplicate account
- [ ] Invite acceptance is recorded in `AuditLog`
- [ ] Pending invites visible and cancellable in the Team page
