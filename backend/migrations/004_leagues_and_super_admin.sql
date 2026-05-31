-- 004_leagues_and_super_admin.sql
-- Adds per-league multi-tenancy and a super_admin role.
-- Each user belongs to one league; super_admins create leagues and promote league admins.

-- Leagues table
CREATE TABLE IF NOT EXISTS leagues (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leagues_invite_code ON leagues(invite_code);

-- Add league_id to users (nullable; super_admins may have none)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS league_id INTEGER REFERENCES leagues(id) ON DELETE SET NULL;

-- Replace the role CHECK constraint to include super_admin
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('player', 'admin', 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_users_league_id ON users(league_id);
