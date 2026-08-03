import { useEffect, useState } from 'react';
import { signOut } from 'aws-amplify/auth';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/api';

interface MeResponse {
  userId: string;
  email?: string;
}

export function Dashboard() {
  const { user, refresh } = useAuth();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<MeResponse>('/me')
      .then(setMe)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Request failed');
      });
  }, []);

  async function handleSignOut() {
    await signOut();
    await refresh();
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Spending Tracker</h1>
        <Button variant="outline" onClick={() => void handleSignOut()}>
          Sign out
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Signed in</CardTitle>
          <CardDescription>{user?.email}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {error && <p className="text-destructive">API error: {error}</p>}
          {me && (
            <>
              <p className="text-muted-foreground">
                The API verified this session and returned your identity.
              </p>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(me, null, 2)}
              </pre>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
