import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { IngestParser, IngestSource, PendingTransaction } from '@spending-tracker/shared';
import { documentClient, tableName } from '../lib/dynamo';
import { createId } from '../lib/id';
import { PENDING_PREFIX, dedupSk, pendingSk, userPk } from '../lib/keys';

/**
 * How long a deduplication marker outlives the alert that wrote it. Long enough
 * to cover an authorization and its posted counterpart plus any retry, short
 * enough that the markers never become a meaningful share of the table.
 */
const DEDUP_TTL_DAYS = 90;

export interface PendingInput {
  date: string;
  amountCents: number;
  currency: string;
  merchantRaw: string;
  merchantSanitized: string;
  suggestedCategoryId: string | null;
  source: IngestSource;
  parser: IngestParser;
}

interface PendingItem extends PendingInput {
  pk: string;
  sk: string;
  id: string;
  createdAt: string;
}

const toPending = ({ pk: _pk, sk: _sk, ...pending }: PendingItem): PendingTransaction => pending;

/**
 * Oldest first: the inbox is a queue to work through, unlike the transaction
 * list, which is read newest first.
 */
export async function listPending(userId: string): Promise<PendingTransaction[]> {
  const { Items = [] } = await documentClient.send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: { ':pk': userPk(userId), ':prefix': PENDING_PREFIX },
    }),
  );

  return (Items as PendingItem[]).map(toPending);
}

export async function getPending(userId: string, id: string): Promise<PendingTransaction | null> {
  const { Item } = await documentClient.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: pendingSk(id) },
    }),
  );

  return Item ? toPending(Item as PendingItem) : null;
}

/**
 * Writes an inbox row and its deduplication marker in one transaction.
 *
 * The marker carries the condition, so a repeat of the same purchase fails the
 * whole write rather than being detected by a read first — two alerts arriving
 * at once cannot both pass a check and then both insert. Markers are written
 * only on this path, so manual entry and CSV import are never blocked by one.
 */
export async function createPending(
  userId: string,
  input: PendingInput,
): Promise<'created' | 'duplicate'> {
  const table = tableName();
  const id = createId();
  const item: PendingItem = {
    pk: userPk(userId),
    sk: pendingSk(id),
    id,
    ...input,
    createdAt: new Date().toISOString(),
  };

  const expiresAt = Math.floor(Date.now() / 1000) + DEDUP_TTL_DAYS * 24 * 60 * 60;

  try {
    await documentClient.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: table, Item: item } },
          {
            Put: {
              TableName: table,
              Item: {
                pk: userPk(userId),
                sk: dedupSk(input.date, input.amountCents, input.merchantSanitized),
                pendingId: id,
                expiresAt,
              },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
        ],
      }),
    );

    return 'created';
  } catch (error) {
    if (
      error instanceof TransactionCanceledException &&
      error.CancellationReasons?.some((reason) => reason.Code === 'ConditionalCheckFailed')
    ) {
      return 'duplicate';
    }

    throw error;
  }
}

/** Returns false when there was nothing to remove. */
export async function deletePending(userId: string, id: string): Promise<boolean> {
  const { Attributes } = await documentClient.send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: pendingSk(id) },
      ReturnValues: 'ALL_OLD',
    }),
  );

  return Attributes !== undefined;
}
