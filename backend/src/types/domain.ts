export type UserRole = 'customer' | 'seller' | 'admin';
export type ProductStatus = 'active' | 'inactive' | 'archived';
export type OrderStatus = 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentMethod = 'simulated_card' | 'simulated_paypal' | 'simulated_wallet';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  createdAt: string;
}

export interface ShippingAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}
