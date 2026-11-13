import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { documentClient, tableName } from '../lib/dynamo';
import { merchantSk, userPk } from '../lib/keys';

/**
 * What the user has already decided a merchant belongs to.
 *
 * Confirming an inbox row records the choice here, so the second alert from the
 * same merchant arrives already categorised and the model is never asked a
 * question that has been answered. The key is the sanitized merchant, which is
 * what makes two spellings of one shop share an answer.
 */

export async function getMapping(
  userId: string,
  sanitizedMerchant: string,
): Promise<string | null> {
  if (sanitizedMerchant === '') {
    return null;
  }

  const { Item } = await documentClient.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: merchantSk(sanitizedMerchant) },
    }),
  );

  const categoryId = (Item as { categoryId?: string } | undefined)?.categoryId;

  return categoryId ?? null;
}

export async function putMapping(
  userId: string,
  sanitizedMerchant: string,
  categoryId: string,
): Promise<void> {
  if (sanitizedMerchant === '') {
    return;
  }

  await documentClient.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        pk: userPk(userId),
        sk: merchantSk(sanitizedMerchant),
        categoryId,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
}
