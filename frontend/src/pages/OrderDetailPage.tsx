import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { OrdersApi } from '../api/endpoints';
import { LoadingState } from '../components/LoadingState';
import { TrackingTimeline } from '../components/TrackingTimeline';
import type { Order, OrderTracking } from '../types';
import { formatDate, formatMoney } from '../utils/format';

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [tracking, setTracking] = useState<OrderTracking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([OrdersApi.get(id), OrdersApi.tracking(id)])
      .then(([orderRes, trackingRes]) => {
        setOrder(orderRes.order);
        setTracking(trackingRes.tracking);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingState />;
  if (!order) return <div className="page container section empty-state">Order not found.</div>;

  return (
    <div className="page container section">
      {searchParams.get('placed') && (
        <div className="alert alert-success">
          Thank you! Your order has been placed and payment was simulated successfully.
        </div>
      )}

      <h1 className="section-title">Order #{order.id.slice(0, 8).toUpperCase()}</h1>
      <p className="text-muted">Placed on {formatDate(order.createdAt)}</p>

      {tracking && (
        <div className="card card-padded mt-lg">
          <h3 style={{ marginTop: 0 }}>Tracking status: {order.trackingStatus.replace(/_/g, ' ')}</h3>
          {order.trackingNumber && <p className="text-muted">Tracking number: {order.trackingNumber}</p>}
          <TrackingTimeline timeline={tracking.timeline} />
        </div>
      )}

      <div className="layout-with-sidebar mt-lg">
        <div className="card">
          {order.items.map((item) => (
            <div
              key={item.id}
              className="flex-between"
              style={{ padding: 16, borderBottom: '1px solid var(--color-border)' }}
            >
              <span>
                {item.productName} &times; {item.quantity}
              </span>
              <strong>{formatMoney(item.lineTotalCents)}</strong>
            </div>
          ))}
        </div>

        <div className="card card-padded">
          <h3 style={{ marginTop: 0 }}>Summary</h3>
          <div className="flex-between">
            <span className="text-muted">Subtotal</span>
            <span>{formatMoney(order.subtotalCents)}</span>
          </div>
          <div className="flex-between">
            <span className="text-muted">Shipping</span>
            <span>{formatMoney(order.shippingCents)}</span>
          </div>
          <div className="flex-between">
            <span className="text-muted">Tax</span>
            <span>{formatMoney(order.taxCents)}</span>
          </div>
          <div className="flex-between mt-lg" style={{ fontWeight: 800 }}>
            <span>Total</span>
            <span>{formatMoney(order.totalCents)}</span>
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '16px 0' }} />
          <h4>Shipping Address</h4>
          <p className="text-muted">
            {order.shippingAddress.line1}
            <br />
            {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}
            <br />
            {order.shippingAddress.country}
          </p>
        </div>
      </div>
    </div>
  );
}
