import { Router, Request, Response } from 'express';
import { query } from '../db/pool';
import { authenticate } from '../middleware/auth';
import { Match } from '../types';

export const matchesRouter = Router();

matchesRouter.get('/', authenticate, async (_req: Request, res: Response) => {
  const { rows } = await query<Match>(
    `SELECT * FROM matches ORDER BY kickoff_time_utc ASC`
  );
  res.json({ matches: rows });
});

matchesRouter.get('/upcoming', authenticate, async (_req: Request, res: Response) => {
  // Returns the NEXT 10 not-yet-finished matches by kickoff time.
  // 10 is intentional: keeps Home page + "you haven't predicted X" banner
  // bounded to a sensible near-horizon. For full schedule, use GET /matches.
  const { rows } = await query<Match>(
    `SELECT * FROM matches
     WHERE status != 'finished'
     ORDER BY kickoff_time_utc ASC
     LIMIT 10`
  );
  res.json({ matches: rows });
});

matchesRouter.get('/live', authenticate, async (_req: Request, res: Response) => {
  const { rows } = await query<Match>(
    `SELECT * FROM matches WHERE status = 'live' ORDER BY kickoff_time_utc ASC`
  );
  res.json({ matches: rows });
});

matchesRouter.get('/:id', authenticate, async (req: Request, res: Response) => {
  const { rows } = await query<Match>(
    'SELECT * FROM matches WHERE id = $1',
    [req.params.id]
  );
  if (rows.length === 0) { res.status(404).json({ error: 'Match not found' }); return; }
  res.json({ match: rows[0] });
});
