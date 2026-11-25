/**
 * 3G-Resilient Fetch Engine for the Yakunex Hub API.
 * - Sends HttpOnly cookies (credentials: 'include').
 * - Adaptive in-memory GET cache (30s standard / 60s on 3G) + in-flight GET deduplication.
 * - Persistent stale-while-error fallback cache (memory + sessionStorage) so 3G micro-drops never break views.
 * - Per-request AbortController timeout + exponential backoff retry on network drops / 502 / 503 / 504.
 * - Automatic cache invalidation on any mutation (POST / PATCH / PUT / DELETE).
 * - On 401, performs a resilient silent refresh and retries the request.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly isNetworkError: boolean;
  constructor(status: number, message: string, isNetworkError = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.isNetworkError = isNetworkError;
  }
}

let refreshInFlight: Promise<boolean> | null = null;
const STORAGE_CACHE_KEY = 'yh-api-cache-v1';
const getCache = new Map<string, { data: unknown; expiresAt: number }>();
const staleCache = new Map<string, unknown>();
const inflightGets = new Map<string, Promise<unknown>>();
let storageHydrated = false;

function hydrateStaleCacheFromStorage(): void {
  if (storageHydrated || typeof window === 'undefined') return;
  storageHydrated = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        staleCache.set(k, v);
      }
    }
  } catch {
    // Ignore storage read errors
  }
}

function persistStaleCacheToStorage(path: string, data: unknown): void {
  staleCache.set(path, data);
  if (typeof window === 'undefined') return;
  try {
    const obj: Record<string, unknown> = {};
    let count = 0;
    for (const [k, v] of staleCache.entries()) {
      if (count >= 25) break;
      obj[k] = v;
      count += 1;
    }
    window.sessionStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(obj));
  } catch {
    // Ignore quota errors
  }
}

export function isSlow3GConnection(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean; downlink?: number; rtt?: number };
  };
  const conn = nav.connection;
  if (!conn) return false;
  if (
    conn.saveData ||
    conn.effectiveType === 'slow-2g' ||
    conn.effectiveType === '2g' ||
    conn.effectiveType === '3g'
  ) {
    return true;
  }
  if (typeof conn.downlink === 'number' && conn.downlink > 0 && conn.downlink <= 1.5) {
    return true;
  }
  if (typeof conn.rtt === 'number' && conn.rtt >= 300) {
    return true;
  }
  return false;
}

function getCacheTtlMs(): number {
  return isSlow3GConnection() ? 60_000 : 30_000;
}

export function clearApiCache(): void {
  getCache.clear();
  inflightGets.clear();
  liveInflight?.clear();
}

/** Wipes all in-memory and sessionStorage caches on logout or account switch so data never leaks across users. */
export function purgeAllClientSessionCaches(): void {
  getCache.clear();
  staleCache.clear();
  inflightGets.clear();
  liveInflight?.clear();
  storageHydrated = false;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(STORAGE_CACHE_KEY);
      window.sessionStorage.removeItem('yh-session-cache-v1');
      window.sessionStorage.removeItem('yh-sa-preview-role');
    } catch {
      // ignore storage errors
    }
  }
}

const TRANSIENT_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function isRetryableRequest(path: string, method: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || method === 'PUT' || method === 'PATCH') {
    return true;
  }
  // Safe/idempotent or signaling POST endpoints that can be retried on a 3G radio drop before response
  return (
    path === '/auth/refresh' ||
    path.includes('/meetings/') ||
    path === '/time-entries/stop'
  );
}

async function rawFetch(
  path: string,
  init: RequestInit = {},
  options: { timeoutMs?: number; maxRetries?: number } = {},
): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const timeoutMs = options.timeoutMs ?? 18_000;
  const maxRetries = options.maxRetries ?? (isRetryableRequest(path, method) ? 2 : 1);

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`/api${path}`, {
        ...init,
        signal: init.signal ?? controller.signal,
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'YakunexHub',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init.headers ?? {}),
        },
      });
      clearTimeout(timer);

      if (attempt < maxRetries && TRANSIENT_STATUS_CODES.has(response.status) && isRetryableRequest(path, method)) {
        const delay = (attempt === 0 ? 240 : 600) + Math.floor(Math.random() * 120);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return response;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < maxRetries) {
        const delay = (attempt === 0 ? 250 : 650) + Math.floor(Math.random() * 150);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    }
  }

  throw new ApiError(
    0,
    lastError instanceof Error && lastError.name === 'AbortError'
      ? 'Connection timed out on slow network. Retrying...'
      : 'Network connection interrupted. Please check your signal.',
    true,
  );
}

/** Rotates the refresh token. Concurrent callers share one in-flight request. */
export function refreshSession(): Promise<boolean> {
  return (refreshInFlight ??= rawFetch(
    '/auth/refresh',
    { method: 'POST' },
    { timeoutMs: 12_000, maxRetries: 2 },
  )
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    }));
}

const LIVE_REALTIME_PREFIXES = [
  '/tasks',
  '/projects',
  '/sprints',
  '/bugs',
  '/chat',
  '/time-entries',
  '/attendance',
  '/leave',
  '/approvals',
  '/notifications',
  '/meetings',
  '/users',
  '/finance',
  '/assets',
  '/performance',
  '/interns',
  '/profile',
  '/clients',
  '/documents',
  '/organization',
  '/dashboard',
];

function isLiveRealtimePath(path: string): boolean {
  return LIVE_REALTIME_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`));
}

function broadcastWorkspaceMutation(path: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('yakunex:workspace-mutated', { detail: { path, ts: Date.now() } }));
  } catch {
    // ignore
  }
  try {
    const bc = new BroadcastChannel('yakunex_live_sync');
    bc.postMessage({ type: 'mutated', path, ts: Date.now() });
    bc.close();
  } catch {
    // BroadcastChannel unsupported
  }
}

export async function api<T>(path: string, init: RequestInit = {}, allowRetry = true): Promise<T> {
  hydrateStaleCacheFromStorage();
  const method = (init.method ?? 'GET').toUpperCase();

  if (method === 'GET' && allowRetry) {
    const now = Date.now();
    const isLive = isLiveRealtimePath(path);
    const cached = !isLive ? getCache.get(path) : undefined;
    if (cached && cached.expiresAt > now) {
      return cached.data as T;
    }
    const existing = inflightGets.get(path);
    if (existing) {
      return existing as Promise<T>;
    }
    const promise = executeRequest<T>(path, init, allowRetry)
      .then((data) => {
        if (!isLive) {
          getCache.set(path, { data, expiresAt: Date.now() + getCacheTtlMs() });
        }
        persistStaleCacheToStorage(path, data);
        return data;
      })
      .catch((err: unknown) => {
        // On 3G transient failure or 5xx, serve last known good GET data instead of crashing the view
        const isAuthFailure = err instanceof ApiError && (err.status === 401 || err.status === 403);
        if (!isAuthFailure && staleCache.has(path)) {
          const fallback = staleCache.get(path) as T;
          if (!isLive) {
            getCache.set(path, { data: fallback, expiresAt: Date.now() + 8_000 });
          }
          return fallback;
        }
        throw err;
      })
      .finally(() => {
        inflightGets.delete(path);
      });
    inflightGets.set(path, promise);
    return promise;
  }

  // Any mutation invalidates fresh GET TTLs and broadcasts an instant live-sync signal across all open tabs.
  if (method !== 'GET') {
    clearApiCache();
    const result = await executeRequest<T>(path, init, allowRetry);
    broadcastWorkspaceMutation(path);
    return result;
  }

  return executeRequest<T>(path, init, allowRetry);
}

const liveInflight = new Map<string, { promise: Promise<unknown>; at: number; done: boolean }>();
/** Several widgets ask for the same live data at the same moment (e.g. /notifications from the sidebar
 * badge, meeting alerts and the bell). Calls within this window share one request. */
const LIVE_SHARE_MS = 1_000;

/** Real-time GET request that bypasses the in-memory GET cache (used for live meeting rooms & WebRTC signaling). */
export function liveGet<T>(path: string): Promise<T> {
  const now = Date.now();
  const shared = liveInflight.get(path);
  // Meeting signalling must never get a reused answer; it only shares a request that is still running.
  const reuseFinished = !path.startsWith('/meetings') && !path.startsWith('/public/meetings');
  if (shared && (!shared.done || (reuseFinished && now - shared.at < LIVE_SHARE_MS))) {
    return shared.promise as Promise<T>;
  }
  const promise = executeRequest<T>(path, { method: 'GET' }, true, {
    timeoutMs: 8_500,
    maxRetries: 1,
  });
  const entry = { promise: promise as Promise<unknown>, at: now, done: false };
  liveInflight.set(path, entry);
  promise.then(
    () => {
      entry.done = true;
    },
    () => {
      if (liveInflight.get(path) === entry) liveInflight.delete(path);
    },
  );
  return promise;
}

async function executeRequest<T>(
  path: string,
  init: RequestInit,
  allowRetry: boolean,
  fetchOptions?: { timeoutMs?: number; maxRetries?: number },
): Promise<T> {
  const response = await rawFetch(path, init, fetchOptions);

  if (response.status === 401 && allowRetry && !path.startsWith('/auth/')) {
    if (await refreshSession()) {
      return executeRequest<T>(path, init, false, fetchOptions);
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

/** Gently warms core module caches in the background so sidebar navigation on 3G is instantaneous. */
export function warmWorkspaceCache(isAdmin: boolean): void {
  if (typeof window === 'undefined') return;
  const routes = [
    isAdmin ? '/dashboard/admin' : '/dashboard/me',
    '/projects',
    '/tasks',
    '/meetings',
  ];
  routes.forEach((route, idx) => {
    setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      void api(route).catch(() => undefined);
    }, (idx + 1) * 450);
  });
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
