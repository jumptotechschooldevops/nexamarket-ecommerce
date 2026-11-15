import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthApi } from '../api/endpoints';
import { getToken, setToken } from '../api/client';
import type { User } from '../types';
import { AuthContext } from './authContextObject';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // No stored token means there is nothing to verify, so loading can start
  // false — this avoids ever needing to set it synchronously inside the
  // effect below (see hooks/useAsync.ts for why that matters).
  const [loading, setLoading] = useState(() => getToken() !== null);

  useEffect(() => {
    if (!getToken()) {
      return;
    }
    let active = true;
    AuthApi.me()
      .then((res) => {
        if (active) setUser(res.user);
      })
      .catch(() => {
        if (active) setToken(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await AuthApi.login({ email, password });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(
    async (input: { email: string; password: string; fullName: string; role?: 'customer' | 'seller'; storeName?: string }) => {
      const res = await AuthApi.register(input);
      setToken(res.token);
      setUser(res.user);
      return res.user;
    },
    [],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
