import { Router, Request, Response } from 'express';
import { query } from '../db/pool';
import { authenticate, requireAdmin } from '../middleware/auth';
import { getPublicKey, sendDailySummaryToUser, sendDailySummaryToAll } from '../services/push';

export const pushRouter = Router();

// Public so the service worker registration can fetch it before login
pushRouter.get('/vapid-public-key', (_req: Request, res: Response) => {
  res.json({ key: getPublicKey() });
});

pushRouter.post('/subscribe', authenticate, async (req: Request, res: Response) => {
  const { endpoint, keys } = req.body ?? {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: 'invalid subscription' });
    return;
  }
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh = $3, auth = $4`,
    [req.user!.id, endpoint, keys.p256dh, keys.auth]
  );
  res.json({ ok: true });
});

pushRouter.post('/unsubscribe', authenticate, async (req: Request, res: Response) => {
  const { endpoint } = req.body ?? {};
  if (!endpoint) { res.status(400).json({ error: 'endpoint required' }); return; }
  await query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [req.user!.id, endpoint]);
  res.json({ ok: true });
});

// Admin: send a test push to yourself or all users (smoke test the pipeline)
pushRouter.post('/test', authenticate, requireAdmin, async (req: Request, res: Response) => {
  const target = String(req.body?.target ?? 'me');
  if (target === 'all') {
    await sendDailySummaryToAll();
    res.json({ ok: true, target: 'all' });
    return;
  }
  const { rows } = await query<{ name: string }>('SELECT name FROM users WHERE id = $1', [req.user!.id]);
  await sendDailySummaryToUser(req.user!.id, rows[0]?.name ?? 'there');
  res.json({ ok: true, target: 'me' });
});
