import { Pool } from 'pg';

declare global {
  var __controlplanePgPool: Pool | undefined;
}

export function getDbPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  if (!globalThis.__controlplanePgPool) {
    globalThis.__controlplanePgPool = new Pool({
      connectionString: databaseUrl,
      max: 10,
    });
  }

  return globalThis.__controlplanePgPool;
}
