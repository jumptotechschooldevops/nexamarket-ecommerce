import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CategoriesApi, ProductsApi } from '../api/endpoints';
import { ProductCard } from '../components/ProductCard';
import { LoadingState } from '../components/LoadingState';
import type { Category, Product } from '../types';

const CATEGORY_ICONS: Record<string, string> = {
  electronics: '💻',
  clothing: '👕',
  furniture: '🛋️',
  beauty: '💄',
  sports: '🏀',
  'home-appliances': '🏠',
};

export function HomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([CategoriesApi.list(), ProductsApi.list({ sort: 'rating', limit: 8 })])
      .then(([categoriesRes, productsRes]) => {
        setCategories(categoriesRes.categories);
        setFeatured(productsRes.products);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <section className="hero">
        <div className="container">
          <div>
            <h1>Everything you need, from sellers you can trust.</h1>
            <p>
              NexaMarket connects shoppers with independent sellers across electronics, fashion, home, beauty,
              sports and more — all backed by secure checkout and real-time order tracking.
            </p>
            <Link to="/products" className="btn btn-primary">
              Start shopping
            </Link>
          </div>
          <div className="hero-visual">
            <img src="https://placehold.co/300x200/1f4c82/ffffff?text=Electronics" alt="Electronics" />
            <img src="https://placehold.co/300x200/0e7490/ffffff?text=Sports" alt="Sports" />
            <img src="https://placehold.co/300x200/b45309/ffffff?text=Appliances" alt="Home Appliances" />
            <img src="https://placehold.co/300x200/7c2d12/ffffff?text=Clothing" alt="Clothing" />
          </div>
        </div>
      </section>

      <section className="section container">
        <h2 className="section-title">Shop by category</h2>
        {loading ? (
          <LoadingState />
        ) : (
          <div className="category-grid">
            {categories.map((category) => (
              <Link key={category.id} to={`/products?category=${category.slug}`} className="category-card">
                <span className="category-icon">{CATEGORY_ICONS[category.slug] ?? '🛍️'}</span>
                {category.name}
                <span className="category-count">{category.productCount} products</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="section container">
        <h2 className="section-title">Top rated this week</h2>
        {loading ? (
          <LoadingState />
        ) : (
          <div className="product-grid">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
