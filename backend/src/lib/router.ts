import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyHandlerV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { UnauthorizedError } from './auth';
import { errorResponse, jsonResponse } from './http';
import { ValidationError } from './validation';

export type Route = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
) => Promise<APIGatewayProxyStructuredResultV2>;

/** Maps thrown errors onto status codes, keeping internals out of responses. */
export function toErrorResponse(error: unknown): APIGatewayProxyStructuredResultV2 {
  if (error instanceof ValidationError) {
    return jsonResponse(400, { message: error.message, details: error.details });
  }

  if (error instanceof UnauthorizedError) {
    return errorResponse(401, error.message);
  }

  console.error('Unhandled error', error);
  return errorResponse(500, 'Internal server error');
}

/**
 * Dispatches on API Gateway's route key (for example `GET /transactions`), so a
 * single function can serve every method of one resource.
 */
export function router(routes: Record<string, Route>): APIGatewayProxyHandlerV2WithJWTAuthorizer {
  return async (event) => {
    const route = routes[event.routeKey];

    if (!route) {
      return errorResponse(404, `Unsupported route ${event.routeKey}`);
    }

    try {
      return await route(event);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
