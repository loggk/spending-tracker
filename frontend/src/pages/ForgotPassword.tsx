import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { confirmResetPassword, resetPassword, signIn } from 'aws-amplify/auth';
import { useAuth } from '@/auth/auth-context';
import { PrismLogo } from '@/components/PrismLogo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

/** Password reset is a two-step flow: request code, then confirm with new password. */
type Step = 'request' | 'confirm';

export function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const initialEmail = searchParams.get('email') ?? '';
  const initialCode = searchParams.get('code') ?? '';

  const [step, setStep] = useState<Step>(initialCode && initialEmail ? 'confirm' : 'request');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState(initialCode);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [deliveryDestination, setDeliveryDestination] = useState<string | null>(null);

  const { refresh } = useAuth();
  const navigate = useNavigate();

  async function handleRequest(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const output = await resetPassword({ username: email.trim() });
      const dest = output.nextStep.codeDeliveryDetails?.destination;
      if (dest) {
        setDeliveryDestination(dest);
      }
      setStep('confirm');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not request password reset');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);

    try {
      await confirmResetPassword({
        username: email.trim(),
        confirmationCode: code.trim(),
        newPassword,
      });

      toast.success('Password reset successfully');

      // Attempt automatic sign-in with the new password
      try {
        await signIn({ username: email.trim(), password: newPassword });
        await refresh();
        void navigate('/');
      } catch {
        void navigate('/sign-in');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reset password');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendCode() {
    setError(null);
    setResending(true);

    try {
      const output = await resetPassword({ username: email.trim() });
      const dest = output.nextStep.codeDeliveryDetails?.destination;
      if (dest) {
        setDeliveryDestination(dest);
      }
      toast.success('A new verification code has been sent');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not resend code');
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3">
          <div className="flex justify-center pb-1">
            <PrismLogo className="h-8 w-auto" />
          </div>
          <div className="space-y-1">
            <CardTitle>{step === 'request' ? 'Reset password' : 'Set new password'}</CardTitle>
            <CardDescription>
              {step === 'request'
                ? 'Enter your email address to receive a verification code.'
                : `We sent a verification code to ${deliveryDestination || email}.`}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {step === 'request' ? (
            <form onSubmit={handleRequest} className="grid gap-4">
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
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Sending code…' : 'Send reset code'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Remember your password?{' '}
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
              <div className="grid gap-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  At least 12 characters, with upper and lower case letters and a number.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Resetting…' : 'Reset password'}
              </Button>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <button
                  type="button"
                  disabled={resending}
                  onClick={() => void handleResendCode()}
                  className="cursor-pointer underline underline-offset-4 hover:text-foreground disabled:opacity-50"
                >
                  {resending ? 'Resending code…' : 'Resend code'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep('request');
                  }}
                  className="cursor-pointer underline underline-offset-4 hover:text-foreground"
                >
                  Use a different email
                </button>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Remember your password?{' '}
                <Link to="/sign-in" className="underline underline-offset-4">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
