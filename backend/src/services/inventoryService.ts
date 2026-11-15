import type { Pool, PoolClient } from 'pg';
import { AppError } from '../utils/AppError.js';

export interface InventoryDto {
  productId: string;
  quantity: number;
  reservedQuantity: number;
  available: number;
  reorderThreshold: number;
  updatedAt: string;
}

function mapRow(row: Record<string, unknown>): InventoryDto {
  const quantity = Number(row.quantity);
  const reserved = Number(row.reserved_quantity);
  return {
    productId: row.product_id as string,
    quantity,
    reservedQuantity: reserved,
    available: quantity - reserved,
    reorderThreshold: Number(row.reorder_threshold),
    updatedAt: row.updated_at as string,
  };
}

export async function getInventoryByProduct(pool: Pool, productId: string): Promise<InventoryDto> {
  const result = await pool.query('SELECT * FROM inventory WHERE product_id = $1', [productId]);
  if (result.rowCount === 0) {
    throw AppError.notFound('Inventory record not found for product');
  }
  return mapRow(result.rows[0]);
}

export interface InventoryUpdateInput {
  quantity?: number;
  reorderThreshold?: number;
  delta?: number;
}

export async function updateInventory(pool: Pool, productId: string, input: InventoryUpdateInput): Promise<InventoryDto> {
  if (input.quantity !== undefined) {
    const result = await pool.query(
      `UPDATE inventory SET quantity = $1, updated_at = now() WHERE product_id = $2 RETURNING *`,
      [input.quantity, productId],
    );
    if (result.rowCount === 0) throw AppError.notFound('Inventory record not found for product');
  }

  if (input.delta !== undefined) {
    const result = await pool.query(
      `UPDATE inventory SET quantity = quantity + $1, updated_at = now()
       WHERE product_id = $2 AND quantity + $1 >= 0
       RETURNING *`,
      [input.delta, productId],
    );
    if (result.rowCount === 0) {
      throw AppError.badRequest('Insufficient stock for requested quantity adjustment');
    }
  }

  if (input.reorderThreshold !== undefined) {
    const result = await pool.query(
      `UPDATE inventory SET reorder_threshold = $1, updated_at = now() WHERE product_id = $2 RETURNING *`,
      [input.reorderThreshold, productId],
    );
    if (result.rowCount === 0) throw AppError.notFound('Inventory record not found for product');
  }

  return getInventoryByProduct(pool, productId);
}

export async function reserveStock(
  client: PoolClient,
  productId: string,
  quantity: number,
): Promise<void> {
  const result = await client.query(
    `UPDATE inventory
     SET quantity = quantity - $1, updated_at = now()
     WHERE product_id = $2 AND quantity - $1 >= 0
     RETURNING quantity`,
    [quantity, productId],
  );
  if (result.rowCount === 0) {
    throw AppError.conflict('Insufficient stock for one or more items in your cart');
  }
}
