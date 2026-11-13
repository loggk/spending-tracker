import { GetCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { documentClient, tableName } from '../lib/dynamo';
import { createToken } from '../lib/id';
import { INGEST_ALIAS_SK, USER_ALIAS_SK, ingestAliasPk, userPk } from '../lib/keys';

/**
 * The stored half of an ingest address. The address itself is assembled by the
 * handler, which is the only place that knows the receiving domain.
 */
export interface AliasRecord {
  token: string;
  userId: string;
  forwardFrom?: string;
  createdAt: string;
}

interface AliasItem extends AliasRecord {
  pk: string;
  sk: string;
}

const toAlias = ({ token, userId, forwardFrom, createdAt }: AliasItem): AliasRecord => ({
  token,
  userId,
  ...(forwardFrom !== undefined && { forwardFrom }),
  createdAt,
});

/**
 * Resolves an inbound address to its owner. Tokens are generated lowercase and
 * looked up lowercase, because mail systems do not preserve the case of a local
 * part reliably.
 */
export async function resolveAlias(token: string): Promise<AliasRecord | null> {
  const { Item } = await documentClient.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: ingestAliasPk(token.toLowerCase()), sk: INGEST_ALIAS_SK },
    }),
  );

  return Item ? toAlias(Item as AliasItem) : null;
}

/** Null when the user has never generated an address. */
export async function getAliasForUser(userId: string): Promise<AliasRecord | null> {
  const { Item } = await documentClient.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: USER_ALIAS_SK },
    }),
  );

  const token = (Item as { token?: string } | undefined)?.token;

  return token === undefined ? null : resolveAlias(token);
}

/**
 * Creates the user's address, rotates it, or updates which sender may forward
 * to it.
 *
 * Rotation exists because the address is public by necessity — it gets typed
 * into a bank's alert settings — so there has to be a way to abandon one that
 * leaked. The old token is deleted in the same transaction that writes the new
 * one, so an address is never valid for two users and never silently kept
 * alive after being replaced.
 */
export async function putAlias(
  userId: string,
  options: { forwardFrom?: string | undefined; rotate?: boolean | undefined } = {},
): Promise<AliasRecord> {
  const existing = await getAliasForUser(userId);

  if (existing !== null && options.rotate !== true) {
    if (options.forwardFrom === undefined) {
      return existing;
    }

    await documentClient.send(
      new UpdateCommand({
        TableName: tableName(),
        Key: { pk: ingestAliasPk(existing.token), sk: INGEST_ALIAS_SK },
        UpdateExpression: 'SET forwardFrom = :forwardFrom',
        ExpressionAttributeValues: { ':forwardFrom': options.forwardFrom },
      }),
    );

    return { ...existing, forwardFrom: options.forwardFrom };
  }

  const table = tableName();
  const token = createToken();
  const record: AliasRecord = {
    token,
    userId,
    // A rotation keeps the sender the user already configured unless they
    // changed it in the same request.
    ...((options.forwardFrom ?? existing?.forwardFrom) !== undefined && {
      forwardFrom: options.forwardFrom ?? existing?.forwardFrom,
    }),
    createdAt: new Date().toISOString(),
  };

  await documentClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: table,
            Item: { pk: ingestAliasPk(token), sk: INGEST_ALIAS_SK, ...record },
            // 80 bits makes a collision implausible; the condition makes it
            // impossible, which is cheaper than reasoning about the odds.
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
        {
          Put: {
            TableName: table,
            Item: { pk: userPk(userId), sk: USER_ALIAS_SK, token },
          },
        },
        ...(existing === null
          ? []
          : [
              {
                Delete: {
                  TableName: table,
                  Key: { pk: ingestAliasPk(existing.token), sk: INGEST_ALIAS_SK },
                },
              },
            ]),
      ],
    }),
  );

  return record;
}
