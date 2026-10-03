import { useQueryClient } from '@tanstack/react-query';
import { collectBlocks } from '../api/blockCache';
import { useItemsById } from '../api/items';
import { useDragStore } from './dragStore';
import { planDrop } from './planDrop';
import type { DropAction, DropData, Rect } from './types';

/** What releasing here would do right now; null when nothing is hovering this target. */
export function usePreviewAction(drop: DropData, isOver: boolean, getRect: () => Rect): DropAction | null {
  const qc = useQueryClient();
  const items = useItemsById();
  const payload = useDragStore((s) => s.payload);
  const pointer = useDragStore((s) => (isOver ? s.pointer : null));
  const pointerStart = useDragStore((s) => s.pointerStart);
  const activeInitialRect = useDragStore((s) => s.activeInitialRect);
  if (!isOver || !payload || !pointer) return null;
  return planDrop(payload, drop, {
    pointerStart, pointerEnd: pointer, dropRect: getRect(), activeInitialRect, items, blocks: collectBlocks(qc),
  });
}
