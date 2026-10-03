import type { Item } from '../api/types';
import { MINUTES_PER_DAY, SNAP_MINUTES, clamp, minutesSinceMidnight, shiftDays, startOfDayLocal } from './time';

/** Work blocks must lie within [open_at, deadline_at]; missing dates do not constrain (mirrors the API). */
type Dated = Pick<Item, 'open_at' | 'deadline_at'>;

const ceil15 = (m: number) => Math.ceil(m / SNAP_MINUTES) * SNAP_MINUTES;
const floor15 = (m: number) => Math.floor(m / SNAP_MINUTES) * SNAP_MINUTES;

/** Does any part of local `day` fall inside the item's planning range? */
export function dayInWindow(item: Dated, day: Date): boolean {
  const start = startOfDayLocal(day);
  const end = shiftDays(start, 1);
  if (item.open_at && Date.parse(item.open_at) >= end.getTime()) return false;
  if (item.deadline_at && Date.parse(item.deadline_at) <= start.getTime()) return false;
  return true;
}

/**
 * Snap a desired block start (minutes after local midnight of `day`) into the item's range so the
 * whole block fits inside both that day and [open_at, deadline_at]. Null when it cannot fit.
 */
export function constrainStart(item: Dated, day: Date, desiredMinutes: number, durationMinutes: number): number | null {
  if (!dayInWindow(item, day)) return null;
  const start = startOfDayLocal(day);
  const end = shiftDays(start, 1);
  let lo = 0;
  let hi = MINUTES_PER_DAY - durationMinutes;
  if (item.open_at && Date.parse(item.open_at) > start.getTime()) lo = ceil15(minutesSinceMidnight(new Date(item.open_at)));
  if (item.deadline_at && Date.parse(item.deadline_at) < end.getTime()) {
    hi = Math.min(hi, floor15(minutesSinceMidnight(new Date(item.deadline_at)) - durationMinutes));
  }
  if (hi < lo) return null;
  return clamp(desiredMinutes, lo, hi);
}
