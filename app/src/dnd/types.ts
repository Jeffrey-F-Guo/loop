import type { UpdateItemInput } from '../api/types';
import type { DockEdge } from '../domain/layout';

export type DragPayload =
  | { kind: 'item'; itemId: string }
  | { kind: 'timelineBar'; itemId: string }
  | { kind: 'workBlock'; blockId: string }
  | { kind: 'panel'; viewId: string };

export type DropData =
  | { kind: 'calendarDay'; date: string } // yyyy-MM-dd local
  | { kind: 'timelineDay'; date: string }
  | { kind: 'panelZone'; viewId: string; edge: DockEdge };

export const ACCEPTS: Record<DropData['kind'], DragPayload['kind'][]> = {
  calendarDay: ['item', 'timelineBar', 'workBlock'],
  timelineDay: ['item', 'timelineBar'],
  panelZone: ['panel'],
};

export interface Point { x: number; y: number }
export interface Rect { top: number; left: number; width: number; height: number }

export type DropAction =
  | { type: 'createBlock'; itemId: string; startAt: string; endAt: string }
  | { type: 'moveBlock'; blockId: string; startAt: string; endAt: string }
  | { type: 'updateItem'; itemId: string; patch: UpdateItemInput }
  | { type: 'shiftItem'; itemId: string; days: number } // dates and work blocks move together
  | { type: 'dock'; viewId: string; targetViewId: string; edge: DockEdge }
  | { type: 'none' };

export interface DroppableData {
  drop: DropData;
  getRect: () => Rect;
  getClipRect: () => Rect | null;
}

export const toRect = (r: { top: number; left: number; width: number; height: number }): Rect =>
  ({ top: r.top, left: r.left, width: r.width, height: r.height });
