from datetime import datetime, timedelta, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from jose import jwt
from authlib.integrations.httpx_client import AsyncOAuth2Client

from app.config import get_settings
from app.database import get_db, current_user_id_var, bypass_rls_var, impersonating_admin_email_var
from app.models.user import User
from app.models.invite import TeamInvite
from app.models.access_request import PlatformAccessRequest
from app.rate_limit import limiter
from app.schemas.user import UserOut, UserWithTeams
from app.services.email import send_welcome_email

router = APIRouter()
settings = get_settings()

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


def create_jwt(user_id: uuid.UUID) -> str:
    """Create a JWT token for a user."""
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expiry_hours),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """FastAPI dependency: extract and validate JWT from cookie, return User.

    Also sets the per-request RLS context so Postgres row-level-security
    policies can filter by the authenticated user's team memberships.
    """
    token = request.cookies.get("ca_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    # The users table is global (no RLS), so we can look the user up before
    # the RLS context is established. After this point, every subsequent
    # query in this request runs under the user's identity.
    bypass_rls_var.set(True)
    user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
    bypass_rls_var.set(False)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=401, detail="User not found")

    current_user_id_var.set(str(user.id))
    # Super-admins bypass RLS policies entirely (covers admin.py endpoints
    # that read across teams). App-layer `require_super_admin` still gates
    # these routes; bypass here just lets the query itself return rows.
    if user.is_super_admin:
        bypass_rls_var.set(True)

    # If ca_admin_token is present this request is running as an impersonated user.
    # Decode it so audit log entries can be marked with who is impersonating.
    admin_cookie = request.cookies.get("ca_admin_token")
    if admin_cookie:
        try:
            admin_payload = jwt.decode(admin_cookie, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
            admin_uid = admin_payload.get("sub")
            if admin_uid:
                bypass_rls_var.set(True)
                admin_user = db.query(User).filter(User.id == uuid.UUID(admin_uid)).first()
                bypass_rls_var.set(False)
                if admin_user:
                    impersonating_admin_email_var.set(admin_user.email)
        except Exception:
            pass

    # Attach the user to any error reports Sentry captures on this request.
    from app.observability import set_user_context
    set_user_context(str(user.id), user.email)
    return user


@router.get("/login")
@limiter.limit("10/minute")
async def login(request: Request):
    """Redirect user to Google OAuth consent screen."""
    client = AsyncOAuth2Client(
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        redirect_uri=f"{settings.api_url}/auth/callback",
        scope="openid email profile",
    )
    uri, _state = client.create_authorization_url(GOOGLE_AUTH_URL)
    return RedirectResponse(url=uri)


@router.get("/callback")
@limiter.limit("10/minute")
async def callback(request: Request, db: Session = Depends(get_db)):
    """Handle Google OAuth callback."""
    code = request.query_params.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    client = AsyncOAuth2Client(
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        redirect_uri=f"{settings.api_url}/auth/callback",
    )

    # Exchange code for tokens
    token = await client.fetch_token(GOOGLE_TOKEN_URL, code=code)

    # Get user info from Google
    client.token = token
    resp = await client.get(GOOGLE_USERINFO_URL)
    userinfo = resp.json()

    google_id = userinfo["sub"]
    email = userinfo["email"]
    display_name = userinfo.get("name", email.split("@")[0])
    avatar_url = userinfo.get("picture")

    # RLS bypass: no user identity is established yet during the OAuth callback.
    bypass_rls_var.set(True)
    user = db.query(User).filter(User.google_id == google_id).first()
    if user is None:
        if not settings.allow_signup:
            bypass_rls_var.set(False)
            return RedirectResponse(
                url="http://localhost:5173?login_error=signup_disabled", status_code=302
            )

        # Gate: new users must have a pending team invite OR an accepted access request.
        has_team_invite = db.query(TeamInvite).filter(
            TeamInvite.invited_email == email,
            TeamInvite.status == "pending",
            TeamInvite.expires_at > datetime.now(timezone.utc),
        ).first()

        has_access = db.query(PlatformAccessRequest).filter(
            PlatformAccessRequest.email == email,
            PlatformAccessRequest.status == "accepted",
        ).first()

        if not has_team_invite and not has_access:
            # Determine the right error to show in the UI
            pending_req = db.query(PlatformAccessRequest).filter(
                PlatformAccessRequest.email == email,
                PlatformAccessRequest.status == "pending",
            ).first()
            rejected_req = db.query(PlatformAccessRequest).filter(
                PlatformAccessRequest.email == email,
                PlatformAccessRequest.status == "rejected",
            ).first()
            if pending_req:
                error = "access_pending"
            elif rejected_req:
                error = "access_rejected"
            else:
                error = "access_needed"
            bypass_rls_var.set(False)
            return RedirectResponse(
                url=f"http://localhost:5173?login_error={error}", status_code=302
            )

        user = User(
            google_id=google_id,
            email=email,
            display_name=display_name,
            avatar_url=avatar_url,
            company=has_access.company if has_access else None,
        )
        db.add(user)
        db.flush()
        user.last_login_at = datetime.now(timezone.utc)

        # Send welcome email for users coming through the team-invite bypass.
        # (Access-request approvals get their own email at accept time via admin.)
        if has_team_invite and not has_access:
            send_welcome_email(email, display_name, "http://localhost:5173")
    else:
        user.last_login_at = datetime.now(timezone.utc)
        # Don't overwrite display_name on returning users — they may have set
        # their own in /profile. Only seed it if it was never populated.
        if not user.display_name:
            user.display_name = display_name
        user.avatar_url = avatar_url

    db.commit()
    bypass_rls_var.set(False)

    # Issue JWT cookie and redirect to frontend
    token_str = create_jwt(user.id)
    response = RedirectResponse(url="http://localhost:5173", status_code=302)
    is_prod = settings.environment != "development"
    response.set_cookie(
        key="ca_token",
        value=token_str,
        httponly=True,
        secure=is_prod,
        samesite="none" if is_prod else "lax",
        max_age=settings.jwt_expiry_hours * 3600,
    )
    return response


@router.get("/me", response_model=UserWithTeams)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the current authenticated user with their team memberships."""
    return current_user


@router.put("/me", response_model=UserOut)
def update_me(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update the current user's editable profile fields."""
    if "display_name" in payload:
        name = (payload.get("display_name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="display_name cannot be empty")
        if len(name) > 128:
            raise HTTPException(status_code=400, detail="display_name too long")
        current_user.display_name = name
    if "company" in payload:
        company = (payload.get("company") or "").strip() or None
        if company and len(company) > 128:
            raise HTTPException(status_code=400, detail="company too long")
        current_user.company = company
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user


ALLOWED_THEMES = {"default", "light", "amber", "staminachem"}


@router.put("/me/theme", response_model=UserOut)
def set_my_theme(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update the current user's theme preference."""
    theme = payload.get("theme")
    if theme not in ALLOWED_THEMES:
        raise HTTPException(status_code=400, detail="invalid theme")
    current_user.theme = theme
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/logout")
def logout(response: Response):
    """Clear the auth cookie."""
    response.delete_cookie("ca_token")
    return {"status": "logged out"}