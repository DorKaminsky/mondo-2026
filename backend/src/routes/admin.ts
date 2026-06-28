import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { query } from '../db/pool';
import { authenticate, requireAdmin } from '../middleware/auth';
import { calculateMatchScores, calculatePreTournamentScores } from '../services/scoring';
import { backfillAllFinishedMatches } from '../services/playerStats';

export const adminRouter = Router();
adminRouter.use(authenticate, requireAdmin);

// ── Match Result Entry ──────────────────────────────────────────────────────

// `home_score` / `away_score` are the 90-minute (regulation) score — what
// users predicted against. The full-time + shootout fields are optional, for
// knockout matches that went to ET/pens — admin only fills them in for display.
const resultSchema = Joi.object({
  home_score: Joi.number().integer().min(0).required(),
  away_score: Joi.number().integer().min(0).required(),
  first_scorer_team: Joi.string().valid('home', 'away', 'none').required(),
  status: Joi.string().valid('scheduled', 'live', 'finished').default('finished'),
  home_score_full_time: Joi.number().integer().min(0).allow(null).optional(),
  away_score_full_time: Joi.number().integer().min(0).allow(null).optional(),
  home_shootout_score: Joi.number().integer().min(0).allow(null).optional(),
  away_shootout_score: Joi.number().integer().min(0).allow(null).optional(),
});

adminRouter.put('/matches/:id/result', async (req: Request, res: Response) => {
  const { error, value } = resultSchema.validate(req.body);
  if (error) { res.status(400).json({ error: error.details[0].message }); return; }

  const matchId = parseInt(req.params.id, 10);

  await query(
    `UPDATE matches SET
       home_score = $1, away_score = $2, first_scorer_team = $3,
       status = $4,
       home_score_full_time = $5, away_score_full_time = $6,
       home_shootout_score = $7, away_shootout_score = $8,
       last_updated = NOW()
     WHERE id = $9`,
    [
      value.home_score, value.away_score, value.first_scorer_team, value.status,
      value.home_score_full_time ?? null, value.away_score_full_time ?? null,
      value.home_shootout_score ?? null, value.away_shootout_score ?? null,
      matchId,
    ]
  );

  if (value.status === 'finished') {
    await calculateMatchScores(matchId);
  }

  res.json({ message: 'Match updated and scores calculated' });
});

adminRouter.put('/matches/:id/status', async (req: Request, res: Response) => {
  const { status } = req.body;
  if (!['scheduled', 'live', 'finished'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }
  await query('UPDATE matches SET status = $1, last_updated = NOW() WHERE id = $2', [status, req.params.id]);
  res.json({ message: 'Match status updated' });
});

// ── User Management ─────────────────────────────────────────────────────────
// Super-admins see all users; league admins see only their own league.

adminRouter.get('/users', async (req: Request, res: Response) => {
  const { role, league_id } = req.user!;
  const isSuper = role === 'super_admin';

  const sql = isSuper
    ? `SELECT u.id, u.email, u.name, u.role, u.league_id, u.created_at,
              s.total_points, l.name AS league_name
         FROM users u
         LEFT JOIN scores s ON s.user_id = u.id
         LEFT JOIN leagues l ON l.id = u.league_id
         ORDER BY u.created_at DESC`
    : `SELECT u.id, u.email, u.name, u.role, u.league_id, u.created_at,
              s.total_points
         FROM users u
         LEFT JOIN scores s ON s.user_id = u.id
         WHERE u.league_id = $1
         ORDER BY u.created_at DESC`;

  const { rows } = isSuper ? await query(sql) : await query(sql, [league_id]);
  res.json({ users: rows });
});

adminRouter.delete('/users/:id', async (req: Request, res: Response) => {
  const { role, league_id } = req.user!;
  const isSuper = role === 'super_admin';

  // League admins can only delete players in their own league
  const sql = isSuper
    ? `DELETE FROM users WHERE id = $1 AND role = 'player'`
    : `DELETE FROM users WHERE id = $1 AND role = 'player' AND league_id = $2`;

  await (isSuper ? query(sql, [req.params.id]) : query(sql, [req.params.id, league_id]));
  res.json({ message: 'User deleted' });
});

// ── System Settings ─────────────────────────────────────────────────────────

adminRouter.get('/settings', async (_req: Request, res: Response) => {
  const { rows } = await query('SELECT key, value FROM system_settings');
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json({ settings });
});

adminRouter.put('/settings', async (req: Request, res: Response) => {
  const allowed = ['pre_tournament_deadline', 'announcement_banner', 'predictions_locked'];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));

  for (const [key, value] of updates) {
    await query(
      `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, String(value)]
    );
  }

  res.json({ message: 'Settings updated' });
});

// ── All Predictions for a Match (admin view, scoped to league) ──────────────

adminRouter.get('/matches/:id/predictions', async (req: Request, res: Response) => {
  const { role, league_id } = req.user!;
  const isSuper = role === 'super_admin';

  const sql = isSuper
    ? `SELECT mp.*, u.name, u.email, u.league_id, l.name AS league_name
         FROM match_predictions mp
         JOIN users u ON mp.user_id = u.id
         LEFT JOIN leagues l ON l.id = u.league_id
         WHERE mp.match_id = $1
         ORDER BY u.name ASC`
    : `SELECT mp.*, u.name, u.email
         FROM match_predictions mp
         JOIN users u ON mp.user_id = u.id
         WHERE mp.match_id = $1 AND u.league_id = $2
         ORDER BY u.name ASC`;

  const { rows } = isSuper
    ? await query(sql, [req.params.id])
    : await query(sql, [req.params.id, league_id]);
  res.json({ predictions: rows });
});

// ── Dashboard stats ─────────────────────────────────────────────────────────

adminRouter.get('/dashboard', async (req: Request, res: Response) => {
  const { role, league_id } = req.user!;
  const isSuper = role === 'super_admin';

  const usersSql = isSuper
    ? `SELECT COUNT(*) AS total FROM users WHERE role = 'player'`
    : `SELECT COUNT(*) AS total FROM users WHERE role = 'player' AND league_id = $1`;

  const [usersRes, matchesRes, leaguesRes] = await Promise.all([
    isSuper ? query(usersSql) : query(usersSql, [league_id]),
    query(`SELECT COUNT(*) FILTER (WHERE status = 'finished') AS finished,
                  COUNT(*) FILTER (WHERE status = 'live') AS live,
                  COUNT(*) AS total
             FROM matches`),
    isSuper
      ? query('SELECT COUNT(*) AS total FROM leagues')
      : Promise.resolve({ rows: [{ total: 1 }] }),
  ]);

  res.json({
    users: usersRes.rows[0],
    matches: matchesRes.rows[0],
    leagues: leaguesRes.rows[0],
  });
});

// ── Player Stats Backfill ────────────────────────────────────────────────────

adminRouter.post('/player-stats/backfill', async (_req: Request, res: Response) => {
  await backfillAllFinishedMatches();
  const { rows } = await query<{ count: string }>('SELECT COUNT(*) AS count FROM player_stats');
  res.json({ message: 'Backfill complete', players: parseInt(rows[0].count, 10) });
});

// ── Pre-tournament Result Entry ─────────────────────────────────────────────
// Admin enters the actual tournament outcomes; backend scores all
// pre-tournament predictions (winner 16 / runner-up 8 / top scorer name 12 /
// top assister name 12 / each group winner 4 / each group runner-up 4).

const GROUPS = ['a','b','c','d','e','f','g','h','i','j','k','l'];
const groupSchema = Joi.object(
  Object.fromEntries(GROUPS.flatMap(g => [
    [`group_${g}_first`, Joi.string().allow('', null)],
    [`group_${g}_second`, Joi.string().allow('', null)],
  ]))
);

const preTournamentResultSchema = Joi.object({
  winner_team: Joi.string().allow('', null),
  runner_up_team: Joi.string().allow('', null),
  top_scorer_name: Joi.string().allow('', null),
  top_assister_name: Joi.string().allow('', null),
  groups: groupSchema.required(),
});

// GET — fetch saved actuals (so admin can edit/correct them)
adminRouter.get('/pre-tournament-results', async (_req: Request, res: Response) => {
  const { rows } = await query<{ key: string; value: string }>(
    `SELECT key, value FROM system_settings WHERE key LIKE 'pt_actual_%'`
  );
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({ actuals: settings });
});

// PUT — save actuals AND trigger scoring
adminRouter.put('/pre-tournament-results', async (req: Request, res: Response) => {
  const { error, value } = preTournamentResultSchema.validate(req.body);
  if (error) { res.status(400).json({ error: error.details[0].message }); return; }

  // Persist each as a system_setting so admin can revisit
  const flat: Record<string, string> = {
    pt_actual_winner: value.winner_team ?? '',
    pt_actual_runner_up: value.runner_up_team ?? '',
    pt_actual_top_scorer: value.top_scorer_name ?? '',
    pt_actual_top_assister: value.top_assister_name ?? '',
  };
  for (const g of GROUPS) {
    flat[`pt_actual_group_${g}_first`] = value.groups[`group_${g}_first`] ?? '';
    flat[`pt_actual_group_${g}_second`] = value.groups[`group_${g}_second`] ?? '';
  }
  for (const [key, v] of Object.entries(flat)) {
    await query(
      `INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, v]
    );
  }

  // Mark all in-flight pre-tournament predictions as final, then score them
  await query(`UPDATE pre_tournament_predictions SET is_final = true`);

  const groupResults: Record<string, { first: string; second: string }> = {};
  for (const g of GROUPS) {
    groupResults[g] = {
      first: value.groups[`group_${g}_first`] ?? '',
      second: value.groups[`group_${g}_second`] ?? '',
    };
  }

  await calculatePreTournamentScores(
    value.winner_team ?? '',
    value.runner_up_team ?? '',
    value.top_scorer_name ?? '',
    value.top_assister_name ?? '',
    groupResults
  );

  res.json({ message: 'Pre-tournament results saved and scored' });
});
