import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { signOut } from 'aws-amplify/auth';
import { SparklesIcon } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { AssistantDrawer } from '@/components/AssistantDrawer';
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
  const [assistantOpen, setAssistantOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    await refresh();
  }

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 sm:gap-6 sm:px-6">
          <span className="font-semibold tracking-tight">Spending Tracker</span>

          {/* Wide screens fit the links beside the brand; narrow ones get the row below. */}
          <Nav className="hidden gap-1 sm:flex" itemClassName="rounded-md px-3 py-1.5 text-sm" />

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <span className="hidden max-w-40 truncate text-sm text-muted-foreground md:inline">
              {user?.email}
            </span>
            <ThemeToggle />
            <Button variant="outline" size="sm" onClick={() => void handleSignOut()}>
              Sign out
            </Button>
          </div>
        </div>

        <Nav
          className="flex border-t sm:hidden"
          itemClassName="flex-1 py-2.5 text-center text-sm"
        />
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setAssistantOpen(true)}
        className="fixed right-4 bottom-4 z-40 h-8 gap-1.5 rounded-full border bg-background/95 px-3 text-xs font-medium shadow-md backdrop-blur-xs transition hover:bg-muted hover:shadow-lg sm:right-6 sm:bottom-6"
        title="Open Financial Assistant"
      >
        <SparklesIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <span>Ask AI</span>
      </Button>

      <AssistantDrawer open={assistantOpen} onOpenChange={setAssistantOpen} />
    </div>
  );
}

function Nav({ className, itemClassName }: { className: string; itemClassName: string }) {
  return (
    <nav className={className}>
      {links.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            cn(
              itemClassName,
              'transition-colors',
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
  );
}
