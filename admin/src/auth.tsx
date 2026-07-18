import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from './api';

export type User = {
  id: string; email: string; name: string;
  role: 'admin' | 'gerente'; permissions: string[]; mustChangePassword: boolean;
};

type Ctx = {
  user: User | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  can(permission: string): boolean;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try { setUser(await apiFetch<User>('/auth/me')); }
    catch { setUser(null); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);

  const value: Ctx = {
    user, loading,
    async login(email, password) {
      setUser(await apiFetch<User>('/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
      }));
    },
    async logout() {
      await apiFetch('/auth/logout', { method: 'POST' });
      setUser(null);
    },
    refresh,
    // Espelha canDo() do servidor, mas serve apenas para esconder controle.
    can(permission) {
      if (!user) return false;
      if (user.role === 'admin') return true;
      if (permission === 'user.manage') return false;
      return user.permissions.includes(permission);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return ctx;
}
