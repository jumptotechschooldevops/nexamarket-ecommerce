import { Link } from 'react-router-dom';
import type { Product } from '../types';
import { formatMoney } from '../utils/format';

export function ProductCard({ product }: { product: Product }) {
  const stockClass = product.stock === 0 ? 'out' : product.stock <= 10 ? 'low' : 'ok';
  const stockLabel = product.stock === 0 ? 'Out of stock' : product.stock <= 10 ? `Only ${product.stock} left` : 'In stock';

  return (
    <Link to={`/products/${product.id}`} className="product-card">
      <img src={product.imageUrl} alt={product.name} loading="lazy" />
      <div className="product-card-body">
        <span className="product-brand">{product.brand ?? product.storeName}</span>
        <span className="product-name">{product.name}</span>
        <span className="product-rating">
          <strong>★ {product.rating.toFixed(1)}</strong> ({product.ratingCount})
        </span>
        <span className={`product-stock ${stockClass}`}>{stockLabel}</span>
        <span className="product-price">{formatMoney(product.priceCents, product.currency)}</span>
      </div>
    </Link>
  );
}
