-- 007_last_seen_at.sql
-- Tracks when a user last visited the home page so we can show
-- "+X pts since your last visit" on login.

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_total_points INTEGER DEFAULT 0;

-- Backfill: existing users start with their current total as the baseline,
-- so the first "since last visit" delta is 0 (not their full score)
UPDATE users u SET last_seen_total_points = COALESCE(s.total_points, 0)
FROM scores s WHERE s.user_id = u.id;
