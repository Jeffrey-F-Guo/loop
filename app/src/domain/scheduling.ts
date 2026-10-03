import type { DropboxFilter, Item } from '../api/types';

export const isScheduled = (item: Item) => item.work_block_count > 0;

export const DROPBOX_FILTER_LABELS: Record<DropboxFilter, string> = {
  all: 'All',
  unscheduled: 'Unscheduled',
  scheduled: 'Scheduled',
  completed: 'Completed',
};

/** Client-side Dropbox query (FUNCTIONAL_SPEC §6). Preserves input order. */
export function filterItems(items: Item[], filter: DropboxFilter): Item[] {
  switch (filter) {
    case 'all':
      return items.filter((i) => i.status === 'active');
    case 'scheduled':
      return items.filter((i) => i.status === 'active' && isScheduled(i));
    case 'unscheduled':
      return items.filter((i) => i.status === 'active' && !isScheduled(i));
    case 'completed':
      return items.filter((i) => i.status === 'completed');
  }
}
