import cron from 'node-cron';
import { applyDefaultPredictions } from '../services/scoring';
import { syncLiveScores } from '../services/liveScores';
import { logger } from '../utils/logger';

export function startJobs() {
  // Apply default predictions every 15 minutes (catches matches whose deadline
  // recently passed without a prediction).
  // Was 5min — bumped to 15min to reduce Neon compute-hours. Each cron fire
  // wakes the serverless DB; combined with 2 Fly machines and 5-min interval
  // that meant ~576 touches/day, keeping compute permanently warm and burning
  // through the free tier in a few weeks. The window in applyDefaultPredictions
  // is now 75min (was 65min) to remain >= the new cron interval.
  // Both Fly machines run this; ON CONFLICT DO NOTHING in the insert keeps it
  // idempotent — 2x the cron fires is OK, just wasteful by a factor of 2 not 100x.
  cron.schedule('*/15 * * * *', async () => {
    try {
      await applyDefaultPredictions();
    } catch (err) {
      logger.error('Default predictions job failed', { err });
    }
  });

  // Sync live scores every 5 minutes — separate from defaults job so ESPN
  // fetches are more frequent (live score freshness) without waking the DB
  // as often as applyDefaultPredictions does.
  cron.schedule('*/5 * * * *', async () => {
    try {
      await syncLiveScores();
    } catch (err) {
      logger.error('Live score sync job failed', { err });
    }
  });

  logger.info('Background jobs started');
}
