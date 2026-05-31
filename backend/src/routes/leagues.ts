import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { query } from '../db/pool';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { generateInviteCode } from '../utils/inviteCode';
import { League } from '../types';

export const leaguesRouter = Router();

const createSchema = Joi.object({
  name: Joi.string().min(2).max(80).required(),
});

// ── Caller's own league (any authenticated user) ────────────────────────────

leaguesRouter.get('/mine', authenticate, async (req: Request, res: Response) => {
  const { league_id, role } = req.user!;
  if (!league_id) { res.json({ league: null }); return; }

  // League admins (and super_admins) can see the invite code; players don't need it
  const wantsCode = role === 'admin' || role === 'super_admin';
  const sql = wantsCode
    ? 'SELECT id, name, invite_code, created_at FROM leagues WHERE id = $1'
    : 'SELECT id, name, created_at FROM leagues WHERE id = $1';
  const { rows } = await query(sql, [league_id]);
  res.json({ league: rows[0] ?? null });
});

// ── Super-admin: list, create, regenerate, promote ──────────────────────────

leaguesRouter.use(authenticate, requireSuperAdmin);

leaguesRouter.get('/', async (_req: Request, res: Response) => {
  const { rows } = await query(
    `SELECT l.id, l.name, l.invite_code, l.created_at,
            COUNT(u.id) FILTER (WHERE u.role = 'player') AS member_count,
            COUNT(u.id) FILTER (WHERE u.role = 'admin') AS admin_count
       FROM leagues l
       LEFT JOIN users u ON u.league_id = l.id
       GROUP BY l.id
       ORDER BY l.created_at DESC`
  );
  res.json({ leagues: rows });
});

leaguesRouter.post('/', async (req: Request, res: Response) => {
  const { error, value } = createSchema.validate(req.body);
  if (error) { res.status(400).json({ error: error.details[0].message }); return; }

  const inviteCode = await generateInviteCode();
  const { rows } = await query<League>(
    `INSERT INTO leagues (name, invite_code, created_by)
     VALUES ($1, $2, $3)
     RETURNING id, name, invite_code, created_by, created_at`,
    [value.name, inviteCode, req.user!.id]
  );
  res.status(201).json({ league: rows[0] });
});

leaguesRouter.post('/:id/regenerate-code', async (req: Request, res: Response) => {
  const newCode = await generateInviteCode();
  const { rows } = await query<League>(
    `UPDATE leagues SET invite_code = $1 WHERE id = $2
     RETURNING id, name, invite_code, created_by, created_at`,
    [newCode, req.params.id]
  );
  if (rows.length === 0) { res.status(404).json({ error: 'League not found' }); return; }
  res.json({ league: rows[0] });
});

leaguesRouter.post('/:id/promote/:userId', async (req: Request, res: Response) => {
  // Promote a player in this league to admin
  const { rows } = await query(
    `UPDATE users SET role = 'admin'
     WHERE id = $1 AND league_id = $2 AND role = 'player'
     RETURNING id, email, name, role, league_id`,
    [req.params.userId, req.params.id]
  );
  if (rows.length === 0) { res.status(404).json({ error: 'User not in this league or already admin' }); return; }
  res.json({ user: rows[0] });
});

leaguesRouter.post('/:id/demote/:userId', async (req: Request, res: Response) => {
  const { rows } = await query(
    `UPDATE users SET role = 'player'
     WHERE id = $1 AND league_id = $2 AND role = 'admin'
     RETURNING id, email, name, role, league_id`,
    [req.params.userId, req.params.id]
  );
  if (rows.length === 0) { res.status(404).json({ error: 'User not an admin in this league' }); return; }
  res.json({ user: rows[0] });
});
