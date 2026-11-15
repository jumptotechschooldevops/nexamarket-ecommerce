import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { runMigrations } from '../migrate.js';
import { adminUser, categories, customers, imageUrlFor, products, sellers } from './data.js';

const DEMO_PASSWORD = 'Passw0rd!2026';

async function seed(pool: Pool): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Categories
  const categoryIdBySlug = new Map<string, string>();
  for (const category of categories) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO categories (name, slug, description, icon)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
       RETURNING id`,
      [category.name, category.slug, category.description, category.icon],
    );
    categoryIdBySlug.set(category.slug, result.rows[0].id);
  }
  logger.info({ count: categories.length }, 'Seeded categories');

  // Admin user
  await pool.query(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name`,
    [adminUser.email, passwordHash, adminUser.fullName],
  );

  // Sellers (user + seller profile)
  const sellerIdByIndex: string[] = [];
  for (const seller of sellers) {
    const userResult = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'seller')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name
       RETURNING id`,
      [seller.email, passwordHash, seller.fullName],
    );
    const userId = userResult.rows[0].id;

    const sellerResult = await pool.query<{ id: string }>(
      `INSERT INTO sellers (user_id, store_name, store_slug, store_description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET store_name = EXCLUDED.store_name, store_description = EXCLUDED.store_description
       RETURNING id`,
      [userId, seller.storeName, seller.storeSlug, seller.storeDescription],
    );
    sellerIdByIndex.push(sellerResult.rows[0].id);
  }
  logger.info({ count: sellers.length }, 'Seeded sellers');

  // Customers
  const customerIds: string[] = [];
  for (const customer of customers) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'customer')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, full_name = EXCLUDED.full_name
       RETURNING id`,
      [customer.email, passwordHash, customer.fullName],
    );
    customerIds.push(result.rows[0].id);
  }
  logger.info({ count: customers.length }, 'Seeded customers');

  // Products + inventory
  const productIdBySlug = new Map<string, string>();
  for (const product of products) {
    const categoryId = categoryIdBySlug.get(product.categorySlug);
    const sellerId = sellerIdByIndex[product.sellerIndex];
    if (!categoryId || !sellerId) {
      throw new Error(`Missing category or seller reference for product ${product.slug}`);
    }

    const result = await pool.query<{ id: string }>(
      `INSERT INTO products (seller_id, category_id, name, slug, description, price_cents, image_url, images, brand, rating, rating_count, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active')
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         price_cents = EXCLUDED.price_cents,
         image_url = EXCLUDED.image_url,
         images = EXCLUDED.images,
         brand = EXCLUDED.brand
       RETURNING id`,
      [
        sellerId,
        categoryId,
        product.name,
        product.slug,
        product.description,
        product.priceCents,
        imageUrlFor(product),
        JSON.stringify([imageUrlFor(product)]),
        product.brand,
        (3.5 + Math.random() * 1.5).toFixed(1),
        Math.floor(10 + Math.random() * 480),
      ],
    );
    const productId = result.rows[0].id;
    productIdBySlug.set(product.slug, productId);

    await pool.query(
      `INSERT INTO inventory (product_id, quantity, reorder_threshold)
       VALUES ($1, $2, 10)
       ON CONFLICT (product_id) DO NOTHING`,
      [productId, product.stock],
    );
  }
  logger.info({ count: products.length }, 'Seeded products and inventory');

  // One demo order for the first customer, for order history / tracking demos.
  const demoTrackingNumber = 'NEXA-DEMO-TRACK-0001';
  const existingDemoOrder = await pool.query('SELECT id FROM orders WHERE tracking_number = $1', [
    demoTrackingNumber,
  ]);

  if (existingDemoOrder.rowCount === 0) {
    const demoCustomerId = customerIds[0];
    const demoProducts = products.slice(0, 2);
    const items = demoProducts.map((p) => ({
      productId: productIdBySlug.get(p.slug)!,
      sellerId: sellerIdByIndex[p.sellerIndex],
      name: p.name,
      quantity: 1,
      unitPriceCents: p.priceCents,
    }));
    const subtotal = items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
    const shipping = 599;
    const tax = Math.round(subtotal * 0.08);
    const total = subtotal + shipping + tax;

    const orderResult = await pool.query<{ id: string }>(
      `INSERT INTO orders (user_id, status, subtotal_cents, shipping_cents, tax_cents, total_cents, shipping_address, tracking_number, tracking_status)
       VALUES ($1, 'shipped', $2, $3, $4, $5, $6, $7, 'in_transit')
       RETURNING id`,
      [
        demoCustomerId,
        subtotal,
        shipping,
        tax,
        total,
        JSON.stringify({
          line1: '742 Evergreen Terrace',
          city: 'Springfield',
          state: 'OR',
          postalCode: '97477',
          country: 'US',
        }),
        demoTrackingNumber,
      ],
    );
    const orderId = orderResult.rows[0].id;

    for (const item of items) {
      await pool.query(
        `INSERT INTO order_items (order_id, product_id, seller_id, product_name, quantity, unit_price_cents, line_total_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [orderId, item.productId, item.sellerId, item.name, item.quantity, item.unitPriceCents, item.unitPriceCents * item.quantity],
      );
    }

    await pool.query(
      `INSERT INTO payments (order_id, method, status, amount_cents, transaction_ref, card_last4)
       VALUES ($1, 'simulated_card', 'succeeded', $2, $3, '4242')`,
      [orderId, total, `SIM-${orderId.slice(0, 8)}`],
    );

    logger.info({ orderId }, 'Seeded demo order');
  } else {
    logger.info('Demo order already present, skipping');
  }
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    await runMigrations(pool);
    await seed(pool);
    logger.info('Seed completed successfully');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exitCode = 1;
});
