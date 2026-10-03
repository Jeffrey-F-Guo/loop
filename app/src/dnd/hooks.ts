import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useCallback, useRef } from 'react';
import { useDragStore } from './dragStore';
import { ACCEPTS, toRect, type DragPayload, type DropData, type DroppableData, type Rect } from './types';

export function useTypedDraggable({ id, payload, disabled }: { id: string; payload: DragPayload; disabled?: boolean }) {
  const d = useDraggable({ id, data: { payload }, disabled });
  return { setNodeRef: d.setNodeRef, listeners: d.listeners, attributes: d.attributes, isDragging: d.isDragging };
}

export function useTypedDroppable({ id, drop }: { id: string; drop: DropData }) {
  const active = useDragStore((s) => s.payload);
  const nodeRef = useRef<HTMLElement | null>(null);
  // Never disabled before a drag starts, so dnd-kit measures every target at drag start.
  const disabled = !!active && !ACCEPTS[drop.kind].includes(active.kind);
  const getRect = useCallback((): Rect => toRect(nodeRef.current?.getBoundingClientRect() ?? { top: 0, left: 0, width: 0, height: 0 }), []);
  const getClipRect = useCallback((): Rect | null => {
    const clip = nodeRef.current?.parentElement?.closest('[data-drop-clip]');
    return clip ? toRect(clip.getBoundingClientRect()) : null;
  }, []);
  const data: DroppableData = { drop, getRect, getClipRect };
  const d = useDroppable({ id, disabled, data });
  const setNodeRef = useCallback((el: HTMLElement | null) => {
    nodeRef.current = el;
    d.setNodeRef(el);
  }, [d.setNodeRef]);
  return { setNodeRef, isOver: d.isOver && !disabled, getRect };
}
