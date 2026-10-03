import { ApiError, type ApiClient, type HttpMethod } from '../api/client';
import type { Item, Layout, WorkBlock } from '../api/types';
import { DEFAULT_LAYOUT } from '../domain/layout';
import { shiftDays } from '../domain/time';

let seq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const now = () => new Date().toISOString();

export const makeItem = (over: Partial<Item> = {}): Item => ({
  id: uid(), title: 'Item', description: null, open_at: null, deadline_at: null, status: 'active',
  work_block_count: 0, scheduled_minutes: 0, created_at: now(), updated_at: now(), completed_at: null, ...over,
});

export const makeBlock = (over: Partial<WorkBlock> & { item_id: string }): WorkBlock => ({
  id: uid(), start_at: '2026-10-06T16:00:00.000Z', end_at: '2026-10-06T17:00:00.000Z',
  created_at: now(), updated_at: now(), ...over,
});

export interface FakeApi extends ApiClient {
  items: Item[];
  blocks: WorkBlock[];
  layout: Layout;
  calls: { method: HttpMethod; path: string; body?: unknown }[];
  /** The next request matching `pred` (default: any) fails with HTTP 500. */
  failNext(pred?: (method: HttpMethod, path: string) => boolean): void;
  /** Holds every response until the returned release function is called. */
  hold(): () => void;
}

export function createFakeApi(seed: { items?: Item[]; blocks?: WorkBlock[]; layout?: Layout } = {}): FakeApi {
  let failPred: ((m: HttpMethod, p: string) => boolean) | null = null;
  let gate: Promise<void> | null = null;

  const withCount = (i: Item): Item => {
    const mine = api.blocks.filter((b) => b.item_id === i.id);
    const minutes = mine.reduce((m, b) => m + (Date.parse(b.end_at) - Date.parse(b.start_at)) / 60_000, 0);
    return { ...i, work_block_count: mine.length, scheduled_minutes: Math.round(minutes) };
  };
  const notFound = () => new ApiError(404, 'not_found', 'not found');

  const api: FakeApi = {
    items: seed.items ?? [],
    blocks: seed.blocks ?? [],
    layout: seed.layout ?? structuredClone(DEFAULT_LAYOUT),
    calls: [],
    failNext(pred = () => true) {
      failPred = pred;
    },
    hold() {
      let release!: () => void;
      gate = new Promise((r) => (release = r));
      return () => {
        gate = null;
        release();
      };
    },
    async request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
      api.calls.push({ method, path, body });
      if (gate) await gate;
      if (failPred?.(method, path)) {
        failPred = null;
        throw new ApiError(500, 'internal', 'boom');
      }
      const [route, query = ''] = path.split('?');
      const params = new URLSearchParams(query);
      const id = route.split('/')[2];
      const b = body as Record<string, unknown>;

      if (route === '/items' && method === 'GET') {
        const status = params.get('status') ?? 'active';
        return { items: api.items.filter((i) => status === 'all' || i.status === status).map(withCount) } as T;
      }
      if (route === '/items' && method === 'POST') {
        const it = makeItem({ ...(b as Partial<Item>), title: String(b.title).trim() });
        api.items.unshift(it);
        return withCount(it) as T;
      }
      if (route.startsWith('/items/')) {
        const idx = api.items.findIndex((i) => i.id === id);
        if (idx < 0) throw notFound();
        if (method === 'POST' && route.endsWith('/unschedule')) {
          api.blocks = api.blocks.filter((x) => x.item_id !== id);
          api.items[idx] = { ...api.items[idx], open_at: null, deadline_at: null, updated_at: now() };
          return withCount(api.items[idx]) as T;
        }
        if (method === 'PATCH' && typeof b.shift_days === 'number') {
          // Mirrors the API: dates and all of the item's blocks move by whole local days.
          const shift = (s: string) => shiftDays(new Date(s), b.shift_days as number).toISOString();
          const cur = api.items[idx];
          api.items[idx] = {
            ...cur, updated_at: now(),
            open_at: cur.open_at && shift(cur.open_at), deadline_at: cur.deadline_at && shift(cur.deadline_at),
          };
          api.blocks = api.blocks.map((x) => (x.item_id === id ? { ...x, start_at: shift(x.start_at), end_at: shift(x.end_at) } : x));
          return withCount(api.items[idx]) as T;
        }
        if (method === 'PATCH') {
          const next = { ...api.items[idx], ...(b as Partial<Item>), updated_at: now() };
          if (b.status === 'completed' && api.items[idx].status !== 'completed') next.completed_at = now();
          if (b.status === 'active') next.completed_at = null;
          api.items[idx] = next;
          return withCount(next) as T;
        }
        if (method === 'DELETE') {
          api.items.splice(idx, 1);
          api.blocks = api.blocks.filter((x) => x.item_id !== id);
          return undefined as T;
        }
        return withCount(api.items[idx]) as T;
      }
      if (route === '/work-blocks' && method === 'GET') {
        const start = params.get('start');
        const end = params.get('end');
        const itemId = params.get('item_id');
        return {
          work_blocks: api.blocks.filter((x) =>
            (!itemId || x.item_id === itemId) &&
            (!start || !end || (Date.parse(x.end_at) > Date.parse(start) && Date.parse(x.start_at) < Date.parse(end)))),
        } as T;
      }
      if (route === '/work-blocks' && method === 'POST') {
        if (!api.items.some((i) => i.id === b.item_id)) throw notFound();
        const blk = makeBlock(b as Partial<WorkBlock> & { item_id: string });
        api.blocks.push(blk);
        return blk as T;
      }
      if (route.startsWith('/work-blocks/')) {
        const idx = api.blocks.findIndex((x) => x.id === id);
        if (idx < 0) throw notFound();
        if (method === 'PATCH') {
          api.blocks[idx] = { ...api.blocks[idx], ...(b as Partial<WorkBlock>), updated_at: now() };
          return api.blocks[idx] as T;
        }
        if (method === 'DELETE') {
          api.blocks.splice(idx, 1);
          return undefined as T;
        }
        return api.blocks[idx] as T;
      }
      if (route === '/workspace') {
        if (method === 'PUT') api.layout = b.layout as Layout;
        return { layout: api.layout, updated_at: now() } as T;
      }
      throw new Error(`fakeApi: unhandled ${method} ${path}`);
    },
  };
  return api;
}
