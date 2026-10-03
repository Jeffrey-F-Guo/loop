import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './client';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('createApiClient', () => {
  it('sends JSON with auth headers to /api/v1', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(201, { id: '1' }));
    const api = createApiClient({ baseUrl: 'http://x', headers: () => ({ 'X-Dev-User': 'u' }), fetchImpl });
    await expect(api.request('POST', '/items', { title: 't' })).resolves.toEqual({ id: '1' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://x/api/v1/items');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json', 'X-Dev-User': 'u' });
    expect(init.body).toBe('{"title":"t"}');
  });

  it('returns undefined for 204', async () => {
    const api = createApiClient({ baseUrl: '', headers: () => ({}), fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 204 })) });
    await expect(api.request('DELETE', '/items/1')).resolves.toBeUndefined();
  });

  it('maps error bodies to ApiError', async () => {
    const api = createApiClient({ baseUrl: '', headers: () => ({}), fetchImpl: vi.fn().mockResolvedValue(json(400, { error: { code: 'validation_failed', message: 'bad', field: 'title' } })) });
    await expect(api.request('POST', '/items', {})).rejects.toMatchObject({ status: 400, code: 'validation_failed', field: 'title' });
  });

  it('maps network failures to ApiError with status 0', async () => {
    const api = createApiClient({ baseUrl: '', headers: () => ({}), fetchImpl: vi.fn().mockRejectedValue(new TypeError('offline')) });
    const err = await api.request<never>('GET', '/items').catch((e: ApiError) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
  });
});
