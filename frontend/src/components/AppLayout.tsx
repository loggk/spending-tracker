import { NavLink, Outlet } from 'react-router-dom';
import { signOut } from 'aws-amplify/auth';
import { useAuth } from '@/auth/auth-context';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/categories', label: 'Categories' },
  { to: '/receipts', label: 'Receipts' },
];

export function AppLayout() {
  const { user, refresh } = useAuth();

  async function handleSignOut() {
    await signOut();
    await refresh();
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
          <span className="font-semibold tracking-tight">Spending Tracker</span>
          <nav className="flex gap-1">
            {links.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user?.email}</span>
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={() => void handleSignOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
