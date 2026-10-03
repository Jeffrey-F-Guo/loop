import { useQueryClient } from '@tanstack/react-query';
import { collectBlocks } from '../../api/blockCache';
import type { Item, WorkBlock } from '../../api/types';
import { useDragStore } from '../../dnd/dragStore';
import { useTypedDroppable } from '../../dnd/hooks';
import { usePreviewAction } from '../../dnd/usePreviewAction';
import { dayInWindow } from '../../domain/range';
import { HOUR_PX, MINUTES_PER_DAY, minutesSinceMidnight, toDateKey } from '../../domain/time';
import { tokens } from '../../ui/tokens';
import { BlockView } from './BlockView';
import { assignLanes } from './lanes';

const SLOT_PX = HOUR_PX / 4;
const slotLabel = (i: number) => `${String(Math.floor(i / 4)).padStart(2, '0')}${String((i % 4) * 15).padStart(2, '0')}`;
const OUT_OF_RANGE_BG = `repeating-linear-gradient(-45deg, ${tokens.color.hover} 0 6px, transparent 6px 12px)`;

/** The Item behind the current drag (Dropbox row, Timeline bar, or Calendar block), if any. */
function useDraggedItem(items: Map<string, Item>): Item | null {
  const qc = useQueryClient();
  const payload = useDragStore((s) => s.payload);
  if (!payload) return null;
  if (payload.kind === 'item' || payload.kind === 'timelineBar') return items.get(payload.itemId) ?? null;
  if (payload.kind === 'workBlock') {
    const block = collectBlocks(qc).get(payload.blockId);
    return (block && items.get(block.item_id)) ?? null;
  }
  return null;
}

export function DayColumn({ viewId, date, blocks, items }: {
  viewId: string;
  date: Date;
  blocks: WorkBlock[];
  items: Map<string, Item>;
}) {
  const key = toDateKey(date);
  const drop = { kind: 'calendarDay', date: key } as const;
  const { setNodeRef, isOver, getRect } = useTypedDroppable({ id: `${viewId}:cday:${key}`, drop });
  const preview = usePreviewAction(drop, isOver, getRect);
  const dragged = useDraggedItem(items);
  const outOfRange = !!dragged && !dayInWindow(dragged, date);
  const lanes = assignLanes(blocks.map((b) => ({
    id: b.id,
    start: minutesSinceMidnight(new Date(b.start_at)),
    end: Math.max(minutesSinceMidnight(new Date(b.start_at)) + 15, minutesSinceMidnight(new Date(b.end_at)) || MINUTES_PER_DAY),
  })));

  let ghost: { top: number; height: number } | null = null;
  if (preview && (preview.type === 'createBlock' || preview.type === 'moveBlock')) {
    const s = new Date(preview.startAt);
    const e = new Date(preview.endAt);
    if (toDateKey(s) === key) {
      ghost = { top: (minutesSinceMidnight(s) / 60) * HOUR_PX, height: ((e.getTime() - s.getTime()) / 3_600_000) * HOUR_PX };
    }
  }

  return (
    <div
      ref={setNodeRef}
      data-testid={`calendar-day-${key}`}
      data-out-of-range={outOfRange || undefined}
      style={{
        position: 'relative', flex: 1, minWidth: 0, height: 24 * HOUR_PX, borderLeft: `1px solid ${tokens.color.border}`,
        background: outOfRange ? OUT_OF_RANGE_BG : isOver && preview?.type !== 'none' ? tokens.color.accentFaint : 'transparent',
      }}
    >
      {Array.from({ length: 96 }, (_, i) => (
        <div
          key={i}
          data-testid={`calendar-slot-${key}-${slotLabel(i)}`}
          style={{ position: 'absolute', left: 0, right: 0, top: i * SLOT_PX, height: SLOT_PX, borderTop: i % 4 === 0 && i ? `1px solid ${tokens.color.border}` : 'none' }}
        />
      ))}
      {ghost && (
        <div
          data-testid="calendar-ghost"
          style={{ position: 'absolute', left: 2, right: 2, top: ghost.top, height: ghost.height, border: `1.5px dashed ${tokens.color.accent}`, borderRadius: tokens.radius.sm, background: tokens.color.accentFaint, pointerEvents: 'none', zIndex: 3 }}
        />
      )}
      {blocks.map((b) => {
        const l = lanes.get(b.id) ?? { lane: 0, lanes: 1 };
        return <BlockView key={b.id} block={b} item={items.get(b.item_id)} viewId={viewId} lane={l.lane} lanes={l.lanes} />;
      })}
    </div>
  );
}
