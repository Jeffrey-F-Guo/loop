import { format } from 'date-fns';
import { useMemo, useRef, useState } from 'react';
import { useItems } from '../../api/items';
import { useTypedDroppable } from '../../dnd/hooks';
import { shiftDays, toDateKey, weekDays, weekStart } from '../../domain/time';
import { tokens } from '../../ui/tokens';
import type { ViewProps } from '../../workspace/viewTypes';
import { timelineRows } from './geometry';
import { TimelineBar } from './TimelineBar';

const LABEL_WIDTH = 160;
const ROW_HEIGHT = 32;

function DayColumn({ viewId, date, index }: { viewId: string; date: Date; index: number }) {
  const key = toDateKey(date);
  const { setNodeRef, isOver } = useTypedDroppable({ id: `${viewId}:tday:${key}`, drop: { kind: 'timelineDay', date: key } });
  const isToday = key === toDateKey(new Date());
  return (
    <div
      ref={setNodeRef}
      data-testid={`timeline-day-${key}`}
      style={{
        position: 'absolute', top: 0, bottom: 0, left: `${(index / 7) * 100}%`, width: `${100 / 7}%`,
        borderLeft: index ? `1px solid ${tokens.color.border}` : 'none',
        background: isOver ? tokens.color.accentFaint : isToday ? 'rgba(15,15,15,0.015)' : 'transparent',
        boxShadow: isOver ? `inset 2px 0 0 ${tokens.color.accent}` : 'none',
      }}
    />
  );
}

export function TimelineView({ viewId }: ViewProps<Record<string, never>>) {
  const [start, setStart] = useState(() => weekStart(new Date()));
  const days = useMemo(() => weekDays(start), [start]);
  const { data: items = [] } = useItems();
  const rows = useMemo(() => timelineRows(items, start), [items, start]);
  const daysRef = useRef<HTMLDivElement>(null);

  const navButton = { border: 'none', background: 'transparent', padding: '2px 6px', borderRadius: tokens.radius.sm, color: tokens.color.muted };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: tokens.font.size.sm }}>
        <span style={{ flex: 1, fontWeight: 500 }}>{format(days[0], 'MMM d')} – {format(days[6], 'MMM d, yyyy')}</span>
        <button data-testid="timeline-prev" style={navButton} onClick={() => setStart((s) => shiftDays(s, -7))}>‹</button>
        <button data-testid="timeline-today" style={navButton} onClick={() => setStart(weekStart(new Date()))}>Today</button>
        <button data-testid="timeline-next" style={navButton} onClick={() => setStart((s) => shiftDays(s, 7))}>›</button>
      </div>
      <div style={{ display: 'flex', borderBottom: `1px solid ${tokens.color.border}`, fontSize: tokens.font.size.xs, color: tokens.color.muted }}>
        <div style={{ width: LABEL_WIDTH, flexShrink: 0 }} />
        {days.map((d) => (
          <div key={d.toISOString()} style={{ flex: 1, padding: '4px 6px', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {format(d, 'EEE d')}
          </div>
        ))}
      </div>
      <div data-drop-clip style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex' }}>
        <div style={{ width: LABEL_WIDTH, flexShrink: 0 }}>
          {rows.map(({ item }) => (
            <div key={item.id} style={{ height: ROW_HEIGHT, padding: '0 12px', lineHeight: `${ROW_HEIGHT}px`, fontSize: tokens.font.size.sm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.title}
            </div>
          ))}
        </div>
        <div ref={daysRef} data-role="timeline-days" style={{ position: 'relative', flex: 1, minHeight: Math.max(rows.length * ROW_HEIGHT, 120) }}>
          {days.map((d, i) => <DayColumn key={d.toISOString()} viewId={viewId} date={d} index={i} />)}
          {rows.map(({ item, geo }, i) => (
            <div key={item.id} style={{ position: 'absolute', left: 0, right: 0, top: i * ROW_HEIGHT, height: ROW_HEIGHT }}>
              <TimelineBar item={item} geo={geo} days={days} viewId={viewId} daysRef={daysRef} />
            </div>
          ))}
          {rows.length === 0 && (
            <div data-testid="timeline-empty" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tokens.color.muted, fontSize: tokens.font.size.sm, pointerEvents: 'none' }}>
              No dated Items in this period.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
