import { describe, expect, it } from 'vitest';
import type { Item } from '../api/types';
import { fromDateKey } from './time';
import { placeOnDay, setDeadlineDay, setOpenDay, shiftItemDays, timelineShape } from './timeline';

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const item = (over: Partial<Item> = {}): Item => ({
  id: 'i', title: 'i', description: null, open_at: null, deadline_at: null, status: 'active',
  work_block_count: 0, created_at: '', updated_at: '', completed_at: null, ...over,
});
const mon = local(2026, 10, 5);
const friEnd = local(2026, 10, 9, 23, 59);

describe('timelineShape', () => {
  it('range needs both dates', () => expect(timelineShape(item({ open_at: mon, deadline_at: friEnd }))).toBe('range'));
  it('deadline only is a marker', () => expect(timelineShape(item({ deadline_at: friEnd }))).toBe('deadline-marker'));
  it('open only is hidden', () => expect(timelineShape(item({ open_at: mon }))).toBe('hidden'));
  it('no dates is hidden', () => expect(timelineShape(item())).toBe('hidden'));
});

describe('edge edits', () => {
  const ranged = item({ open_at: mon, deadline_at: friEnd });

  it('left edge sets open_at to local midnight', () => {
    expect(setOpenDay(ranged, fromDateKey('2026-10-06'))).toEqual({ open_at: local(2026, 10, 6) });
  });
  it('left edge dragged past the deadline clamps to the deadline day', () => {
    expect(setOpenDay(ranged, fromDateKey('2026-10-12'))).toEqual({ open_at: local(2026, 10, 9) });
  });
  it('right edge sets deadline_at to 23:59', () => {
    expect(setDeadlineDay(ranged, fromDateKey('2026-10-10'))).toEqual({ deadline_at: local(2026, 10, 10, 23, 59) });
  });
  it('right edge dragged before the open day clamps to the open day', () => {
    expect(setDeadlineDay(ranged, fromDateKey('2026-10-01'))).toEqual({ deadline_at: local(2026, 10, 5, 23, 59) });
  });
});

describe('shiftItemDays', () => {
  it('moves both dates and keeps time of day', () => {
    expect(shiftItemDays(item({ open_at: mon, deadline_at: friEnd }), 2)).toEqual({
      open_at: local(2026, 10, 7), deadline_at: local(2026, 10, 11, 23, 59),
    });
  });
  it('moves only the dates that exist', () => {
    expect(shiftItemDays(item({ deadline_at: friEnd }), -1)).toEqual({ deadline_at: local(2026, 10, 8, 23, 59) });
  });
  it('zero days is an empty patch', () => expect(shiftItemDays(item({ open_at: mon }), 0)).toEqual({}));
});

describe('placeOnDay (Dropbox → Timeline)', () => {
  const wed = fromDateKey('2026-10-07');
  it('no dates → one-day range', () => {
    expect(placeOnDay(item(), wed)).toEqual({ open_at: local(2026, 10, 7), deadline_at: local(2026, 10, 7, 23, 59) });
  });
  it('open only → one-day range on that day', () => {
    expect(placeOnDay(item({ open_at: mon }), wed)).toEqual({ open_at: local(2026, 10, 7), deadline_at: local(2026, 10, 7, 23, 59) });
  });
  it('both dates → range moves so it opens on that day', () => {
    expect(placeOnDay(item({ open_at: mon, deadline_at: friEnd }), wed)).toEqual({
      open_at: local(2026, 10, 7), deadline_at: local(2026, 10, 11, 23, 59),
    });
  });
  it('deadline only, dropped on or before the deadline → opens that day, deadline kept', () => {
    expect(placeOnDay(item({ deadline_at: friEnd }), wed)).toEqual({ open_at: local(2026, 10, 7) });
  });
  it('deadline only, dropped after the deadline → one-day range on that day', () => {
    expect(placeOnDay(item({ deadline_at: friEnd }), fromDateKey('2026-10-12'))).toEqual({
      open_at: local(2026, 10, 12), deadline_at: local(2026, 10, 12, 23, 59),
    });
  });
});
