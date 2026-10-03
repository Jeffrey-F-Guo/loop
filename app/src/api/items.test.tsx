import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeApi, makeBlock, makeItem } from '../test/fakeApi';
import { createWrapper } from '../test/render';
import { REVERTED_MESSAGE, useToastStore } from '../ui/toastStore';
import { qk } from './keys';
import { tempId, useCreateItem, useDeleteItem, useItems, useShiftItem, useUnscheduleItem, useUpdateItem } from './items';
import { useWorkBlocks } from './workBlocks';
import type { Item, WorkBlock } from './types';

beforeEach(() => useToastStore.setState({ toasts: [] }));

describe('items hooks', () => {
  it('rapid captures appear immediately, in order, and none are lost', async () => {
    const { wrapper, qc, api } = createWrapper();
    const { result } = renderHook(() => ({ items: useItems(), create: useCreateItem() }), { wrapper });
    await waitFor(() => expect(result.current.items.isSuccess).toBe(true));

    const release = api.hold();
    await act(async () => {
      for (const title of ['A', 'B', 'C']) result.current.create.mutate({ tempId: tempId('i'), input: { title } });
    });
    expect(qc.getQueryData<Item[]>(qk.items)!.map((i) => i.title)).toEqual(['C', 'B', 'A']);

    release();
    await waitFor(() => expect(api.items).toHaveLength(3));
    await waitFor(() => {
      const items = qc.getQueryData<Item[]>(qk.items)!;
      expect(items.map((i) => i.title)).toEqual(['C', 'B', 'A']);
      expect(items.every((i) => !i.id.startsWith('tmp-'))).toBe(true);
    });
  });

  it('a failed update reverts and shows a toast', async () => {
    const api = createFakeApi({ items: [makeItem({ id: 'i1', title: 'Physics HW' })] });
    const { wrapper, qc } = createWrapper(api);
    const { result } = renderHook(() => ({ items: useItems(), update: useUpdateItem() }), { wrapper });
    await waitFor(() => expect(result.current.items.isSuccess).toBe(true));

    api.failNext((m) => m === 'PATCH');
    const release = api.hold();
    await act(async () => result.current.update.mutate({ id: 'i1', patch: { title: 'Physics Assignment' } }));
    expect(qc.getQueryData<Item[]>(qk.items)![0].title).toBe('Physics Assignment');
    release();
    await waitFor(() => expect(qc.getQueryData<Item[]>(qk.items)![0].title).toBe('Physics HW'));
    expect(useToastStore.getState().toasts.map((t) => t.message)).toContain(REVERTED_MESSAGE);
  });

  it('a failed update reverts only that item, keeping a create that succeeded meanwhile', async () => {
    const api = createFakeApi({ items: [makeItem({ id: 'b', title: 'B' })] });
    const { wrapper, qc } = createWrapper(api);
    const { result } = renderHook(() => ({ items: useItems(), create: useCreateItem(), update: useUpdateItem() }), { wrapper });
    await waitFor(() => expect(result.current.items.isSuccess).toBe(true));

    api.failNext((m) => m === 'PATCH');
    const release = api.hold();
    await act(async () => {
      result.current.create.mutate({ tempId: tempId('i'), input: { title: 'A' } });
      result.current.update.mutate({ id: 'b', patch: { title: 'B2' } });
    });
    release(); // POST settles first (succeeds), then PATCH fails
    await waitFor(() => expect(useToastStore.getState().toasts.map((t) => t.message)).toContain(REVERTED_MESSAGE));
    const items = qc.getQueryData<Item[]>(qk.items)!;
    expect(items.map((i) => i.title)).toEqual(['A', 'B']);
    expect(items.every((i) => !i.id.startsWith('tmp-'))).toBe(true);
  });

  it('a failed delete puts back only that item, keeping a create that succeeded meanwhile', async () => {
    const api = createFakeApi({ items: [makeItem({ id: 'b', title: 'B' })] });
    const { wrapper, qc } = createWrapper(api);
    const { result } = renderHook(() => ({ items: useItems(), create: useCreateItem(), del: useDeleteItem() }), { wrapper });
    await waitFor(() => expect(result.current.items.isSuccess).toBe(true));

    api.failNext((m) => m === 'DELETE');
    const release = api.hold();
    await act(async () => {
      result.current.create.mutate({ tempId: tempId('i'), input: { title: 'A' } });
      result.current.del.mutate({ id: 'b' });
    });
    release();
    await waitFor(() => expect(useToastStore.getState().toasts.map((t) => t.message)).toContain(REVERTED_MESSAGE));
    const items = qc.getQueryData<Item[]>(qk.items)!;
    expect(items.map((i) => i.title)).toEqual(['A', 'B']);
    expect(items.every((i) => !i.id.startsWith('tmp-'))).toBe(true);
  });

  it('completing an item sets status and completed_at optimistically', async () => {
    const api = createFakeApi({ items: [makeItem({ id: 'i1' })] });
    const { wrapper, qc } = createWrapper(api);
    const { result } = renderHook(() => ({ items: useItems(), update: useUpdateItem() }), { wrapper });
    await waitFor(() => expect(result.current.items.isSuccess).toBe(true));
    const release = api.hold();
    await act(async () => result.current.update.mutate({ id: 'i1', patch: { status: 'completed' } }));
    const it = qc.getQueryData<Item[]>(qk.items)![0];
    expect(it.status).toBe('completed');
    expect(it.completed_at).not.toBeNull();
    release();
  });

  it('deleting an item removes its blocks from every calendar cache immediately', async () => {
    const item = makeItem({ id: 'i1' });
    const api = createFakeApi({ items: [item], blocks: [makeBlock({ id: 'b1', item_id: 'i1' })] });
    const { wrapper, qc } = createWrapper(api);
    const range = { start: new Date('2026-10-05T07:00:00Z'), end: new Date('2026-10-12T07:00:00Z') };
    const { result } = renderHook(() => ({ items: useItems(), blocks: useWorkBlocks(range), del: useDeleteItem() }), { wrapper });
    await waitFor(() => expect(result.current.blocks.data).toHaveLength(1));

    const release = api.hold();
    await act(async () => result.current.del.mutate({ id: 'i1' }));
    expect(qc.getQueryData<Item[]>(qk.items)).toEqual([]);
    const blockCaches = qc.getQueriesData<WorkBlock[]>({ queryKey: qk.workBlocks });
    expect(blockCaches.every(([, data]) => !data || data.length === 0)).toBe(true);
    release();
    await waitFor(() => expect(api.items).toHaveLength(0));
  });
});

describe('useUnscheduleItem (removing from the Timeline)', () => {
  const seed = () => createFakeApi({
    items: [makeItem({ id: 'i1', open_at: '2026-10-05T07:00:00.000Z', deadline_at: '2026-10-10T06:59:00.000Z' }), makeItem({ id: 'i2' })],
    blocks: [makeBlock({ id: 'b1', item_id: 'i1' }), makeBlock({ id: 'b2', item_id: 'i2' })],
  });
  const range = { start: new Date('2026-10-05T07:00:00Z'), end: new Date('2026-10-12T07:00:00Z') };

  it("clears the dates and every calendar entry, keeping the item, before the server answers", async () => {
    const api = seed();
    const { wrapper, qc } = createWrapper(api);
    const { result } = renderHook(() => ({ items: useItems(), blocks: useWorkBlocks(range), un: useUnscheduleItem() }), { wrapper });
    await waitFor(() => expect(result.current.blocks.data).toHaveLength(2));

    const release = api.hold();
    await act(async () => result.current.un.mutate({ id: 'i1' }));
    const it = qc.getQueryData<Item[]>(qk.items)!.find((i) => i.id === 'i1')!;
    expect(it).toMatchObject({ open_at: null, deadline_at: null, work_block_count: 0, scheduled_minutes: 0 });
    await waitFor(() => expect(result.current.blocks.data!.map((b) => b.id)).toEqual(['b2']));
    release();
    await waitFor(() => expect(api.blocks.map((b) => b.id)).toEqual(['b2']));
    expect(api.calls.at(-1)).toMatchObject({ method: 'POST', path: '/items/i1/unschedule' });
    expect(api.items).toHaveLength(2);
  });

  it('a failed unschedule puts the dates and the blocks back', async () => {
    const api = seed();
    const { wrapper, qc } = createWrapper(api);
    const { result } = renderHook(() => ({ items: useItems(), blocks: useWorkBlocks(range), un: useUnscheduleItem() }), { wrapper });
    await waitFor(() => expect(result.current.blocks.data).toHaveLength(2));
    api.failNext();
    await act(async () => result.current.un.mutate({ id: 'i1' }));
    await waitFor(() => expect(useToastStore.getState().toasts.map((t) => t.message)).toContain(REVERTED_MESSAGE));
    expect(qc.getQueryData<Item[]>(qk.items)!.find((i) => i.id === 'i1')!.open_at).toBe('2026-10-05T07:00:00.000Z');
    await waitFor(() => expect(result.current.blocks.data!.map((b) => b.id).sort()).toEqual(['b1', 'b2']));
  });
});

describe('useShiftItem (moving a Timeline bar)', () => {
  const local = (d: number, h = 0, m = 0) => new Date(2026, 9, d, h, m).toISOString();
  const week = { start: new Date(2026, 9, 5), end: new Date(2026, 9, 12) };
  const seed = () => createFakeApi({
    items: [makeItem({ id: 'i1', open_at: local(5), deadline_at: local(9, 23, 59) })],
    blocks: [makeBlock({ id: 'b1', item_id: 'i1', start_at: local(6, 19), end_at: local(6, 20) })],
  });
  const blockIn = (qc: ReturnType<typeof createWrapper>['qc']) =>
    qc.getQueryData<WorkBlock[]>(qk.workBlocksRange(week.start.toISOString(), week.end.toISOString()))!.find((b) => b.id === 'b1')!;

  it('moves the dates and the scheduled blocks together, before the server answers', async () => {
    const api = seed();
    const { wrapper, qc } = createWrapper(api);
    const { result } = renderHook(() => ({ items: useItems(), blocks: useWorkBlocks(week), shift: useShiftItem() }), { wrapper });
    await waitFor(() => expect(result.current.items.isSuccess && result.current.blocks.isSuccess).toBe(true));

    const release = api.hold();
    await act(async () => result.current.shift.mutate({ id: 'i1', days: 2 }));
    const it = qc.getQueryData<Item[]>(qk.items)![0];
    expect([it.open_at, it.deadline_at]).toEqual([local(7), local(11, 23, 59)]);
    expect([blockIn(qc).start_at, blockIn(qc).end_at]).toEqual([local(8, 19), local(8, 20)]);
    release();
    await waitFor(() => expect(api.calls.at(-1)).toMatchObject({
      method: 'PATCH', path: '/items/i1', body: { shift_days: 2, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    }));
    await waitFor(() => expect(api.blocks[0].start_at).toBe(local(8, 19)));
  });

  it('a failed shift puts the dates and the blocks back', async () => {
    const api = seed();
    const { wrapper, qc } = createWrapper(api);
    const { result } = renderHook(() => ({ items: useItems(), blocks: useWorkBlocks(week), shift: useShiftItem() }), { wrapper });
    await waitFor(() => expect(result.current.items.isSuccess && result.current.blocks.isSuccess).toBe(true));
    api.failNext((m) => m === 'PATCH');
    await act(async () => result.current.shift.mutate({ id: 'i1', days: 2 }));
    await waitFor(() => expect(useToastStore.getState().toasts.map((t) => t.message)).toContain(REVERTED_MESSAGE));
    expect(qc.getQueryData<Item[]>(qk.items)![0].open_at).toBe(local(5));
    expect(blockIn(qc).start_at).toBe(local(6, 19));
  });
});
