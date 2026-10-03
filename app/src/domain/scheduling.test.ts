import { describe, expect, it } from 'vitest';
import type { Item } from '../api/types';
import { filterItems, isScheduled } from './scheduling';

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id, title: id, description: null, open_at: null, deadline_at: null, status: 'active',
  work_block_count: 0, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
  completed_at: null, ...over,
});

describe('filterItems', () => {
  const items = [
    item('unscheduled'),
    item('scheduled', { work_block_count: 2 }),
    item('done', { status: 'completed', work_block_count: 1 }),
  ];
  const ids = (f: Parameters<typeof filterItems>[1]) => filterItems(items, f).map((i) => i.id);

  it('derives scheduling from work blocks, not status', () => {
    expect(isScheduled(items[1])).toBe(true);
    expect(isScheduled(items[0])).toBe(false);
  });
  it('all = every active item, preserving order', () => expect(ids('all')).toEqual(['unscheduled', 'scheduled']));
  it('scheduled excludes completed', () => expect(ids('scheduled')).toEqual(['scheduled']));
  it('unscheduled', () => expect(ids('unscheduled')).toEqual(['unscheduled']));
  it('completed', () => expect(ids('completed')).toEqual(['done']));
});
