import { type FormEvent, useEffect, useState } from 'react';
import type { PendingTransaction } from '@spending-tracker/shared';
import { CheckIcon, CopyIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { CategorySelect } from '@/components/CategorySelect';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/FormCard';
import { IconButton } from '@/components/IconButton';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatAmount, parseAmountToCents } from '@/lib/format';
import {
  useCategories,
  useConfirmPending,
  useDismissPending,
  useInbox,
  useIngestAlias,
  useUpdateIngestAlias,
} from '@/lib/queries';

const SOURCE_LABELS: Record<PendingTransaction['source'], string> = {
  amex: 'Amex',
  rbc: 'RBC',
};

interface Draft {
  date: string;
  amount: string;
  description: string;
  categoryId: string;
}

const toDraft = (row: PendingTransaction): Draft => ({
  date: row.date,
  amount: (row.amountCents / 100).toFixed(2),
  // The issuer's own wording is the starting point; the user can shorten it.
  description: row.merchantRaw,
  categoryId: row.suggestedCategoryId ?? '',
});

export function Inbox() {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const pending = useInbox();
  const categories = useCategories();
  const confirm = useConfirmPending();
  const dismiss = useDismissPending();

  const rows = pending.data ?? [];
  const categoryList = categories.data ?? [];

  /**
   * Seeds a draft for each new row without touching rows already on screen —
   * the queue refetches on a timer, and that must not discard half-finished
   * edits.
   */
  useEffect(() => {
    if (pending.data === undefined) {
      return;
    }

    setDrafts((current) => {
      const next = { ...current };
      let changed = false;

      for (const row of pending.data) {
        if (!(row.id in next)) {
          next[row.id] = toDraft(row);
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [pending.data]);

  function update(id: string, patch: Partial<Draft>) {
    setDrafts((current) => {
      const existing = current[id];
      return existing === undefined ? current : { ...current, [id]: { ...existing, ...patch } };
    });
  }

  function handleConfirm(row: PendingTransaction) {
    const draft = drafts[row.id];
    if (draft === undefined) {
      return;
    }

    const amountCents = parseAmountToCents(draft.amount);
    if (amountCents === null) {
      toast.error('Enter an amount like 12.99');
      return;
    }

    if (draft.categoryId === '') {
      toast.error('Pick a category first');
      return;
    }

    if (draft.description.trim() === '') {
      toast.error('Give it a description');
      return;
    }

    confirm.mutate(
      {
        id: row.id,
        date: draft.date,
        amountCents,
        description: draft.description.trim(),
        categoryId: draft.categoryId,
      },
      {
        onSuccess: () => toast.success(`Added ${draft.description.trim()}`),
        onError: (error: Error) => toast.error(error.message),
      },
    );
  }

  function handleDismiss(row: PendingTransaction) {
    dismiss.mutate(row.id, {
      onError: (error: Error) => toast.error(error.message),
    });
  }

  return (
    <>
      <PageHeader
        eyebrow={rows.length > 0 ? `${rows.length} waiting` : undefined}
        title="Inbox"
        description="Transactions read from your Amex and RBC alert emails. Check each one before it joins your ledger."
      />

      <IngestAddressCard />

      {pending.isPending && <EmptyState>Loading the inbox…</EmptyState>}
      {pending.isError && (
        <EmptyState>Could not load the inbox: {pending.error.message}</EmptyState>
      )}

      {pending.isSuccess &&
        (rows.length === 0 ? (
          <EmptyState>
            Nothing waiting. Alerts show up here within a minute or so of a purchase.
          </EmptyState>
        ) : (
          <ul className="grid gap-2.5">
            {rows.map((row) => {
              const draft = drafts[row.id] ?? toDraft(row);

              return (
                <li key={row.id}>
                  <Card className="grid gap-3 px-5 py-[18px]">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium break-words">{row.merchantRaw}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Tag>{SOURCE_LABELS[row.source]}</Tag>
                          {row.currency !== 'CAD' && <Tag>{row.currency}</Tag>}
                          {/* A template match is structural; the model is a judgement call. */}
                          {row.parser === 'model' && <Tag tone="warn">Unverified read</Tag>}
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {formatAmount(row.amountCents)}
                      </span>
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-[auto_7rem_1fr_11rem_auto] sm:items-end">
                      <Field label="Date" htmlFor={`date-${row.id}`}>
                        <Input
                          id={`date-${row.id}`}
                          type="date"
                          value={draft.date}
                          onChange={(event) => update(row.id, { date: event.target.value })}
                        />
                      </Field>
                      <Field label="Amount" htmlFor={`amount-${row.id}`}>
                        <Input
                          id={`amount-${row.id}`}
                          inputMode="decimal"
                          className="tabular-nums"
                          value={draft.amount}
                          onChange={(event) => update(row.id, { amount: event.target.value })}
                        />
                      </Field>
                      <Field label="Description" htmlFor={`description-${row.id}`}>
                        <Input
                          id={`description-${row.id}`}
                          maxLength={200}
                          value={draft.description}
                          onChange={(event) => update(row.id, { description: event.target.value })}
                        />
                      </Field>
                      <Field label="Category" htmlFor={`category-${row.id}`}>
                        <CategorySelect
                          id={`category-${row.id}`}
                          categories={categoryList}
                          value={draft.categoryId}
                          onChange={(categoryId) => update(row.id, { categoryId })}
                        />
                      </Field>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          disabled={confirm.isPending}
                          onClick={() => handleConfirm(row)}
                        >
                          Add
                        </Button>
                        <IconButton
                          label="Dismiss"
                          tone="destructive"
                          disabled={dismiss.isPending}
                          onClick={() => handleDismiss(row)}
                        >
                          <Trash2Icon />
                        </IconButton>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        ))}
    </>
  );
}

function Tag({ children, tone = 'default' }: { children: string; tone?: 'default' | 'warn' }) {
  return (
    <span
      className={
        tone === 'warn'
          ? 'rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400'
          : 'rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground'
      }
    >
      {children}
    </span>
  );
}

/**
 * The one piece of setup this feature needs: the address to point the banks at,
 * and which sender may use it.
 *
 * It sits on this page rather than in a settings area because it is the only
 * setting the feature has, and it is meaningless away from the queue it fills.
 */
function IngestAddressCard() {
  const alias = useIngestAlias();
  const updateAlias = useUpdateIngestAlias();
  const [forwardFrom, setForwardFrom] = useState('');
  const [copied, setCopied] = useState(false);

  const current = alias.data ?? null;

  useEffect(() => {
    setForwardFrom(current?.forwardFrom ?? '');
  }, [current?.forwardFrom]);

  function save(event: FormEvent) {
    event.preventDefault();
    updateAlias.mutate(
      { ...(forwardFrom.trim() !== '' && { forwardFrom: forwardFrom.trim() }) },
      {
        onSuccess: () => toast.success('Saved'),
        onError: (error: Error) => toast.error(error.message),
      },
    );
  }

  function rotate() {
    updateAlias.mutate(
      { rotate: true },
      {
        onSuccess: () => toast.success('New address issued. Update it in Amex and RBC.'),
        onError: (error: Error) => toast.error(error.message),
      },
    );
  }

  async function copy(address: string) {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (alias.isPending) {
    return null;
  }

  if (current === null) {
    return (
      <Card className="grid gap-2.5 px-5 py-[18px]">
        <div>
          <p className="text-sm font-medium">Set up email ingestion</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            You get a private address to forward your Amex and RBC transaction alerts to. Each alert
            becomes a row here.
          </p>
        </div>
        <Button
          size="sm"
          className="justify-self-start"
          disabled={updateAlias.isPending}
          onClick={() => updateAlias.mutate({})}
        >
          {updateAlias.isPending ? 'Generating…' : 'Generate my address'}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="grid gap-3 px-5 py-[18px]">
      <div className="grid gap-[5px]">
        <p className="text-xs text-muted-foreground">Forward your alerts to</p>
        <div className="flex items-center gap-1.5">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-2.5 py-1.5 text-[13px]">
            {current.address}
          </code>
          <IconButton label="Copy address" onClick={() => void copy(current.address)}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </IconButton>
          <IconButton label="Issue a new address" disabled={updateAlias.isPending} onClick={rotate}>
            <RefreshCwIcon />
          </IconButton>
        </div>
      </div>

      <form className="grid gap-2.5 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={save}>
        <Field label="Forwarding from" htmlFor="forward-from">
          <Input
            id="forward-from"
            type="email"
            placeholder="you@gmail.com"
            value={forwardFrom}
            onChange={(event) => setForwardFrom(event.target.value)}
          />
        </Field>
        <Button type="submit" variant="outline" size="sm" disabled={updateAlias.isPending}>
          Save
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        Mail is accepted from Amex and RBC directly, or forwarded from the address above — anything
        else is dropped. Forwarding from your own inbox is the easier route: add a filter that
        forwards transaction alerts to the address above.
      </p>
    </Card>
  );
}
