import type { Item, UpdateItemInput, WorkBlock } from '../api/types';
import { daysBetween, endOfDayLocal, shiftDays, startOfDayLocal } from './time';

export type TimelineShape = 'range' | 'deadline-marker' | 'hidden';
type Dated = Pick<Item, 'open_at' | 'deadline_at'>;

const iso = (d: Date) => d.toISOString();
const date = (s: string) => new Date(s);

export function timelineShape(item: Dated): TimelineShape {
  if (item.open_at && item.deadline_at) return 'range';
  if (item.deadline_at) return 'deadline-marker';
  return 'hidden';
}

type Span = Pick<WorkBlock, 'start_at' | 'end_at'>;

/** Left-edge drag. Never moves open_at past the deadline's day or past the earliest scheduled block. */
export function setOpenDay(item: Dated, day: Date, blocks: Span[] = []): UpdateItemInput {
  let open = startOfDayLocal(day);
  if (item.deadline_at) {
    const deadlineDay = startOfDayLocal(date(item.deadline_at));
    if (open > deadlineDay) open = deadlineDay;
  }
  for (const b of blocks) {
    const blockDay = startOfDayLocal(date(b.start_at));
    if (open > blockDay) open = blockDay;
  }
  return { open_at: iso(open) };
}

/** Right-edge drag. Never moves deadline_at before the open day or before the latest scheduled block. */
export function setDeadlineDay(item: Dated, day: Date, blocks: Span[] = []): UpdateItemInput {
  let lastDay = startOfDayLocal(day);
  if (item.open_at) {
    const openDay = startOfDayLocal(date(item.open_at));
    if (lastDay < openDay) lastDay = openDay;
  }
  for (const b of blocks) {
    const blockDay = startOfDayLocal(date(b.end_at)); // a block ending at 00:00 needs that day too
    if (lastDay < blockDay) lastDay = blockDay;
  }
  return { deadline_at: iso(endOfDayLocal(lastDay)) };
}

export function shiftItemDays(item: Dated, n: number): UpdateItemInput {
  if (n === 0) return {};
  const patch: UpdateItemInput = {};
  if (item.open_at) patch.open_at = iso(shiftDays(date(item.open_at), n));
  if (item.deadline_at) patch.deadline_at = iso(shiftDays(date(item.deadline_at), n));
  return patch;
}

/** Dropbox → Timeline drop (spec §6.5). */
export function placeOnDay(item: Dated, day: Date): UpdateItemInput {
  const oneDay = { open_at: iso(startOfDayLocal(day)), deadline_at: iso(endOfDayLocal(day)) };
  if (item.open_at && item.deadline_at) {
    return shiftItemDays(item, daysBetween(startOfDayLocal(date(item.open_at)), startOfDayLocal(day)));
  }
  if (item.deadline_at) {
    const deadlineDay = startOfDayLocal(date(item.deadline_at));
    return startOfDayLocal(day) <= deadlineDay ? { open_at: oneDay.open_at } : oneDay;
  }
  return oneDay;
}
