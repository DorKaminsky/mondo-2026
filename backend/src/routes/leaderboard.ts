import { Router, Request, Response } from 'express';
import { query } from '../db/pool';
import { authenticate } from '../middleware/auth';

export const leaderboardRouter = Router();

leaderboardRouter.get('/', authenticate, async (req: Request, res: Response) => {
  const leagueId = req.user!.league_id;
  if (!leagueId) {
    res.json({ leaderboard: [], currentUserId: req.user!.id });
    return;
  }
  const { rows } = await query(
    `SELECT
       u.id, u.name,
       s.total_points, s.pre_tournament_points, s.group_stage_points,
       s.knockout_points, s.perfect_matches_count,
       RANK() OVER (ORDER BY s.total_points DESC, s.perfect_matches_count DESC) AS rank
     FROM scores s
     JOIN users u ON s.user_id = u.id
     WHERE u.role = 'player' AND u.league_id = $1
     ORDER BY s.total_points DESC, s.perfect_matches_count DESC`,
    [leagueId]
  );
  res.json({ leaderboard: rows, currentUserId: req.user!.id });
});

leaderboardRouter.get('/me', authenticate, async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const { rows: scoreRows } = await query(
    `SELECT s.*,
       RANK() OVER (ORDER BY s.total_points DESC) AS rank
     FROM scores s
     WHERE s.user_id = $1`,
    [userId]
  );

  const { rows: matchHistory } = await query(
    `SELECT
       mp.*,
       m.home_team, m.away_team, m.kickoff_time_utc, m.round, m.group_name,
       m.home_score, m.away_score, m.status as match_status, m.first_scorer_team
     FROM match_predictions mp
     JOIN matches m ON mp.match_id = m.id
     WHERE mp.user_id = $1
     ORDER BY m.kickoff_time_utc DESC`,
    [userId]
  );

  res.json({
    score: scoreRows[0] ?? null,
    matchHistory,
  });
});

leaderboardRouter.get('/stats', authenticate, async (req: Request, res: Response) => {
  const leagueId = req.user!.league_id;
  if (!leagueId) {
    res.json({ popularPredictions: [] });
    return;
  }
  const { rows: popularPredictions } = await query(
    `SELECT
       m.id as match_id, m.home_team, m.away_team,
       COUNT(*) FILTER (WHERE mp.prediction_result = 'home') as home_votes,
       COUNT(*) FILTER (WHERE mp.prediction_result = 'draw') as draw_votes,
       COUNT(*) FILTER (WHERE mp.prediction_result = 'away') as away_votes,
       COUNT(*) as total_predictions
     FROM matches m
     JOIN match_predictions mp ON mp.match_id = m.id
     JOIN users u ON mp.user_id = u.id
     WHERE u.league_id = $1
     GROUP BY m.id, m.home_team, m.away_team
     ORDER BY m.kickoff_time_utc ASC
     LIMIT 20`,
    [leagueId]
  );

  res.json({ popularPredictions });
});
