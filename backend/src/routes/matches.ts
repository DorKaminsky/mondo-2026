import { Router, Request, Response } from 'express';
import { query } from '../db/pool';
import { authenticate } from '../middleware/auth';
import { syncLiveScores } from '../services/liveScores';
import { logger } from '../utils/logger';
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
  // Excludes the 3rd-place playoff — not predicted in this league.
  const { rows } = await query<Match>(
    `SELECT * FROM matches
     WHERE status = 'scheduled'
       AND home_team NOT LIKE '%third place%'
       AND away_team NOT LIKE '%third place%'
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
  // Fire-and-forget sync whenever someone polls the live endpoint
  if (rows.length > 0) {
    syncLiveScores().catch(err => logger.error('On-demand live sync failed', { err }));
  }
});

matchesRouter.get('/:id', authenticate, async (req: Request, res: Response) => {
  const { rows } = await query<Match>(
    'SELECT * FROM matches WHERE id = $1',
    [req.params.id]
  );
  if (rows.length === 0) { res.status(404).json({ error: 'Match not found' }); return; }
  res.json({ match: rows[0] });
});
