import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { OrdersApi } from '../api/endpoints';
import { LoadingState, EmptyState } from '../components/LoadingState';
import type { Order } from '../types';
import { formatDate, formatMoney } from '../utils/format';

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-neutral',
  paid: 'badge-success',
  processing: 'badge-warning',
  shipped: 'badge-warning',
  delivered: 'badge-success',
  cancelled: 'badge-danger',
};

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    OrdersApi.list({ limit: 50 })
      .then((res) => setOrders(res.orders))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div className="page container section">
      <h1 className="section-title">Your Orders</h1>
      {orders.length === 0 ? (
        <EmptyState label="You haven't placed any orders yet." />
      ) : (
        <div className="card">
          {orders.map((order) => (
            <Link
              key={order.id}
              to={`/orders/${order.id}`}
              className="flex-between"
              style={{ padding: 18, borderBottom: '1px solid var(--color-border)', color: 'inherit' }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>Order #{order.id.slice(0, 8).toUpperCase()}</div>
                <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                  Placed {formatDate(order.createdAt)} &middot; {order.items.length} item(s)
                </div>
              </div>
              <span className={`badge ${STATUS_BADGE[order.status] ?? 'badge-neutral'}`}>{order.status}</span>
              <strong>{formatMoney(order.totalCents)}</strong>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
