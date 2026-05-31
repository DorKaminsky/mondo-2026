import { Pool } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

export const pool = new Pool({ connectionString: config.databaseUrl });

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
