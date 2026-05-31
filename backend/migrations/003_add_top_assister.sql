ALTER TABLE pre_tournament_predictions
  ADD COLUMN IF NOT EXISTS top_assister_name TEXT,
  ADD COLUMN IF NOT EXISTS top_assister_team TEXT;
