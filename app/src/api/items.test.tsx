import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeApi, makeBlock, makeItem } from '../test/fakeApi';
import { createWrapper } from '../test/render';
import { REVERTED_MESSAGE, useToastStore } from '../ui/toastStore';
import { qk } from './keys';
import { tempId, useCreateItem, useDeleteItem, useItems, useUpdateItem } from './items';
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
