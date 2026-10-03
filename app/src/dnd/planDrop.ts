import type { Item, WorkBlock } from '../api/types';
import { constrainStart } from '../domain/range';
import {
  DEFAULT_BLOCK_MINUTES, HOUR_PX, MINUTES_PER_DAY, atMinutes, daysBetween, fromDateKey, roundTo15, snapDown15, startOfDayLocal,
} from '../domain/time';
import { placeOnDay } from '../domain/timeline';
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
const UNDATED = { open_at: null, deadline_at: null };
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
    // Blocks must fit inside the item's [open_at, deadline_at]; outside days get no action (and no preview).
    if (payload.kind === 'item' || payload.kind === 'timelineBar') {
      const item = ctx.items.get(payload.itemId);
      if (!item) return NONE;
      const minutes = constrainStart(item, day, snapDown15(pointerMinutes), DEFAULT_BLOCK_MINUTES);
      if (minutes === null) return NONE;
      const start = atMinutes(day, minutes);
      return { type: 'createBlock', itemId: payload.itemId, startAt: iso(start), endAt: iso(addMinutes(start, DEFAULT_BLOCK_MINUTES)) };
    }
    if (payload.kind === 'workBlock') {
      const block = ctx.blocks.get(payload.blockId);
      if (!block) return NONE;
      const duration = Math.round((Date.parse(block.end_at) - Date.parse(block.start_at)) / 60_000);
      const grab = ctx.activeInitialRect ? pxToMinutes(ctx.pointerStart.y - ctx.activeInitialRect.top) : 0;
      const item = ctx.items.get(block.item_id) ?? UNDATED;
      const minutes = constrainStart(item, day, roundTo15(pointerMinutes - grab), Math.min(duration, MINUTES_PER_DAY));
      if (minutes === null) return NONE;
      const start = atMinutes(day, minutes);
      return { type: 'moveBlock', blockId: block.id, startAt: iso(start), endAt: iso(addMinutes(start, duration)) };
    }
    return NONE;
  }

  // timelineDay: moving a dated range moves its work blocks too (shiftItem).
  if (payload.kind === 'item' || payload.kind === 'timelineBar') {
    const item = ctx.items.get(payload.itemId);
    if (!item) return NONE;
    const days = payload.kind === 'timelineBar'
      ? Math.round((ctx.pointerEnd.x - ctx.pointerStart.x) / ctx.dropRect.width)
      : item.open_at && item.deadline_at ? daysBetween(startOfDayLocal(new Date(item.open_at)), day) : null;
    if (days === null) return { type: 'updateItem', itemId: item.id, patch: placeOnDay(item, day) };
    return days ? { type: 'shiftItem', itemId: item.id, days } : NONE;
  }
  return NONE;
}
