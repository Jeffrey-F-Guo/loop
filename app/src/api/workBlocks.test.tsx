import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFakeApi, makeBlock, makeItem } from '../test/fakeApi';
import { createWrapper } from '../test/render';
import { qk } from './keys';
import { tempId, useItems } from './items';
import { useCreateWorkBlock, useDeleteWorkBlock, useUpdateWorkBlock, useWorkBlocks } from './workBlocks';
import type { Item, WorkBlock } from './types';

const week1 = { start: new Date('2026-10-05T07:00:00Z'), end: new Date('2026-10-12T07:00:00Z') };
const week2 = { start: new Date('2026-10-12T07:00:00Z'), end: new Date('2026-10-19T07:00:00Z') };

describe('work block hooks', () => {
  it('creating a block shows it and bumps the item count before the server answers', async () => {
    const api = createFakeApi({ items: [makeItem({ id: 'i1' })] });
    const { wrapper, qc } = createWrapper(api);
    const { result } = renderHook(() => ({ items: useItems(), blocks: useWorkBlocks(week1), create: useCreateWorkBlock() }), { wrapper });
    await waitFor(() => expect(result.current.blocks.isSuccess && result.current.items.isSuccess).toBe(true));

    const release = api.hold();
    await act(async () => result.current.create.mutate({
      tempId: tempId('b'),
      input: { item_id: 'i1', start_at: '2026-10-07T02:00:00.000Z', end_at: '2026-10-07T03:00:00.000Z' },
    }));
    // Still held: the server has not answered, so this is the optimistic state.
    // TanStack Query notifies observers on setTimeout(0), hence waitFor for the rendered value.
    await waitFor(() => expect(result.current.blocks.data).toHaveLength(1));
    expect(qc.getQueryData<Item[]>(qk.items)![0].work_block_count).toBe(1);
    release();
    await waitFor(() => expect(result.current.blocks.data![0].id.startsWith('tmp-')).toBe(false));
  });

  it('a failed create removes the block and restores the count', async () => {
    const api = createFakeApi({ items: [makeItem({ id: 'i1' })] });
    const { wrapper, qc } = createWrapper(api);
    const { result } = renderHook(() => ({ items: useItems(), blocks: useWorkBlocks(week1), create: useCreateWorkBlock() }), { wrapper });
    await waitFor(() => expect(result.current.blocks.isSuccess && result.current.items.isSuccess).toBe(true));
    api.failNext();
    await act(async () => result.current.create.mutate({
      tempId: tempId('b'),
      input: { item_id: 'i1', start_at: '2026-10-07T02:00:00.000Z', end_at: '2026-10-07T03:00:00.000Z' },
    }));
    await waitFor(() => expect(result.current.blocks.data).toHaveLength(0));
    expect(qc.getQueryData<Item[]>(qk.items)![0].work_block_count).toBe(0);
    expect(qc.getQueryData<Item[]>(qk.items)![0].scheduled_minutes).toBe(0);
  });

  it("the item's scheduled time follows creates, resizes and deletes immediately", async () => {
    const api = createFakeApi({
      items: [makeItem({ id: 'i1' })],
      blocks: [makeBlock({ id: 'b1', item_id: 'i1', start_at: '2026-10-07T02:00:00.000Z', end_at: '2026-10-07T03:00:00.000Z' })],
    });
    const { wrapper, qc } = createWrapper(api);
    const { result } = renderHook(() => ({
      items: useItems(), blocks: useWorkBlocks(week1),
      create: useCreateWorkBlock(), update: useUpdateWorkBlock(), del: useDeleteWorkBlock(),
    }), { wrapper });
    await waitFor(() => expect(result.current.blocks.isSuccess && result.current.items.isSuccess).toBe(true));
    const minutes = () => qc.getQueryData<Item[]>(qk.items)![0].scheduled_minutes;
    expect(minutes()).toBe(60);

    const release = api.hold();
    await act(async () => result.current.create.mutate({
      tempId: tempId('b'),
      input: { item_id: 'i1', start_at: '2026-10-08T02:00:00.000Z', end_at: '2026-10-08T02:30:00.000Z' },
    }));
    expect(minutes()).toBe(90);
    await act(async () => result.current.update.mutate({ id: 'b1', patch: { end_at: '2026-10-07T04:30:00.000Z' } }));
    expect(minutes()).toBe(180);
    await act(async () => result.current.del.mutate({ id: 'b1' }));
    expect(minutes()).toBe(30);
    release();
  });

  it('a failed resize puts the scheduled time back', async () => {
    const api = createFakeApi({
      items: [makeItem({ id: 'i1' })],
      blocks: [makeBlock({ id: 'b1', item_id: 'i1', start_at: '2026-10-07T02:00:00.000Z', end_at: '2026-10-07T03:00:00.000Z' })],
    });
    const { wrapper, qc } = createWrapper(api);
    const { result } = renderHook(() => ({ items: useItems(), blocks: useWorkBlocks(week1), update: useUpdateWorkBlock() }), { wrapper });
    await waitFor(() => expect(result.current.blocks.isSuccess && result.current.items.isSuccess).toBe(true));
    api.failNext();
    await act(async () => result.current.update.mutate({ id: 'b1', patch: { end_at: '2026-10-07T04:00:00.000Z' } }));
    await waitFor(() => expect(result.current.update.isError).toBe(true));
    expect(qc.getQueryData<Item[]>(qk.items)![0].scheduled_minutes).toBe(60);
  });

  it('moving a block across weeks moves it between cached ranges', async () => {
    const api = createFakeApi({
      items: [makeItem({ id: 'i1' })],
      blocks: [makeBlock({ id: 'b1', item_id: 'i1', start_at: '2026-10-07T02:00:00.000Z', end_at: '2026-10-07T03:00:00.000Z' })],
    });
    const { wrapper, qc } = createWrapper(api);
    const { result } = renderHook(() => ({ w1: useWorkBlocks(week1), w2: useWorkBlocks(week2), update: useUpdateWorkBlock() }), { wrapper });
    await waitFor(() => expect(result.current.w1.data).toHaveLength(1));
    await waitFor(() => expect(result.current.w2.isSuccess).toBe(true));

    await act(async () => result.current.update.mutate({ id: 'b1', patch: { start_at: '2026-10-14T02:00:00.000Z', end_at: '2026-10-14T03:00:00.000Z' } }));
    expect(qc.getQueryData<WorkBlock[]>(qk.workBlocksRange(week1.start.toISOString(), week1.end.toISOString()))).toHaveLength(0);
    expect(qc.getQueryData<WorkBlock[]>(qk.workBlocksRange(week2.start.toISOString(), week2.end.toISOString()))).toHaveLength(1);
  });
});
