import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { query } from '../db/pool';
import { authenticate } from '../middleware/auth';
import { MatchPrediction, Match } from '../types';

export const predictionsRouter = Router();

const predictionSchema = Joi.object({
  match_id: Joi.number().integer().positive().required(),
  prediction_result: Joi.string().valid('home', 'draw', 'away').required(),
  team_a_goals: Joi.number().integer().min(0).max(20).required(),
  team_b_goals: Joi.number().integer().min(0).max(20).required(),
  goal_difference: Joi.number().integer().min(0).max(20).required(),
  first_scorer: Joi.string().valid('home', 'away', 'none').required(),
});

function getDeadline(kickoffUtc: Date): Date {
  return new Date(kickoffUtc.getTime() - 60 * 60 * 1000); // 1 hour before kickoff
}

// Submit or update a match prediction
predictionsRouter.post('/', authenticate, async (req: Request, res: Response) => {
  const { error, value } = predictionSchema.validate(req.body);
  if (error) { res.status(400).json({ error: error.details[0].message }); return; }

  const { match_id, prediction_result, team_a_goals, team_b_goals, goal_difference, first_scorer } = value;
  const userId = req.user!.id;

  // Fetch match and check deadline
  const { rows: matchRows } = await query<Match>('SELECT * FROM matches WHERE id = $1', [match_id]);
  if (matchRows.length === 0) { res.status(404).json({ error: 'Match not found' }); return; }
  const match = matchRows[0];

  const deadline = getDeadline(new Date(match.kickoff_time_utc));
  if (new Date() > deadline) {
    res.status(403).json({ error: 'Prediction deadline has passed' });
    return;
  }

  const { rows } = await query<MatchPrediction>(
    `INSERT INTO match_predictions
       (user_id, match_id, prediction_result, team_a_goals, team_b_goals, first_scorer, goal_difference, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false)
     ON CONFLICT (user_id, match_id) DO UPDATE SET
       prediction_result = EXCLUDED.prediction_result,
       team_a_goals = EXCLUDED.team_a_goals,
       team_b_goals = EXCLUDED.team_b_goals,
       first_scorer = EXCLUDED.first_scorer,
       goal_difference = EXCLUDED.goal_difference,
       is_default = false,
       submitted_at = NOW()
     RETURNING *`,
    [userId, match_id, prediction_result, team_a_goals, team_b_goals, first_scorer, goal_difference]
  );

  res.status(201).json({ prediction: rows[0] });
});

// Get all predictions for the current user
predictionsRouter.get('/my', authenticate, async (req: Request, res: Response) => {
  const { rows } = await query<MatchPrediction & { home_team: string; away_team: string; kickoff_time_utc: Date; round: string }>(
    `SELECT mp.*, m.home_team, m.away_team, m.kickoff_time_utc, m.round, m.group_name,
            m.status as match_status, m.home_score, m.away_score
     FROM match_predictions mp
     JOIN matches m ON mp.match_id = m.id
     WHERE mp.user_id = $1
     ORDER BY m.kickoff_time_utc ASC`,
    [req.user!.id]
  );
  res.json({ predictions: rows });
});

// Get prediction for specific match
predictionsRouter.get('/match/:matchId', authenticate, async (req: Request, res: Response) => {
  const { rows } = await query<MatchPrediction>(
    'SELECT * FROM match_predictions WHERE user_id = $1 AND match_id = $2',
    [req.user!.id, req.params.matchId]
  );
  res.json({ prediction: rows[0] ?? null });
});

// All league members' predictions for a match — only after deadline (1h before kickoff).
// Returns name + 5 fields per user. is_default flag included so frontend can mark
// "missed deadline" entries differently.
predictionsRouter.get('/match/:matchId/all', authenticate, async (req: Request, res: Response) => {
  const matchId = parseInt(req.params.matchId, 10);
  if (Number.isNaN(matchId)) { res.status(400).json({ error: 'Invalid match id' }); return; }

  const leagueId = req.user!.league_id;
  if (!leagueId) { res.json({ predictions: [], deadlinePassed: false }); return; }

  const { rows: matchRows } = await query<{ kickoff_time_utc: Date }>(
    'SELECT kickoff_time_utc FROM matches WHERE id = $1', [matchId]
  );
  if (matchRows.length === 0) { res.status(404).json({ error: 'Match not found' }); return; }

  const kickoff = new Date(matchRows[0].kickoff_time_utc);
  const deadline = new Date(kickoff.getTime() - 60 * 60 * 1000);
  const deadlinePassed = new Date() > deadline;
  if (!deadlinePassed) { res.json({ predictions: [], deadlinePassed: false }); return; }

  const { rows } = await query(
    `SELECT mp.id, mp.user_id, u.name, u.role,
            mp.prediction_result, mp.team_a_goals, mp.team_b_goals,
            mp.first_scorer, mp.goal_difference,
            mp.is_default, mp.points_earned
       FROM match_predictions mp
       JOIN users u ON u.id = mp.user_id
      WHERE mp.match_id = $1 AND u.league_id = $2 AND u.role != 'admin'
      ORDER BY mp.points_earned DESC NULLS LAST, mp.is_default ASC, u.name ASC`,
    [matchId, leagueId]
  );

  res.json({ predictions: rows, deadlinePassed: true });
});
