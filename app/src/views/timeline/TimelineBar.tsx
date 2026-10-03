import { useQueryClient } from '@tanstack/react-query';
import { useState, type RefObject } from 'react';
import { useApi } from '../../api/ApiProvider';
import { collectBlocks } from '../../api/blockCache';
import { useUpdateItem } from '../../api/items';
import type { Item, UpdateItemInput } from '../../api/types';
import { itemBlocksQuery } from '../../api/workBlocks';
import { useDragStore } from '../../dnd/dragStore';
import { useTypedDraggable } from '../../dnd/hooks';
import { toRect } from '../../dnd/types';
import { formatMinutes } from '../../domain/scheduling';
import { clamp, daysBetween, fromDateKey, startOfDayLocal, toDateKey } from '../../domain/time';
import { setDeadlineDay, setOpenDay } from '../../domain/timeline';
import { useItemDetailStore } from '../../ui/itemDetailStore';
import { tokens } from '../../ui/tokens';
import type { BarGeometry } from './geometry';

type Edge = 'left' | 'right';

/**
 * While this item's bar is being dragged and the pointer is over this Timeline's day area,
 * the whole-day shift the drop would apply; otherwise null.
 */
function useMoveShift(itemId: string, daysRef: RefObject<HTMLDivElement | null>): number | null {
  return useDragStore((s) => {
    if (s.payload?.kind !== 'timelineBar' || s.payload.itemId !== itemId || !daysRef.current) return null;
    const r = daysRef.current.getBoundingClientRect();
    const p = s.pointer;
    if (p.x < r.left || p.x > r.left + r.width || p.y < r.top || p.y > r.top + r.height) return null;
    return Math.round((p.x - s.pointerStart.x) / (r.width / 7));
  });
}

function EdgeHandle({ testID, onPointerDown, visible }: { testID: string; onPointerDown: (e: React.PointerEvent) => void; visible: boolean }) {
  return (
    <div
      data-testid={testID}
      onPointerDown={onPointerDown}
      title="Drag to change the date"
      style={{ width: 10, flexShrink: 0, cursor: 'ew-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ width: 3, height: 12, borderRadius: 2, background: tokens.color.accent, opacity: visible ? 0.9 : 0, transition: `opacity ${tokens.motion.fast}` }} />
    </div>
  );
}

/** The task's total scheduled Calendar time, shown quietly at the end of its bar. */
function ScheduledTime({ item, style }: { item: Item; style?: React.CSSProperties }) {
  if (item.scheduled_minutes <= 0) return null;
  return (
    <span
      data-testid={`timeline-time-${item.id}`}
      title={`${formatMinutes(item.scheduled_minutes)} scheduled on the calendar`}
      style={{ flexShrink: 0, fontSize: 10, color: tokens.color.muted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', ...style }}
    >
      {formatMinutes(item.scheduled_minutes)}
    </span>
  );
}

export function TimelineBar({ item, geo, days, viewId, daysRef }: {
  item: Item;
  geo: BarGeometry;
  days: Date[];
  viewId: string;
  daysRef: RefObject<HTMLDivElement | null>;
}) {
  const drag = useTypedDraggable({ id: `${viewId}:bar:${item.id}`, payload: { kind: 'timelineBar', itemId: item.id } });
  const update = useUpdateItem();
  const api = useApi();
  const qc = useQueryClient();
  const openDetail = useItemDetailStore((s) => s.open);
  const [edgePreview, setEdgePreview] = useState<{ edge: Edge; patch: UpdateItemInput } | null>(null);
  const [hover, setHover] = useState(false);
  const shift = useMoveShift(item.id, daysRef);

  const colAt = (clientX: number) => {
    const r = daysRef.current!.getBoundingClientRect();
    return clamp(Math.floor(((clientX - r.left) / r.width) * 7), 0, 6);
  };
  const colOf = (iso: string) => clamp(daysBetween(days[0], startOfDayLocal(new Date(iso))), 0, 6);

  // Edges stop where they would leave a scheduled block outside the range. All blocks known for
  // this item count: cached Calendar weeks plus the item's full list, fetched when the edge is grabbed.
  const edgePatch = (edge: Edge, clientX: number): UpdateItemInput => {
    const blocks = [...collectBlocks(qc).values()].filter((b) => b.item_id === item.id);
    const day = days[colAt(clientX)];
    return edge === 'left' ? setOpenDay(item, day, blocks) : setDeadlineDay(item, day, blocks);
  };

  const startEdgeDrag = (edge: Edge) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    void qc.prefetchQuery(itemBlocksQuery(api, item.id));
    const onMove = (ev: PointerEvent) => setEdgePreview({ edge, patch: edgePatch(edge, ev.clientX) });
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setEdgePreview(null);
      const patch = edgePatch(edge, ev.clientX);
      const field = edge === 'left' ? 'open_at' : 'deadline_at';
      if (patch[field] !== item[field]) update.mutate({ id: item.id, patch });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const pct = (c: number) => `${(c / 7) * 100}%`;
  const deadlineKey = item.deadline_at ? toDateKey(new Date(item.deadline_at)) : '';
  const moving = shift !== null;
  const shiftAttr = moving && shift !== 0 ? shift : undefined;
  const movingStyle = moving ? { opacity: 1, boxShadow: `0 0 0 1.5px ${tokens.color.accent}, ${tokens.shadow.drag}` } : {};

  if (geo.kind === 'marker') {
    const col = clamp(geo.col + (shift ?? 0), 0, 6);
    return (
      <>
        <div
          ref={drag.setNodeRef}
          {...drag.listeners}
          {...drag.attributes}
          data-testid={`timeline-marker-${item.id}`}
          data-deadline-date={deadlineKey}
          data-preview-shift={shiftAttr}
          title={`${item.title} · due ${deadlineKey}`}
          onClick={(e) => openDetail(item.id, toRect(e.currentTarget.getBoundingClientRect()), { from: 'timeline' })}
          style={{
            position: 'absolute', top: 8, left: `calc(${pct(col)} + ${100 / 14}% - 6px)`, width: 12, height: 12,
            borderRadius: 6, background: tokens.color.accent, cursor: 'grab', opacity: drag.isDragging ? 0.4 : 1,
            ...movingStyle,
          }}
        />
        <ScheduledTime
          item={item}
          style={{ position: 'absolute', top: 6, left: `calc(${pct(col)} + ${100 / 14}% + 9px)`, lineHeight: '16px', pointerEvents: 'none' }}
        />
      </>
    );
  }

  let { startCol, endCol } = geo;
  if (edgePreview?.edge === 'left' && edgePreview.patch.open_at) startCol = Math.min(colOf(edgePreview.patch.open_at), endCol);
  if (edgePreview?.edge === 'right' && edgePreview.patch.deadline_at) endCol = Math.max(colOf(edgePreview.patch.deadline_at), startCol);
  if (moving) {
    startCol = clamp(startCol + shift, 0, 6);
    endCol = clamp(endCol + shift, 0, 6);
  }
  const openKey = toDateKey(new Date(item.open_at!));
  const fmt = (k: string) => fromDateKey(k).toLocaleDateString(undefined, { weekday: 'short' });
  const showGrips = hover || !!edgePreview;

  return (
    <div
      data-testid={`timeline-bar-${item.id}`}
      data-open-date={openKey}
      data-deadline-date={deadlineKey}
      data-preview-shift={shiftAttr}
      title={`${item.title} · ${fmt(openKey)} → ${fmt(deadlineKey)}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute', top: 5, height: 22, left: `calc(${pct(startCol)} + 2px)`, width: `calc(${pct(endCol - startCol + 1)} - 4px)`,
        display: 'flex', alignItems: 'stretch', background: tokens.color.accentSoft, borderRadius: tokens.radius.sm,
        borderRight: geo.clippedRight ? 'none' : `2px solid ${tokens.color.accent}`, opacity: drag.isDragging ? 0.4 : 1,
        transition: edgePreview || moving ? 'none' : `left ${tokens.motion.base}, width ${tokens.motion.base}`,
        zIndex: moving ? 2 : undefined,
        ...movingStyle,
      }}
    >
      {!geo.clippedLeft && <EdgeHandle testID={`timeline-bar-left-${item.id}`} onPointerDown={startEdgeDrag('left')} visible={showGrips} />}
      <div
        ref={drag.setNodeRef}
        {...drag.listeners}
        {...drag.attributes}
        onClick={(e) => openDetail(item.id, toRect(e.currentTarget.getBoundingClientRect()), { from: 'timeline' })}
        style={{
          flex: 1, minWidth: 0, padding: '0 4px', fontSize: tokens.font.size.xs, lineHeight: '22px', cursor: moving ? 'grabbing' : 'grab',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: tokens.color.text,
        }}
      >
        {item.title}
      </div>
      <ScheduledTime item={item} style={{ lineHeight: '22px', paddingRight: geo.clippedRight ? 4 : 0 }} />
      {!geo.clippedRight && <EdgeHandle testID={`timeline-bar-right-${item.id}`} onPointerDown={startEdgeDrag('right')} visible={showGrips} />}
    </div>
  );
}
