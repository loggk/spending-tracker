import { fetchAuthSession } from 'aws-amplify/auth';
import { config } from '@/config';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Calls the API with the current Cognito ID token attached. Amplify refreshes
 * the token automatically when it is close to expiry.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { tokens } = await fetchAuthSession();
  const idToken = tokens?.idToken?.toString();

  if (!idToken) {
    throw new ApiError(401, 'Not signed in');
  }

  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      authorization: `Bearer ${idToken}`,
      'content-type': 'application/json',
    },
  });

  if (!response.ok) {
    const message = await response
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => undefined);
    throw new ApiError(response.status, message ?? response.statusText);
  }

  return response.json() as Promise<T>;
}
