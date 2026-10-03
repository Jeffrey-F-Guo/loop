import { describe, expect, it } from 'vitest';
import type { Item, WorkBlock } from '../api/types';
import { HOUR_PX } from '../domain/time';
import { planDrop, type DropContext } from './planDrop';

const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const item = (over: Partial<Item> = {}): Item => ({
  id: 'i1', title: 'Physics', description: null, open_at: null, deadline_at: null, status: 'active',
  work_block_count: 0, created_at: '', updated_at: '', completed_at: null, ...over,
});
const block: WorkBlock = { id: 'b1', item_id: 'i1', start_at: local(6, 19), end_at: local(6, 21), created_at: '', updated_at: '' };

const columnTop = 100;
const ctx = (over: Partial<DropContext> = {}): DropContext => ({
  pointerStart: { x: 0, y: 0 },
  pointerEnd: { x: 0, y: columnTop + 19 * HOUR_PX + 2 }, // 19:00 + 2px
  dropRect: { top: columnTop, left: 0, width: 120, height: 24 * HOUR_PX },
  activeInitialRect: null,
  items: new Map([['i1', item({ open_at: local(5, 0), deadline_at: local(9, 23, 59) })]]),
  blocks: new Map([['b1', block]]),
  ...over,
});
const tue = { kind: 'calendarDay', date: '2026-10-06' } as const;
const wed = { kind: 'calendarDay', date: '2026-10-07' } as const;

describe('planDrop → Calendar', () => {
  it('Dropbox item creates a 60-minute block at the slot under the pointer', () => {
    expect(planDrop({ kind: 'item', itemId: 'i1' }, tue, ctx())).toEqual({
      type: 'createBlock', itemId: 'i1', startAt: local(6, 19), endAt: local(6, 20),
    });
  });

  it('snaps down to the 15-minute slot', () => {
    const c = ctx({ pointerEnd: { x: 0, y: columnTop + 19 * HOUR_PX + HOUR_PX * 0.49 } }); // ~19:29
    expect(planDrop({ kind: 'item', itemId: 'i1' }, tue, c)).toMatchObject({ startAt: local(6, 19, 15) });
  });

  it('a timeline bar also creates a block and never touches item dates', () => {
    const a = planDrop({ kind: 'timelineBar', itemId: 'i1' }, tue, ctx());
    expect(a).toMatchObject({ type: 'createBlock', itemId: 'i1' });
  });

  it('clamps a drop near midnight so the block stays inside the day', () => {
    const c = ctx({ pointerEnd: { x: 0, y: columnTop + 23.9 * HOUR_PX } });
    expect(planDrop({ kind: 'item', itemId: 'i1' }, tue, c)).toMatchObject({ startAt: local(6, 23), endAt: local(7, 0) });
  });

  it('moving a block keeps its duration and respects where it was grabbed', () => {
    // grabbed 6px (7.5 min) below the block's top, dropped 6px below Wed 19:00
    const c = ctx({
      pointerStart: { x: 0, y: 500 + 6 },
      activeInitialRect: { top: 500, left: 0, width: 100, height: 2 * HOUR_PX },
      pointerEnd: { x: 0, y: columnTop + 19 * HOUR_PX + 6 },
    });
    expect(planDrop({ kind: 'workBlock', blockId: 'b1' }, wed, c)).toEqual({
      type: 'moveBlock', blockId: 'b1', startAt: local(7, 19), endAt: local(7, 21),
    });
  });

  it('refuses days outside the item range (Mon → Fri)', () => {
    const sun = { kind: 'calendarDay', date: '2026-10-11' } as const;
    expect(planDrop({ kind: 'item', itemId: 'i1' }, sun, ctx())).toEqual({ type: 'none' });
    expect(planDrop({ kind: 'workBlock', blockId: 'b1' }, sun, ctx({ activeInitialRect: { top: 0, left: 0, width: 1, height: 1 } }))).toEqual({ type: 'none' });
  });

  it('on the deadline day, pulls a late drop back so the block ends by 23:59', () => {
    const fri = { kind: 'calendarDay', date: '2026-10-09' } as const;
    const c = ctx({ pointerEnd: { x: 0, y: columnTop + 23.5 * HOUR_PX } });
    expect(planDrop({ kind: 'item', itemId: 'i1' }, fri, c)).toMatchObject({ startAt: local(9, 22, 45), endAt: local(9, 23, 45) });
  });

  it('an unknown item or block is a no-op', () => {
    expect(planDrop({ kind: 'item', itemId: 'nope' }, tue, ctx())).toEqual({ type: 'none' });
    expect(planDrop({ kind: 'workBlock', blockId: 'nope' }, tue, ctx())).toEqual({ type: 'none' });
  });
});

describe('planDrop → Timeline', () => {
  const day = (date: string) => ({ kind: 'timelineDay', date }) as const;

  it('Dropbox item with no dates becomes a one-day range', () => {
    const c = ctx({ items: new Map([['i1', item()]]) });
    expect(planDrop({ kind: 'item', itemId: 'i1' }, day('2026-10-07'), c)).toEqual({
      type: 'updateItem', itemId: 'i1', patch: { open_at: local(7, 0), deadline_at: local(7, 23, 59) },
    });
  });

  it('dragging a bar shifts the item (and its blocks) by whole columns of pointer movement', () => {
    const c = ctx({ pointerStart: { x: 100, y: 0 }, pointerEnd: { x: 100 + 2 * 120 + 10, y: 0 } });
    expect(planDrop({ kind: 'timelineBar', itemId: 'i1' }, day('2026-10-08'), c)).toEqual({ type: 'shiftItem', itemId: 'i1', days: 2 });
  });

  it('a dated Dropbox item dropped on a day shifts so it opens that day', () => {
    expect(planDrop({ kind: 'item', itemId: 'i1' }, day('2026-10-07'), ctx())).toEqual({ type: 'shiftItem', itemId: 'i1', days: 2 });
  });

  it('a bar dropped back where it started is a no-op', () => {
    const c = ctx({ pointerStart: { x: 100, y: 0 }, pointerEnd: { x: 130, y: 0 } });
    expect(planDrop({ kind: 'timelineBar', itemId: 'i1' }, day('2026-10-05'), c)).toEqual({ type: 'none' });
  });
});

describe('planDrop → panels', () => {
  it('docks a panel onto another panel', () => {
    expect(planDrop({ kind: 'panel', viewId: 'a' }, { kind: 'panelZone', viewId: 'b', edge: 'left' }, ctx()))
      .toEqual({ type: 'dock', viewId: 'a', targetViewId: 'b', edge: 'left' });
  });
  it('dropping a panel on itself is a no-op', () => {
    expect(planDrop({ kind: 'panel', viewId: 'a' }, { kind: 'panelZone', viewId: 'a', edge: 'left' }, ctx())).toEqual({ type: 'none' });
  });
  it('rejects payloads the target does not accept', () => {
    expect(planDrop({ kind: 'panel', viewId: 'a' }, tue, ctx())).toEqual({ type: 'none' });
    expect(planDrop({ kind: 'workBlock', blockId: 'b1' }, { kind: 'timelineDay', date: '2026-10-07' }, ctx())).toEqual({ type: 'none' });
  });
});
