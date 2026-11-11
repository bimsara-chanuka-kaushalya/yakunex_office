/**
 * Thin fetch wrapper for the ProjectFlow API.
 * - Sends HttpOnly cookies (credentials: 'include').
 * - On 401, performs one silent refresh and retries the request.
 * - Surfaces the API's human-readable error messages.
 */

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function rawFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
}

/** Rotates the refresh token. Concurrent callers share one in-flight request. */
export function refreshSession(): Promise<boolean> {
  return (refreshInFlight ??= rawFetch('/auth/refresh', { method: 'POST' })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    }));
}

export async function api<T>(path: string, init: RequestInit = {}, allowRetry = true): Promise<T> {
  const response = await rawFetch(path, init);

  if (response.status === 401 && allowRetry && !path.startsWith('/auth/')) {
    if (await refreshSession()) {
      return api<T>(path, init, false);
    }
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const raw = body?.message;
    const message = Array.isArray(raw)
      ? raw.join(' ')
      : typeof raw === 'string'
        ? raw
        : 'Something went wrong. Please try again.';
    throw new ApiError(response.status, message);
  }
  return body as T;
}

export function post<T>(path: string, data?: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) });
}

export function patch<T>(path: string, data: unknown): Promise<T> {
  return api<T>(path, { method: 'PATCH', body: JSON.stringify(data) });
}

export function put<T>(path: string, data: unknown): Promise<T> {
  return api<T>(path, { method: 'PUT', body: JSON.stringify(data) });
}

export function del<T>(path: string): Promise<T> {
  return api<T>(path, { method: 'DELETE' });
}
