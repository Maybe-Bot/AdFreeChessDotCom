import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User, AuthResponse, LoginBody, RegisterBody } from '@chess/shared';
import { api } from '../api/client';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (body: LoginBody) => Promise<void>;
  register: (body: RegisterBody) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const user = await api.get<User>('/auth/me');
          setUser(user);
          setLoading(false);
          return;
        } catch {
          localStorage.removeItem('token');
        }
      }
      try {
        const res = await api.post<AuthResponse>('/auth/guest', {});
        localStorage.setItem('token', res.token);
        setUser(res.user);
      } catch {
        // Guest creation failed — app continues with no user
      }
      setLoading(false);
    }
    init();
  }, []);

  async function login(body: LoginBody) {
    const res = await api.post<AuthResponse>('/auth/login', body);
    localStorage.setItem('token', res.token);
    setUser(res.user);
  }

  async function register(body: RegisterBody) {
    const res = await api.post<AuthResponse>('/auth/register', body);
    localStorage.setItem('token', res.token);
    setUser(res.user);
  }

  function logout() {
    localStorage.removeItem('token');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
