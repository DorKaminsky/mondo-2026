import { app } from './app';
import { pool } from './db/pool';
import { config } from './config';
import { logger } from './utils/logger';
import { startJobs } from './jobs';

async function main() {
  await pool.query('SELECT 1'); // verify DB connection
  logger.info('Database connected');

  startJobs();

  app.listen(config.port, () => {
    logger.info(`Server running on port ${config.port} [${config.nodeEnv}]`);
  });
}

main().catch((err) => {
  logger.error('Fatal startup error', { err });
  process.exit(1);
});
