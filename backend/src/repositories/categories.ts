import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { Category } from '@spending-tracker/shared';
import { ulid } from 'ulid';
import { documentClient, tableName } from '../lib/dynamo';
import { CATEGORY_PREFIX, categorySk, userPk } from '../lib/keys';
import type { CategoryInput } from '../lib/validation';

interface CategoryItem {
  pk: string;
  sk: string;
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

const toCategory = ({ id, name, color, createdAt }: CategoryItem): Category => ({
  id,
  name,
  color,
  createdAt,
});

export async function listCategories(userId: string): Promise<Category[]> {
  const { Items = [] } = await documentClient.send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: { ':pk': userPk(userId), ':prefix': CATEGORY_PREFIX },
    }),
  );

  return (Items as CategoryItem[]).map(toCategory);
}

export async function createCategory(userId: string, input: CategoryInput): Promise<Category> {
  const item: CategoryItem = {
    pk: userPk(userId),
    sk: categorySk(ulid()),
    id: '',
    ...input,
    createdAt: new Date().toISOString(),
  };
  item.id = item.sk.slice(CATEGORY_PREFIX.length);

  await documentClient.send(new PutCommand({ TableName: tableName(), Item: item }));

  return toCategory(item);
}

/** Returns null when the category does not exist for this user. */
export async function updateCategory(
  userId: string,
  id: string,
  input: CategoryInput,
): Promise<Category | null> {
  const existing = await getCategory(userId, id);
  if (!existing) {
    return null;
  }

  const item: CategoryItem = {
    pk: userPk(userId),
    sk: categorySk(id),
    id,
    ...input,
    createdAt: existing.createdAt,
  };

  await documentClient.send(new PutCommand({ TableName: tableName(), Item: item }));

  return toCategory(item);
}

export async function getCategory(userId: string, id: string): Promise<Category | null> {
  const { Item } = await documentClient.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: categorySk(id) },
    }),
  );

  return Item ? toCategory(Item as CategoryItem) : null;
}

/** Returns false when there was nothing to delete. */
export async function deleteCategory(userId: string, id: string): Promise<boolean> {
  const { Attributes } = await documentClient.send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { pk: userPk(userId), sk: categorySk(id) },
      ReturnValues: 'ALL_OLD',
    }),
  );

  return Attributes !== undefined;
}
