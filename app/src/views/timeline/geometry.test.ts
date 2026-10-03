import { describe, expect, it } from 'vitest';
import type { Item } from '../../api/types';
import { fromDateKey } from '../../domain/time';
import { barGeometry, timelineRows } from './geometry';

const local = (d: number, h = 0, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const item = (id: string, over: Partial<Item> = {}): Item => ({
  id, title: id, description: null, open_at: null, deadline_at: null, status: 'active',
  work_block_count: 0, created_at: '', updated_at: '', completed_at: null, ...over,
});
const week = fromDateKey('2026-10-05');

describe('barGeometry', () => {
  it('maps a Mon→Fri range to columns 0..4', () => {
    expect(barGeometry(item('a', { open_at: local(5), deadline_at: local(9, 23, 59) }), week))
      .toEqual({ kind: 'range', startCol: 0, endCol: 4, clippedLeft: false, clippedRight: false });
  });
  it('clips ranges that extend beyond the week', () => {
    expect(barGeometry(item('a', { open_at: local(1), deadline_at: local(14, 23, 59) }), week))
      .toEqual({ kind: 'range', startCol: 0, endCol: 6, clippedLeft: true, clippedRight: true });
  });
  it('returns null for ranges outside the week', () => {
    expect(barGeometry(item('a', { open_at: local(12), deadline_at: local(13) }), week)).toBeNull();
  });
  it('places deadline markers', () => {
    expect(barGeometry(item('a', { deadline_at: local(7, 23, 59) }), week)).toEqual({ kind: 'marker', col: 2 });
  });
  it('hides open-only and undated items', () => {
    expect(barGeometry(item('a', { open_at: local(6) }), week)).toBeNull();
    expect(barGeometry(item('a'), week)).toBeNull();
  });
});

describe('timelineRows', () => {
  it('lists active dated items in this week, earliest first', () => {
    const rows = timelineRows([
      item('later', { open_at: local(8), deadline_at: local(9) }),
      item('done', { open_at: local(5), deadline_at: local(6), status: 'completed' }),
      item('first', { deadline_at: local(6) }),
      item('undated'),
    ], week);
    expect(rows.map((r) => r.item.id)).toEqual(['first', 'later']);
  });
});
