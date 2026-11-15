import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { checkout, getOrderTracking } from '../../src/services/orderService.js';
import { AppError } from '../../src/utils/AppError.js';

const SHIPPING_ADDRESS = { line1: '1 Test Way', city: 'Testville', state: 'CA', postalCode: '90210', country: 'US' };

function buildClient(responses: Array<() => unknown>) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const query = vi.fn((sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    const next = responses.shift();
    if (!next) throw new Error(`No mocked response left for query: ${sql}`);
    return Promise.resolve(next());
  });
  return { client: { query, release: vi.fn() } as unknown as PoolClient, calls, query };
}

function buildPool(client: PoolClient, poolQueryImpl: (sql: string, params?: unknown[]) => unknown) {
  return {
    connect: vi.fn().mockResolvedValue(client),
    query: vi.fn(poolQueryImpl),
  } as unknown as Pool;
}

describe('orderService.checkout', () => {
  it('computes subtotal, 8% tax and flat shipping correctly, and commits', async () => {
    const { client, calls } = buildClient([
      () => ({}), // BEGIN
      () => ({ rows: [{ id: 'cart-1' }], rowCount: 1 }), // SELECT carts
      () => ({
        // SELECT cart_items joined with products
        rows: [
          { product_id: 'p1', quantity: 2, unit_price_cents: 1500, name: 'Widget', seller_id: 's1', status: 'active' },
        ],
        rowCount: 1,
      }),
      () => ({
        // INSERT orders RETURNING *
        rows: [
          {
            id: 'order-1',
            user_id: 'user-1',
            status: 'paid',
            subtotal_cents: 3000,
            shipping_cents: 599,
            tax_cents: 240,
            total_cents: 3839,
            currency: 'USD',
            shipping_address: SHIPPING_ADDRESS,
            tracking_number: null,
            tracking_status: 'order_placed',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
        rowCount: 1,
      }),
      () => ({ rows: [{ quantity: 8 }], rowCount: 1 }), // reserveStock UPDATE inventory
      () => ({ rowCount: 1 }), // INSERT order_items
      () => ({ rowCount: 1 }), // INSERT payments
      () => ({ rowCount: 1 }), // DELETE cart_items
      () => ({}), // COMMIT
    ]);
    const pool = buildPool(client, () => ({ rows: [], rowCount: 0 })); // fetchOrderItems via pool

    const order = await checkout(pool, 'user-1', {
      shippingAddress: SHIPPING_ADDRESS,
      paymentMethod: 'simulated_card',
      cardNumber: '4242424242424242',
    });

    // subtotal = 1500 * 2 = 3000; tax = round(3000 * 0.08) = 240; total = 3000 + 599 + 240 = 3839
    const insertOrderCall = calls[3];
    expect(insertOrderCall.sql).toContain('INSERT INTO orders');
    expect(insertOrderCall.params).toEqual(['user-1', 3000, 599, 240, 3839, JSON.stringify(SHIPPING_ADDRESS)]);

    expect(order.totalCents).toBe(3839);
    expect(calls.at(-1)?.sql).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('includes a card_last4 derived from the last 4 digits of the provided card number', async () => {
    const { client, calls } = buildClient([
      () => ({}),
      () => ({ rows: [{ id: 'cart-1' }], rowCount: 1 }),
      () => ({ rows: [{ product_id: 'p1', quantity: 1, unit_price_cents: 1000, name: 'Widget', seller_id: 's1', status: 'active' }], rowCount: 1 }),
      () => ({ rows: [{ id: 'order-1', user_id: 'user-1', status: 'paid', subtotal_cents: 1000, shipping_cents: 599, tax_cents: 80, total_cents: 1679, currency: 'USD', shipping_address: SHIPPING_ADDRESS, tracking_number: null, tracking_status: 'order_placed', created_at: 'x', updated_at: 'x' }], rowCount: 1 }),
      () => ({ rows: [{ quantity: 4 }], rowCount: 1 }),
      () => ({ rowCount: 1 }),
      () => ({ rowCount: 1 }),
      () => ({ rowCount: 1 }),
      () => ({}),
    ]);
    const pool = buildPool(client, () => ({ rows: [], rowCount: 0 }));

    await checkout(pool, 'user-1', { shippingAddress: SHIPPING_ADDRESS, paymentMethod: 'simulated_card', cardNumber: '4242424242424242' });

    const insertPaymentCall = calls.find((c) => c.sql.includes('INSERT INTO payments'));
    expect(insertPaymentCall?.params?.[4]).toBe('4242');
  });

  it('rejects an empty cart with AppError.badRequest and rolls back', async () => {
    const { client, calls } = buildClient([
      () => ({}), // BEGIN
      () => ({ rows: [], rowCount: 0 }), // SELECT carts -> no cart row
      () => ({}), // ROLLBACK
    ]);
    const pool = buildPool(client, () => ({ rows: [], rowCount: 0 }));

    await expect(
      checkout(pool, 'user-1', { shippingAddress: SHIPPING_ADDRESS, paymentMethod: 'simulated_card' }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(calls.at(-1)?.sql).toBe('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('rejects when a cart item references a no-longer-active product, and rolls back', async () => {
    const { client, calls } = buildClient([
      () => ({}),
      () => ({ rows: [{ id: 'cart-1' }], rowCount: 1 }),
      () => ({
        rows: [{ product_id: 'p1', quantity: 1, unit_price_cents: 500, name: 'Discontinued Gadget', seller_id: 's1', status: 'archived' }],
        rowCount: 1,
      }),
      () => ({}), // ROLLBACK
    ]);
    const pool = buildPool(client, () => ({ rows: [], rowCount: 0 }));

    const err = await checkout(pool, 'user-1', { shippingAddress: SHIPPING_ADDRESS, paymentMethod: 'simulated_card' }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(409);
    expect(err.message).toContain('Discontinued Gadget');
    expect(calls.at(-1)?.sql).toBe('ROLLBACK');
  });

  it('rejects when inventory reservation fails due to insufficient stock, and rolls back', async () => {
    const { client, calls } = buildClient([
      () => ({}),
      () => ({ rows: [{ id: 'cart-1' }], rowCount: 1 }),
      () => ({ rows: [{ product_id: 'p1', quantity: 50, unit_price_cents: 1000, name: 'Widget', seller_id: 's1', status: 'active' }], rowCount: 1 }),
      () => ({ rows: [{ id: 'order-1', user_id: 'user-1', status: 'paid', subtotal_cents: 50000, shipping_cents: 599, tax_cents: 4000, total_cents: 54599, currency: 'USD', shipping_address: SHIPPING_ADDRESS, tracking_number: null, tracking_status: 'order_placed', created_at: 'x', updated_at: 'x' }], rowCount: 1 }),
      () => ({ rows: [], rowCount: 0 }), // reserveStock fails: not enough stock
      () => ({}), // ROLLBACK
    ]);
    const pool = buildPool(client, () => ({ rows: [], rowCount: 0 }));

    await expect(
      checkout(pool, 'user-1', { shippingAddress: SHIPPING_ADDRESS, paymentMethod: 'simulated_card' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(calls.at(-1)?.sql).toBe('ROLLBACK');
  });
});

describe('orderService.getOrderTracking', () => {
  it('marks every stage up to and including the current tracking status as completed', async () => {
    const pool = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM orders')) {
          return Promise.resolve({
            rows: [
              {
                id: 'order-1',
                user_id: 'user-1',
                status: 'shipped',
                subtotal_cents: 1000,
                shipping_cents: 599,
                tax_cents: 80,
                total_cents: 1679,
                currency: 'USD',
                shipping_address: SHIPPING_ADDRESS,
                tracking_number: 'TRACK-1',
                tracking_status: 'shipped',
                created_at: 'x',
                updated_at: 'x',
              },
            ],
            rowCount: 1,
          });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }),
    } as unknown as Pool;

    const tracking = await getOrderTracking(pool, 'order-1');

    expect(tracking.timeline.map((t) => t.status)).toEqual([
      'order_placed',
      'processing',
      'shipped',
      'in_transit',
      'delivered',
    ]);
    expect(tracking.timeline.filter((t) => t.completed).map((t) => t.status)).toEqual([
      'order_placed',
      'processing',
      'shipped',
    ]);
    expect(tracking.timeline.find((t) => t.status === 'in_transit')?.completed).toBe(false);
  });
});
