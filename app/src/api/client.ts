import type { ApiErrorBody, ApiErrorCode } from './types';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode | 'network',
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

export interface ApiClient {
  request<T>(method: HttpMethod, path: string, body?: unknown, opts?: { keepalive?: boolean }): Promise<T>;
}

export function createApiClient(opts: {
  baseUrl: string;
  headers: () => Record<string, string>;
  fetchImpl?: typeof fetch;
}): ApiClient {
  return {
    async request<T>(method: HttpMethod, path: string, body?: unknown, o?: { keepalive?: boolean }): Promise<T> {
      const doFetch = opts.fetchImpl ?? fetch;
      let res: Response;
      try {
        res = await doFetch(`${opts.baseUrl}/api/v1${path}`, {
          method,
          headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...opts.headers() },
          body: body === undefined ? undefined : JSON.stringify(body),
          keepalive: o?.keepalive,
        });
      } catch {
        throw new ApiError(0, 'network', 'Network error');
      }
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      const data = text ? JSON.parse(text) : undefined;
      if (!res.ok) {
        const err = (data as ApiErrorBody | undefined)?.error;
        throw new ApiError(res.status, err?.code ?? 'internal', err?.message ?? `HTTP ${res.status}`, err?.field);
      }
      return data as T;
    },
  };
}
