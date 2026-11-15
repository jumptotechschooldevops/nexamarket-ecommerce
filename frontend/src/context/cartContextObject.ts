import { createContext } from 'react';
import type { Cart } from '../types';

export interface CartContextValue {
  cart: Cart | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addItem: (productId: string, quantity: number) => Promise<void>;
  updateItem: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
}

// Kept in its own file for the same reason as authContextObject.ts.
export const CartContext = createContext<CartContextValue | undefined>(undefined);
