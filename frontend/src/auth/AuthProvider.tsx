import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { type AuthUser, AuthContext } from './auth-context';

/** Reads the signed-in user from the Cognito ID token, or null if there is no session. */
async function loadUser(): Promise<AuthUser | null> {
  const { tokens } = await fetchAuthSession();
  const claims = tokens?.idToken?.payload;

  if (!claims?.sub) {
    return null;
  }

  return {
    userId: String(claims.sub),
    email: typeof claims['email'] === 'string' ? claims['email'] : '',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser(await loadUser());
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ user, loading, refresh }), [user, loading, refresh]);

  return <AuthContext value={value}>{children}</AuthContext>;
}
