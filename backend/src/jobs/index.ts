import cron from 'node-cron';
import { applyDefaultPredictions } from '../services/scoring';
import { logger } from '../utils/logger';

export function startJobs() {
  // Apply default predictions every 5 minutes (catches matches whose deadline just passed)
  cron.schedule('*/5 * * * *', async () => {
    try {
      await applyDefaultPredictions();
    } catch (err) {
      logger.error('Default predictions job failed', { err });
    }
  });

  logger.info('Background jobs started');
}
