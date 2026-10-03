import {
  DndContext, DragOverlay, MeasuringStrategy, PointerSensor, pointerWithin, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, type ReactNode } from 'react';
import { collectBlocks } from '../api/blockCache';
import { tempId, useItemsById, useUpdateItem } from '../api/items';
import { useCreateWorkBlock, useUpdateWorkBlock } from '../api/workBlocks';
import { tokens } from '../ui/tokens';
import { useDragStore } from './dragStore';
import { planDrop } from './planDrop';
import { toRect, type DragPayload, type DropAction, type DroppableData, type Point } from './types';

export type DockAction = Extract<DropAction, { type: 'dock' }>;

const inside = (p: Point, r: { top: number; left: number; width: number; height: number }) =>
  p.x >= r.left && p.x <= r.left + r.width && p.y >= r.top && p.y <= r.top + r.height;

/** pointerWithin, minus targets whose visible (clipped) area does not contain the pointer. */
const clippedPointerWithin: CollisionDetection = (args) => {
  const p = args.pointerCoordinates;
  if (!p) return [];
  return pointerWithin(args).filter((c) => {
    const data = args.droppableContainers.find((d) => d.id === c.id)?.data.current as DroppableData | undefined;
    const clip = data?.getClipRect();
    return !clip || inside(p, clip);
  });
};

export function DndProvider({ children, onDock }: { children: ReactNode; onDock?: (a: DockAction) => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const qc = useQueryClient();
  const items = useItemsById();
  const createBlock = useCreateWorkBlock();
  const updateBlock = useUpdateWorkBlock();
  const updateItem = useUpdateItem();
  const store = useDragStore;
  const moveListener = useRef<((e: PointerEvent) => void) | null>(null);

  const stopTracking = () => {
    if (moveListener.current) window.removeEventListener('pointermove', moveListener.current);
    moveListener.current = null;
  };

  const onDragStart = useCallback((e: DragStartEvent) => {
    const payload = e.active.data.current?.payload as DragPayload | undefined;
    if (!payload) return;
    const ev = e.activatorEvent as PointerEvent;
    const initial = e.active.rect.current.initial;
    store.getState().begin({
      payload,
      pointerStart: { x: ev.clientX, y: ev.clientY },
      activeInitialRect: initial ? toRect(initial) : null,
    });
    stopTracking();
    moveListener.current = (pe: PointerEvent) => store.getState().move({ x: pe.clientX, y: pe.clientY });
    window.addEventListener('pointermove', moveListener.current);
  }, [store]);

  const execute = useCallback((a: DropAction) => {
    switch (a.type) {
      case 'createBlock':
        createBlock.mutate({ tempId: tempId('b'), input: { item_id: a.itemId, start_at: a.startAt, end_at: a.endAt } });
        break;
      case 'moveBlock':
        updateBlock.mutate({ id: a.blockId, patch: { start_at: a.startAt, end_at: a.endAt } });
        break;
      case 'updateItem':
        updateItem.mutate({ id: a.itemId, patch: a.patch });
        break;
      case 'dock':
        onDock?.(a);
        break;
    }
  }, [createBlock, updateBlock, updateItem, onDock]);

  const onDragEnd = useCallback((e: DragEndEvent) => {
    stopTracking();
    const s = store.getState();
    const payload = s.payload;
    s.end();
    const data = e.over?.data.current as DroppableData | undefined;
    if (!payload || !data) return;
    execute(planDrop(payload, data.drop, {
      pointerStart: s.pointerStart, pointerEnd: s.pointer, dropRect: data.getRect(),
      activeInitialRect: s.activeInitialRect, items, blocks: collectBlocks(qc),
    }));
  }, [store, execute, items, qc]);

  const onDragCancel = useCallback(() => {
    stopTracking();
    store.getState().end();
  }, [store]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={clippedPointerWithin}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        <DragChip />
      </DragOverlay>
    </DndContext>
  );
}

function DragChip() {
  const payload = useDragStore((s) => s.payload);
  const items = useItemsById();
  const qc = useQueryClient();
  if (!payload) return null;
  let label = 'View';
  if (payload.kind === 'item' || payload.kind === 'timelineBar') label = items.get(payload.itemId)?.title ?? '';
  if (payload.kind === 'workBlock') {
    const b = collectBlocks(qc).get(payload.blockId);
    label = (b && items.get(b.item_id)?.title) ?? '';
  }
  return (
    <div
      style={{
        display: 'inline-block', maxWidth: 260, padding: '6px 10px', borderRadius: tokens.radius.md,
        background: tokens.color.panel, boxShadow: tokens.shadow.drag, border: `1px solid ${tokens.color.border}`,
        fontSize: tokens.font.size.sm, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden',
        textOverflow: 'ellipsis', pointerEvents: 'none',
      }}
    >
      {label}
    </div>
  );
}
