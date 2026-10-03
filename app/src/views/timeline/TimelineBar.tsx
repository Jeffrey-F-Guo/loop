import { useState, type RefObject } from 'react';
import { useUpdateItem } from '../../api/items';
import type { Item, UpdateItemInput } from '../../api/types';
import { useTypedDraggable } from '../../dnd/hooks';
import { toRect } from '../../dnd/types';
import { clamp, fromDateKey, toDateKey } from '../../domain/time';
import { setDeadlineDay, setOpenDay } from '../../domain/timeline';
import { useItemDetailStore } from '../../ui/itemDetailStore';
import { tokens } from '../../ui/tokens';
import type { BarGeometry } from './geometry';

type Edge = 'left' | 'right';

export function TimelineBar({ item, geo, days, viewId, daysRef }: {
  item: Item;
  geo: BarGeometry;
  days: Date[];
  viewId: string;
  daysRef: RefObject<HTMLDivElement | null>;
}) {
  const drag = useTypedDraggable({ id: `${viewId}:bar:${item.id}`, payload: { kind: 'timelineBar', itemId: item.id } });
  const update = useUpdateItem();
  const openDetail = useItemDetailStore((s) => s.open);
  const [preview, setPreview] = useState<{ edge: Edge; col: number } | null>(null);

  const colAt = (clientX: number) => {
    const r = daysRef.current!.getBoundingClientRect();
    return clamp(Math.floor(((clientX - r.left) / r.width) * 7), 0, 6);
  };

  const startEdgeDrag = (edge: Edge) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const onMove = (ev: PointerEvent) => setPreview({ edge, col: colAt(ev.clientX) });
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setPreview(null);
      const day = days[colAt(ev.clientX)];
      const patch: UpdateItemInput = edge === 'left' ? setOpenDay(item, day) : setDeadlineDay(item, day);
      const field = edge === 'left' ? 'open_at' : 'deadline_at';
      if (patch[field] !== item[field]) update.mutate({ id: item.id, patch });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const pct = (c: number) => `${(c / 7) * 100}%`;
  const deadlineKey = item.deadline_at ? toDateKey(new Date(item.deadline_at)) : '';

  if (geo.kind === 'marker') {
    return (
      <div
        ref={drag.setNodeRef}
        {...drag.listeners}
        {...drag.attributes}
        data-testid={`timeline-marker-${item.id}`}
        data-deadline-date={deadlineKey}
        title={`${item.title} · due ${deadlineKey}`}
        onClick={(e) => openDetail(item.id, toRect(e.currentTarget.getBoundingClientRect()))}
        style={{
          position: 'absolute', top: 8, left: `calc(${pct(geo.col)} + ${100 / 14}% - 6px)`, width: 12, height: 12,
          borderRadius: 6, background: tokens.color.accent, cursor: 'grab', opacity: drag.isDragging ? 0.4 : 1,
        }}
      />
    );
  }

  let { startCol, endCol } = geo;
  if (preview?.edge === 'left') startCol = Math.min(preview.col, endCol);
  if (preview?.edge === 'right') endCol = Math.max(preview.col, startCol);
  const openKey = toDateKey(new Date(item.open_at!));
  const fmt = (k: string) => fromDateKey(k).toLocaleDateString(undefined, { weekday: 'short' });

  return (
    <div
      data-testid={`timeline-bar-${item.id}`}
      data-open-date={openKey}
      data-deadline-date={deadlineKey}
      title={`${item.title} · ${fmt(openKey)} → ${fmt(deadlineKey)}`}
      style={{
        position: 'absolute', top: 5, height: 22, left: `calc(${pct(startCol)} + 2px)`, width: `calc(${pct(endCol - startCol + 1)} - 4px)`,
        display: 'flex', alignItems: 'stretch', background: tokens.color.accentSoft, borderRadius: tokens.radius.sm,
        borderRight: geo.clippedRight ? 'none' : `2px solid ${tokens.color.accent}`, opacity: drag.isDragging ? 0.4 : 1,
        transition: preview ? 'none' : `left ${tokens.motion.base}, width ${tokens.motion.base}`,
      }}
    >
      {!geo.clippedLeft && (
        <div data-testid={`timeline-bar-left-${item.id}`} onPointerDown={startEdgeDrag('left')} style={{ width: 6, cursor: 'ew-resize', flexShrink: 0 }} />
      )}
      <div
        ref={drag.setNodeRef}
        {...drag.listeners}
        {...drag.attributes}
        onClick={(e) => openDetail(item.id, toRect(e.currentTarget.getBoundingClientRect()))}
        style={{
          flex: 1, minWidth: 0, padding: '0 6px', fontSize: tokens.font.size.xs, lineHeight: '22px', cursor: 'grab',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: tokens.color.text,
        }}
      >
        {item.title}
      </div>
      {!geo.clippedRight && (
        <div data-testid={`timeline-bar-right-${item.id}`} onPointerDown={startEdgeDrag('right')} style={{ width: 6, cursor: 'ew-resize', flexShrink: 0 }} />
      )}
    </div>
  );
}
