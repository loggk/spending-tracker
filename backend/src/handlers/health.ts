import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

/** Unauthenticated health check used to verify the API is deployed and reachable. */
export const handler: APIGatewayProxyHandlerV2 = async () => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ status: 'ok' }),
});
