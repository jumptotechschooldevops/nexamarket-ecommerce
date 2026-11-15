import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { listProducts } from '../../src/services/productService.js';

function mockPool() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const pool = {
    query: vi.fn((sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT COUNT(*)')) {
        return Promise.resolve({ rows: [{ count: '1' }], rowCount: 1 });
      }
      return Promise.resolve({
        rows: [
          {
            id: 'p1',
            name: 'Widget',
            slug: 'widget',
            description: 'A widget',
            price_cents: 1999,
            currency: 'USD',
            image_url: 'img',
            images: ['img'],
            brand: 'Acme',
            rating: '4.5',
            rating_count: 10,
            status: 'active',
            category_id: 'c1',
            category_name: 'Electronics',
            seller_id: 's1',
            store_name: 'Acme Store',
            stock: 5,
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ],
        rowCount: 1,
      });
    }),
  } as unknown as Pool;
  return { pool, calls };
}

describe('productService.listProducts', () => {
  it('filters by active status by default', async () => {
    const { pool, calls } = mockPool();
    await listProducts(pool, {});
    const countCall = calls.find((c) => c.sql.startsWith('SELECT COUNT(*)'));
    expect(countCall?.sql).toContain("p.status = 'active'");
  });

  it('includes inactive products when includeInactive is true', async () => {
    const { pool, calls } = mockPool();
    await listProducts(pool, { includeInactive: true });
    const countCall = calls.find((c) => c.sql.startsWith('SELECT COUNT(*)'));
    expect(countCall?.sql).not.toContain("p.status = 'active'");
  });

  it('applies a price range filter using parameterized queries', async () => {
    const { pool, calls } = mockPool();
    await listProducts(pool, { minPrice: 10, maxPrice: 50 });
    const countCall = calls.find((c) => c.sql.startsWith('SELECT COUNT(*)'));
    expect(countCall?.sql).toContain('p.price_cents >=');
    expect(countCall?.sql).toContain('p.price_cents <=');
    expect(countCall?.params).toContain(1000);
    expect(countCall?.params).toContain(5000);
  });

  it('maps database rows into ProductDto shape', async () => {
    const { pool } = mockPool();
    const result = await listProducts(pool, {});
    expect(result.products[0]).toMatchObject({
      id: 'p1',
      name: 'Widget',
      priceCents: 1999,
      categoryName: 'Electronics',
      storeName: 'Acme Store',
      stock: 5,
    });
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });
});
