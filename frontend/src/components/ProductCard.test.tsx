import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProductCard } from './ProductCard';
import type { Product } from '../types';

const baseProduct: Product = {
  id: 'p1',
  name: 'Test Widget',
  slug: 'test-widget',
  description: 'A widget for testing',
  priceCents: 2599,
  currency: 'USD',
  imageUrl: 'https://placehold.co/400x400',
  images: [],
  brand: 'Acme',
  rating: 4.5,
  ratingCount: 12,
  status: 'active',
  categoryId: 'c1',
  categoryName: 'Electronics',
  sellerId: 's1',
  storeName: 'Acme Store',
  stock: 5,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function renderWithRouter(product: Product) {
  return render(
    <MemoryRouter>
      <ProductCard product={product} />
    </MemoryRouter>,
  );
}

describe('ProductCard', () => {
  it('renders product name, price and brand', () => {
    renderWithRouter(baseProduct);
    expect(screen.getByText('Test Widget')).toBeInTheDocument();
    expect(screen.getByText('$25.99')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('shows "Out of stock" when stock is zero', () => {
    renderWithRouter({ ...baseProduct, stock: 0 });
    expect(screen.getByText('Out of stock')).toBeInTheDocument();
  });

  it('shows a low-stock warning when stock is at or below 10', () => {
    renderWithRouter({ ...baseProduct, stock: 3 });
    expect(screen.getByText('Only 3 left')).toBeInTheDocument();
  });

  it('links to the product detail page', () => {
    renderWithRouter(baseProduct);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/products/p1');
  });
});
