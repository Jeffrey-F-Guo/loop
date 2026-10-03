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

function bumpCount(qc: ReturnType<typeof useQueryClient>, itemId: string, delta: number) {
  qc.setQueryData<Item[]>(qk.items, (old) =>
    old?.map((i) => (i.id === itemId ? { ...i, work_block_count: Math.max(0, i.work_block_count + delta) } : i)));
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
      bumpCount(qc, input.item_id, +1);
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
      if (cur) upsertBlockInCaches(qc, { ...cur, ...patch });
      return { snap };
    },
    onSuccess: (block) => upsertBlockInCaches(qc, block),
    onError: (_e, _v, ctx) => {
      if (ctx) restoreBlocks(qc, ctx.snap);
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
      if (cur) bumpCount(qc, cur.item_id, -1);
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
