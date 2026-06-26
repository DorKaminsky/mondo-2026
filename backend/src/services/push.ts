import webpush from 'web-push';
import { query } from '../db/pool';
import { logger } from '../utils/logger';

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:admin@mondo-2026.app';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  logger.warn('VAPID keys not set — push notifications disabled');
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

export function getPublicKey(): string {
  return VAPID_PUBLIC;
}

interface SubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Send to every subscription for a user; quietly drop dead endpoints (HTTP 410/404).
export async function sendToUser(userId: number, payload: PushPayload): Promise<number> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return 0;

  const { rows: subs } = await query<SubRow>(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );

  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      );
      sent++;
    } catch (err: any) {
      const code = err?.statusCode ?? err?.status;
      if (code === 404 || code === 410) {
        await query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]);
        logger.info(`Push: pruned dead subscription ${s.id} for user ${userId}`);
      } else {
        logger.warn(`Push: failed to send to subscription ${s.id}`, { err: err?.message ?? err });
      }
    }
  }
  return sent;
}

// Build the personalised daily-summary push for one user and send it.
// Always sends — even when caught up — per user request.
export async function sendDailySummaryToUser(userId: number, userName: string): Promise<void> {
  // Window: next 24h of scheduled matches. Always 24h regardless of when the
  // push fires — keeps test pushes meaningful and guarantees every kickoff is
  // covered by at most one daily nudge (since the cron also runs every 24h).
  const { rows: todaysMatches } = await query<{ id: number; home_team: string; away_team: string }>(
    `SELECT id, home_team, away_team
       FROM matches
      WHERE status = 'scheduled'
        AND kickoff_time_utc >= NOW()
        AND kickoff_time_utc < NOW() + INTERVAL '24 hours'
      ORDER BY kickoff_time_utc`
  );

  if (todaysMatches.length === 0) {
    await sendToUser(userId, {
      title: '⚽ Mondo 2026',
      body: `Hi ${userName}! No matches in the next 24h — enjoy the break! 🍻`,
      url: '/',
    });
    return;
  }

  const matchIds = todaysMatches.map(m => m.id);
  const { rows: predicted } = await query<{ match_id: number }>(
    `SELECT match_id FROM match_predictions
      WHERE user_id = $1 AND match_id = ANY($2::int[]) AND is_default = false`,
    [userId, matchIds]
  );
  const predictedIds = new Set(predicted.map(r => r.match_id));
  const pending = todaysMatches.filter(m => !predictedIds.has(m.id));

  const word = (n: number) => n === 1 ? 'match' : 'matches';
  let body: string;
  if (pending.length === 0) {
    body = `Hi ${userName}! All ${todaysMatches.length} ${word(todaysMatches.length)} in the next 24h predicted ✅ Good luck!`;
  } else if (pending.length === todaysMatches.length) {
    body = `Hi ${userName}! ${pending.length} ${word(pending.length)} in the next 24h — none predicted yet ⏰`;
  } else {
    body = `Hi ${userName}! ${pending.length} of ${todaysMatches.length} ${word(todaysMatches.length)} in the next 24h still need predictions ⏰`;
  }

  await sendToUser(userId, {
    title: '⚽ Mondo 2026',
    body,
    url: '/',
  });
}

export async function sendDailySummaryToAll(): Promise<void> {
  // Send to every user with at least one push subscription (players + super_admins).
  // League admins (role = 'admin') are excluded — they oversee, don't compete.
  const { rows: users } = await query<{ id: number; name: string }>(
    `SELECT DISTINCT u.id, u.name
       FROM users u
       JOIN push_subscriptions s ON s.user_id = u.id
      WHERE u.role != 'admin' AND u.is_mock = false`
  );
  logger.info(`Push: daily summary cron firing for ${users.length} subscribed users`);
  for (const u of users) {
    try {
      await sendDailySummaryToUser(u.id, u.name);
    } catch (err) {
      logger.warn(`Push: daily summary failed for user ${u.id}`, { err });
    }
  }
}
