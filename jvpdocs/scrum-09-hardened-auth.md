# Scrum 9 — Hardened Authentication on OAuth 2.0

**Status:** 🔴 Not started

## Goal
Harden the Google OAuth + JWT flow to meet enterprise IT requirements: PKCE, CSRF state validation, secure cookie storage, short-lived tokens with rotation, and scope minimisation.

## What Already Exists
- `backend/app/routers/auth.py` — Google OAuth callback, JWT issued as `HttpOnly` cookie (`ca_token`)
- JWT signed with HS256, expiry configured via `jwt_expiry_hours` (currently defaults to 72 h in `config.py`)
- `AuthContext.jsx` handles login redirect and `/auth/me` fetch
- `authlib` is installed (`requirements.txt`)

## Gaps to Close

### PKCE
- Generate `code_verifier` + `code_challenge` on the `/auth/login` redirect
- Pass `code_challenge` + `code_challenge_method=S256` to Google's authorisation endpoint
- Store `code_verifier` server-side (Redis, keyed by `state`) and send it with the token exchange in `/auth/callback`

### CSRF `state` parameter
- Currently verify state is present; confirm it is generated per-request, stored in a short-lived Redis key, and deleted after use
- If not, implement: `state = secrets.token_urlsafe(32)` → store in Redis (TTL 10 min) → validate in callback → delete

### Token lifecycle
- Reduce `jwt_expiry_hours` to 0.25 (15 min) for access tokens
- Implement a `refresh_token` (opaque, stored in a second `HttpOnly` cookie, 7-day TTL)
- Add `POST /auth/refresh` endpoint: validates refresh token, issues new access token, rotates refresh token (old one invalidated in Redis)
- On 401, `api.js` should attempt one silent refresh before redirecting to `/login`

### Cookie flags
- Confirm `ca_token` is set with `HttpOnly=True`, `Secure=True`, `SameSite=Strict`
- In `environment=development` allow `Secure=False` (localhost)

### Scope minimisation
- Confirm Google OAuth scopes are limited to `openid email profile` — no extra scopes

## Key Files
| File | Change |
|------|--------|
| `backend/app/routers/auth.py` | PKCE, state Redis storage, refresh endpoint |
| `backend/app/config.py` | `jwt_expiry_hours` → 0.25, add `refresh_token_expiry_days` |
| `frontend/src/api.js` | Silent refresh interceptor on 401 |
| `frontend/src/AuthContext.jsx` | Handle refresh flow |

## Acceptance Criteria
- [ ] PKCE `code_verifier`/`code_challenge` used on every OAuth flow
- [ ] `state` generated per-request, validated, and deleted after use
- [ ] Access token TTL ≤ 15 min; refresh token TTL = 7 days
- [ ] Refresh token rotates on every use; old token is immediately invalidated
- [ ] `ca_token` cookie has `HttpOnly`, `Secure`, `SameSite=Strict` in production
- [ ] Silent refresh in `api.js` — user is not logged out on a single 401
- [ ] OAuth scope is `openid email profile` only
