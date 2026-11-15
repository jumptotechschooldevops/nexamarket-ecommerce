import type { Pool } from 'pg';

export interface AdminDashboardStats {
  totalRevenueCents: number;
  totalOrders: number;
  totalCustomers: number;
  totalSellers: number;
  totalProducts: number;
  lowStockProducts: number;
  revenueByDay: Array<{ date: string; revenueCents: number }>;
  topProducts: Array<{ productId: string; name: string; unitsSold: number; revenueCents: number }>;
  ordersByStatus: Array<{ status: string; count: number }>;
}

export async function getAdminDashboardStats(pool: Pool): Promise<AdminDashboardStats> {
  const [revenue, counts, lowStock, revenueByDay, topProducts, ordersByStatus] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(total_cents), 0) AS total FROM orders WHERE status != 'cancelled'`),
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM orders) AS total_orders,
        (SELECT COUNT(*) FROM users WHERE role = 'customer') AS total_customers,
        (SELECT COUNT(*) FROM sellers) AS total_sellers,
        (SELECT COUNT(*) FROM products WHERE status = 'active') AS total_products
    `),
    pool.query(`SELECT COUNT(*) AS count FROM inventory WHERE quantity <= reorder_threshold`),
    pool.query(`
      SELECT to_char(created_at, 'YYYY-MM-DD') AS date, SUM(total_cents) AS revenue
      FROM orders
      WHERE status != 'cancelled' AND created_at >= now() - interval '14 days'
      GROUP BY date
      ORDER BY date ASC
    `),
    pool.query(`
      SELECT oi.product_id, oi.product_name AS name, SUM(oi.quantity) AS units_sold, SUM(oi.line_total_cents) AS revenue
      FROM order_items oi
      GROUP BY oi.product_id, oi.product_name
      ORDER BY units_sold DESC
      LIMIT 5
    `),
    pool.query(`SELECT status, COUNT(*) AS count FROM orders GROUP BY status`),
  ]);

  return {
    totalRevenueCents: Number(revenue.rows[0].total),
    totalOrders: Number(counts.rows[0].total_orders),
    totalCustomers: Number(counts.rows[0].total_customers),
    totalSellers: Number(counts.rows[0].total_sellers),
    totalProducts: Number(counts.rows[0].total_products),
    lowStockProducts: Number(lowStock.rows[0].count),
    revenueByDay: revenueByDay.rows.map((r) => ({ date: r.date, revenueCents: Number(r.revenue) })),
    topProducts: topProducts.rows.map((r) => ({
      productId: r.product_id,
      name: r.name,
      unitsSold: Number(r.units_sold),
      revenueCents: Number(r.revenue),
    })),
    ordersByStatus: ordersByStatus.rows.map((r) => ({ status: r.status, count: Number(r.count) })),
  };
}
