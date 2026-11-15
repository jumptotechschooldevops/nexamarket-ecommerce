import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useCart } from '../context/useCart';

export function Header() {
  const { user, logout } = useAuth();
  const { cart } = useCart();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    navigate(query.trim() ? `/products?q=${encodeURIComponent(query.trim())}` : '/products');
  }

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <header className="site-header">
      <div className="header-top">
        <Link to="/" className="brand">
          Nexa<span>Market</span>
        </Link>

        <form className="search-form" onSubmit={handleSearch}>
          <input
            type="search"
            placeholder="Search products, brands and categories"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search products"
          />
          <button type="submit">Search</button>
        </form>

        <div className="header-actions">
          {user ? (
            <>
              <Link to="/orders" className="header-link">
                <span>Returns</span>
                <strong>&amp; Orders</strong>
              </Link>
              {user.role === 'seller' && (
                <Link to="/seller" className="header-link">
                  <span>Seller</span>
                  <strong>Dashboard</strong>
                </Link>
              )}
              {user.role === 'admin' && (
                <Link to="/admin" className="header-link">
                  <span>Admin</span>
                  <strong>Dashboard</strong>
                </Link>
              )}
              <span className="header-link" onClick={handleLogout} role="button" tabIndex={0}>
                <span>Hi, {user.fullName.split(' ')[0]}</span>
                <strong>Sign out</strong>
              </span>
            </>
          ) : (
            <Link to="/login" className="header-link">
              <span>Hello, sign in</span>
              <strong>Account</strong>
            </Link>
          )}

          {(!user || user.role === 'customer') && (
            <Link to="/cart" className="cart-link">
              🛒 Cart
              {cart && cart.itemCount > 0 && <span className="cart-badge">{cart.itemCount}</span>}
            </Link>
          )}
        </div>
      </div>

      <nav className="header-nav">
        <div className="container">
          <Link to="/products">All Products</Link>
          <Link to="/products?category=electronics">Electronics</Link>
          <Link to="/products?category=clothing">Clothing</Link>
          <Link to="/products?category=furniture">Furniture</Link>
          <Link to="/products?category=beauty">Beauty</Link>
          <Link to="/products?category=sports">Sports</Link>
          <Link to="/products?category=home-appliances">Home Appliances</Link>
        </div>
      </nav>
    </header>
  );
}
