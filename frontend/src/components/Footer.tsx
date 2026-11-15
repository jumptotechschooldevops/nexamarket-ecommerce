export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <h5>Shop</h5>
            <a href="/products?category=electronics">Electronics</a>
            <a href="/products?category=clothing">Clothing</a>
            <a href="/products?category=furniture">Furniture</a>
            <a href="/products?category=beauty">Beauty</a>
          </div>
          <div>
            <h5>Sell on NexaMarket</h5>
            <a href="/register?role=seller">Become a seller</a>
            <a href="/seller">Seller dashboard</a>
          </div>
          <div>
            <h5>Customer Service</h5>
            <a href="/orders">Your orders</a>
            <a href="/cart">Your cart</a>
          </div>
          <div>
            <h5>About NexaMarket</h5>
            <a href="#">Our story</a>
            <a href="#">Careers</a>
            <a href="#">Trust &amp; safety</a>
          </div>
        </div>
        <div className="footer-bottom">
          &copy; {new Date().getFullYear()} NexaMarket, Inc. — a fictional marketplace built for demonstration purposes only.
        </div>
      </div>
    </footer>
  );
}
