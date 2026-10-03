import { describe, expect, it } from 'vitest';
import type { Item } from '../../api/types';
import { itemMeta } from './itemMeta';

const now = new Date(2026, 9, 5, 9, 0); // Mon Oct 5
const local = (d: number, h = 0, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const item = (over: Partial<Item> = {}): Item => ({
  id: 'i', title: 't', description: null, open_at: null, deadline_at: null, status: 'active',
  work_block_count: 0, scheduled_minutes: 0, created_at: '', updated_at: '', completed_at: null, ...over,
});

describe('itemMeta', () => {
  it('is empty with nothing planned', () => expect(itemMeta(item(), now)).toBe(''));
  it('shows weekday for deadlines within the next 6 days', () => expect(itemMeta(item({ deadline_at: local(9, 23, 59) }), now)).toBe('Due Fri'));
  it('shows month and day for later deadlines', () => expect(itemMeta(item({ deadline_at: local(20, 23, 59) }), now)).toBe('Due Oct 20'));
  it('shows the planning range', () => expect(itemMeta(item({ open_at: local(6), deadline_at: local(9, 23, 59) }), now)).toBe('Tue → Fri'));
  it('appends block count', () => {
    expect(itemMeta(item({ open_at: local(6), deadline_at: local(9, 23, 59), work_block_count: 2 }), now)).toBe('Tue → Fri · 2 blocks');
    expect(itemMeta(item({ work_block_count: 1 }), now)).toBe('1 block');
  });
});
