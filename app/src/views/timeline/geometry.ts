import type { Item } from '../../api/types';
import { daysBetween, startOfDayLocal } from '../../domain/time';
import { timelineShape } from '../../domain/timeline';

export type BarGeometry =
  | { kind: 'range'; startCol: number; endCol: number; clippedLeft: boolean; clippedRight: boolean }
  | { kind: 'marker'; col: number };

const col = (iso: string, weekStart: Date) => daysBetween(weekStart, startOfDayLocal(new Date(iso)));

export function barGeometry(item: Item, weekStart: Date): BarGeometry | null {
  const shape = timelineShape(item);
  if (shape === 'range') {
    const open = col(item.open_at!, weekStart);
    const due = col(item.deadline_at!, weekStart);
    if (due < 0 || open > 6) return null;
    return { kind: 'range', startCol: Math.max(0, open), endCol: Math.min(6, due), clippedLeft: open < 0, clippedRight: due > 6 };
  }
  if (shape === 'deadline-marker') {
    const c = col(item.deadline_at!, weekStart);
    return c >= 0 && c <= 6 ? { kind: 'marker', col: c } : null;
  }
  return null;
}

export function timelineRows(items: Item[], weekStart: Date): { item: Item; geo: BarGeometry }[] {
  const sortKey = (i: Item) => Date.parse(i.open_at ?? i.deadline_at ?? '');
  return items
    .filter((i) => i.status === 'active')
    .map((item) => ({ item, geo: barGeometry(item, weekStart) }))
    .filter((r): r is { item: Item; geo: BarGeometry } => r.geo !== null)
    .sort((a, b) => sortKey(a.item) - sortKey(b.item) || a.item.title.localeCompare(b.item.title));
}
