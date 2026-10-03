import type { Item, WorkBlock } from '../api/types';
import {
  DEFAULT_BLOCK_MINUTES, HOUR_PX, MINUTES_PER_DAY, atMinutes, clamp, fromDateKey, roundTo15, snapDown15,
} from '../domain/time';
import { placeOnDay, shiftItemDays } from '../domain/timeline';
import { ACCEPTS, type DragPayload, type DropAction, type DropData, type Point, type Rect } from './types';

export interface DropContext {
  pointerStart: Point;
  pointerEnd: Point;
  dropRect: Rect;
  activeInitialRect: Rect | null;
  items: Map<string, Item>;
  blocks: Map<string, WorkBlock>;
}

const NONE: DropAction = { type: 'none' };
const pxToMinutes = (px: number) => (px / HOUR_PX) * 60;
const iso = (d: Date) => d.toISOString();
const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

/** The one place that decides what a drop means (FUNCTIONAL_SPEC §12, FEATURE_DESIGN §18). */
export function planDrop(payload: DragPayload, drop: DropData, ctx: DropContext): DropAction {
  if (!ACCEPTS[drop.kind].includes(payload.kind)) return NONE;

  if (drop.kind === 'panelZone') {
    if (payload.kind !== 'panel' || payload.viewId === drop.viewId) return NONE;
    return { type: 'dock', viewId: payload.viewId, targetViewId: drop.viewId, edge: drop.edge };
  }

  const day = fromDateKey(drop.date);
  const pointerMinutes = pxToMinutes(ctx.pointerEnd.y - ctx.dropRect.top);

  if (drop.kind === 'calendarDay') {
    if (payload.kind === 'item' || payload.kind === 'timelineBar') {
      if (!ctx.items.has(payload.itemId)) return NONE;
      const minutes = clamp(snapDown15(pointerMinutes), 0, MINUTES_PER_DAY - DEFAULT_BLOCK_MINUTES);
      const start = atMinutes(day, minutes);
      return { type: 'createBlock', itemId: payload.itemId, startAt: iso(start), endAt: iso(addMinutes(start, DEFAULT_BLOCK_MINUTES)) };
    }
    if (payload.kind === 'workBlock') {
      const block = ctx.blocks.get(payload.blockId);
      if (!block) return NONE;
      const duration = Math.round((Date.parse(block.end_at) - Date.parse(block.start_at)) / 60_000);
      const grab = ctx.activeInitialRect ? pxToMinutes(ctx.pointerStart.y - ctx.activeInitialRect.top) : 0;
      const minutes = clamp(roundTo15(pointerMinutes - grab), 0, Math.max(0, MINUTES_PER_DAY - duration));
      const start = atMinutes(day, minutes);
      return { type: 'moveBlock', blockId: block.id, startAt: iso(start), endAt: iso(addMinutes(start, duration)) };
    }
    return NONE;
  }

  // timelineDay
  if (payload.kind === 'item' || payload.kind === 'timelineBar') {
    const item = ctx.items.get(payload.itemId);
    if (!item) return NONE;
    if (payload.kind === 'item') return { type: 'updateItem', itemId: item.id, patch: placeOnDay(item, day) };
    const days = Math.round((ctx.pointerEnd.x - ctx.pointerStart.x) / ctx.dropRect.width);
    const patch = shiftItemDays(item, days);
    return Object.keys(patch).length ? { type: 'updateItem', itemId: item.id, patch } : NONE;
  }
  return NONE;
}
