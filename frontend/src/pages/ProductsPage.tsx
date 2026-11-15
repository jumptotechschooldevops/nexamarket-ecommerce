import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CategoriesApi, ProductsApi } from '../api/endpoints';
import { ProductCard } from '../components/ProductCard';
import { Pagination } from '../components/Pagination';
import { LoadingState, EmptyState } from '../components/LoadingState';
import type { Category, PaginationMeta, Product } from '../types';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'rating', label: 'Top Rated' },
];

export function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  const q = searchParams.get('q') ?? '';
  const categorySlug = searchParams.get('category') ?? '';
  const sort = searchParams.get('sort') ?? 'newest';
  const page = Number(searchParams.get('page') ?? '1');

  useEffect(() => {
    CategoriesApi.list().then((res) => setCategories(res.categories));
  }, []);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.slug === categorySlug),
    [categories, categorySlug],
  );

  useEffect(() => {
    setLoading(true);
    ProductsApi.list({
      q: q || undefined,
      category: selectedCategory?.id,
      sort,
      page,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
    })
      .then((res) => {
        setProducts(res.products);
        setMeta(res.meta);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, categorySlug, selectedCategory?.id, sort, page]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  }

  function applyPriceFilter(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    next.delete('page');
    setSearchParams(next);
  }

  return (
    <div className="page container section">
      <div className="breadcrumb">
        Home / {selectedCategory ? selectedCategory.name : q ? `Search: "${q}"` : 'All products'}
      </div>

      <div className="layout-with-sidebar">
        <aside className="sidebar card card-padded">
          <div className="filter-group">
            <h4>Category</h4>
            <div
              className="filter-option"
              onClick={() => updateParam('category', '')}
              style={{ fontWeight: !categorySlug ? 700 : 400 }}
            >
              All categories
            </div>
            {categories.map((c) => (
              <div
                key={c.id}
                className="filter-option"
                onClick={() => updateParam('category', c.slug)}
                style={{ fontWeight: categorySlug === c.slug ? 700 : 400 }}
              >
                {c.name} ({c.productCount})
              </div>
            ))}
          </div>

          <div className="filter-group">
            <h4>Price range</h4>
            <form onSubmit={applyPriceFilter} className="flex gap-sm">
              <input
                type="number"
                placeholder="Min"
                value={minPrice}
                min={0}
                onChange={(e) => setMinPrice(e.target.value)}
              />
              <input
                type="number"
                placeholder="Max"
                value={maxPrice}
                min={0}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
            </form>
            <button className="btn btn-outline btn-sm mt-lg" onClick={applyPriceFilter} type="button">
              Apply
            </button>
          </div>
        </aside>

        <div>
          <div className="flex-between mt-lg" style={{ marginTop: 0, marginBottom: 16 }}>
            <span className="text-muted">{meta ? `${meta.total} results` : ''}</span>
            <select value={sort} onChange={(e) => updateParam('sort', e.target.value)}>
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  Sort: {opt.label}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <LoadingState />
          ) : products.length === 0 ? (
            <EmptyState label="No products matched your search. Try adjusting filters." />
          ) : (
            <div className="product-grid">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          {meta && <Pagination meta={meta} onPageChange={(p) => updateParam('page', String(p))} />}
        </div>
      </div>
    </div>
  );
}
