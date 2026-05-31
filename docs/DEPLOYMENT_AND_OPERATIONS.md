# Operations & Deployment Runbook

This doc is the living record of how mondo-2026 is deployed, where things live, how to keep it running during the tournament, and what to do when something breaks. Read this first if you (or a future Claude session) are picking up this project after a gap.

Last updated: 2026-05-31 (initial production ship).

---

## 1. The "where is everything" map

| Component | Provider | Free? | URL / Identifier |
|---|---|---|---|
| Frontend (PWA) | Vercel | Yes | https://mondo-2026-two.vercel.app |
| Backend (Express API) | Fly.io | Yes (CC required, no charge in our usage) | https://mondo-2026-dk.fly.dev |
| Database (Postgres 16) | Neon | Yes | console.neon.tech project: `mondo-2026` |
| Source code | GitHub | Yes (public) | https://github.com/DorKaminsky/mondo-2026 |
| Owner accounts | — | — | github: DorKaminsky · vercel: dorkaminsky · fly: kaminskydor@gmail.com |

### Region
- Fly app primary region: `fra` (Frankfurt) — close to Israel/Europe.
- Neon DB: `eu-central-1` (Frankfurt).
- Vercel: edge CDN (global).

### Two Fly machines run by default
Fly's HA default created two `app` machines for zero-downtime deploys. Both within free tier (3 shared-cpu-1x at 256MB allowed). To drop to one: edit `backend/fly.toml` → `min_machines_running = 0` → `fly deploy`. You lose zero-downtime deploys but save resources.

---

## 2. Architecture — one screen

```
┌─────────────────────┐         ┌──────────────────────────┐         ┌─────────────────┐
│  Vercel (frontend)  │  HTTPS  │  Fly.io (backend)        │  HTTPS  │  Neon (Postgres)│
│  React + Vite + PWA │ ──────▶ │  Express + node-cron      │ ──────▶ │  16, eu-central │
│  static + edge CDN  │   API   │  2x shared-cpu, 256MB     │  pg     │  3GB free       │
└─────────────────────┘         └──────────────────────────┘         └─────────────────┘
        │                              │
        │ VITE_API_URL points here      │ DATABASE_URL points to Neon
        │                              │ FRONTEND_URL points back to Vercel (CORS)
        └──────────────────────────────┘
                 baked at build time         set as Fly secret
```

Auth: JWT in `Authorization: Bearer` header. No cookies. No sessions. League membership is encoded in the JWT (`{ id, role, league_id }`) so most queries don't need a DB lookup to scope by league.

Cron: a single 5-minute job inside the Express process fills in default predictions (0-0, 1pt/correct) for any user who hasn't predicted by 1h before kickoff. Lives in `backend/src/jobs/index.ts`. Runs because Fly machines don't auto-stop (`auto_stop_machines = 'off'` in `fly.toml`).

---

## 3. Environment variables

### Backend (Fly secrets — set with `fly secrets set ... --app mondo-2026-dk`)

| Var | Required | What |
|---|---|---|
| `DATABASE_URL` | yes | Neon connection string with `?sslmode=require` |
| `JWT_SECRET` | yes | 32-byte hex (`openssl rand -hex 32`). Rotating logs everyone out. |
| `FRONTEND_URL` | yes | Exact Vercel URL (`https://mondo-2026-two.vercel.app`). Must match — CORS is exact-match in production. |
| `NODE_ENV` | yes (set in fly.toml) | `production` |
| `PORT` | yes (set in fly.toml) | `3001` |
| `SMTP_*`, `EMAIL_FROM`, `ADMIN_EMAIL` | optional | If empty, emails silently no-op. We don't send any critical email currently. |

List current values: `fly secrets list --app mondo-2026-dk` (only names — values are write-only after `set`).

### Frontend (Vercel env — set in dashboard or via `vercel env add`)

| Var | Required | What |
|---|---|---|
| `VITE_API_URL` | yes | `https://mondo-2026-dk.fly.dev` (no trailing slash; the client appends `/api`) |

⚠ Vercel env vars are baked **at build time**, not runtime. If you change `VITE_API_URL`, run `vercel --prod` again or trigger a rebuild from the dashboard.

---

## 4. How to do common things

### Day-to-day during the tournament

**Enter a finished match's score** (the only recurring task):
1. https://mondo-2026-two.vercel.app/admin/matches
2. Pick the match → enter home score, away score, first scoring team (home/away/none) → status: `finished` → submit
3. Scoring engine fires the moment you submit. Leaderboards update within 30s (frontend cache).

**Add a new league for new friends:**
1. https://mondo-2026-two.vercel.app/admin/leagues  (super-admin only — you)
2. Create → copy the 6-char code → share

**Promote a friend to league admin** (so they can enter their league's match results / regenerate the invite code):
- No UI button yet. Use the API directly:
  ```bash
  TOKEN=<your-jwt-from-localStorage-after-login>
  curl -X POST https://mondo-2026-dk.fly.dev/api/leagues/<LEAGUE_ID>/promote/<USER_ID> \
    -H "Authorization: Bearer $TOKEN"
  ```
- Or just do it directly in Neon SQL:
  ```sql
  UPDATE users SET role = 'admin' WHERE id = <USER_ID> AND league_id = <LEAGUE_ID>;
  ```

### Code changes & redeploy

**Backend change → Fly:**
```bash
cd backend
# make changes, commit
fly deploy --app mondo-2026-dk
# release_command runs migrations automatically
```

**Frontend change → Vercel:**
- Easiest: `git push` to GitHub `main` — Vercel auto-deploys on push (it's wired up via the GitHub integration during `vercel link`).
- Or manually: `cd frontend && vercel --prod`.

**New migration:**
```bash
# Add backend/migrations/006_my_change.sql
# Test locally first:
DATABASE_URL=... npm run migrate
# Then deploy:
fly deploy --app mondo-2026-dk
# release_command applies it; existing migrations are skipped.
```

### Debug a problem

```bash
# Backend health
curl https://mondo-2026-dk.fly.dev/api/health

# Recent backend logs (last 100 lines, follows new ones)
fly logs --app mondo-2026-dk

# DB inspect via psql
psql "postgresql://...neon..." -c "SELECT id, name, role, league_id FROM users ORDER BY created_at DESC LIMIT 10;"

# Roll back a bad backend deploy
fly releases --app mondo-2026-dk
fly deploy --app mondo-2026-dk --image registry.fly.io/mondo-2026-dk:deployment-<previous-id>

# Frontend build logs (vercel)
vercel logs <deployment-url>
```

### CORS errors after rename / redomain

Symptom: browser console shows `blocked by CORS policy` after deploying to a new Vercel URL.

Fix:
```bash
fly secrets set FRONTEND_URL='https://new-vercel-url.vercel.app' --app mondo-2026-dk
# Auto-rolls. Verify:
curl -i -X OPTIONS https://mondo-2026-dk.fly.dev/api/auth/login \
  -H 'Origin: https://new-vercel-url.vercel.app' \
  -H 'Access-Control-Request-Method: POST'
# Should return 204 with access-control-allow-origin matching the new URL.
```

---

## 5. Decisions log (why things are the way they are)

These are the calls made during the build that future-you might second-guess. Read before refactoring.

- **No payment verification on the platform.** Originally the app required admin approval of a payment screenshot to unlock predictions. Removed entirely (migration `005_drop_payment.sql`). Replaced with league invite codes — admin shares a 6-char code, only people with the code can register. Real payment happens off-platform (you collect via Bit/PayBox/whatever).
- **One league per user.** A user can't be in two leagues with the same email — they'd have to register twice with different emails. This kept the schema trivial: `league_id` lives on `users`, predictions/scores inherit scope via the user FK. If we ever need cross-league users, we'd need a `league_memberships` join table and a "current league" context everywhere.
- **Match list is global.** All leagues bet on the same 104 WC2026 matches. Matches are not scoped by league. This is correct: every league watches the same tournament. Scoring is per-user (so per-league via the user FK).
- **First user to register becomes super_admin.** The bootstrap rule in `backend/src/routes/auth.ts`: if the `users` table is empty, the registration request doesn't need an invite code AND the user is created with `role = 'super_admin'`. After that, every registration must include a valid invite code.
- **Invite codes use an unambiguous alphabet.** `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no `0/O/1/I` to avoid people typoing them in. 6 chars long. Collision-resistant up to ~33^6 ≈ 1.3B codes. See `backend/src/utils/inviteCode.ts`.
- **Match results are entered manually.** No sports API integration. Considered it but punted — 104 matches over 5 weeks is ~3 min/day of clicking. Decision recorded in conversation: "Manual entry, you do it (recommended for now)". If we ever automate, the clean place to bolt it on is a new cron job in `backend/src/jobs/index.ts` that polls a free API like football-data.org and calls `calculateMatchScores()` after writing the result.
- **JWT carries `league_id`.** Saves a DB lookup on every authenticated request. Tradeoff: if a user is moved between leagues (currently impossible via UI), the JWT stays stale until they log out and back in. Not a concern at our scale.
- **Two Fly machines, not one.** Fly's launch wizard auto-creates HA pairs. We kept it for zero-downtime deploys; cost is still $0 because both fit in the free 3-VM allowance.
- **PWA icons are gradient placeholders.** ImageMagick-generated 192x192 and 512x512 solid gradients. Replace `frontend/public/icon-192.png` and `icon-512.png` with proper artwork before any "official" launch, but they're valid PNGs and the manifest works.
- **No `/preview` page anymore.** It was a mock-data demo screen; deleted because friends register with codes — no demo audience. `MockAuthProvider` was deleted with it.
- **Cloudinary, multer, payment emails: all deleted.** They only existed to support payment screenshot uploads. Files removed: `backend/src/services/cloudinary.ts`, `backend/src/middleware/upload.ts`, the `sendPaymentApproved/Rejected` functions in `email.ts`, `backend/src/pages/admin/AdminPayments.tsx`. Dependencies removed from `package.json`: `cloudinary`, `multer`, `@types/multer`.

---

## 6. Known gaps (intentionally not built for v1)

These were considered and deliberately punted. If a friend complains about one of them, here's what's involved.

| Gap | Effort to add | Notes |
|---|---|---|
| Email verification on registration | Medium | Need to wire SMTP, send verification link, add `email_verified` column. Currently you trust the league code as the auth gate. |
| Password reset | Medium | Need SMTP + reset token table. Workaround: you can manually update `password_hash` in Neon SQL with a bcrypt hash. |
| "Promote to admin" UI button | Small | Add a button to `frontend/src/pages/admin/AdminUsers.tsx` calling the existing `/api/leagues/:id/promote/:userId` endpoint. |
| "Delete league" UI | Small | Add a DELETE endpoint in `backend/src/routes/leagues.ts` and a button. Be careful — orphans users. Probably want to either reassign or cascade-delete users. |
| Live match auto-update | Medium | Sports API integration. football-data.org has a free WC tier. Add a cron job that polls every 5 min during match windows. Risk: lag and occasional bad data → keep manual override anyway. |
| PWA install prompt | Tiny | The PWA already works; just no in-app banner promoting "Add to Home Screen". |
| Group opinion deadline filter is client-side time | Small | If a friend's clock is wrong by more than an hour, they could see vote stats before deadline. Move the filter server-side. Currently the leak is mostly theoretical. |
| Per-league system settings | Medium | Right now `pre_tournament_deadline`, `announcement_banner`, `predictions_locked` are global (one super-admin tweaks them for everyone). If you want per-league deadlines, add `league_id` to `system_settings` PK. |

---

## 7. Fresh-machine setup (if you ever clone this repo elsewhere)

```bash
git clone https://github.com/DorKaminsky/mondo-2026.git
cd mondo-2026

# Backend
cd backend
cp .env.example .env       # edit DATABASE_URL + JWT_SECRET
npm install
npm run migrate            # against your local Postgres
npm run dev                # :3001

# Frontend (separate terminal)
cd ../frontend
npm install
npm run dev                # :5173, proxies /api → :3001
```

Tests:
```bash
cd backend && npm test     # 21 scoring engine tests
cd frontend && npm test    # 19 leaderboard UI tests
```

To deploy from scratch (e.g. a new region or a new Fly app):
1. Neon: create project, grab DATABASE_URL.
2. `cd backend && fly launch --no-deploy --copy-config --name <new-name> --region <region> --org personal --yes`
3. `fly secrets set DATABASE_URL=... JWT_SECRET=$(openssl rand -hex 32) FRONTEND_URL=<vercel-url> --app <new-name>`
4. `fly deploy --app <new-name>`
5. `cd ../frontend && vercel link --yes --project <project-name>`
6. `printf '<fly-url>' | vercel env add VITE_API_URL production`
7. `vercel --prod`
8. `fly secrets set FRONTEND_URL=<final-vercel-url> --app <new-name>`

---

## 8. Deployment timeline (this initial ship)

For reference / future "how long does this take" estimates:

- Local refactor (drop payment, add leagues, signup with codes, super_admin role, all UI updates): ~3 hours of focused work
- Neon DB setup: 5 min
- Fly.io install + signup + first deploy: 15 min
- Vercel install + first deploy: 5 min
- Wire CORS + smoke tests: 5 min
- Bootstrap super-admin + first league: 3 min

Total infra time once code is ready: ~30 minutes.
