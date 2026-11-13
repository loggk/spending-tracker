import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('../lib/dynamo', () => ({
  documentClient: { send: mocks.send },
  tableName: () => 'test-table',
}));

const { createPending } = await import('./pending-transactions');

const INPUT = {
  date: '2026-11-11',
  amountCents: 3860,
  currency: 'CAD',
  merchantRaw: 'TIM HORTONS #1234',
  merchantSanitized: 'TIM HORTONS',
  suggestedCategoryId: null,
  source: 'amex' as const,
  parser: 'template' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createPending', () => {
  it('writes the row and its deduplication marker in one transaction', async () => {
    mocks.send.mockResolvedValue({});

    await expect(createPending('user-1', INPUT)).resolves.toBe('created');

    const command = mocks.send.mock.calls[0]?.[0] as {
      input: { TransactItems: Record<string, { Item: Record<string, unknown> }>[] };
    };
    const [row, marker] = command.input.TransactItems;

    expect(row?.Put?.Item).toMatchObject({ pk: 'USER#user-1', merchantSanitized: 'TIM HORTONS' });
    expect(row?.Put?.Item['sk']).toMatch(/^PEND#/);

    expect(marker?.Put?.Item['sk']).toBe('DEDUP#2026-11-11#3860#TIM HORTONS');
    expect(marker?.Put).toMatchObject({ ConditionExpression: 'attribute_not_exists(pk)' });
    // Markers expire; the rows they guard do not.
    expect(marker?.Put?.Item['expiresAt']).toBeTypeOf('number');
    expect(row?.Put?.Item['expiresAt']).toBeUndefined();
  });

  it('reports a repeat of the same purchase as a duplicate', async () => {
    mocks.send.mockRejectedValue(
      new TransactionCanceledException({
        message: 'cancelled',
        $metadata: {},
        CancellationReasons: [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }],
      }),
    );

    await expect(createPending('user-1', INPUT)).resolves.toBe('duplicate');
  });

  it('rethrows a cancellation that was not the condition failing', async () => {
    mocks.send.mockRejectedValue(
      new TransactionCanceledException({
        message: 'cancelled',
        $metadata: {},
        CancellationReasons: [{ Code: 'ThrottlingError' }],
      }),
    );

    await expect(createPending('user-1', INPUT)).rejects.toThrow(TransactionCanceledException);
  });

  it('rethrows anything else', async () => {
    mocks.send.mockRejectedValue(new Error('network'));

    await expect(createPending('user-1', INPUT)).rejects.toThrow('network');
  });
});
