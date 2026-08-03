import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { UnauthorizedError, getAuthenticatedUser } from './auth';

function eventWithClaims(
  claims: Record<string, string> | undefined,
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    requestContext: {
      authorizer: claims ? { jwt: { claims, scopes: [] } } : undefined,
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe('getAuthenticatedUser', () => {
  it('returns the subject and email from verified claims', () => {
    const event = eventWithClaims({ sub: 'user-123', email: 'logan@example.com' });

    expect(getAuthenticatedUser(event)).toEqual({
      userId: 'user-123',
      email: 'logan@example.com',
    });
  });

  it('omits email when the claim is absent', () => {
    const event = eventWithClaims({ sub: 'user-123' });

    expect(getAuthenticatedUser(event)).toEqual({ userId: 'user-123' });
  });

  it('rejects an event with no authorizer context', () => {
    expect(() => getAuthenticatedUser(eventWithClaims(undefined))).toThrow(UnauthorizedError);
  });

  it('rejects an empty subject claim', () => {
    expect(() => getAuthenticatedUser(eventWithClaims({ sub: '' }))).toThrow(UnauthorizedError);
  });
});
