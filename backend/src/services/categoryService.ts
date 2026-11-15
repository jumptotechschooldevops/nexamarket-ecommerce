import type { Pool } from 'pg';
import { AppError } from '../utils/AppError.js';

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  productCount: number;
}

export async function listCategories(pool: Pool): Promise<CategoryDto[]> {
  const result = await pool.query(`
    SELECT c.id, c.name, c.slug, c.description, c.icon,
           COUNT(p.id) FILTER (WHERE p.status = 'active') AS product_count
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id
    GROUP BY c.id
    ORDER BY c.name ASC
  `);
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    productCount: Number(row.product_count),
  }));
}

export async function getCategoryById(pool: Pool, id: string): Promise<CategoryDto> {
  const result = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);
  if (result.rowCount === 0) {
    throw AppError.notFound('Category not found');
  }
  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    productCount: 0,
  };
}
