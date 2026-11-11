import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { signOut } from 'aws-amplify/auth';
import { SparklesIcon } from 'lucide-react';
import { useAuth } from '@/auth/auth-context';
import { AssistantDrawer } from '@/components/AssistantDrawer';
import { SegmentedControl, type SegmentOption } from '@/components/SegmentedControl';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';

const LINKS: SegmentOption<string>[] = [
  { value: '/', label: 'Dashboard' },
  { value: '/transactions', label: 'Transactions' },
  { value: '/categories', label: 'Categories' },
  { value: '/receipts', label: 'Receipts' },
];

export function AppLayout() {
  const { user, refresh } = useAuth();
  const { pathname } = useLocation();
  const [assistantOpen, setAssistantOpen] = useState(false);

  const current =
    LINKS.find(({ value }) => (value === '/' ? pathname === '/' : pathname.startsWith(value)))
      ?.value ?? '/';

  async function handleSignOut() {
    await signOut();
    await refresh();
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2.5 px-6 py-3">
          <span className="text-base font-semibold tracking-[-0.025em]">Spending Tracker</span>

          {/* Wide screens fit the links beside the brand; narrow ones get the row below. */}
          <Nav current={current} className="hidden sm:inline-flex" />

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden max-w-40 truncate text-sm text-muted-foreground md:inline">
              {user?.email}
            </span>
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              className="border-input"
              onClick={() => void handleSignOut()}
            >
              Sign out
            </Button>
          </div>

          {/* The four labels only just fit a phone, so the row scrolls if they do not. */}
          <div className="-mx-6 w-[calc(100%+3rem)] overflow-x-auto px-6 sm:hidden">
            <Nav current={current} className="flex w-full min-w-max [&>*]:flex-1" />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-5 px-6 pt-8 pb-[88px]">
        <Outlet />
      </main>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setAssistantOpen(true)}
        className="fixed right-6 bottom-6 z-40 h-8 gap-1.5 rounded-full border-input bg-card px-3 text-xs font-medium shadow-fab transition hover:bg-muted"
        title="Open Financial Assistant"
      >
        <SparklesIcon className="size-3.5 text-primary" />
        <span>Ask AI</span>
      </Button>

      <AssistantDrawer open={assistantOpen} onOpenChange={setAssistantOpen} />
    </div>
  );
}

function Nav({ current, className }: { current: string; className: string }) {
  return (
    <SegmentedControl
      label="Sections"
      options={LINKS}
      value={current}
      className={className}
      renderItem={(option, { className: itemClassName }) => (
        <NavLink key={option.value} to={option.value} end className={itemClassName}>
          {option.label}
        </NavLink>
      )}
    />
  );
}
