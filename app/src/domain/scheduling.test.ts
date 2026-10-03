import { describe, expect, it } from 'vitest';
import type { Item } from '../api/types';
import { formatMinutes, isScheduled, sectionItems, sectionsFromLegacyFilter, toggleSection } from './scheduling';

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id, title: id, description: null, open_at: null, deadline_at: null, status: 'active',
  work_block_count: 0, scheduled_minutes: 0, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
  completed_at: null, ...over,
});

describe('sectionItems', () => {
  const items = [
    item('unscheduled'),
    item('scheduled', { work_block_count: 2 }),
    item('done', { status: 'completed', work_block_count: 1 }),
    item('scheduled-2', { work_block_count: 1 }),
  ];
  const ids = (s: Parameters<typeof sectionItems>[1]) => sectionItems(items, s).map((i) => i.id);

  it('derives scheduling from work blocks, not status', () => {
    expect(isScheduled(items[1])).toBe(true);
    expect(isScheduled(items[0])).toBe(false);
  });
  it('scheduled = active items with work blocks, preserving order', () => expect(ids('scheduled')).toEqual(['scheduled', 'scheduled-2']));
  it('unscheduled = active items without work blocks', () => expect(ids('unscheduled')).toEqual(['unscheduled']));
  it('completed = completed items, scheduled or not', () => expect(ids('completed')).toEqual(['done']));
});

describe('toggleSection', () => {
  it('adds a section in display order', () =>
    expect(toggleSection(['unscheduled'], 'completed')).toEqual(['unscheduled', 'completed']));
  it('keeps display order whatever order sections were turned on', () =>
    expect(toggleSection(['completed'], 'scheduled')).toEqual(['scheduled', 'completed']));
  it('removes a section', () => expect(toggleSection(['scheduled', 'unscheduled'], 'scheduled')).toEqual(['unscheduled']));
  it('never removes the last section', () => expect(toggleSection(['completed'], 'completed')).toEqual(['completed']));
});

describe('sectionsFromLegacyFilter', () => {
  it.each([
    ['all', ['scheduled', 'unscheduled']],
    ['scheduled', ['scheduled']],
    ['unscheduled', ['unscheduled']],
    ['completed', ['completed']],
  ] as const)('%s', (f, want) => expect(sectionsFromLegacyFilter(f)).toEqual(want));
});

describe('formatMinutes', () => {
  it.each([
    [15, '15m'],
    [60, '1h'],
    [150, '2h 30m'],
    [600, '10h'],
  ])('%i → %s', (m, want) => expect(formatMinutes(m)).toBe(want));
});
