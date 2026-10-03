import { format } from 'date-fns';
import { useRef, useState } from 'react';
import { isTempId } from '../../api/items';
import type { Item, WorkBlock } from '../../api/types';
import { useUpdateWorkBlock } from '../../api/workBlocks';
import { useTypedDraggable } from '../../dnd/hooks';
import { toRect } from '../../dnd/types';
import { HOUR_PX, MIN_BLOCK_MINUTES, MINUTES_PER_DAY, atMinutes, clamp, minutesSinceMidnight, roundTo15, toLocalStamp } from '../../domain/time';
import { useItemDetailStore } from '../../ui/itemDetailStore';
import { tokens } from '../../ui/tokens';

export function BlockView({ block, item, viewId, lane, lanes }: {
  block: WorkBlock;
  item: Item | undefined;
  viewId: string;
  lane: number;
  lanes: number;
}) {
  const temp = isTempId(block.id);
  const drag = useTypedDraggable({ id: `${viewId}:block:${block.id}`, payload: { kind: 'workBlock', blockId: block.id }, disabled: temp });
  const update = useUpdateWorkBlock();
  const openDetail = useItemDetailStore((s) => s.open);
  const [previewEnd, setPreviewEnd] = useState<number | null>(null);
  // The click that follows a resize's pointerup belongs to the resize, not to "open detail".
  const resizedRef = useRef(false);

  const start = new Date(block.start_at);
  const end = new Date(block.end_at);
  const startMin = minutesSinceMidnight(start);
  const sameDay = start.toDateString() === end.toDateString();
  const endMin = previewEnd ?? (sameDay ? minutesSinceMidnight(end) : MINUTES_PER_DAY);
  const height = ((endMin - startMin) / 60) * HOUR_PX;

  const onResizeDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const top = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect().top;
    const endAt = (clientY: number) =>
      clamp(roundTo15(startMin + ((clientY - top) / HOUR_PX) * 60), startMin + MIN_BLOCK_MINUTES, MINUTES_PER_DAY);
    const onMove = (ev: PointerEvent) => setPreviewEnd(endAt(ev.clientY));
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setPreviewEnd(null);
      resizedRef.current = true;
      const next = atMinutes(start, endAt(ev.clientY)).toISOString();
      if (Date.parse(next) !== Date.parse(block.end_at)) update.mutate({ id: block.id, patch: { end_at: next } });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const done = item?.status === 'completed';
  return (
    <div
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      data-testid={`calendar-block-${block.id}`}
      data-start={toLocalStamp(start)}
      data-end={toLocalStamp(previewEnd === null ? end : atMinutes(start, previewEnd))}
      onClick={(e) => {
        if (resizedRef.current) {
          resizedRef.current = false;
          return;
        }
        if (!temp) openDetail(block.item_id, toRect(e.currentTarget.getBoundingClientRect()));
      }}
      style={{
        position: 'absolute', top: (startMin / 60) * HOUR_PX + 1, height: Math.max(height - 2, 10),
        left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`,
        background: tokens.color.accentSoft, borderLeft: `3px solid ${tokens.color.accent}`, borderRadius: tokens.radius.sm,
        padding: '2px 6px', overflow: 'hidden', cursor: temp ? 'default' : 'grab', userSelect: 'none',
        opacity: drag.isDragging ? 0.35 : done ? 0.5 : 1, fontSize: tokens.font.size.xs, zIndex: 2,
      }}
    >
      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item?.title ?? ''}</div>
      {height >= 36 && (
        <div style={{ color: tokens.color.muted }}>
          {format(start, 'h:mm')}–{format(atMinutes(start, endMin), 'h:mm a')}
        </div>
      )}
      <div
        data-testid={`calendar-block-resize-${block.id}`}
        onPointerDown={onResizeDown}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, cursor: 'ns-resize' }}
      />
    </div>
  );
}
