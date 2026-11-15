import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createApp } from '../../src/app.js';

export const testPool = new Pool({ connectionString: process.env.DATABASE_URL });
export const app = createApp();

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${randomUUID().slice(0, 8)}@nexamarket.test`;
}

export async function createCategoryFixture(): Promise<string> {
  const name = `Test Category ${randomUUID().slice(0, 8)}`;
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const result = await testPool.query(
    `INSERT INTO categories (name, slug, description) VALUES ($1, $2, 'fixture category') RETURNING id`,
    [name, slug],
  );
  return result.rows[0].id;
}

export async function closeTestResources(): Promise<void> {
  await testPool.end();
}
