import type { DropboxFilter, Layout, LayoutNode, SplitNode, ViewInstance, ViewNode } from '../api/types';
import { DEFAULT_DROPBOX_SECTIONS, DROPBOX_SECTIONS, sectionsFromLegacyFilter } from './scheduling';

export type DockEdge = 'left' | 'right' | 'top' | 'bottom' | 'center';

export const MAX_DEPTH = 8;
export const MAX_VIEWS = 24;

export const DEFAULT_LAYOUT: Layout = {
  version: 1,
  root: {
    kind: 'split', id: 's-root', direction: 'column', sizes: [0.62, 0.38],
    children: [
      {
        kind: 'split', id: 's-top', direction: 'row', sizes: [0.32, 0.68],
        children: [
          { kind: 'view', id: 'v-dropbox', view: { type: 'dropbox', config: { sections: [...DEFAULT_DROPBOX_SECTIONS] } } },
          { kind: 'view', id: 'v-calendar', view: { type: 'calendar', config: { mode: 'week' } } },
        ],
      },
      { kind: 'view', id: 'v-timeline', view: { type: 'timeline', config: {} } },
    ],
  },
};

export const genId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

export function listViews(layout: Layout): ViewNode[] {
  const out: ViewNode[] = [];
  const walk = (n: LayoutNode) => (n.kind === 'view' ? out.push(n) : n.children.forEach(walk));
  if (layout.root) walk(layout.root);
  return out;
}

export const findView = (layout: Layout, viewId: string) => listViews(layout).find((v) => v.id === viewId) ?? null;

// ---------- validation (mirrors api/internal/domain/layout.go) ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const onlyKeys = (o: Record<string, unknown>, keys: string[]) => Object.keys(o).every((k) => keys.includes(k));

function validView(v: unknown): boolean {
  if (!isObj(v) || !onlyKeys(v, ['type', 'config']) || !isObj(v.config)) return false;
  const c = v.config;
  switch (v.type) {
    case 'dropbox':
      if (onlyKeys(c, ['filter']) && 'filter' in c) return ['all', 'scheduled', 'unscheduled', 'completed'].includes(c.filter as string); // legacy
      return onlyKeys(c, ['sections']) && Array.isArray(c.sections) && c.sections.length > 0 &&
        new Set(c.sections).size === c.sections.length && c.sections.every((s) => DROPBOX_SECTIONS.includes(s));
    case 'timeline':
      return Object.keys(c).length === 0;
    case 'calendar':
      return onlyKeys(c, ['mode']) && (c.mode === 'week' || c.mode === 'day');
    default:
      return false;
  }
}

export function validateLayout(value: unknown): value is Layout {
  if (!isObj(value) || !onlyKeys(value, ['version', 'root']) || value.version !== 1) return false;
  if (value.root === null || value.root === undefined) return true;
  const ids = new Set<string>();
  let views = 0;
  const node = (n: unknown, depth: number): boolean => {
    if (depth > MAX_DEPTH || !isObj(n) || typeof n.id !== 'string' || n.id === '' || ids.has(n.id)) return false;
    ids.add(n.id);
    if (n.kind === 'view') {
      views++;
      return onlyKeys(n, ['kind', 'id', 'view']) && views <= MAX_VIEWS && validView(n.view);
    }
    if (n.kind !== 'split' || !onlyKeys(n, ['kind', 'id', 'direction', 'children', 'sizes'])) return false;
    if (n.direction !== 'row' && n.direction !== 'column') return false;
    if (!Array.isArray(n.children) || !Array.isArray(n.sizes) || n.children.length < 2) return false;
    if (n.sizes.length !== n.children.length || n.sizes.some((s) => typeof s !== 'number' || s <= 0)) return false;
    if (Math.abs((n.sizes as number[]).reduce((a, b) => a + b, 0) - 1) > 0.01) return false;
    return n.children.every((c) => node(c, depth + 1));
  };
  return node(value.root, 1);
}

/**
 * Rewrites pre-sections Dropbox configs ({filter}) as {sections}. Returns `layout` itself
 * when nothing needed upgrading.
 */
export function upgradeLegacyConfigs(layout: Layout): Layout {
  let changed = false;
  const up = mapLayout(layout, (n) => {
    if (n.kind !== 'view' || n.view.type !== 'dropbox' || !('filter' in n.view.config)) return n;
    changed = true;
    const { filter } = n.view.config as unknown as { filter: DropboxFilter };
    return { ...n, view: { type: 'dropbox', config: { sections: sectionsFromLegacyFilter(filter) } } };
  });
  return changed ? up : layout;
}

// ---------- normalization ----------

function normNode(n: LayoutNode): LayoutNode | null {
  if (n.kind === 'view') return n;
  const kids: LayoutNode[] = [];
  const sizes: number[] = [];
  n.children.forEach((c, i) => {
    const nc = normNode(c);
    if (!nc) return;
    const s = n.sizes[i] > 0 ? n.sizes[i] : 0;
    if (nc.kind === 'split' && nc.direction === n.direction) {
      nc.children.forEach((gc, j) => {
        kids.push(gc);
        sizes.push(s * nc.sizes[j]);
      });
    } else {
      kids.push(nc);
      sizes.push(s);
    }
  });
  if (kids.length === 0) return null;
  if (kids.length === 1) return kids[0];
  const total = sizes.reduce((a, b) => a + b, 0);
  const norm = total > 0 && sizes.every((s) => s > 0) ? sizes.map((s) => s / total) : kids.map(() => 1 / kids.length);
  return { ...n, children: kids, sizes: norm };
}

export function normalize(layout: Layout): Layout {
  return { version: 1, root: layout.root ? normNode(layout.root) : null };
}

/** Apply `next`, normalized, only if the result is still valid; otherwise keep `prev`. */
function guard(prev: Layout, next: Layout): Layout {
  const n = normalize(next);
  return validateLayout(n) ? n : prev;
}

function mapNode(n: LayoutNode, fn: (n: LayoutNode) => LayoutNode): LayoutNode {
  const mapped = fn(n);
  if (mapped !== n || mapped.kind === 'view') return mapped;
  return { ...mapped, children: mapped.children.map((c) => mapNode(c, fn)) };
}

const mapLayout = (l: Layout, fn: (n: LayoutNode) => LayoutNode): Layout =>
  ({ version: 1, root: l.root ? mapNode(l.root, fn) : null });

function dropNode(n: LayoutNode, viewId: string): LayoutNode | null {
  if (n.kind === 'view') return n.id === viewId ? null : n;
  const kept: LayoutNode[] = [];
  const sizes: number[] = [];
  n.children.forEach((c, i) => {
    const r = dropNode(c, viewId);
    if (r) {
      kept.push(r);
      sizes.push(n.sizes[i]);
    }
  });
  return kept.length ? { ...n, children: kept, sizes } : null;
}

// ---------- operations ----------

export function setViewConfig<V extends ViewInstance>(layout: Layout, viewId: string, config: V['config']): Layout {
  return guard(layout, mapLayout(layout, (n) =>
    n.kind === 'view' && n.id === viewId ? { ...n, view: { ...n.view, config } as ViewInstance } : n));
}

export function removeView(layout: Layout, viewId: string): Layout {
  return guard(layout, { version: 1, root: layout.root ? dropNode(layout.root, viewId) : null });
}

export function duplicateView(layout: Layout, viewId: string, newId = genId('v')): Layout {
  const src = findView(layout, viewId);
  if (!src) return layout;
  const copy: ViewNode = { kind: 'view', id: newId, view: structuredClone(src.view) };
  return guard(layout, mapLayout(layout, (n) =>
    n.kind === 'view' && n.id === viewId
      ? { kind: 'split', id: genId('s'), direction: 'row', sizes: [0.5, 0.5], children: [n, copy] }
      : n));
}

export function addView(layout: Layout, view: ViewInstance, newId = genId('v')): Layout {
  const node: ViewNode = { kind: 'view', id: newId, view };
  if (!layout.root) return guard(layout, { version: 1, root: node });
  return guard(layout, {
    version: 1,
    root: { kind: 'split', id: genId('s'), direction: 'row', sizes: [0.7, 0.3], children: [layout.root, node] },
  });
}

export function setSizes(layout: Layout, splitId: string, sizes: number[]): Layout {
  return guard(layout, mapLayout(layout, (n) =>
    n.kind === 'split' && n.id === splitId && sizes.length === n.children.length ? { ...n, sizes } : n));
}

export function dockView(layout: Layout, viewId: string, targetViewId: string, edge: DockEdge): Layout {
  if (viewId === targetViewId) return layout;
  const src = findView(layout, viewId);
  const tgt = findView(layout, targetViewId);
  if (!src || !tgt) return layout;
  if (edge === 'center') {
    return guard(layout, mapLayout(layout, (n) =>
      n.kind === 'view' && n.id === viewId ? tgt : n.kind === 'view' && n.id === targetViewId ? src : n));
  }
  const without: Layout = { version: 1, root: layout.root ? dropNode(layout.root, viewId) : null };
  const direction = edge === 'left' || edge === 'right' ? 'row' : 'column';
  const first = edge === 'left' || edge === 'top';
  return guard(layout, mapLayout(without, (n) =>
    n.kind === 'view' && n.id === targetViewId
      ? { kind: 'split', id: genId('s'), direction, sizes: [0.5, 0.5], children: first ? [src, n] : [n, src] } as SplitNode
      : n));
}
