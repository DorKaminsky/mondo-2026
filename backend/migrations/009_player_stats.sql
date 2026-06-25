CREATE TABLE IF NOT EXISTS player_stats (
  espn_athlete_id TEXT PRIMARY KEY,
  full_name       TEXT NOT NULL,
  team_name       TEXT NOT NULL,
  goals           INTEGER NOT NULL DEFAULT 0,
  assists         INTEGER NOT NULL DEFAULT 0,
  matches_played  INTEGER NOT NULL DEFAULT 0,
  last_synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_stats_goals   ON player_stats (goals DESC);
CREATE INDEX IF NOT EXISTS idx_player_stats_assists ON player_stats (assists DESC);
