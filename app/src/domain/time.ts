import { addDays, differenceInCalendarDays, format, parse, startOfDay, startOfWeek } from 'date-fns';

export const SNAP_MINUTES = 15;
export const DEFAULT_BLOCK_MINUTES = 60;
export const MIN_BLOCK_MINUTES = 15;
export const HOUR_PX = 48;
export const MINUTES_PER_DAY = 1440;

export const snapDown15 = (m: number) => Math.floor(m / SNAP_MINUTES) * SNAP_MINUTES;
export const roundTo15 = (m: number) => Math.round(m / SNAP_MINUTES) * SNAP_MINUTES;
export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export const weekStart = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });
export const weekDays = (start: Date) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

export const toDateKey = (d: Date) => format(d, 'yyyy-MM-dd');
export const fromDateKey = (key: string) => parse(key, 'yyyy-MM-dd', new Date());
export const toLocalStamp = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

/** Local wall-clock time `minutes` after midnight of `day` (DST-safe). */
export function atMinutes(day: Date, minutes: number): Date {
  const d = startOfDay(day);
  d.setHours(0, minutes, 0, 0);
  return d;
}

export const minutesSinceMidnight = (d: Date) => d.getHours() * 60 + d.getMinutes();
export const startOfDayLocal = (d: Date) => startOfDay(d);
export function endOfDayLocal(d: Date): Date {
  const e = startOfDay(d);
  e.setHours(23, 59, 0, 0);
  return e;
}

/** Shift by whole calendar days, keeping wall-clock time. */
export const shiftDays = (d: Date, n: number) => addDays(d, n);
/** Calendar days from `a` to `b` (positive when b is later). */
export const daysBetween = (a: Date, b: Date) => differenceInCalendarDays(b, a);
