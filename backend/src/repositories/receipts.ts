import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Receipt, ReceiptLineItem, ReceiptStatus } from '@spending-tracker/shared';
import { documentClient, tableName } from '../lib/dynamo';
import { createId } from '../lib/id';
import { receiptSk, userPk } from '../lib/keys';

interface ReceiptItem {
  pk: string;
  sk: string;
  id: string;
  status: ReceiptStatus;
  s3Key: string;
  merchant?: string;
  date?: string;
  items?: ReceiptLineItem[];
  error?: string;
  createdAt: string;
}

const toReceipt = ({ pk: _pk, sk: _sk, s3Key: _s3Key, ...receipt }: ReceiptItem): Receipt =>
  receipt;

/** Records a receipt as pending before the image is uploaded. */
export async function createReceipt(userId: string, s3Key: (id: string) => string) {
  const id = createId();
  const item: ReceiptItem = {
    pk: userPk(userId),
    sk: receiptSk(id),
    id,
    status: 'processing',
    s3Key: s3Key(id),
    createdAt: new Date().toISOString(),
  };

  await documentClient.send(new PutCommand({ TableName: tableName(), Item: item }));

  return { id, s3Key: item.s3Key };
}

export async function getReceipt(userId: string, id: string): Promise<Receipt | null> {
  const { Item } = await documentClient.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: receiptSk(id) },
    }),
  );

  return Item ? toReceipt(Item as ReceiptItem) : null;
}

/** Stores what the model read. Only ever called by the parser Lambda. */
export async function markParsed(
  userId: string,
  id: string,
  parsed: { merchant: string | null; date: string | null; items: ReceiptLineItem[] },
): Promise<void> {
  await documentClient.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: receiptSk(id) },
      UpdateExpression:
        'SET #status = :status, #items = :items, merchant = :merchant, #date = :date REMOVE #error',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#items': 'items',
        '#date': 'date',
        '#error': 'error',
      },
      ExpressionAttributeValues: {
        ':status': 'parsed' satisfies ReceiptStatus,
        ':items': parsed.items,
        ':merchant': parsed.merchant ?? undefined,
        ':date': parsed.date ?? undefined,
      },
    }),
  );
}

export async function markFailed(userId: string, id: string, message: string): Promise<void> {
  await documentClient.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: receiptSk(id) },
      UpdateExpression: 'SET #status = :status, #error = :error',
      ExpressionAttributeNames: { '#status': 'status', '#error': 'error' },
      ExpressionAttributeValues: {
        ':status': 'failed' satisfies ReceiptStatus,
        ':error': message.slice(0, 300),
      },
    }),
  );
}
