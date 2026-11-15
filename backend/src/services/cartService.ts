import type { Pool } from 'pg';
import { AppError } from '../utils/AppError.js';

export interface CartItemDto {
  id: string;
  productId: string;
  name: string;
  imageUrl: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  availableStock: number;
}

export interface CartDto {
  id: string;
  userId: string;
  items: CartItemDto[];
  subtotalCents: number;
  itemCount: number;
}

async function getOrCreateCartId(pool: Pool, userId: string): Promise<string> {
  const existing = await pool.query('SELECT id FROM carts WHERE user_id = $1', [userId]);
  if (existing.rowCount && existing.rowCount > 0) {
    return existing.rows[0].id;
  }
  const created = await pool.query('INSERT INTO carts (user_id) VALUES ($1) RETURNING id', [userId]);
  return created.rows[0].id;
}

async function loadCart(pool: Pool, userId: string): Promise<CartDto> {
  const cartId = await getOrCreateCartId(pool, userId);
  const itemsResult = await pool.query(
    `SELECT ci.id, ci.product_id, ci.quantity, ci.unit_price_cents,
            p.name, p.image_url, COALESCE(i.quantity - i.reserved_quantity, 0) AS available_stock
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     LEFT JOIN inventory i ON i.product_id = p.id
     WHERE ci.cart_id = $1
     ORDER BY ci.created_at ASC`,
    [cartId],
  );

  const items: CartItemDto[] = itemsResult.rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    name: row.name,
    imageUrl: row.image_url,
    quantity: Number(row.quantity),
    unitPriceCents: Number(row.unit_price_cents),
    lineTotalCents: Number(row.quantity) * Number(row.unit_price_cents),
    availableStock: Number(row.available_stock),
  }));

  return {
    id: cartId,
    userId,
    items,
    subtotalCents: items.reduce((sum, i) => sum + i.lineTotalCents, 0),
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
  };
}

export async function getCart(pool: Pool, userId: string): Promise<CartDto> {
  return loadCart(pool, userId);
}

export async function addItemToCart(
  pool: Pool,
  userId: string,
  productId: string,
  quantity: number,
): Promise<CartDto> {
  const productResult = await pool.query(
    `SELECT p.price_cents, COALESCE(i.quantity - i.reserved_quantity, 0) AS available_stock
     FROM products p LEFT JOIN inventory i ON i.product_id = p.id
     WHERE p.id = $1 AND p.status = 'active'`,
    [productId],
  );
  if (productResult.rowCount === 0) {
    throw AppError.notFound('Product not found or unavailable');
  }
  const { price_cents: priceCents, available_stock: availableStock } = productResult.rows[0];
  if (Number(availableStock) < quantity) {
    throw AppError.badRequest('Requested quantity exceeds available stock');
  }

  const cartId = await getOrCreateCartId(pool, userId);
  await pool.query(
    `INSERT INTO cart_items (cart_id, product_id, quantity, unit_price_cents)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (cart_id, product_id)
     DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity, updated_at = now()`,
    [cartId, productId, quantity, priceCents],
  );

  return loadCart(pool, userId);
}

export async function updateCartItem(
  pool: Pool,
  userId: string,
  itemId: string,
  quantity: number,
): Promise<CartDto> {
  const result = await pool.query(
    `UPDATE cart_items ci SET quantity = $1, updated_at = now()
     WHERE ci.id = $2 AND ci.cart_id = (SELECT id FROM carts WHERE user_id = $3)
     RETURNING ci.id`,
    [quantity, itemId, userId],
  );
  if (result.rowCount === 0) {
    throw AppError.notFound('Cart item not found');
  }
  return loadCart(pool, userId);
}

export async function removeCartItem(pool: Pool, userId: string, itemId: string): Promise<CartDto> {
  const result = await pool.query(
    `DELETE FROM cart_items
     WHERE id = $1 AND cart_id = (SELECT id FROM carts WHERE user_id = $2)
     RETURNING id`,
    [itemId, userId],
  );
  if (result.rowCount === 0) {
    throw AppError.notFound('Cart item not found');
  }
  return loadCart(pool, userId);
}

export async function clearCart(pool: Pool, userId: string): Promise<void> {
  await pool.query(`DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE user_id = $1)`, [userId]);
}
