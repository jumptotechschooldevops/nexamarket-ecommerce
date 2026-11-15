import type { Pool } from 'pg';
import { AppError } from '../utils/AppError.js';

export interface SellerDto {
  id: string;
  userId: string;
  storeName: string;
  storeSlug: string;
  storeDescription: string | null;
  isApproved: boolean;
  createdAt: string;
}

function mapRow(row: Record<string, unknown>): SellerDto {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    storeName: row.store_name as string,
    storeSlug: row.store_slug as string,
    storeDescription: (row.store_description as string | null) ?? null,
    isApproved: row.is_approved as boolean,
    createdAt: row.created_at as string,
  };
}

export async function getSellerByUserId(pool: Pool, userId: string): Promise<SellerDto> {
  const result = await pool.query('SELECT * FROM sellers WHERE user_id = $1', [userId]);
  if (result.rowCount === 0) {
    throw AppError.notFound('Seller profile not found for this user');
  }
  return mapRow(result.rows[0]);
}

export async function getSellerById(pool: Pool, id: string): Promise<SellerDto> {
  const result = await pool.query('SELECT * FROM sellers WHERE id = $1', [id]);
  if (result.rowCount === 0) {
    throw AppError.notFound('Seller not found');
  }
  return mapRow(result.rows[0]);
}

export interface SellerSalesSummary {
  totalOrders: number;
  totalRevenueCents: number;
  totalUnitsSold: number;
}

export async function getSellerSalesSummary(pool: Pool, sellerId: string): Promise<SellerSalesSummary> {
  const result = await pool.query(
    `SELECT COUNT(DISTINCT order_id) AS total_orders,
            COALESCE(SUM(line_total_cents), 0) AS total_revenue_cents,
            COALESCE(SUM(quantity), 0) AS total_units_sold
     FROM order_items
     WHERE seller_id = $1`,
    [sellerId],
  );
  const row = result.rows[0];
  return {
    totalOrders: Number(row.total_orders),
    totalRevenueCents: Number(row.total_revenue_cents),
    totalUnitsSold: Number(row.total_units_sold),
  };
}
