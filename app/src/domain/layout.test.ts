import { describe, expect, it } from 'vitest';
import type { Layout, LayoutNode, SplitNode, ViewNode } from '../api/types';
import {
  DEFAULT_LAYOUT, addView, dockView, duplicateView, findView, listViews, normalize, removeView,
  setSizes, setViewConfig, validateLayout,
} from './layout';

const leaf = (id: string): ViewNode => ({ kind: 'view', id, view: { type: 'timeline', config: {} } });
const split = (id: string, direction: 'row' | 'column', children: LayoutNode[], sizes?: number[]): SplitNode => ({
  kind: 'split', id, direction, children, sizes: sizes ?? children.map(() => 1 / children.length),
});
const L = (root: LayoutNode | null): Layout => ({ version: 1, root });
const ids = (l: Layout) => listViews(l).map((v) => v.id);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('validateLayout', () => {
  it('accepts the default layout and an empty workspace', () => {
    expect(validateLayout(DEFAULT_LAYOUT)).toBe(true);
    expect(validateLayout(L(null))).toBe(true);
  });
  it.each([
    ['not an object', 'nope'],
    ['wrong version', { version: 2, root: null }],
    ['one-child split', L(split('s', 'row', [leaf('a')], [1]))],
    ['duplicate ids', L(split('s', 'row', [leaf('a'), leaf('a')]))],
    ['bad sizes', L(split('s', 'row', [leaf('a'), leaf('b')], [0.5, 0.2]))],
    ['unknown view type', L({ kind: 'view', id: 'a', view: { type: 'kanban', config: {} } } as unknown as LayoutNode)],
    ['bad dropbox filter', L({ kind: 'view', id: 'a', view: { type: 'dropbox', config: { filter: 'later' } } } as unknown as LayoutNode)],
    ['timeline config with keys', L({ kind: 'view', id: 'a', view: { type: 'timeline', config: { zoom: 1 } } } as unknown as LayoutNode)],
  ])('rejects %s', (_name, value) => {
    expect(validateLayout(value)).toBe(false);
  });
});

describe('normalize', () => {
  it('collapses single-child splits and renormalizes sizes', () => {
    const l = normalize(L(split('s', 'row', [split('inner', 'column', [leaf('a')], [1]), leaf('b')], [2, 2])));
    expect(l.root).toMatchObject({ kind: 'split', children: [{ id: 'a' }, { id: 'b' }], sizes: [0.5, 0.5] });
  });
  it('flattens nested splits with the same direction', () => {
    const l = normalize(L(split('s', 'row', [split('inner', 'row', [leaf('a'), leaf('b')], [0.5, 0.5]), leaf('c')], [0.5, 0.5])));
    expect((l.root as SplitNode).children.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect((l.root as SplitNode).sizes).toEqual([0.25, 0.25, 0.5]);
  });
});

describe('view operations', () => {
  it('setViewConfig changes only that view', () => {
    const l = setViewConfig(DEFAULT_LAYOUT, 'v-dropbox', { filter: 'unscheduled' });
    expect(findView(l, 'v-dropbox')?.view).toEqual({ type: 'dropbox', config: { filter: 'unscheduled' } });
    expect(findView(DEFAULT_LAYOUT, 'v-dropbox')?.view).toEqual({ type: 'dropbox', config: { filter: 'all' } });
  });

  it('removeView collapses the parent split', () => {
    const l = removeView(DEFAULT_LAYOUT, 'v-calendar');
    expect(ids(l)).toEqual(['v-dropbox', 'v-timeline']);
    expect(validateLayout(l)).toBe(true);
    expect(removeView(L(leaf('only')), 'only').root).toBeNull();
  });

  it('duplicateView inserts an independent copy to the right', () => {
    const l = duplicateView(DEFAULT_LAYOUT, 'v-dropbox', 'v-copy');
    expect(ids(l)).toEqual(['v-dropbox', 'v-copy', 'v-calendar', 'v-timeline']);
    const top = (l.root as SplitNode).children[0] as SplitNode;
    expect(top.direction).toBe('row');
    expect(sum(top.sizes)).toBeCloseTo(1);
    const again = setViewConfig(l, 'v-copy', { filter: 'scheduled' });
    expect(findView(again, 'v-dropbox')?.view.config).toEqual({ filter: 'all' });
  });

  it('addView places the new view at the right edge, or as root when empty', () => {
    const l = addView(DEFAULT_LAYOUT, { type: 'calendar', config: { mode: 'day' } }, 'v-new');
    expect(ids(l).at(-1)).toBe('v-new');
    expect(validateLayout(l)).toBe(true);
    expect(addView(L(null), { type: 'timeline', config: {} }, 'v-1').root).toMatchObject({ kind: 'view', id: 'v-1' });
  });

  it('refuses to exceed 24 views', () => {
    let l = L(leaf('v-0'));
    for (let i = 1; i < 24; i++) l = addView(l, { type: 'timeline', config: {} }, `v-${i}`);
    expect(listViews(l)).toHaveLength(24);
    expect(addView(l, { type: 'timeline', config: {} }, 'v-24')).toBe(l);
    expect(duplicateView(l, 'v-0', 'v-dup')).toBe(l);
  });

  it('setSizes updates one split and renormalizes', () => {
    const l = setSizes(DEFAULT_LAYOUT, 's-top', [1, 3]);
    expect((((l.root as SplitNode).children[0]) as SplitNode).sizes).toEqual([0.25, 0.75]);
  });
});

describe('dockView', () => {
  it('docking to the left of a target splits the target in a row', () => {
    const l = dockView(DEFAULT_LAYOUT, 'v-timeline', 'v-dropbox', 'left');
    expect(ids(l)).toEqual(['v-timeline', 'v-dropbox', 'v-calendar']);
    expect(validateLayout(l)).toBe(true);
  });
  it('docking to the bottom splits in a column', () => {
    const l = dockView(DEFAULT_LAYOUT, 'v-calendar', 'v-timeline', 'bottom');
    const root = l.root as SplitNode;
    expect(root.direction).toBe('column');
    expect(ids(l)).toEqual(['v-dropbox', 'v-timeline', 'v-calendar']);
  });
  it('center swaps the two views', () => {
    const l = dockView(DEFAULT_LAYOUT, 'v-dropbox', 'v-timeline', 'center');
    expect(ids(l)).toEqual(['v-timeline', 'v-calendar', 'v-dropbox']);
  });
  it('docking onto itself is a no-op', () => {
    expect(dockView(DEFAULT_LAYOUT, 'v-dropbox', 'v-dropbox', 'left')).toBe(DEFAULT_LAYOUT);
  });
});
