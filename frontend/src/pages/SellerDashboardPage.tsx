import { useEffect, useState, type FormEvent } from 'react';
import { CategoriesApi, InventoryApi, OrdersApi, ProductsApi, SellersApi } from '../api/endpoints';
import { ApiError } from '../api/client';
import { LoadingState, EmptyState } from '../components/LoadingState';
import type { Category, Order, Product } from '../types';
import { formatDate, formatMoney } from '../utils/format';

type Tab = 'overview' | 'products' | 'orders' | 'add-product';

export function SellerDashboardPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [summary, setSummary] = useState<{ totalOrders: number; totalRevenueCents: number; totalUnitsSold: number } | null>(
    null,
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [summaryRes, productsRes, ordersRes, categoriesRes] = await Promise.all([
        SellersApi.mySummary(),
        SellersApi.myProducts({ limit: 50 }),
        SellersApi.myOrders({ limit: 50 }),
        CategoriesApi.list(),
      ]);
      setSummary(summaryRes.summary);
      setProducts(productsRes.products);
      setOrders(ordersRes.orders);
      setCategories(categoriesRes.categories);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function handleStockUpdate(productId: string, quantity: number) {
    await InventoryApi.update(productId, { quantity });
    await loadAll();
  }

  async function handleShip(orderId: string) {
    await OrdersApi.updateStatus(orderId, { status: 'shipped', trackingStatus: 'shipped' });
    setStatusMessage('Order marked as shipped.');
    await loadAll();
  }

  if (loading) return <LoadingState />;

  return (
    <div className="page container section">
      <h1 className="section-title">Seller Dashboard</h1>

      <div className="tabs">
        <div className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>
          Overview
        </div>
        <div className={`tab ${tab === 'products' ? 'active' : ''}`} onClick={() => setTab('products')}>
          Products &amp; Inventory
        </div>
        <div className={`tab ${tab === 'orders' ? 'active' : ''}`} onClick={() => setTab('orders')}>
          Orders
        </div>
        <div className={`tab ${tab === 'add-product' ? 'active' : ''}`} onClick={() => setTab('add-product')}>
          + Add Product
        </div>
      </div>

      {statusMessage && <div className="alert alert-success">{statusMessage}</div>}

      {tab === 'overview' && summary && (
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="label">Total Revenue</div>
            <div className="value">{formatMoney(summary.totalRevenueCents)}</div>
          </div>
          <div className="stat-tile">
            <div className="label">Orders Fulfilled</div>
            <div className="value">{summary.totalOrders}</div>
          </div>
          <div className="stat-tile">
            <div className="label">Units Sold</div>
            <div className="value">{summary.totalUnitsSold}</div>
          </div>
          <div className="stat-tile">
            <div className="label">Active Listings</div>
            <div className="value">{products.filter((p) => p.status === 'active').length}</div>
          </div>
        </div>
      )}

      {tab === 'products' && (
        <ProductsTab products={products} onUpdateStock={handleStockUpdate} />
      )}

      {tab === 'orders' && <OrdersTab orders={orders} onShip={handleShip} />}

      {tab === 'add-product' && (
        <AddProductTab
          categories={categories}
          onCreated={() => {
            setStatusMessage('Product created successfully.');
            setTab('products');
            void loadAll();
          }}
        />
      )}
    </div>
  );
}

function ProductsTab({
  products,
  onUpdateStock,
}: {
  products: Product[];
  onUpdateStock: (productId: string, quantity: number) => Promise<void>;
}) {
  const [edits, setEdits] = useState<Record<string, number>>({});

  if (products.length === 0) return <EmptyState label="You have no products listed yet." />;

  return (
    <div className="table-scroll card">
      <table className="data-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Price</th>
            <th>Status</th>
            <th>Stock</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>{product.name}</td>
              <td>{formatMoney(product.priceCents)}</td>
              <td>
                <span className={`badge ${product.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                  {product.status}
                </span>
              </td>
              <td>
                <input
                  type="number"
                  min={0}
                  style={{ width: 80 }}
                  value={edits[product.id] ?? product.stock}
                  onChange={(e) => setEdits({ ...edits, [product.id]: Number(e.target.value) })}
                />
              </td>
              <td>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => onUpdateStock(product.id, edits[product.id] ?? product.stock)}
                >
                  Update
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrdersTab({ orders, onShip }: { orders: Order[]; onShip: (orderId: string) => Promise<void> }) {
  if (orders.length === 0) return <EmptyState label="No orders containing your products yet." />;

  return (
    <div className="table-scroll card">
      <table className="data-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Date</th>
            <th>Status</th>
            <th>Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>#{order.id.slice(0, 8).toUpperCase()}</td>
              <td>{formatDate(order.createdAt)}</td>
              <td>
                <span className="badge badge-neutral">{order.status}</span>
              </td>
              <td>{formatMoney(order.totalCents)}</td>
              <td>
                {order.status !== 'shipped' && order.status !== 'delivered' && (
                  <button className="btn btn-outline btn-sm" onClick={() => onShip(order.id)}>
                    Mark Shipped
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddProductTab({ categories, onCreated }: { categories: Category[]; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    categoryId: categories[0]?.id ?? '',
    priceCents: '',
    imageUrl: 'https://placehold.co/640x480/15345a/ffffff?text=New+Product',
    brand: '',
    stock: '10',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await ProductsApi.create({
        name: form.name,
        description: form.description,
        categoryId: form.categoryId,
        priceCents: Math.round(Number(form.priceCents) * 100),
        imageUrl: form.imageUrl,
        brand: form.brand || undefined,
        stock: Number(form.stock),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create product.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card card-padded" style={{ maxWidth: 560 }} onSubmit={handleSubmit}>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="form-group">
        <label htmlFor="name">Product name</label>
        <input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="form-group">
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          required
          rows={4}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="categoryId">Category</label>
          <select
            id="categoryId"
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="price">Price (USD)</label>
          <input
            id="price"
            type="number"
            min={0}
            step="0.01"
            required
            value={form.priceCents}
            onChange={(e) => setForm({ ...form, priceCents: e.target.value })}
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="brand">Brand</label>
          <input id="brand" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="stock">Initial stock</label>
          <input
            id="stock"
            type="number"
            min={0}
            required
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
          />
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="imageUrl">Image URL</label>
        <input id="imageUrl" required value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
      </div>
      <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
        {submitting ? 'Creating…' : 'List Product'}
      </button>
    </form>
  );
}
