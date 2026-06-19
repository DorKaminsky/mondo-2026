import { Pool } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

// Pool tuning notes:
//  - idleTimeoutMillis 5s — tight so Neon's serverless compute can scale-to-zero
//    quickly when nobody is using the app. The default (10s) keeps a connection
//    open longer than necessary; combined with our 5-min cron and 2 Fly machines,
//    that meant the DB never idled, defeating the auto-suspend feature.
//  - max 10 — way more than 23 friends + cron actually need; leaves headroom.
//  - min 0 — let the pool fully drain when there's no traffic.
export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  min: 0,
  idleTimeoutMillis: 5_000,
});

pool.on('error', (err) => logger.error('Unexpected pool error', { err }));

export async function query<T extends object = Record<string, unknown>>(
  text: string,
  params?: unknown[]
) {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  logger.debug('db query', { text, duration, rows: res.rowCount });
  return res;
}

export async function getClient() {
  return pool.connect();
}
