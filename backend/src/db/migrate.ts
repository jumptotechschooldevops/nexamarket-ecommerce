import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

export async function runMigrations(pool: Pool = new Pool({ connectionString: env.DATABASE_URL })): Promise<void> {
  await ensureMigrationsTable(pool);

  const appliedResult = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  const applied = new Set(appliedResult.rows.map((r) => r.filename));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      logger.info({ file }, 'Migration already applied, skipping');
      continue;
    }

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      logger.info({ file }, 'Migration applied');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ file, err }, 'Migration failed');
      throw err;
    } finally {
      client.release();
    }
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  runMigrations(pool)
    .then(() => {
      logger.info('All migrations applied successfully');
      return pool.end();
    })
    .catch((err) => {
      logger.error({ err }, 'Migration run failed');
      process.exitCode = 1;
      return pool.end();
    });
}
