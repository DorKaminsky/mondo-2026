# CLAUDE.md — Production Safety Rules

> **Read this BEFORE touching anything in this repo.**
> The mondo-2026 platform has real users with real predictions on the line. As of June 7, 2026, there are ~6 league members and the World Cup starts June 11. **Lost data = lost trust. Permanent.**

---

## 🚨 PRODUCTION IS LIVE — TREAT THE DB AS SACRED

The Neon Postgres at `ep-wandering-mountain-alhkssrj` holds:
- Real user accounts (passwords hashed with bcrypt — irrecoverable if lost)
- Real predictions submitted before deadlines (cannot be re-entered after lock)
- League invite codes friends are using
- Match scores entered manually by the admin (you, Dor)
- Pre-tournament predictions worth up to 132 pts each

**There are NO backups except Neon's automatic 24-hour point-in-time recovery on the default branch.** If you destroy data and notice 25 hours later, it's gone forever.

---

## ⛔ ABSOLUTELY FORBIDDEN without explicit user confirmation IN THIS SESSION

These commands/operations require Dor to type "yes do it" in plain text after I've described exactly what will happen and what data is at risk. **Do not assume past authorization carries forward.**

- `DELETE FROM users` (any variant — even `WHERE email LIKE '%test%'`)
- `DELETE FROM match_predictions` (any variant)
- `DELETE FROM pre_tournament_predictions` (any variant)
- `DELETE FROM scores` or `UPDATE scores SET ... = 0` (any variant — wipes accumulated points)
- `DELETE FROM leagues` (orphans users)
- `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `DELETE FROM matches`
- `UPDATE matches SET status = 'scheduled'` after a match has been scored (un-scoring loses points history)
- `UPDATE matches SET kickoff_time_utc = ...` for any match real users have predicted on (changes deadlines retroactively)
- `UPDATE match_predictions SET points_earned = NULL` (wipes scoring history, even if "I'll re-score it")
- `fly apps destroy mondo-2026-dk` or any command that destroys the Fly app
- `fly secrets unset DATABASE_URL` or `JWT_SECRET` (the latter logs everyone out instantly)
- Any direct `psql` connection where the planned action isn't explicitly approved
- Resetting Neon's default branch from a snapshot
- Force-pushing to `main` (`git push --force` to origin)
- Deleting branches that have user-impacting code

If a request seems to require any of the above, **STOP** and ask: "This will destroy [specific data]. Type 'yes do it' to confirm, or tell me what you actually want."

---

## ⚠️ HIGH-CAUTION operations — describe the impact first

These can be done but require an explanation of what changes BEFORE I act:

- `fly deploy --app mondo-2026-dk` — running migrations on every deploy. Always check `backend/migrations/` for any new files since the last deploy and explain what they'll do.
- Any new `.sql` migration in `backend/migrations/` — write the migration as `IF NOT EXISTS` / `IF EXISTS` so re-running is idempotent. Never write a migration that DROPs anything without explicit confirmation in the session.
- `vercel --prod` — frontend changes. Lower risk than backend, but still: name what users will see differently.
- Editing `backend/src/services/scoring.ts` — touch with extreme care; `calculateMatchScores` has subtraction logic for re-scoring that, if buggy, can silently double-count or zero out everyone.
- Editing `backend/src/middleware/auth.ts` — a bug here can either lock everyone out or open the system to anyone.
- Changing the `users.role` CHECK constraint or `users.league_id` NOT NULL.
- Bumping `JWT_SECRET` (logs everyone out, including Dor — confirm there's a plan to share fresh login info).

---

## 🛡️ SAFE-BY-DEFAULT patterns

When fixing user-reported bugs, prefer these patterns:

### Reading the DB to investigate
Always safe. Read freely with `SELECT`s.

### Adding a migration
- Use `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- For data backfills, use `WHERE ... IS NULL` so re-running doesn't overwrite real values
- Test against a Neon branch first if the migration touches multiple rows
- Number sequentially (the next file should be `008_*.sql`)

### Changing application code
- Run `npx tsc --noEmit` and `npm test` in `backend/` and `frontend/` before deploying
- Frontend changes: deploy first, ask user to verify, then move on
- Backend changes: same, but also tail `fly logs --app mondo-2026-dk` for 30 seconds after deploy

### Fixing a single user's data
- Always show the user what will change before changing it: `SELECT ... before` + describe what `UPDATE` will do
- Prefer surgical updates (`WHERE id = X`) over broad ones
- Never use `DELETE` when `UPDATE` to set fields to `NULL` is enough
- Save the affected row's previous state in the conversation so it's recoverable for ~5 minutes

### Re-scoring a match
- The scoring engine in `calculateMatchScores` is idempotent (it subtracts old then adds new) — calling `PUT /api/admin/matches/:id/result` again with the same scores is safe
- Do NOT manually `UPDATE scores` to "fix" something — call the admin endpoint instead

---

## 🚫 NEVER DURING TEST/SIMULATION RUNS

I have a pattern of running E2E simulations against production. The tests have always cleaned up after themselves, but cleanup itself is dangerous.

**When running any simulation:**
- The cleanup `DELETE FROM users WHERE email LIKE 'sim-%@test.com'` is fine because the LIKE is specific, but ALWAYS verify the WHERE clause matches only test data before running
- The cleanup `DELETE FROM users WHERE email LIKE 'load-%@test.com'` — same: verify
- NEVER `DELETE FROM users` without a `WHERE` clause that I've inspected
- NEVER reset all scores (`UPDATE scores SET total_points = 0 ...`) unless the user explicitly asked to wipe scores. After friends start playing, this is destructive even between matches.
- NEVER reset matches (`UPDATE matches SET status = 'scheduled'`) for matches that have been scored

If a simulation needs to clean up: prefer creating users in a separate `SIMULATION` league and only delete via `WHERE league_id = <sim>` predicates.

---

## 📋 Pre-action checklist for ANY destructive operation

Before running any DELETE, UPDATE, DROP, TRUNCATE, or `fly apps destroy`:

1. **Pause.** Don't just type the command.
2. **State the action** in plain English: "I'm about to delete N rows of TYPE matching CONDITION."
3. **State the impact**: "This affects user X / score Y / match Z."
4. **State the recoverability**: "This is recoverable via Neon PITR within 24h" / "This is NOT recoverable."
5. **Wait for explicit "yes do it" confirmation in the current session.**
6. **Run the equivalent SELECT first** to see what would be affected.
7. **Only then** execute.

If the user previously approved a similar action — that authorization does NOT carry forward. Fresh session, fresh confirmation.

---

## 🔑 Live-reference

- **Production frontend:** https://mondo-2026-two.vercel.app
- **Production backend:** https://mondo-2026-dk.fly.dev
- **Database:** Neon project `mondo-2026`, default branch `production`. Connection string in Fly secrets (`fly secrets list --app mondo-2026-dk`).
- **GitHub:** https://github.com/DorKaminsky/mondo-2026
- **Owner accounts:** Dor (super_admin, league_id=1)
- **Friends in Class Of 2014** (league_id=1): Israel, Oren, Gal, Guy. As of session start of 2026-06-07: **DO NOT delete or modify their predictions/scores without explicit per-user confirmation.**

---

## 🩹 If something goes wrong

1. Check Fly logs: `fly logs --app mondo-2026-dk`
2. Check Neon point-in-time recovery: https://console.neon.tech → mondo-2026 → Branches → restore. **Available for 24 hours** on the default branch.
3. If the issue is recent (< 1 hour) and the data was clearly destroyed, RESTORE FROM PITR before doing anything else.
4. Roll back the Fly deploy: `fly releases list --app mondo-2026-dk` then `fly deploy --image registry.fly.io/mondo-2026-dk:deployment-<previous>`
5. Frontend rollback: in Vercel dashboard → Deployments → previous deployment → Promote to Production.
6. Tell Dor what happened, what was lost, and what you're doing to recover.

**Never silently delete more data trying to "clean up" a previous mistake.**

---

## 📜 Read these too (other docs in this repo)

- [`docs/DEPLOYMENT_AND_OPERATIONS.md`](docs/DEPLOYMENT_AND_OPERATIONS.md) — where things live, how to deploy, how to verify, decisions log
- [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) — what friends see; useful context for "what does this feature do"
- [`README.md`](README.md) — project overview

---

**Tournament starts June 11, 2026 at 19:00 UTC. Every prediction submitted before each kickoff − 1h is sacred. Don't break the trust.**
