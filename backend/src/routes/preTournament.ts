import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { query } from '../db/pool';
import { authenticate } from '../middleware/auth';
import { PreTournamentPrediction } from '../types';

export const preTournamentRouter = Router();

const GROUPS = ['a','b','c','d','e','f','g','h','i','j','k','l'];

const predictionSchema = Joi.object({
  winner_team: Joi.string().allow('', null),
  runner_up_team: Joi.string().allow('', null),
  top_scorer_name: Joi.string().allow('', null),
  top_scorer_team: Joi.string().allow('', null),
  top_assister_name: Joi.string().allow('', null),
  top_assister_team: Joi.string().allow('', null),
  ...Object.fromEntries(
    GROUPS.flatMap(g => [
      [`group_${g}_first`, Joi.string().allow('', null)],
      [`group_${g}_second`, Joi.string().allow('', null)],
    ])
  ),
});

async function getDeadline(): Promise<Date> {
  const { rows } = await query(
    "SELECT value FROM system_settings WHERE key = 'pre_tournament_deadline'"
  );
  return new Date(String(rows[0]?.value ?? '2026-06-11T13:00:00Z'));
}

preTournamentRouter.get('/', authenticate, async (req: Request, res: Response) => {
  const { rows } = await query<PreTournamentPrediction>(
    'SELECT * FROM pre_tournament_predictions WHERE user_id = $1',
    [req.user!.id]
  );
  res.json({ prediction: rows[0] ?? null });
});

preTournamentRouter.put('/', authenticate, async (req: Request, res: Response) => {
  const { error, value } = predictionSchema.validate(req.body);
  if (error) { res.status(400).json({ error: error.details[0].message }); return; }

  const userId = req.user!.id;

  const deadline = await getDeadline();
  if (new Date() > deadline) {
    res.status(403).json({ error: 'Pre-tournament prediction deadline has passed' });
    return;
  }

  const groupFields = GROUPS.flatMap(g => [`group_${g}_first`, `group_${g}_second`]);
  const fields = ['winner_team','runner_up_team','top_scorer_name','top_scorer_team','top_assister_name','top_assister_team', ...groupFields];

  const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  const vals = fields.map(f => value[f] || null);

  const { rows } = await query<PreTournamentPrediction>(
    `INSERT INTO pre_tournament_predictions (user_id, ${fields.join(', ')}, submitted_at)
     VALUES ($1, ${fields.map((_, i) => `$${i + 2}`).join(', ')}, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       ${setClauses},
       submitted_at = NOW()
     RETURNING *`,
    [userId, ...vals]
  );

  res.json({ prediction: rows[0] });
});
