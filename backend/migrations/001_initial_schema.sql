-- Initial schema for mondo_2026

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'approved', 'rejected')),
  payment_screenshot_url TEXT,
  payment_notes TEXT,
  payment_approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  api_match_id TEXT UNIQUE,
  match_number INTEGER NOT NULL,
  round TEXT NOT NULL CHECK (round IN ('group', 'r32', 'r16', 'qf', 'sf', 'final')),
  group_name TEXT,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  stadium TEXT,
  kickoff_time_utc TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'finished')),
  home_score INTEGER,
  away_score INTEGER,
  first_scorer_team TEXT CHECK (first_scorer_team IN ('home', 'away', 'none')),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_predictions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  prediction_result TEXT NOT NULL CHECK (prediction_result IN ('home', 'draw', 'away')),
  team_a_goals INTEGER NOT NULL DEFAULT 0 CHECK (team_a_goals >= 0 AND team_a_goals <= 20),
  team_b_goals INTEGER NOT NULL DEFAULT 0 CHECK (team_b_goals >= 0 AND team_b_goals <= 20),
  first_scorer TEXT NOT NULL DEFAULT 'none' CHECK (first_scorer IN ('home', 'away', 'none')),
  goal_difference INTEGER NOT NULL DEFAULT 0 CHECK (goal_difference >= 0),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  points_earned INTEGER,
  UNIQUE(user_id, match_id)
);

CREATE TABLE IF NOT EXISTS pre_tournament_predictions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  winner_team TEXT,
  runner_up_team TEXT,
  top_scorer_name TEXT,
  top_scorer_team TEXT,
  group_a_first TEXT,
  group_a_second TEXT,
  group_b_first TEXT,
  group_b_second TEXT,
  group_c_first TEXT,
  group_c_second TEXT,
  group_d_first TEXT,
  group_d_second TEXT,
  group_e_first TEXT,
  group_e_second TEXT,
  group_f_first TEXT,
  group_f_second TEXT,
  group_g_first TEXT,
  group_g_second TEXT,
  group_h_first TEXT,
  group_h_second TEXT,
  group_i_first TEXT,
  group_i_second TEXT,
  group_j_first TEXT,
  group_j_second TEXT,
  group_k_first TEXT,
  group_k_second TEXT,
  group_l_first TEXT,
  group_l_second TEXT,
  submitted_at TIMESTAMPTZ,
  is_final BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS scores (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  pre_tournament_points INTEGER NOT NULL DEFAULT 0,
  group_stage_points INTEGER NOT NULL DEFAULT 0,
  knockout_points INTEGER NOT NULL DEFAULT 0,
  total_points INTEGER NOT NULL DEFAULT 0,
  perfect_matches_count INTEGER NOT NULL DEFAULT 0,
  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (key, value) VALUES
  ('pre_tournament_deadline', '2026-06-11T13:00:00Z'),
  ('announcement_banner', ''),
  ('predictions_locked', 'false')
ON CONFLICT (key) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_match_predictions_user_id ON match_predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_match_predictions_match_id ON match_predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_matches_kickoff ON matches(kickoff_time_utc);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_scores_total ON scores(total_points DESC);
