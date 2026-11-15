import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CartApi } from '../api/endpoints';
import type { Cart } from '../types';
import { useAuth } from './AuthContext';

interface CartContextValue {
  cart: Cart | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addItem: (productId: string, quantity: number) => Promise<void>;
  updateItem: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || user.role !== 'customer') {
      setCart(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await CartApi.get();
      setCart(res.cart);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cart');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addItem = useCallback(async (productId: string, quantity: number) => {
    const res = await CartApi.addItem(productId, quantity);
    setCart(res.cart);
  }, []);

  const updateItem = useCallback(async (itemId: string, quantity: number) => {
    const res = await CartApi.updateItem(itemId, quantity);
    setCart(res.cart);
  }, []);

  const removeItem = useCallback(async (itemId: string) => {
    const res = await CartApi.removeItem(itemId);
    setCart(res.cart);
  }, []);

  const value = useMemo(
    () => ({ cart, loading, error, refresh, addItem, updateItem, removeItem }),
    [cart, loading, error, refresh, addItem, updateItem, removeItem],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return ctx;
}
