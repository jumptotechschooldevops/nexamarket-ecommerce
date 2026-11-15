import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { getInventoryByProduct, reserveStock, updateInventory } from '../../src/services/inventoryService.js';
import { AppError } from '../../src/utils/AppError.js';

function mockPool(queryImpl: (sql: string, params?: unknown[]) => unknown) {
  return { query: vi.fn(queryImpl) } as unknown as Pool;
}

function mockClient(queryImpl: (sql: string, params?: unknown[]) => unknown) {
  return { query: vi.fn(queryImpl) } as unknown as PoolClient;
}

const INVENTORY_ROW = {
  product_id: 'p1',
  quantity: 8,
  reserved_quantity: 0,
  reorder_threshold: 10,
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('inventoryService.getInventoryByProduct', () => {
  it('computes available as quantity minus reserved', async () => {
    const pool = mockPool(() => ({ rows: [{ ...INVENTORY_ROW, quantity: 20, reserved_quantity: 5 }], rowCount: 1 }));
    const inventory = await getInventoryByProduct(pool, 'p1');
    expect(inventory.available).toBe(15);
  });

  it('throws AppError.notFound when no inventory row exists', async () => {
    const pool = mockPool(() => ({ rows: [], rowCount: 0 }));
    await expect(getInventoryByProduct(pool, 'missing')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('inventoryService.reserveStock', () => {
  it('decrements quantity when enough stock is available', async () => {
    const client = mockClient((sql: string, params) => {
      expect(sql).toContain('quantity = quantity - $1');
      expect(params).toEqual([2, 'p1']);
      return { rows: [{ quantity: 6 }], rowCount: 1 };
    });
    await expect(reserveStock(client, 'p1', 2)).resolves.toBeUndefined();
  });

  it('throws AppError.conflict (409) when stock would go negative', async () => {
    const client = mockClient(() => ({ rows: [], rowCount: 0 }));
    await expect(reserveStock(client, 'p1', 999)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });
  });

  it('rejects with an AppError instance, not a generic Error', async () => {
    const client = mockClient(() => ({ rows: [], rowCount: 0 }));
    await expect(reserveStock(client, 'p1', 999)).rejects.toBeInstanceOf(AppError);
  });
});

describe('inventoryService.updateInventory', () => {
  it('applies an absolute quantity update', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const pool = mockPool((sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('SET quantity = $1')) return { rows: [{}], rowCount: 1 };
      return { rows: [{ ...INVENTORY_ROW, quantity: 42 }], rowCount: 1 };
    });
    const result = await updateInventory(pool, 'p1', { quantity: 42 });
    expect(calls[0].params).toEqual([42, 'p1']);
    expect(result.quantity).toBe(42);
  });

  it('applies a relative delta adjustment', async () => {
    const pool = mockPool((sql: string) => {
      if (sql.includes('quantity = quantity + $1')) return { rows: [{}], rowCount: 1 };
      return { rows: [INVENTORY_ROW], rowCount: 1 };
    });
    await expect(updateInventory(pool, 'p1', { delta: -3 })).resolves.toBeDefined();
  });

  it('throws AppError.badRequest (400) when a negative delta would exceed available stock', async () => {
    const pool = mockPool((sql: string) => {
      if (sql.includes('quantity = quantity + $1')) return { rows: [], rowCount: 0 };
      return { rows: [INVENTORY_ROW], rowCount: 1 };
    });
    await expect(updateInventory(pool, 'p1', { delta: -100 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws AppError.notFound when updating the reorder threshold for a missing product', async () => {
    const pool = mockPool((sql: string) => {
      if (sql.includes('reorder_threshold = $1')) return { rows: [], rowCount: 0 };
      return { rows: [INVENTORY_ROW], rowCount: 1 };
    });
    await expect(updateInventory(pool, 'missing', { reorderThreshold: 5 })).rejects.toMatchObject({ statusCode: 404 });
  });
});
