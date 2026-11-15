import { useCallback, useMemo, type ReactNode } from 'react';
import { CartApi } from '../api/endpoints';
import type { Cart } from '../types';
import { useAuth } from './useAuth';
import { useAsync } from '../hooks/useAsync';
import { CartContext } from './cartContextObject';

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isCustomer = Boolean(user && user.role === 'customer');
  // Keying the fetch by the signed-in customer (rather than just "logged in or
  // not") means switching accounts correctly triggers a fresh fetch too.
  const cartKey = isCustomer ? `customer:${user!.id}` : 'none';

  const fetchCart = useCallback(async (): Promise<Cart | null> => {
    if (!isCustomer) return null;
    const res = await CartApi.get();
    return res.cart;
  }, [isCustomer]);

  const { data: cart, loading, error, setData } = useAsync<Cart | null>(cartKey, fetchCart, null);

  const refresh = useCallback(async () => {
    setData(await fetchCart());
  }, [fetchCart, setData]);

  const addItem = useCallback(
    async (productId: string, quantity: number) => {
      const res = await CartApi.addItem(productId, quantity);
      setData(res.cart);
    },
    [setData],
  );

  const updateItem = useCallback(
    async (itemId: string, quantity: number) => {
      const res = await CartApi.updateItem(itemId, quantity);
      setData(res.cart);
    },
    [setData],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      const res = await CartApi.removeItem(itemId);
      setData(res.cart);
    },
    [setData],
  );

  const value = useMemo(
    () => ({ cart, loading, error, refresh, addItem, updateItem, removeItem }),
    [cart, loading, error, refresh, addItem, updateItem, removeItem],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
