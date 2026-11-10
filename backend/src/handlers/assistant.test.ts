import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as assistantLib from '../lib/assistant';
import { handler } from './assistant';

vi.mock('../lib/assistant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/assistant')>();
  return {
    ...actual,
    runAssistantChat: vi.fn(),
  };
});

function createEvent(body?: unknown): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    version: '2.0',
    routeKey: 'POST /assistant/chat',
    rawPath: '/assistant/chat',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {
      authorizer: {
        jwt: {
          claims: { sub: 'user-456' },
          scopes: [],
        },
      },
    } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer['requestContext'],
    body: body !== undefined ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe('assistant handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with assistant response on valid request', async () => {
    vi.mocked(assistantLib.runAssistantChat).mockResolvedValue({
      reply: 'You spent $50.00.',
      citedTransactions: [],
    });

    const event = createEvent({
      messages: [{ role: 'user', content: 'How much did I spend?' }],
    });

    const result = await handler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 200 });
    expect(JSON.parse((result as { body: string }).body)).toEqual({
      reply: 'You spent $50.00.',
      citedTransactions: [],
    });
    expect(assistantLib.runAssistantChat).toHaveBeenCalledWith('user-456', [
      { role: 'user', content: 'How much did I spend?' },
    ]);
  });

  it('returns 400 for invalid body schema', async () => {
    const event = createEvent({ messages: [] });
    const result = await handler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 400 });
  });

  it('returns 401 when user is not authenticated', async () => {
    const event = createEvent({ messages: [{ role: 'user', content: 'hi' }] });
    // Remove authorizer
    (event.requestContext as unknown as { authorizer: unknown }).authorizer = undefined;

    const result = await handler(event, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 401 });
  });
});
