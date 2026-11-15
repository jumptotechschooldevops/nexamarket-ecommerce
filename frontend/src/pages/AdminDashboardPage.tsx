import { useEffect, useState } from 'react';
import { DashboardApi } from '../api/endpoints';
import { LoadingState } from '../components/LoadingState';
import type { AdminDashboardStats } from '../types';
import { formatMoney, titleCase } from '../utils/format';

export function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    DashboardApi.adminStats()
      .then((res) => setStats(res.stats))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (!stats) return <div className="page container section empty-state">Unable to load dashboard.</div>;

  const maxRevenue = Math.max(1, ...stats.revenueByDay.map((d) => d.revenueCents));

  return (
    <div className="page container section">
      <h1 className="section-title">Admin Dashboard</h1>

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="label">Total Revenue</div>
          <div className="value">{formatMoney(stats.totalRevenueCents)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Total Orders</div>
          <div className="value">{stats.totalOrders}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Customers</div>
          <div className="value">{stats.totalCustomers}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Active Sellers</div>
          <div className="value">{stats.totalSellers}</div>
        </div>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="stat-tile">
          <div className="label">Active Products</div>
          <div className="value">{stats.totalProducts}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Low Stock Alerts</div>
          <div className="value" style={{ color: stats.lowStockProducts > 0 ? 'var(--color-danger)' : undefined }}>
            {stats.lowStockProducts}
          </div>
        </div>
      </div>

      <div className="layout-with-sidebar" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
        <div className="card card-padded">
          <h3 style={{ marginTop: 0 }}>Revenue — last 14 days</h3>
          {stats.revenueByDay.length === 0 ? (
            <p className="text-muted">No revenue recorded in this period yet.</p>
          ) : (
            <div className="flex gap-sm" style={{ alignItems: 'flex-end', height: 180 }}>
              {stats.revenueByDay.map((day) => (
                <div
                  key={day.date}
                  title={`${day.date}: ${formatMoney(day.revenueCents)}`}
                  style={{
                    flex: 1,
                    background: 'var(--color-primary)',
                    borderRadius: '4px 4px 0 0',
                    height: `${Math.max(4, (day.revenueCents / maxRevenue) * 160)}px`,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="card card-padded">
          <h3 style={{ marginTop: 0 }}>Orders by Status</h3>
          {stats.ordersByStatus.map((row) => (
            <div key={row.status} className="flex-between" style={{ marginBottom: 8 }}>
              <span className="badge badge-neutral">{titleCase(row.status)}</span>
              <strong>{row.count}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="card mt-lg table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Top Products</th>
              <th>Units Sold</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {stats.topProducts.map((p) => (
              <tr key={p.productId}>
                <td>{p.name}</td>
                <td>{p.unitsSold}</td>
                <td>{formatMoney(p.revenueCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
