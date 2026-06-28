-- 011_knockout_regulation_score.sql
-- Knockout matches can go to extra time + penalties. Predictions are scored
-- against the 90-minute (regulation) result only. Add columns to store the
-- full-time (post-ET) and shootout scores for display, while home_score /
-- away_score continue to hold the 90-minute score the scoring engine uses.

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS home_score_full_time INTEGER,
  ADD COLUMN IF NOT EXISTS away_score_full_time INTEGER,
  ADD COLUMN IF NOT EXISTS home_shootout_score INTEGER,
  ADD COLUMN IF NOT EXISTS away_shootout_score INTEGER;

COMMENT ON COLUMN matches.home_score IS '90-minute (regulation) home score. Used by scoring engine.';
COMMENT ON COLUMN matches.away_score IS '90-minute (regulation) away score. Used by scoring engine.';
COMMENT ON COLUMN matches.home_score_full_time IS 'Home score at end of extra time (or end of regulation if no ET). For display only.';
COMMENT ON COLUMN matches.away_score_full_time IS 'Away score at end of extra time (or end of regulation if no ET). For display only.';
COMMENT ON COLUMN matches.home_shootout_score IS 'Home penalty shootout score (NULL if no shootout). For display only.';
COMMENT ON COLUMN matches.away_shootout_score IS 'Away penalty shootout score (NULL if no shootout). For display only.';
