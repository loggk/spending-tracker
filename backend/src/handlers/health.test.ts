import { describe, expect, it } from 'vitest';
import { handler } from './health';

describe('health handler', () => {
  it('returns 200 with an ok status', async () => {
    const result = await handler({} as never, {} as never, () => undefined);

    expect(result).toMatchObject({ statusCode: 200 });
    expect(JSON.parse((result as { body: string }).body)).toEqual({ status: 'ok' });
  });
});
