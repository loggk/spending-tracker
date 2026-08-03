import { createContext, use } from 'react';

export interface AuthUser {
  userId: string;
  email: string;
}

export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const state = use(AuthContext);
  if (!state) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return state;
}
