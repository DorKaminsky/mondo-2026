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
