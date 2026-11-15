import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { AppError } from '../utils/AppError.js';
import { buildPaginationMeta, normalizePagination, type PaginationMeta } from '../utils/pagination.js';
import { reserveStock } from './inventoryService.js';
import type { ShippingAddress } from '../types/domain.js';

export interface OrderItemDto {
  id: string;
  productId: string;
  productName: string;
  sellerId: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface OrderDto {
  id: string;
  userId: string;
  status: string;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  shippingAddress: ShippingAddress;
  trackingNumber: string | null;
  trackingStatus: string;
  items: OrderItemDto[];
  createdAt: string;
  updatedAt: string;
}

function mapOrderRow(row: Record<string, unknown>, items: OrderItemDto[]): OrderDto {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    status: row.status as string,
    subtotalCents: Number(row.subtotal_cents),
    shippingCents: Number(row.shipping_cents),
    taxCents: Number(row.tax_cents),
    totalCents: Number(row.total_cents),
    currency: row.currency as string,
    shippingAddress: row.shipping_address as ShippingAddress,
    trackingNumber: (row.tracking_number as string | null) ?? null,
    trackingStatus: row.tracking_status as string,
    items,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

async function fetchOrderItems(client: Pool | PoolClient, orderId: string): Promise<OrderItemDto[]> {
  const result = await client.query(
    `SELECT id, product_id, seller_id, product_name, quantity, unit_price_cents, line_total_cents
     FROM order_items WHERE order_id = $1 ORDER BY created_at ASC`,
    [orderId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    sellerId: row.seller_id,
    quantity: Number(row.quantity),
    unitPriceCents: Number(row.unit_price_cents),
    lineTotalCents: Number(row.line_total_cents),
  }));
}

export interface CheckoutInput {
  shippingAddress: ShippingAddress;
  paymentMethod: 'simulated_card' | 'simulated_paypal' | 'simulated_wallet';
  cardNumber?: string;
}

const TAX_RATE = 0.08;
const FLAT_SHIPPING_CENTS = 599;

export async function checkout(pool: Pool, userId: string, input: CheckoutInput): Promise<OrderDto> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cartResult = await client.query('SELECT id FROM carts WHERE user_id = $1 FOR UPDATE', [userId]);
    if (cartResult.rowCount === 0) {
      throw AppError.badRequest('Cart is empty');
    }
    const cartId = cartResult.rows[0].id;

    const itemsResult = await client.query(
      `SELECT ci.product_id, ci.quantity, ci.unit_price_cents, p.name, p.seller_id, p.status
       FROM cart_items ci JOIN products p ON p.id = ci.product_id
       WHERE ci.cart_id = $1
       FOR UPDATE OF ci`,
      [cartId],
    );

    if (itemsResult.rowCount === 0) {
      throw AppError.badRequest('Cart is empty');
    }

    for (const item of itemsResult.rows) {
      if (item.status !== 'active') {
        throw AppError.conflict(`Product "${item.name}" is no longer available`);
      }
    }

    const subtotalCents = itemsResult.rows.reduce(
      (sum, row) => sum + Number(row.unit_price_cents) * Number(row.quantity),
      0,
    );
    const taxCents = Math.round(subtotalCents * TAX_RATE);
    const totalCents = subtotalCents + FLAT_SHIPPING_CENTS + taxCents;

    const orderResult = await client.query(
      `INSERT INTO orders (user_id, status, subtotal_cents, shipping_cents, tax_cents, total_cents, shipping_address, tracking_status)
       VALUES ($1, 'paid', $2, $3, $4, $5, $6, 'order_placed')
       RETURNING *`,
      [userId, subtotalCents, FLAT_SHIPPING_CENTS, taxCents, totalCents, JSON.stringify(input.shippingAddress)],
    );
    const order = orderResult.rows[0];

    for (const item of itemsResult.rows) {
      await reserveStock(client, item.product_id, Number(item.quantity));
      await client.query(
        `INSERT INTO order_items (order_id, product_id, seller_id, product_name, quantity, unit_price_cents, line_total_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          order.id,
          item.product_id,
          item.seller_id,
          item.name,
          item.quantity,
          item.unit_price_cents,
          Number(item.unit_price_cents) * Number(item.quantity),
        ],
      );
    }

    const transactionRef = `SIM-${randomUUID().slice(0, 12)}`;
    const cardLast4 = input.cardNumber ? input.cardNumber.slice(-4) : null;
    await client.query(
      `INSERT INTO payments (order_id, method, status, amount_cents, transaction_ref, card_last4)
       VALUES ($1, $2, 'succeeded', $3, $4, $5)`,
      [order.id, input.paymentMethod, totalCents, transactionRef, cardLast4],
    );

    await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cartId]);

    await client.query('COMMIT');

    const items = await fetchOrderItems(pool, order.id);
    return mapOrderRow(order, items);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listOrdersForUser(
  pool: Pool,
  userId: string,
  pagination: { page?: number; limit?: number },
): Promise<{ orders: OrderDto[]; meta: PaginationMeta }> {
  const { page, limit, offset } = normalizePagination(pagination);

  const countResult = await pool.query('SELECT COUNT(*) FROM orders WHERE user_id = $1', [userId]);
  const total = Number(countResult.rows[0].count);

  const ordersResult = await pool.query(
    `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );

  const orders = await Promise.all(
    ordersResult.rows.map(async (row) => mapOrderRow(row, await fetchOrderItems(pool, row.id))),
  );

  return { orders, meta: buildPaginationMeta(page, limit, total) };
}

export async function getOrderById(pool: Pool, orderId: string): Promise<OrderDto> {
  const result = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  if (result.rowCount === 0) {
    throw AppError.notFound('Order not found');
  }
  const items = await fetchOrderItems(pool, orderId);
  return mapOrderRow(result.rows[0], items);
}

export async function assertOrderOwnership(pool: Pool, orderId: string, userId: string): Promise<void> {
  const result = await pool.query('SELECT user_id FROM orders WHERE id = $1', [orderId]);
  if (result.rowCount === 0) {
    throw AppError.notFound('Order not found');
  }
  if (result.rows[0].user_id !== userId) {
    throw AppError.forbidden('You do not have access to this order');
  }
}

export interface TrackingEvent {
  status: string;
  label: string;
  completed: boolean;
}

const TRACKING_STAGES = ['order_placed', 'processing', 'shipped', 'in_transit', 'delivered'];
const TRACKING_LABELS: Record<string, string> = {
  order_placed: 'Order placed',
  processing: 'Preparing shipment',
  shipped: 'Shipped',
  in_transit: 'In transit',
  delivered: 'Delivered',
};

export async function getOrderTracking(
  pool: Pool,
  orderId: string,
): Promise<{ trackingNumber: string | null; trackingStatus: string; timeline: TrackingEvent[] }> {
  const order = await getOrderById(pool, orderId);
  const currentIndex = TRACKING_STAGES.indexOf(order.trackingStatus);
  const timeline = TRACKING_STAGES.map((status, idx) => ({
    status,
    label: TRACKING_LABELS[status],
    completed: currentIndex >= 0 && idx <= currentIndex,
  }));
  return { trackingNumber: order.trackingNumber, trackingStatus: order.trackingStatus, timeline };
}

export interface OrderStatusUpdateInput {
  status?: string;
  trackingStatus?: string;
  trackingNumber?: string;
}

export async function updateOrderStatus(pool: Pool, orderId: string, input: OrderStatusUpdateInput): Promise<OrderDto> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (input.status) {
    params.push(input.status);
    sets.push(`status = $${params.length}`);
  }
  if (input.trackingStatus) {
    params.push(input.trackingStatus);
    sets.push(`tracking_status = $${params.length}`);
  }
  if (input.trackingNumber) {
    params.push(input.trackingNumber);
    sets.push(`tracking_number = $${params.length}`);
  }

  if (sets.length === 0) {
    return getOrderById(pool, orderId);
  }

  sets.push('updated_at = now()');
  params.push(orderId);

  const result = await pool.query(`UPDATE orders SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`, params);
  if (result.rowCount === 0) {
    throw AppError.notFound('Order not found');
  }
  return getOrderById(pool, orderId);
}

export async function listOrdersForSeller(
  pool: Pool,
  sellerId: string,
  pagination: { page?: number; limit?: number },
): Promise<{ orders: Array<OrderDto & { sellerLineItems: OrderItemDto[] }>; meta: PaginationMeta }> {
  const { page, limit, offset } = normalizePagination(pagination);

  const countResult = await pool.query(
    'SELECT COUNT(DISTINCT order_id) FROM order_items WHERE seller_id = $1',
    [sellerId],
  );
  const total = Number(countResult.rows[0].count);

  const orderIdsResult = await pool.query(
    `SELECT DISTINCT o.id, o.created_at FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE oi.seller_id = $1
     ORDER BY o.created_at DESC
     LIMIT $2 OFFSET $3`,
    [sellerId, limit, offset],
  );

  const orders = await Promise.all(
    orderIdsResult.rows.map(async (row) => {
      const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [row.id]);
      const allItems = await fetchOrderItems(pool, row.id);
      const sellerLineItems = allItems.filter((item) => item.sellerId === sellerId);
      return { ...mapOrderRow(orderResult.rows[0], allItems), sellerLineItems };
    }),
  );

  return { orders, meta: buildPaginationMeta(page, limit, total) };
}
