export type UserRole = 'customer' | 'seller' | 'admin';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  productCount: number;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  currency: string;
  imageUrl: string;
  images: string[];
  brand: string | null;
  rating: number;
  ratingCount: number;
  status: string;
  categoryId: string;
  categoryName: string;
  sellerId: string;
  storeName: string;
  stock: number;
  createdAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  imageUrl: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  availableStock: number;
}

export interface Cart {
  id: string;
  userId: string;
  items: CartItem[];
  subtotalCents: number;
  itemCount: number;
}

export interface ShippingAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  sellerId: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface Order {
  id: string;
  userId: string;
  status: string;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  shippingAddress: ShippingAddress;
  trackingNumber: string | null;
  trackingStatus: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface TrackingEvent {
  status: string;
  label: string;
  completed: boolean;
}

export interface OrderTracking {
  trackingNumber: string | null;
  trackingStatus: string;
  timeline: TrackingEvent[];
}

export interface Seller {
  id: string;
  userId: string;
  storeName: string;
  storeSlug: string;
  storeDescription: string | null;
  isApproved: boolean;
  createdAt: string;
}

export interface Inventory {
  productId: string;
  quantity: number;
  reservedQuantity: number;
  available: number;
  reorderThreshold: number;
  updatedAt: string;
}

export interface AdminDashboardStats {
  totalRevenueCents: number;
  totalOrders: number;
  totalCustomers: number;
  totalSellers: number;
  totalProducts: number;
  lowStockProducts: number;
  revenueByDay: Array<{ date: string; revenueCents: number }>;
  topProducts: Array<{ productId: string; name: string; unitsSold: number; revenueCents: number }>;
  ordersByStatus: Array<{ status: string; count: number }>;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}
