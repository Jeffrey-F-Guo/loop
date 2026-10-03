import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { REVERTED_MESSAGE, showToast } from '../ui/toastStore';
import { useApi } from './ApiProvider';
import { collectBlocks, removeBlocksFromCaches, restoreBlocks, snapshotBlocks, upsertBlockInCaches } from './blockCache';
import type { ApiClient } from './client';
import { qk } from './keys';
import type { CreateWorkBlockInput, Item, UpdateWorkBlockInput, WorkBlock, WorkBlocksResponse } from './types';

export function useWorkBlocks({ start, end }: { start: Date; end: Date }) {
  const api = useApi();
  const s = start.toISOString();
  const e = end.toISOString();
  return useQuery({
    queryKey: qk.workBlocksRange(s, e),
    queryFn: async () =>
      (await api.request<WorkBlocksResponse>('GET', `/work-blocks?start=${encodeURIComponent(s)}&end=${encodeURIComponent(e)}`)).work_blocks,
  });
}

/** All of one item's work blocks (any week). Shared by the item popover and Timeline edge drags. */
export const itemBlocksQuery = (api: ApiClient, itemId: string) => ({
  queryKey: qk.workBlocksItem(itemId),
  queryFn: async () => (await api.request<WorkBlocksResponse>('GET', `/work-blocks?item_id=${itemId}`)).work_blocks,
});

export function useItemWorkBlocks(itemId: string | null) {
  const api = useApi();
  return useQuery({ ...itemBlocksQuery(api, itemId ?? ''), enabled: !!itemId && !itemId.startsWith('tmp-') });
}

const minutesOf = (b: { start_at: string; end_at: string }) => Math.round((Date.parse(b.end_at) - Date.parse(b.start_at)) / 60_000);

/** Keeps an item's block count and scheduled time in step with an optimistic block change. */
function adjustItem(qc: ReturnType<typeof useQueryClient>, itemId: string, count: number, minutes: number) {
  qc.setQueryData<Item[]>(qk.items, (old) =>
    old?.map((i) => (i.id === itemId
      ? { ...i, work_block_count: Math.max(0, i.work_block_count + count), scheduled_minutes: Math.max(0, i.scheduled_minutes + minutes) }
      : i)));
}

export function useCreateWorkBlock() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input }: { tempId: string; input: CreateWorkBlockInput }) => api.request<WorkBlock>('POST', '/work-blocks', input),
    onMutate: async ({ tempId, input }) => {
      await qc.cancelQueries({ queryKey: qk.workBlocks });
      const snap = snapshotBlocks(qc);
      const prevItems = qc.getQueryData<Item[]>(qk.items);
      const ts = new Date().toISOString();
      upsertBlockInCaches(qc, { id: tempId, ...input, created_at: ts, updated_at: ts });
      adjustItem(qc, input.item_id, +1, minutesOf(input));
      return { snap, prevItems };
    },
    onSuccess: (block, { tempId }) => upsertBlockInCaches(qc, block, tempId),
    onError: (_e, _v, ctx) => {
      if (ctx) {
        restoreBlocks(qc, ctx.snap);
        if (ctx.prevItems) qc.setQueryData(qk.items, ctx.prevItems);
      }
      showToast(REVERTED_MESSAGE);
    },
  });
}

export function useUpdateWorkBlock() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateWorkBlockInput }) => api.request<WorkBlock>('PATCH', `/work-blocks/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.workBlocks });
      const snap = snapshotBlocks(qc);
      const cur = collectBlocks(qc).get(id);
      let resized: { itemId: string; minutes: number } | null = null;
      if (cur) {
        const next = { ...cur, ...patch };
        upsertBlockInCaches(qc, next);
        resized = { itemId: cur.item_id, minutes: minutesOf(next) - minutesOf(cur) };
        if (resized.minutes) adjustItem(qc, resized.itemId, 0, resized.minutes);
      }
      return { snap, resized };
    },
    onSuccess: (block) => upsertBlockInCaches(qc, block),
    onError: (_e, _v, ctx) => {
      if (ctx) restoreBlocks(qc, ctx.snap);
      if (ctx?.resized?.minutes) adjustItem(qc, ctx.resized.itemId, 0, -ctx.resized.minutes);
      showToast(REVERTED_MESSAGE);
    },
  });
}

export function useDeleteWorkBlock() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => api.request<void>('DELETE', `/work-blocks/${id}`),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: qk.workBlocks });
      const snap = snapshotBlocks(qc);
      const prevItems = qc.getQueryData<Item[]>(qk.items);
      const cur = collectBlocks(qc).get(id);
      removeBlocksFromCaches(qc, (b) => b.id === id);
      if (cur) adjustItem(qc, cur.item_id, -1, -minutesOf(cur));
      return { snap, prevItems };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) {
        restoreBlocks(qc, ctx.snap);
        if (ctx.prevItems) qc.setQueryData(qk.items, ctx.prevItems);
      }
      showToast(REVERTED_MESSAGE);
    },
  });
}
