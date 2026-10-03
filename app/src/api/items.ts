import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { REVERTED_MESSAGE, showToast } from '../ui/toastStore';
import { useApi } from './ApiProvider';
import { removeBlocksFromCaches, restoreBlocks, snapshotBlocks } from './blockCache';
import { qk } from './keys';
import type { CreateItemInput, Item, ItemsResponse, UpdateItemInput } from './types';

let tempSeq = 0;
export const tempId = (prefix: string) => `tmp-${prefix}-${Date.now().toString(36)}-${++tempSeq}`;
export const isTempId = (id: string) => id.startsWith('tmp-');

export function useItems() {
  const api = useApi();
  return useQuery({
    queryKey: qk.items,
    queryFn: async () => (await api.request<ItemsResponse>('GET', '/items?status=all')).items,
  });
}

export function useItemsById(): Map<string, Item> {
  const { data } = useItems();
  return useMemo(() => new Map((data ?? []).map((i) => [i.id, i])), [data]);
}

export function useCreateItem() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['items', 'create'],
    mutationFn: ({ input }: { tempId: string; input: CreateItemInput }) => api.request<Item>('POST', '/items', input),
    onMutate: async ({ tempId: id, input }) => {
      await qc.cancelQueries({ queryKey: qk.items });
      const ts = new Date().toISOString();
      const temp: Item = {
        id, title: input.title.trim(), description: input.description ?? null, open_at: input.open_at ?? null,
        deadline_at: input.deadline_at ?? null, status: 'active', work_block_count: 0,
        created_at: ts, updated_at: ts, completed_at: null,
      };
      qc.setQueryData<Item[]>(qk.items, (old = []) => [temp, ...old]);
    },
    onSuccess: (item, { tempId: id }) => {
      qc.setQueryData<Item[]>(qk.items, (old = []) =>
        old.some((i) => i.id === id) ? old.map((i) => (i.id === id ? item : i)) : [item, ...old]);
    },
    onError: (_e, { tempId: id, input }) => {
      qc.setQueryData<Item[]>(qk.items, (old = []) => old.filter((i) => i.id !== id));
      showToast(`Couldn't add "${input.title.trim()}"`);
    },
  });
}

export function applyItemPatch(item: Item, patch: UpdateItemInput): Item {
  const next: Item = { ...item, ...patch };
  if (patch.status === 'completed' && item.status !== 'completed') next.completed_at = new Date().toISOString();
  if (patch.status === 'active') next.completed_at = null;
  return next;
}

export function useUpdateItem() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['items', 'update'],
    mutationFn: ({ id, patch }: { id: string; patch: UpdateItemInput }) => api.request<Item>('PATCH', `/items/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.items });
      const prev = qc.getQueryData<Item[]>(qk.items);
      qc.setQueryData<Item[]>(qk.items, (old = []) => old.map((i) => (i.id === id ? applyItemPatch(i, patch) : i)));
      return { prev };
    },
    onSuccess: (item) => qc.setQueryData<Item[]>(qk.items, (old = []) => old.map((i) => (i.id === item.id ? item : i))),
    // Revert only this item: restoring the whole snapshot would undo concurrent changes (e.g. a create that landed meanwhile).
    onError: (_e, { id }, ctx) => {
      const before = ctx?.prev?.find((i) => i.id === id);
      if (before) qc.setQueryData<Item[]>(qk.items, (old = []) => old.map((i) => (i.id === id ? before : i)));
      showToast(REVERTED_MESSAGE);
    },
  });
}

export function useDeleteItem() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['items', 'delete'],
    mutationFn: ({ id }: { id: string }) => api.request<void>('DELETE', `/items/${id}`),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: qk.items });
      const prev = qc.getQueryData<Item[]>(qk.items);
      const blocks = snapshotBlocks(qc);
      qc.setQueryData<Item[]>(qk.items, (old = []) => old.filter((i) => i.id !== id));
      removeBlocksFromCaches(qc, (b) => b.item_id === id);
      return { prev, blocks };
    },
    // Put back only this item, at its old position; other items may have changed meanwhile.
    onError: (_e, { id }, ctx) => {
      const idx = ctx?.prev?.findIndex((i) => i.id === id) ?? -1;
      if (ctx?.prev && idx >= 0) {
        const before = ctx.prev[idx];
        qc.setQueryData<Item[]>(qk.items, (old = []) =>
          old.some((i) => i.id === id) ? old : [...old.slice(0, idx), before, ...old.slice(idx)]);
      }
      if (ctx?.blocks) restoreBlocks(qc, ctx.blocks);
      showToast(REVERTED_MESSAGE);
    },
  });
}
