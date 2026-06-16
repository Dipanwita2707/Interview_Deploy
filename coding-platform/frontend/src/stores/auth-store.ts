import { create } from 'zustand';
import type { User, CodingRole } from '@/types';
import { authApi } from '@/lib/api';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  fetchMe: () => Promise<void>;
  ssoLogin: (smartToken: string) => Promise<void>;
  devLogin: (email: string, password: string) => Promise<void>;

  // Role checks
  isStaff: () => boolean;
  isHead: () => boolean;
  isStudent: () => boolean;
  hasRole: (role: CodingRole) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: typeof window !== 'undefined' ? localStorage.getItem('coding_token') : null,
  // Start loading when a token already exists — fetchMe will resolve it.
  // Both server and client agree on isAuthenticated:false, avoiding hydration mismatch.
  isLoading: typeof window !== 'undefined' && !!localStorage.getItem('coding_token'),
  isAuthenticated: false,

  setAuth: (token: string, user: User) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('coding_token', token);
    }
    set({ token, user, isAuthenticated: true, isLoading: false });
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('coding_token');
    }
    set({ token: null, user: null, isAuthenticated: false });
  },

  fetchMe: async () => {
    const { token } = get();
    if (!token) return;

    set({ isLoading: true });
    try {
      const res = await authApi.getMe();
      const user = res.data.data as User;
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      // Only logout on an explicit 401 — not on network errors / cold-start failures
      if (err?.response?.status === 401) {
        get().logout();
      }
      set({ isLoading: false });
    }
  },

  ssoLogin: async (smartToken: string) => {
    set({ isLoading: true });
    try {
      const res = await authApi.ssoExchange(smartToken);
      const { token, user } = res.data.data as { token: string; user: User };
      get().setAuth(token, user);
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  devLogin: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const res = await authApi.devLogin(email, password);
      const { token, user } = res.data.data as { token: string; user: User };
      get().setAuth(token, user);
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  isStaff: () => {
    const { user } = get();
    return user?.role === 'placement_member' || user?.role === 'placement_head';
  },

  isHead: () => {
    const { user } = get();
    return user?.role === 'placement_head';
  },

  isStudent: () => {
    const { user } = get();
    return user?.role === 'student';
  },

  hasRole: (role: CodingRole) => {
    const { user } = get();
    return user?.role === role;
  },
}));
