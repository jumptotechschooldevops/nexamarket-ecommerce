import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { OrdersApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import { useCart } from '../context/useCart';
import { formatMoney } from '../utils/format';

export function CheckoutPage() {
  const { cart, refresh } = useCart();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    line1: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
    cardNumber: '4242 4242 4242 4242',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!cart || cart.items.length === 0) {
    return <div className="page container section empty-state">Your cart is empty — add items before checking out.</div>;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await OrdersApi.checkout({
        shippingAddress: {
          line1: form.line1,
          city: form.city,
          state: form.state,
          postalCode: form.postalCode,
          country: form.country,
        },
        paymentMethod: 'simulated_card',
        cardNumber: form.cardNumber.replace(/\s+/g, ''),
      });
      await refresh();
      navigate(`/orders/${res.order.id}?placed=1`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Checkout failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const estimatedShipping = 599;
  const estimatedTax = Math.round(cart.subtotalCents * 0.08);
  const estimatedTotal = cart.subtotalCents + estimatedShipping + estimatedTax;

  return (
    <div className="page container section">
      <h1 className="section-title">Checkout</h1>
      <div className="layout-with-sidebar">
        <form className="card card-padded" onSubmit={handleSubmit}>
          <h3 style={{ marginTop: 0 }}>Shipping Address</h3>
          {error && <div className="alert alert-danger">{error}</div>}

          <div className="form-group">
            <label htmlFor="line1">Street address</label>
            <input
              id="line1"
              required
              value={form.line1}
              onChange={(e) => setForm({ ...form, line1: e.target.value })}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="city">City</label>
              <input id="city" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="state">State / Province</label>
              <input id="state" required value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="postalCode">Postal code</label>
              <input
                id="postalCode"
                required
                value={form.postalCode}
                onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="country">Country</label>
              <input id="country" required value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </div>
          </div>

          <h3>Payment (Simulated)</h3>
          <p className="text-muted" style={{ fontSize: '0.82rem' }}>
            This is a demo marketplace — no real payment is processed. Use any 16-digit test number.
          </p>
          <div className="form-group">
            <label htmlFor="card">Card number</label>
            <input
              id="card"
              required
              pattern="[0-9 ]{12,24}"
              value={form.cardNumber}
              onChange={(e) => setForm({ ...form, cardNumber: e.target.value })}
            />
          </div>

          <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
            {submitting ? 'Placing order…' : `Place order — ${formatMoney(estimatedTotal)}`}
          </button>
        </form>

        <div className="card card-padded">
          <h3 style={{ marginTop: 0 }}>Order Summary</h3>
          {cart.items.map((item) => (
            <div key={item.id} className="flex-between" style={{ fontSize: '0.88rem', marginBottom: 6 }}>
              <span>
                {item.name} &times; {item.quantity}
              </span>
              <span>{formatMoney(item.lineTotalCents)}</span>
            </div>
          ))}
          <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '12px 0' }} />
          <div className="flex-between">
            <span className="text-muted">Subtotal</span>
            <span>{formatMoney(cart.subtotalCents)}</span>
          </div>
          <div className="flex-between">
            <span className="text-muted">Shipping</span>
            <span>{formatMoney(estimatedShipping)}</span>
          </div>
          <div className="flex-between">
            <span className="text-muted">Estimated tax</span>
            <span>{formatMoney(estimatedTax)}</span>
          </div>
          <div className="flex-between mt-lg" style={{ fontWeight: 800, fontSize: '1.1rem' }}>
            <span>Total</span>
            <span>{formatMoney(estimatedTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
