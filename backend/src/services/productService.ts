import type { Pool } from 'pg';
import { AppError } from '../utils/AppError.js';
import { buildPaginationMeta, normalizePagination, type PaginationMeta } from '../utils/pagination.js';

export interface ProductListFilters {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'price_asc' | 'price_desc' | 'newest' | 'rating';
  sellerId?: string;
  page?: number;
  limit?: number;
  includeInactive?: boolean;
}

export interface ProductDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  currency: string;
  imageUrl: string;
  images: string[];
  brand: string | null;
  rating: number;
  ratingCount: number;
  status: string;
  categoryId: string;
  categoryName: string;
  sellerId: string;
  storeName: string;
  stock: number;
  createdAt: string;
}

const SORT_CLAUSES: Record<NonNullable<ProductListFilters['sort']>, string> = {
  price_asc: 'p.price_cents ASC',
  price_desc: 'p.price_cents DESC',
  newest: 'p.created_at DESC',
  rating: 'p.rating DESC, p.rating_count DESC',
};

function mapRow(row: Record<string, unknown>): ProductDto {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    description: row.description as string,
    priceCents: Number(row.price_cents),
    currency: row.currency as string,
    imageUrl: row.image_url as string,
    images: (row.images as string[]) ?? [],
    brand: (row.brand as string | null) ?? null,
    rating: Number(row.rating),
    ratingCount: Number(row.rating_count),
    status: row.status as string,
    categoryId: row.category_id as string,
    categoryName: row.category_name as string,
    sellerId: row.seller_id as string,
    storeName: row.store_name as string,
    stock: Number(row.stock ?? 0),
    createdAt: row.created_at as string,
  };
}

const BASE_SELECT = `
  SELECT p.*, c.name AS category_name, s.store_name,
         COALESCE(i.quantity - i.reserved_quantity, 0) AS stock
  FROM products p
  JOIN categories c ON c.id = p.category_id
  JOIN sellers s ON s.id = p.seller_id
  LEFT JOIN inventory i ON i.product_id = p.id
`;

export async function listProducts(
  pool: Pool,
  filters: ProductListFilters,
): Promise<{ products: ProductDto[]; meta: PaginationMeta }> {
  const { page, limit, offset } = normalizePagination(filters);
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (!filters.includeInactive) {
    conditions.push(`p.status = 'active'`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    conditions.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length} OR p.brand ILIKE $${params.length})`);
  }
  if (filters.category) {
    params.push(filters.category);
    conditions.push(`p.category_id = $${params.length}`);
  }
  if (filters.sellerId) {
    params.push(filters.sellerId);
    conditions.push(`p.seller_id = $${params.length}`);
  }
  if (filters.minPrice !== undefined) {
    params.push(Math.round(filters.minPrice * 100));
    conditions.push(`p.price_cents >= $${params.length}`);
  }
  if (filters.maxPrice !== undefined) {
    params.push(Math.round(filters.maxPrice * 100));
    conditions.push(`p.price_cents <= $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderClause = `ORDER BY ${SORT_CLAUSES[filters.sort ?? 'newest']}`;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM products p ${whereClause}`,
    params,
  );
  const total = Number(countResult.rows[0].count);

  const dataParams = [...params, limit, offset];
  const dataResult = await pool.query(
    `${BASE_SELECT} ${whereClause} ${orderClause} LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams,
  );

  return {
    products: dataResult.rows.map(mapRow),
    meta: buildPaginationMeta(page, limit, total),
  };
}

export async function getProductById(pool: Pool, id: string): Promise<ProductDto> {
  const result = await pool.query(`${BASE_SELECT} WHERE p.id = $1`, [id]);
  if (result.rowCount === 0) {
    throw AppError.notFound('Product not found');
  }
  return mapRow(result.rows[0]);
}

export interface CreateProductInput {
  sellerId: string;
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string;
  images?: string[];
  brand?: string;
  stock: number;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function createProduct(pool: Pool, input: CreateProductInput): Promise<ProductDto> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const baseSlug = slugify(input.name);
    const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;

    const productResult = await client.query(
      `INSERT INTO products (seller_id, category_id, name, slug, description, price_cents, image_url, images, brand)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        input.sellerId,
        input.categoryId,
        input.name,
        uniqueSlug,
        input.description,
        input.priceCents,
        input.imageUrl,
        JSON.stringify(input.images ?? [input.imageUrl]),
        input.brand ?? null,
      ],
    );
    const productId = productResult.rows[0].id;

    await client.query(`INSERT INTO inventory (product_id, quantity) VALUES ($1, $2)`, [productId, input.stock]);
    await client.query('COMMIT');
    return getProductById(pool, productId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  categoryId?: string;
  priceCents?: number;
  imageUrl?: string;
  images?: string[];
  brand?: string;
}

export async function assertProductOwnership(pool: Pool, productId: string, sellerId: string): Promise<void> {
  const result = await pool.query('SELECT seller_id FROM products WHERE id = $1', [productId]);
  if (result.rowCount === 0) {
    throw AppError.notFound('Product not found');
  }
  if (result.rows[0].seller_id !== sellerId) {
    throw AppError.forbidden('You do not own this product');
  }
}

export async function updateProduct(pool: Pool, id: string, input: UpdateProductInput): Promise<ProductDto> {
  const sets: string[] = [];
  const params: unknown[] = [];

  const fieldMap: Record<string, unknown> = {
    name: input.name,
    description: input.description,
    category_id: input.categoryId,
    price_cents: input.priceCents,
    image_url: input.imageUrl,
    images: input.images ? JSON.stringify(input.images) : undefined,
    brand: input.brand,
  };

  for (const [column, value] of Object.entries(fieldMap)) {
    if (value !== undefined) {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    }
  }

  if (sets.length === 0) {
    return getProductById(pool, id);
  }

  sets.push('updated_at = now()');
  params.push(id);

  const result = await pool.query(
    `UPDATE products SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`,
    params,
  );
  if (result.rowCount === 0) {
    throw AppError.notFound('Product not found');
  }
  return getProductById(pool, id);
}

export async function deleteProduct(pool: Pool, id: string): Promise<void> {
  const result = await pool.query(`UPDATE products SET status = 'archived', updated_at = now() WHERE id = $1`, [id]);
  if (result.rowCount === 0) {
    throw AppError.notFound('Product not found');
  }
}
