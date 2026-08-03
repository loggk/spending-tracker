import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedError } from './auth';
import { jsonResponse } from './http';
import { router } from './router';
import { ValidationError } from './validation';

const event = (routeKey: string) =>
  ({ routeKey }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

const invoke = (handler: ReturnType<typeof router>, routeKey: string) =>
  handler(event(routeKey), {} as never, () => undefined) as Promise<{
    statusCode: number;
    body?: string;
  }>;

describe('router', () => {
  it('dispatches to the matching route', async () => {
    const handler = router({ 'GET /things': async () => jsonResponse(200, { ok: true }) });

    await expect(invoke(handler, 'GET /things')).resolves.toMatchObject({ statusCode: 200 });
  });

  it('returns 404 for an unregistered route', async () => {
    const handler = router({ 'GET /things': async () => jsonResponse(200, {}) });

    await expect(invoke(handler, 'DELETE /things')).resolves.toMatchObject({ statusCode: 404 });
  });

  it('maps validation failures to 400 with details', async () => {
    const handler = router({
      'GET /things': () => Promise.reject(new ValidationError(['date: required'])),
    });

    const result = await invoke(handler, 'GET /things');

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body ?? '{}')).toMatchObject({ details: ['date: required'] });
  });

  it('maps authorization failures to 401', async () => {
    const handler = router({ 'GET /things': () => Promise.reject(new UnauthorizedError()) });

    await expect(invoke(handler, 'GET /things')).resolves.toMatchObject({ statusCode: 401 });
  });

  it('hides unexpected errors behind a 500', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = router({
      'GET /things': () => Promise.reject(new Error('connection string leaked')),
    });

    const result = await invoke(handler, 'GET /things');

    expect(result.statusCode).toBe(500);
    expect(result.body).not.toContain('connection string');
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
