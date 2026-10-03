import { create } from 'zustand';
import type { Rect } from '../dnd/types';

interface ItemDetailState {
  itemId: string | null;
  anchor: Rect | null;
  open: (itemId: string, anchor?: Rect | null) => void;
  close: () => void;
}

export const useItemDetailStore = create<ItemDetailState>((set) => ({
  itemId: null,
  anchor: null,
  open: (itemId, anchor = null) => set({ itemId, anchor }),
  close: () => set({ itemId: null, anchor: null }),
}));
