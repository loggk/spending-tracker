import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Transaction } from '@spending-tracker/shared';
import { createId } from '../lib/id';
import { documentClient, tableName } from '../lib/dynamo';
import {
  parseTransactionId,
  transactionId,
  transactionRange,
  transactionSk,
  userPk,
} from '../lib/keys';
import type { ListTransactionsQuery, TransactionInput } from '../lib/validation';

interface TransactionItem {
  pk: string;
  sk: string;
  id: string;
  date: string;
  amountCents: number;
  description: string;
  categoryId: string;
  createdAt: string;
}

const toTransaction = ({
  id,
  date,
  amountCents,
  description,
  categoryId,
  createdAt,
}: TransactionItem): Transaction => ({
  id,
  date,
  amountCents,
  description,
  categoryId,
  createdAt,
});

function buildItem(
  userId: string,
  suffix: string,
  input: TransactionInput,
  createdAt: string,
): TransactionItem {
  return {
    pk: userPk(userId),
    sk: transactionSk(input.date, suffix),
    id: transactionId(input.date, suffix),
    ...input,
    createdAt,
  };
}

export async function listTransactions(
  userId: string,
  query: ListTransactionsQuery = {},
): Promise<Transaction[]> {
  const { start, end } = transactionRange(query.from, query.to);
  const filterByCategory = query.categoryId !== undefined;

  const { Items = [] } = await documentClient.send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'pk = :pk AND sk BETWEEN :start AND :end',
      ...(filterByCategory && { FilterExpression: 'categoryId = :categoryId' }),
      ExpressionAttributeValues: {
        ':pk': userPk(userId),
        ':start': start,
        ':end': end,
        ...(filterByCategory && { ':categoryId': query.categoryId }),
      },
      // Newest first, matching how the table is read.
      ScanIndexForward: false,
    }),
  );

  return (Items as TransactionItem[]).map(toTransaction);
}

export async function createTransaction(
  userId: string,
  input: TransactionInput,
): Promise<Transaction> {
  const item = buildItem(userId, createId(), input, new Date().toISOString());

  await documentClient.send(new PutCommand({ TableName: tableName(), Item: item }));

  return toTransaction(item);
}

/** DynamoDB accepts at most 25 writes per batch. */
const BATCH_SIZE = 25;
const MAX_BATCH_ATTEMPTS = 4;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Writes many transactions, used by CSV import. DynamoDB can decline part of a
 * batch under load rather than failing it, so unprocessed items are retried with
 * a widening backoff before the whole request is reported as failed.
 */
export async function createTransactions(
  userId: string,
  inputs: TransactionInput[],
): Promise<Transaction[]> {
  const createdAt = new Date().toISOString();
  const items = inputs.map((input) => buildItem(userId, createId(), input, createdAt));

  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    await writeBatch(items.slice(start, start + BATCH_SIZE));
  }

  return items.map(toTransaction);
}

async function writeBatch(items: TransactionItem[]): Promise<void> {
  const table = tableName();
  let pending = items.map((Item) => ({ PutRequest: { Item } }));

  for (let attempt = 0; attempt < MAX_BATCH_ATTEMPTS; attempt += 1) {
    const { UnprocessedItems } = await documentClient.send(
      new BatchWriteCommand({ RequestItems: { [table]: pending } }),
    );

    const remaining = UnprocessedItems?.[table] ?? [];
    if (remaining.length === 0) {
      return;
    }

    pending = remaining as typeof pending;
    await delay(2 ** attempt * 50);
  }

  throw new Error(`${pending.length} transactions could not be written`);
}

export async function getTransaction(userId: string, id: string): Promise<Transaction | null> {
  const parsed = parseTransactionId(id);
  if (!parsed) {
    return null;
  }

  const { Item } = await documentClient.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: transactionSk(parsed.date, parsed.suffix) },
    }),
  );

  return Item ? toTransaction(Item as TransactionItem) : null;
}

/**
 * Returns null when the transaction does not exist for this user.
 *
 * The date is part of the sort key, so changing it moves the item. That case is
 * a delete plus a put inside a transaction, which keeps the two from diverging
 * if the second write fails. The public id changes as a result.
 */
export async function updateTransaction(
  userId: string,
  id: string,
  input: TransactionInput,
): Promise<Transaction | null> {
  const parsed = parseTransactionId(id);
  if (!parsed) {
    return null;
  }

  const existing = await getTransaction(userId, id);
  if (!existing) {
    return null;
  }

  const item = buildItem(userId, parsed.suffix, input, existing.createdAt);

  if (input.date === parsed.date) {
    await documentClient.send(new PutCommand({ TableName: tableName(), Item: item }));
    return toTransaction(item);
  }

  await documentClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: tableName(),
            Key: { pk: userPk(userId), sk: transactionSk(parsed.date, parsed.suffix) },
          },
        },
        { Put: { TableName: tableName(), Item: item } },
      ],
    }),
  );

  return toTransaction(item);
}

/** Returns false when there was nothing to delete. */
export async function deleteTransaction(userId: string, id: string): Promise<boolean> {
  const parsed = parseTransactionId(id);
  if (!parsed) {
    return false;
  }

  const { Attributes } = await documentClient.send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: transactionSk(parsed.date, parsed.suffix) },
      ReturnValues: 'ALL_OLD',
    }),
  );

  return Attributes !== undefined;
}
