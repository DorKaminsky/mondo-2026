-- 008_add_is_mock.sql
-- Adds an is_mock flag to users so we can exclude non-competing mock accounts
-- (e.g. ISRAEL, used as a fake "average bettor" reference) from the leaderboard
-- and stats while still keeping their predictions visible everywhere else.
--
-- ISRAEL (id=2) is the only mock for now. Targeted by id AND name to avoid
-- silently flagging the wrong row if the DB diverges in some future restore.
-- Idempotent: re-running this migration leaves state unchanged.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_mock BOOLEAN NOT NULL DEFAULT false;

UPDATE users
   SET is_mock = true
 WHERE id = 2 AND name = 'ISRAEL' AND is_mock = false;

-- Speeds up the `WHERE is_mock = false` filter that now appears on every
-- leaderboard / stats query. Tiny table today but cheap insurance.
CREATE INDEX IF NOT EXISTS idx_users_is_mock ON users (is_mock) WHERE is_mock = false;
