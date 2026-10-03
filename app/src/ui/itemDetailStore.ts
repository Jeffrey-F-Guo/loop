import { create } from 'zustand';
import type { Rect } from '../dnd/types';

/**
 * Where the popover was opened from. It decides what "remove" means: a Calendar entry
 * removes just that work block, the Timeline clears the item's dates and blocks, and the
 * task list deletes the item.
 */
export type DetailSource = { from: 'list' } | { from: 'timeline' } | { from: 'calendar'; blockId: string };

interface ItemDetailState {
  itemId: string | null;
  anchor: Rect | null;
  source: DetailSource;
  open: (itemId: string, anchor?: Rect | null, source?: DetailSource) => void;
  close: () => void;
}

export const useItemDetailStore = create<ItemDetailState>((set) => ({
  itemId: null,
  anchor: null,
  source: { from: 'list' },
  open: (itemId, anchor = null, source = { from: 'list' }) => set({ itemId, anchor, source }),
  close: () => set({ itemId: null, anchor: null }),
}));
