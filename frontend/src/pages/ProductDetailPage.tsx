import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ProductsApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import { useAuth } from '../context/useAuth';
import { useCart } from '../context/useCart';
import { useAsync } from '../hooks/useAsync';
import { LoadingState } from '../components/LoadingState';
import type { Product } from '../types';
import { formatMoney } from '../utils/format';

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { addItem } = useCart();
  const navigate = useNavigate();

  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);
  const [adding, setAdding] = useState(false);

  const fetchProduct = useCallback(
    () => (id ? ProductsApi.get(id).then((res) => res.product) : Promise.resolve(null)),
    [id],
  );
  const { data: product, loading } = useAsync<Product | null>(id ?? '', fetchProduct, null);

  async function handleAddToCart() {
    if (!product) return;
    if (!user) {
      navigate('/login');
      return;
    }
    if (user.role !== 'customer') {
      setMessage({ type: 'danger', text: 'Only customer accounts can add items to a cart.' });
      return;
    }
    setAdding(true);
    setMessage(null);
    try {
      await addItem(product.id, quantity);
      setMessage({ type: 'success', text: 'Added to cart.' });
    } catch (err) {
      setMessage({ type: 'danger', text: err instanceof ApiError ? err.message : 'Failed to add to cart.' });
    } finally {
      setAdding(false);
    }
  }

  if (loading) return <LoadingState />;
  if (!product) {
    return <div className="page container section empty-state">Product not found.</div>;
  }

  return (
    <div className="page container section">
      <div className="breadcrumb">
        <Link to="/products">All products</Link> / <Link to={`/products?category=${product.categoryId}`}>{product.categoryName}</Link> /{' '}
        {product.name}
      </div>

      <div className="layout-with-sidebar" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <img src={product.imageUrl} alt={product.name} style={{ borderRadius: 12, width: '100%' }} />

        <div>
          <span className="product-brand">{product.brand ?? product.storeName}</span>
          <h1 style={{ margin: '6px 0' }}>{product.name}</h1>
          <p className="product-rating">
            <strong>★ {product.rating.toFixed(1)}</strong> ({product.ratingCount} ratings) &middot; Sold by{' '}
            <strong>{product.storeName}</strong>
          </p>

          <p className="product-price" style={{ fontSize: '1.8rem' }}>
            {formatMoney(product.priceCents, product.currency)}
          </p>

          <p>
            {product.stock > 0 ? (
              <span className="badge badge-success">{product.stock} in stock</span>
            ) : (
              <span className="badge badge-danger">Out of stock</span>
            )}
          </p>

          <p style={{ lineHeight: 1.6 }}>{product.description}</p>

          {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

          <div className="flex gap-sm" style={{ alignItems: 'center' }}>
            <input
              type="number"
              min={1}
              max={Math.max(1, product.stock)}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
              style={{ width: 70 }}
              disabled={product.stock === 0}
            />
            <button className="btn btn-primary" onClick={handleAddToCart} disabled={adding || product.stock === 0}>
              {product.stock === 0 ? 'Out of stock' : adding ? 'Adding…' : 'Add to Cart'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
