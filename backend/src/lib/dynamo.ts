import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// Created once per container so connections are reused across invocations.
export const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export function tableName(): string {
  const name = process.env['TABLE_NAME'];
  if (!name) {
    throw new Error('TABLE_NAME environment variable is not set');
  }
  return name;
}
