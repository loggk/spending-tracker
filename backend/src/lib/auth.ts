import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

export interface AuthenticatedUser {
  userId: string;
  email?: string;
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Reads the caller's identity from the JWT claims API Gateway has already
 * verified. Throws if `sub` is missing, which should only happen if a route is
 * accidentally deployed without the authorizer attached.
 */
export function getAuthenticatedUser(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): AuthenticatedUser {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  const userId = claims?.['sub'];
  const email = claims?.['email'];

  if (typeof userId !== 'string' || userId.length === 0) {
    throw new UnauthorizedError('Missing subject claim');
  }

  return {
    userId,
    ...(typeof email === 'string' ? { email } : {}),
  };
}
