import { apiRequest } from './client';
import type {
  AdminDashboardStats,
  Cart,
  Category,
  Inventory,
  Order,
  OrderTracking,
  PaginationMeta,
  Product,
  Seller,
  ShippingAddress,
  User,
} from '../types';

export interface AuthResponse {
  user: User;
  token: string;
}

export const AuthApi = {
  register: (input: { email: string; password: string; fullName: string; role?: 'customer' | 'seller'; storeName?: string }) =>
    apiRequest<AuthResponse>('/auth/register', { method: 'POST', body: input }),
  login: (input: { email: string; password: string }) =>
    apiRequest<AuthResponse>('/auth/login', { method: 'POST', body: input }),
  me: () => apiRequest<{ user: User }>('/auth/me'),
};

export const CategoriesApi = {
  list: () => apiRequest<{ categories: Category[] }>('/categories'),
};

export interface PaginationParams {
  [key: string]: string | number | undefined;
  page?: number;
  limit?: number;
}

export interface ProductListParams extends PaginationParams {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: string;
}

export const ProductsApi = {
  list: (params: ProductListParams = {}) =>
    apiRequest<{ products: Product[]; meta: PaginationMeta }>('/products', { query: params }),
  get: (id: string) => apiRequest<{ product: Product }>(`/products/${id}`),
  create: (input: {
    name: string;
    description: string;
    categoryId: string;
    priceCents: number;
    imageUrl: string;
    brand?: string;
    stock: number;
  }) => apiRequest<{ product: Product }>('/products', { method: 'POST', body: input }),
  update: (id: string, input: Partial<{ name: string; description: string; priceCents: number; categoryId: string; imageUrl: string; brand: string }>) =>
    apiRequest<{ product: Product }>(`/products/${id}`, { method: 'PUT', body: input }),
  remove: (id: string) => apiRequest<void>(`/products/${id}`, { method: 'DELETE' }),
};

export const InventoryApi = {
  get: (productId: string) => apiRequest<{ inventory: Inventory }>(`/inventory/${productId}`),
  update: (productId: string, input: { quantity?: number; reorderThreshold?: number }) =>
    apiRequest<{ inventory: Inventory }>(`/inventory/${productId}`, { method: 'PUT', body: input }),
};

export const CartApi = {
  get: () => apiRequest<{ cart: Cart }>('/cart'),
  addItem: (productId: string, quantity: number) =>
    apiRequest<{ cart: Cart }>('/cart/items', { method: 'POST', body: { productId, quantity } }),
  updateItem: (itemId: string, quantity: number) =>
    apiRequest<{ cart: Cart }>(`/cart/items/${itemId}`, { method: 'PUT', body: { quantity } }),
  removeItem: (itemId: string) => apiRequest<{ cart: Cart }>(`/cart/items/${itemId}`, { method: 'DELETE' }),
};

export const OrdersApi = {
  checkout: (input: { shippingAddress: ShippingAddress; paymentMethod: string; cardNumber?: string }) =>
    apiRequest<{ order: Order }>('/orders', { method: 'POST', body: input }),
  list: (params: PaginationParams = {}) =>
    apiRequest<{ orders: Order[]; meta: PaginationMeta }>('/orders', { query: params }),
  get: (id: string) => apiRequest<{ order: Order }>(`/orders/${id}`),
  tracking: (id: string) => apiRequest<{ tracking: OrderTracking }>(`/orders/${id}/tracking`),
  updateStatus: (id: string, input: { status?: string; trackingStatus?: string }) =>
    apiRequest<{ order: Order }>(`/orders/${id}/status`, { method: 'PATCH', body: input }),
};

export const SellersApi = {
  me: () => apiRequest<{ seller: Seller }>('/sellers/me'),
  myProducts: (params: PaginationParams = {}) =>
    apiRequest<{ products: Product[]; meta: PaginationMeta }>('/sellers/me/products', { query: params }),
  myOrders: (params: PaginationParams = {}) =>
    apiRequest<{ orders: Order[]; meta: PaginationMeta }>('/sellers/me/orders', { query: params }),
  mySummary: () =>
    apiRequest<{ summary: { totalOrders: number; totalRevenueCents: number; totalUnitsSold: number } }>('/sellers/me/summary'),
};

export const DashboardApi = {
  adminStats: () => apiRequest<{ stats: AdminDashboardStats }>('/dashboard/stats'),
};
