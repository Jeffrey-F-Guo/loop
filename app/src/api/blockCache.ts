import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { qk } from './keys';
import type { WorkBlock } from './types';

type Snapshot = [QueryKey, WorkBlock[] | undefined][];

function belongs(key: QueryKey, block: WorkBlock): boolean {
  if (key[1] === 'item') return key[2] === block.item_id;
  if (key[1] === 'range') {
    return Date.parse(block.start_at) < Date.parse(key[3] as string) && Date.parse(block.end_at) > Date.parse(key[2] as string);
  }
  return false;
}

const byStart = (a: WorkBlock, b: WorkBlock) => Date.parse(a.start_at) - Date.parse(b.start_at);

/** Insert or move `block` in every cached work-block list it belongs to (by range or item). */
export function upsertBlockInCaches(qc: QueryClient, block: WorkBlock, replaceId: string = block.id) {
  for (const [key, data] of qc.getQueriesData<WorkBlock[]>({ queryKey: qk.workBlocks })) {
    if (!data) continue;
    const rest = data.filter((b) => b.id !== replaceId && b.id !== block.id);
    qc.setQueryData<WorkBlock[]>(key, belongs(key, block) ? [...rest, block].sort(byStart) : rest);
  }
}

export function removeBlocksFromCaches(qc: QueryClient, pred: (b: WorkBlock) => boolean) {
  for (const [key, data] of qc.getQueriesData<WorkBlock[]>({ queryKey: qk.workBlocks })) {
    if (data) qc.setQueryData<WorkBlock[]>(key, data.filter((b) => !pred(b)));
  }
}

export const snapshotBlocks = (qc: QueryClient): Snapshot => qc.getQueriesData<WorkBlock[]>({ queryKey: qk.workBlocks });

export function restoreBlocks(qc: QueryClient, snap: Snapshot) {
  for (const [key, data] of snap) qc.setQueryData(key, data);
}

export function collectBlocks(qc: QueryClient): Map<string, WorkBlock> {
  const out = new Map<string, WorkBlock>();
  for (const [, data] of qc.getQueriesData<WorkBlock[]>({ queryKey: qk.workBlocks })) data?.forEach((b) => out.set(b.id, b));
  return out;
}
