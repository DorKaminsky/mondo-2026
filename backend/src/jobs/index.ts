import cron from 'node-cron';
import { applyDefaultPredictions } from '../services/scoring';
import { syncLiveScores } from '../services/liveScores';
import { sendDailySummaryToAll } from '../services/push';
import { query } from '../db/pool';
import { logger } from '../utils/logger';

// Window = 15 min before first kickoff today → 15 min after ALL matches finish.
// "Today" includes matches whose kickoff was yesterday but are still live/not-yet-finished
// (handles late-night games that cross midnight UTC).
// No matches in scope → return false → both crons skip → Neon can scale to zero.
// Safety cap: 4 hours after first kickoff, in case ESPN never marks a match finished.
async function isInMatchWindow(): Promise<boolean> {
  const { rows } = await query<{
    kickoff: Date;
    status: string;
    last_updated: Date;
  }>(
    `SELECT kickoff_time_utc AS kickoff, status, last_updated
     FROM matches
     WHERE
       -- Today's scheduled matches
       DATE(kickoff_time_utc AT TIME ZONE 'UTC') = CURRENT_DATE
       -- Or still-active matches from yesterday (late-night games crossing midnight)
       OR (status IN ('live', 'scheduled') AND kickoff_time_utc >= NOW() - INTERVAL '10 hours')
     ORDER BY kickoff_time_utc`
  );
  if (rows.length === 0) return false;

  const now = Date.now();
  const windowStart = new Date(rows[0].kickoff).getTime() - 15 * 60 * 1000;
  if (now < windowStart) return false;

  // ponytail: safety cap — if ESPN never finishes a match, close window at 4h after first KO
  const safetyEnd = new Date(rows[0].kickoff).getTime() + 4 * 60 * 60 * 1000;

  const allFinished = rows.every(r => r.status === 'finished');
  if (allFinished) {
    const lastFinished = rows.reduce((max, r) => Math.max(max, new Date(r.last_updated).getTime()), 0);
    const windowEnd = lastFinished + 15 * 60 * 1000;
    return now <= windowEnd;
  }

  // At least one match still not finished → window open until safety cap
  return now < safetyEnd;
}

export function startJobs() {
  // Apply default predictions every 15 minutes.
  cron.schedule('*/15 * * * *', async () => {
    try {
      await applyDefaultPredictions();
    } catch (err) {
      logger.error('Default predictions job failed', { err });
    }
  });

  // Every 5 min during match window.
  cron.schedule('*/5 * * * *', async () => {
    try {
      if (await isInMatchWindow()) await syncLiveScores();
    } catch (err) {
      logger.error('Live score sync (active window) failed', { err });
    }
  });

  // Every hour outside match window — offset to :02 to avoid racing with the :00 active tick.
  cron.schedule('2 * * * *', async () => {
    try {
      if (!await isInMatchWindow()) await syncLiveScores();
    } catch (err) {
      logger.error('Live score sync (idle) failed', { err });
    }
  });

  // Daily push notification: 16:00 Israel time = 13:00 UTC (Israel is UTC+3, no DST).
  // Sends every subscribed user a personalised summary of today's matches.
  cron.schedule('0 13 * * *', async () => {
    try {
      await sendDailySummaryToAll();
    } catch (err) {
      logger.error('Daily push summary failed', { err });
    }
  });

  logger.info('Background jobs started');
}
