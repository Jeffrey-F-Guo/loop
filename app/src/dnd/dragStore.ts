import { create } from 'zustand';
import type { DragPayload, Point, Rect } from './types';

interface DragState {
  payload: DragPayload | null;
  pointerStart: Point;
  pointer: Point;
  activeInitialRect: Rect | null;
  begin: (s: { payload: DragPayload; pointerStart: Point; activeInitialRect: Rect | null }) => void;
  move: (p: Point) => void;
  end: () => void;
}

const ORIGIN = { x: 0, y: 0 };

export const useDragStore = create<DragState>((set) => ({
  payload: null,
  pointerStart: ORIGIN,
  pointer: ORIGIN,
  activeInitialRect: null,
  begin: ({ payload, pointerStart, activeInitialRect }) => set({ payload, pointerStart, pointer: pointerStart, activeInitialRect }),
  move: (pointer) => set({ pointer }),
  end: () => set({ payload: null, activeInitialRect: null }),
}));
