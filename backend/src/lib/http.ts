import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

export function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function errorResponse(
  statusCode: number,
  message: string,
): APIGatewayProxyStructuredResultV2 {
  return jsonResponse(statusCode, { message });
}
