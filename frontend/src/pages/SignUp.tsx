import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { confirmSignUp, signIn, signUp } from 'aws-amplify/auth';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Cognito emails a verification code, so sign-up is a two-step flow. */
type Step = 'details' | 'confirm';

export function SignUp() {
  const [step, setStep] = useState<Step>('details');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  async function handleDetails(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await signUp({
        username: email,
        password,
        options: { userAttributes: { email } },
      });
      setStep('confirm');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create account');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await confirmSignUp({ username: email, confirmationCode: code });
      await signIn({ username: email, password });
      await refresh();
      void navigate('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not confirm account');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{step === 'details' ? 'Create account' : 'Check your email'}</CardTitle>
          <CardDescription>
            {step === 'details'
              ? 'Start tracking your spending.'
              : `We sent a verification code to ${email}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'details' ? (
            <form onSubmit={handleDetails} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  At least 12 characters, with upper and lower case letters and a number.
                </p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create account'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{' '}
                <Link to="/sign-in" className="underline underline-offset-4">
                  Sign in
                </Link>
              </p>
            </form>
          ) : (
            <form onSubmit={handleConfirm} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="code">Verification code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Verifying…' : 'Verify and continue'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
