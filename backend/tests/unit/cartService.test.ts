import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { addItemToCart, getCart } from '../../src/services/cartService.js';
import { AppError } from '../../src/utils/AppError.js';

function mockPool(queryImpl: (sql: string, params?: unknown[]) => unknown) {
  return { query: vi.fn(queryImpl) } as unknown as Pool;
}

describe('cartService.getCart', () => {
  it('computes subtotal and item count from cart line items', async () => {
    const pool = mockPool((sql: string) => {
      if (sql.includes('SELECT id FROM carts')) {
        return { rows: [{ id: 'cart-1' }], rowCount: 1 };
      }
      if (sql.includes('FROM cart_items')) {
        return {
          rows: [
            { id: 'item-1', product_id: 'p1', quantity: 2, unit_price_cents: 1000, name: 'Widget', image_url: 'img', available_stock: 10 },
            { id: 'item-2', product_id: 'p2', quantity: 1, unit_price_cents: 500, name: 'Gadget', image_url: 'img2', available_stock: 5 },
          ],
          rowCount: 2,
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    const cart = await getCart(pool, 'user-1');
    expect(cart.subtotalCents).toBe(2500);
    expect(cart.itemCount).toBe(3);
    expect(cart.items).toHaveLength(2);
  });
});

describe('cartService.addItemToCart', () => {
  it('rejects when requested quantity exceeds available stock', async () => {
    const pool = mockPool((sql: string) => {
      if (sql.includes('FROM products p LEFT JOIN inventory')) {
        return { rows: [{ price_cents: 1000, available_stock: 1 }], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(addItemToCart(pool, 'user-1', 'product-1', 5)).rejects.toThrow(AppError);
  });

  it('rejects when the product does not exist or is inactive', async () => {
    const pool = mockPool((sql: string) => {
      if (sql.includes('FROM products p LEFT JOIN inventory')) {
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(addItemToCart(pool, 'user-1', 'missing-product', 1)).rejects.toThrow(AppError);
  });
});
