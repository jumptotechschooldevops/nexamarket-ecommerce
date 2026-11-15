import { createContext } from 'react';
import type { User } from '../types';

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: {
    email: string;
    password: string;
    fullName: string;
    role?: 'customer' | 'seller';
    storeName?: string;
  }) => Promise<User>;
  logout: () => void;
}

// Kept in its own file (no component, no hook) so that AuthProvider and
// useAuth — which both need it — can each live in a file that exports only
// one kind of thing, which is what react-refresh/only-export-components wants.
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
