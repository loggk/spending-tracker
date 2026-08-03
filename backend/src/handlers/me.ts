import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { UnauthorizedError, getAuthenticatedUser } from '../lib/auth';
import { errorResponse, jsonResponse } from '../lib/http';

/** Returns the caller's identity. Used to confirm a session is valid. */
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    return jsonResponse(200, getAuthenticatedUser(event));
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return errorResponse(401, error.message);
    }
    throw error;
  }
};
