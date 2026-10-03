import { describe, expect, it } from 'vitest';
import type { Item } from '../api/types';
import { constrainStart, dayInWindow } from './range';
import { fromDateKey } from './time';

const local = (d: number, h = 0, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const item = (over: Partial<Item> = {}): Pick<Item, 'open_at' | 'deadline_at'> => ({ open_at: null, deadline_at: null, ...over });
const ranged = item({ open_at: local(6), deadline_at: local(8, 23, 59) }); // Tue 00:00 → Thu 23:59

describe('constrainStart', () => {
  it('leaves undated items unconstrained (except the day itself)', () => {
    expect(constrainStart(item(), fromDateKey('2026-10-01'), 19 * 60, 60)).toBe(19 * 60);
    expect(constrainStart(item(), fromDateKey('2026-10-01'), 23 * 60 + 30, 60)).toBe(23 * 60);
  });
  it('refuses days before the open date or after the deadline', () => {
    expect(constrainStart(ranged, fromDateKey('2026-10-05'), 19 * 60, 60)).toBeNull();
    expect(constrainStart(ranged, fromDateKey('2026-10-09'), 9 * 60, 60)).toBeNull();
  });
  it('allows any time on days fully inside the range', () => {
    expect(constrainStart(ranged, fromDateKey('2026-10-07'), 7 * 60, 60)).toBe(7 * 60);
  });
  it('pulls a late start back so the block ends by a 23:59 deadline', () => {
    expect(constrainStart(ranged, fromDateKey('2026-10-08'), 23 * 60, 60)).toBe(22 * 60 + 45);
  });
  it('pushes an early start to the open time on the open day', () => {
    const noonOpen = item({ open_at: local(6, 12, 10), deadline_at: local(8, 23, 59) });
    expect(constrainStart(noonOpen, fromDateKey('2026-10-06'), 9 * 60, 60)).toBe(12 * 60 + 15);
  });
  it('refuses when the block cannot fit at all that day', () => {
    const lateOpen = item({ open_at: local(6, 23, 30), deadline_at: local(8, 23, 59) });
    expect(constrainStart(lateOpen, fromDateKey('2026-10-06'), 9 * 60, 60)).toBeNull();
  });
});

describe('dayInWindow', () => {
  it('is true for days overlapping [open, deadline]', () => {
    expect(['05', '06', '07', '08', '09'].map((d) => dayInWindow(ranged, fromDateKey(`2026-10-${d}`)))).toEqual([false, true, true, true, false]);
    expect(dayInWindow(item(), fromDateKey('2026-01-01'))).toBe(true);
  });
});
