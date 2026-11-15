import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { LoadingState, EmptyState } from '../components/LoadingState';
import { formatMoney } from '../utils/format';

export function CartPage() {
  const { cart, loading, updateItem, removeItem } = useCart();
  const navigate = useNavigate();

  if (loading) return <LoadingState />;

  if (!cart || cart.items.length === 0) {
    return (
      <div className="page container section">
        <EmptyState label="Your cart is empty." />
        <div style={{ textAlign: 'center' }}>
          <Link to="/products" className="btn btn-primary">
            Continue shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page container section">
      <h1 className="section-title">Your Cart</h1>
      <div className="layout-with-sidebar">
        <div className="card">
          {cart.items.map((item) => (
            <div
              key={item.id}
              className="flex gap-md"
              style={{ padding: 16, borderBottom: '1px solid var(--color-border)', alignItems: 'center' }}
            >
              <img src={item.imageUrl} alt={item.name} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{item.name}</div>
                <div className="text-muted">{formatMoney(item.unitPriceCents)} each</div>
                {item.quantity > item.availableStock && (
                  <div className="form-error">Only {item.availableStock} left in stock</div>
                )}
              </div>
              <input
                type="number"
                min={1}
                max={item.availableStock}
                value={item.quantity}
                style={{ width: 64 }}
                onChange={(e) => updateItem(item.id, Math.max(1, Number(e.target.value)))}
              />
              <div style={{ width: 90, textAlign: 'right', fontWeight: 700 }}>{formatMoney(item.lineTotalCents)}</div>
              <button className="btn btn-danger btn-sm" onClick={() => removeItem(item.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="card card-padded">
          <h3 style={{ marginTop: 0 }}>Order Summary</h3>
          <div className="flex-between">
            <span className="text-muted">Subtotal ({cart.itemCount} items)</span>
            <strong>{formatMoney(cart.subtotalCents)}</strong>
          </div>
          <p className="text-muted" style={{ fontSize: '0.8rem' }}>
            Shipping and tax calculated at checkout.
          </p>
          <button className="btn btn-primary btn-block mt-lg" onClick={() => navigate('/checkout')}>
            Proceed to Checkout
          </button>
        </div>
      </div>
    </div>
  );
}
