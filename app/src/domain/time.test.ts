import { describe, expect, it } from 'vitest';
import {
  atMinutes, daysBetween, endOfDayLocal, fromDateKey, minutesSinceMidnight, roundTo15, shiftDays,
  snapDown15, toDateKey, toLocalStamp, weekDays, weekStart,
} from './time';

describe('time helpers', () => {
  it('snaps to 15-minute increments', () => {
    expect(snapDown15(74)).toBe(60);
    expect(snapDown15(75)).toBe(75);
    expect(roundTo15(67)).toBe(60);
    expect(roundTo15(68)).toBe(75);
  });

  it('starts weeks on Monday, including when today is Sunday', () => {
    const sunday = new Date(2026, 9, 11, 15, 0);
    expect(toDateKey(weekStart(sunday))).toBe('2026-10-05');
    expect(weekDays(weekStart(sunday)).map(toDateKey)).toEqual([
      '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
    ]);
  });

  it('round-trips date keys at local midnight', () => {
    const d = fromDateKey('2026-10-06');
    expect(d.getHours()).toBe(0);
    expect(toDateKey(d)).toBe('2026-10-06');
  });

  it('keeps wall-clock times across the DST change (2026-11-01, America/Los_Angeles)', () => {
    const dstDay = fromDateKey('2026-11-01');
    const sevenPm = atMinutes(dstDay, 19 * 60);
    expect(sevenPm.getHours()).toBe(19);
    expect(minutesSinceMidnight(sevenPm)).toBe(19 * 60);
    const nextWeek = shiftDays(fromDateKey('2026-10-29'), 4);
    expect(toDateKey(nextWeek)).toBe('2026-11-02');
    expect(nextWeek.getHours()).toBe(0);
    expect(daysBetween(fromDateKey('2026-10-26'), fromDateKey('2026-11-02'))).toBe(7);
  });

  it('formats local stamps and end of day', () => {
    expect(toLocalStamp(new Date(2026, 9, 6, 19, 5))).toBe('2026-10-06T19:05');
    const eod = endOfDayLocal(new Date(2026, 9, 9, 8, 0));
    expect([eod.getHours(), eod.getMinutes()]).toEqual([23, 59]);
  });
});
