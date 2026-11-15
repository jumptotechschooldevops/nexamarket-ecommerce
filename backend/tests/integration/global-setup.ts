import { Pool } from 'pg';
import { runMigrations } from '../../src/db/migrate.js';

export default async function setup(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set to run integration tests against a real PostgreSQL instance');
  }
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}
