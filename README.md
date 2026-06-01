# mondo_2026 — WC2026 Predictions Pool

A self-hosted World Cup 2026 betting platform for friends. League-based: each league has its own admin, members, and leaderboard. Sign-up requires an invite code from a league admin.

> **🚀 Already deployed?** See [`docs/DEPLOYMENT_AND_OPERATIONS.md`](docs/DEPLOYMENT_AND_OPERATIONS.md) for the live URLs, where things run, the operational playbook, and the decisions log. Read that first if you're picking this project up after a gap.
>
> **👋 New player joining a league?** See [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) for install instructions, how scoring works, and FAQ. ([Plain text version](docs/USER_GUIDE.txt) for sharing in chats.)

## Stack

- **Backend**: Express + TypeScript + PostgreSQL, JWT auth, node-cron, Joi validation, Winston logs.
- **Frontend**: React 18 + Vite, React Query, react-router, PWA (vite-plugin-pwa).
- **Free hosting**: Fly.io (backend, doesn't sleep) + Neon (Postgres) + Vercel (frontend).

## Local development

```bash
# 1. Postgres
createdb mondo2026

# 2. Backend
cd backend
cp .env.example .env
# edit .env — set DATABASE_URL and a long random JWT_SECRET
npm install
npm run migrate
npm run dev          # runs on :3001

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev          # runs on :5173, proxies /api → :3001
```

Open http://localhost:5173 and register. **The first user becomes super_admin** (no invite code needed). Then create a league from the admin panel and share the invite code.

## Tests

```bash
cd backend && npm test    # 21 scoring engine tests
cd frontend && npm test   # 19 leaderboard UI tests
```

## Deployment to production (free tier)

### 1. Database — Neon

1. Sign up at https://neon.tech (free tier: 0.5 vCPU, 3GB).
2. Create a project (any name). Pick the region closest to your users.
3. Copy the connection string — it looks like `postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require`.

### 2. Backend — Fly.io

```bash
# One-time setup
brew install flyctl     # or curl -L https://fly.io/install.sh | sh
fly auth signup          # free tier requires CC on file but won't charge for our usage

cd backend
fly launch --no-deploy   # accept defaults, decline DB and Redis offers
# Edit fly.toml — change `app = "mondo-2026"` to a unique name if taken

# Set secrets (Fly stores these encrypted)
fly secrets set \
  DATABASE_URL="postgresql://...neon...?sslmode=require" \
  JWT_SECRET="$(openssl rand -hex 32)" \
  FRONTEND_URL="https://your-app.vercel.app"

# Deploy. The release_command runs migrations automatically before each deploy.
fly deploy

# Sanity check
fly logs               # watch startup logs
curl https://mondo-2026.fly.dev/api/health
```

### 3. Frontend — Vercel

```bash
cd frontend
# Connect via GitHub (recommended) or Vercel CLI
npm install -g vercel
vercel                 # follow prompts, link to your account
```

Then in the Vercel dashboard for this project → Settings → Environment Variables:

```
VITE_API_URL = https://mondo-2026.fly.dev
```

Redeploy from the Vercel dashboard (or push a commit) so the new env var is baked into the build.

### 4. CORS — close the loop

Once the Vercel URL is known, update the backend secret so CORS lets it through:

```bash
fly secrets set FRONTEND_URL="https://your-actual-vercel-url.vercel.app"
```

### 5. First-time bootstrap

1. Visit your Vercel URL → `/register`.
2. **Leave the invite code empty** — you'll become the `super_admin`.
3. Go to Admin → Manage Leagues → create a league. Copy the invite code.
4. Open an incognito window and register a second user with that code. Confirm they land on the home page and see the empty leaderboard for that league.
5. Go to Admin → Enter Match Results → set a dummy match to "finished" with a score. Confirm the leaderboard updates.

### 6. Keep the cron alive

Fly.io free tier keeps machines running 24/7 if `min_machines_running = 1` (set in `fly.toml`). The 5-minute cron job that fills in default predictions 1h before kickoff will fire correctly.

Optional: set up [UptimeRobot](https://uptimerobot.com) (free) to ping `https://mondo-2026.fly.dev/api/health` every 5 minutes. Alerts you on downtime AND keeps the VM warm.

## Key features

- **Leagues**: super_admin creates leagues, each league has its own admin (promotable from members) and leaderboard. Users register with a 6-char invite code.
- **Match predictions**: 5-dimension scoring per match (result, home goals, away goals, first-scoring team, goal difference). Group: 2 pts each. Knockout: 3 pts. Default predictions 1 pt.
- **Pre-tournament predictions**: winner (16), runner-up (8), top scorer team (12), top assister team (12), 12 group winners + runners-up (4 each).
- **Auto-default predictions**: if a user hasn't predicted by 1h before kickoff, a 0-0 draw is filled in (cron job runs every 5 min).
- **Group opinion stats**: see how your league voted — but only after the deadline passes.
- **Admin panel**: enter match results, manage users, regenerate invite codes, configure deadlines.

## Migrations

Migrations are plain `.sql` files in `backend/migrations/`. They run in alphabetical order via `npm run migrate`. The `schema_migrations` table tracks what's applied — re-running is a no-op for already-applied files.

To add one:
```bash
# Create backend/migrations/006_my_change.sql
echo "ALTER TABLE ..." > backend/migrations/006_my_change.sql
npm run migrate          # locally first
fly deploy               # release_command runs it on next deploy
```

## Troubleshooting

**"Invalid league invite code" on register**: codes are case-insensitive but must be exactly 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `0/O/1/I`). Have the league admin regenerate from the Leagues page.

**Backend 500s after deploy**: `fly logs` to see the error. Most common is missing env var (check `fly secrets list`).

**CORS errors in browser console**: backend's `FRONTEND_URL` doesn't match the actual frontend URL. Update with `fly secrets set FRONTEND_URL=...` then `fly deploy`.

**Leaderboard is empty**: a player only appears in their own league's leaderboard. Confirm they registered with the right invite code.
