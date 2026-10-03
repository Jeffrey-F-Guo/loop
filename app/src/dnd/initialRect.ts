import { toRect, type Rect } from './types';

interface ActiveLike {
  rect: { current: { initial: { top: number; left: number; width: number; height: number } | null } };
  data: { current?: { getRect?: () => Rect } | Record<string, unknown> };
}

/**
 * The dragged element's rect at drag start. dnd-kit only measures `rect.current.initial`
 * in a layout effect after onDragStart fires, so it is usually still null there; fall back
 * to the draggable's own measurement (registered by useTypedDraggable).
 */
export function initialRectOf(active: ActiveLike): Rect | null {
  const measured = active.rect.current.initial;
  if (measured) return toRect(measured);
  const getRect = (active.data.current as { getRect?: () => Rect } | undefined)?.getRect;
  return getRect ? getRect() : null;
}
