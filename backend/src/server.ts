import { app } from './app';
import { pool } from './db/pool';
import { config } from './config';
import { logger } from './utils/logger';
import { startJobs } from './jobs';

async function main() {
  await pool.query('SELECT 1'); // verify DB connection
  logger.info('Database connected');

  // Background polling can be turned off (e.g. after a tournament ends) to
  // stop waking Neon's serverless compute. Set DISABLE_JOBS=true to keep the
  // API fully functional while the crons stay dark. Re-enable by unsetting.
  if (process.env.DISABLE_JOBS === 'true') {
    logger.info('Background jobs DISABLED via DISABLE_JOBS env');
  } else {
    startJobs();
  }

  app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port} [${config.nodeEnv}]`);
  });
}

main().catch((err) => {
  logger.error('Fatal startup error', { err });
  process.exit(1);
});
