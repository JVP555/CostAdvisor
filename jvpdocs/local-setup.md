# Local Development Setup

Step-by-step guide to get CostAdvisor running on a fresh machine (WSL2 / Ubuntu).

## Prerequisites

- WSL2 with Ubuntu
- Python 3.10+
- Node.js 20+
- Git

---

## 1 — Install system dependencies

```bash
sudo apt update && sudo apt install -y postgresql redis-server
```

---

## 2 — Start PostgreSQL and Redis

```bash
sudo service postgresql start
sudo service redis-server start

# Verify both are up
pg_isready          # should print "accepting connections"
redis-cli ping      # should print PONG
```

Add these to your `~/.bashrc` or `~/.zshrc` so they start automatically:

```bash
sudo service postgresql start
sudo service redis-server start
```

---

## 3 — Create the local database

```bash
psql -U "$USER" -d postgres -c "CREATE USER costadvisor WITH PASSWORD 'costadvisor';"
psql -U "$USER" -d postgres -c "CREATE DATABASE costadvisor OWNER costadvisor;"
psql -U "$USER" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE costadvisor TO costadvisor;"
```

---

## 4 — Clone and install dependencies

```bash
git clone <repo-url>
cd CostAdvisor

# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements-dev.txt

# Frontend
cd ../frontend
npm install
```

---

## 5 — Create the `.env` file

Copy the example file:

```bash
cp ~/CostAdvisor/backend/.env.example ~/CostAdvisor/backend/.env
```

Generate a JWT secret:

```bash
cd ~/CostAdvisor/backend && source venv/bin/activate && python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Then open `backend/.env` and fill in:

```
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-client-secret>
JWT_SECRET=<output from command above>
```

**Getting Google OAuth credentials:**
1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create Credentials → OAuth 2.0 Client ID → Web application
3. Add `http://localhost:8000/auth/callback` to **Authorised redirect URIs**
4. Copy the Client ID and Client Secret into `.env`

> Never commit `.env` — it is gitignored. For staging/prod use Railway's secret manager.

---

## 6 — Run database migrations

```bash
cd ~/CostAdvisor/backend
source venv/bin/activate
alembic upgrade head
```

This applies all 15 migrations in order — creates every table, RLS policy, and seeds freight lane defaults.

---

## 7 — Start the app

```bash
cd ~/CostAdvisor
./start.sh
```

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5173`

---

## 8 — Log in

Go to `http://localhost:5173` and sign in with your Google account. This creates your user and default team in the database.

---

## 9 — Grant yourself super admin (first time only)

After logging in, run this once to make your account a super admin:

```bash
cd ~/CostAdvisor/backend
source venv/bin/activate
python -c "
from app.database import SessionLocal, bypass_rls_var
from app.models.user import User
bypass_rls_var.set(True)
db = SessionLocal()
u = db.query(User).filter(User.email == 'YOUR_EMAIL_HERE').first()
print('Found:', u.email if u else 'NOT FOUND - log in via the app first')
if u:
    u.is_super_admin = True
    db.commit()
    print('Done - you are now super admin')
db.close()
"
```

Replace `YOUR_EMAIL_HERE` with the Google account email you logged in with.

---

## 10 — Verify the setup

| Check | How |
|---|---|
| Backend health | `curl http://localhost:8000/health` → `{"status":"ok"}` |
| Admin console | Go to `http://localhost:5173/admin` — should show the Admin Console page |
| API accessible | `http://localhost:8000/docs` → FastAPI Swagger UI |

---

## Common issues

| Error | Fix |
|---|---|
| `Redis is not running` | `sudo service redis-server start` |
| `password authentication failed for user "costadvisor"` | Re-run Step 3 to create the DB user |
| `relation "users" does not exist` | Re-run Step 5 (`alembic upgrade head`) |
| `NOT FOUND` when granting super admin | Complete Step 7 (log in via the app) first |
| Port 8000 already in use | `lsof -i :8000` then `kill <PID>` |
| Port 5173 already in use | `lsof -i :5173` then `kill <PID>` |
