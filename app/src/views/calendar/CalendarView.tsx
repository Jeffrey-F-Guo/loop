import { format } from 'date-fns';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useItemsById } from '../../api/items';
import type { CalendarMode } from '../../api/types';
import { useWorkBlocks } from '../../api/workBlocks';
import { HOUR_PX, shiftDays, startOfDayLocal, toDateKey, weekDays, weekStart } from '../../domain/time';
import { tokens } from '../../ui/tokens';
import type { ViewProps } from '../../workspace/viewTypes';
import { DayColumn } from './DayColumn';

const GUTTER = 52;

export function CalendarView({ viewId, config, setConfig }: ViewProps<{ mode: CalendarMode }>) {
  const [anchor, setAnchor] = useState(() => startOfDayLocal(new Date()));
  const days = useMemo(() => (config.mode === 'week' ? weekDays(weekStart(anchor)) : [anchor]), [anchor, config.mode]);
  const range = useMemo(() => ({ start: days[0], end: shiftDays(days[days.length - 1], 1) }), [days]);
  const { data: blocks = [] } = useWorkBlocks(range);
  const items = useItemsById();
  const scrollRef = useRef<HTMLDivElement>(null);
  const step = config.mode === 'week' ? 7 : 1;

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 8 * HOUR_PX;
  }, []);

  const byDay = useMemo(() => {
    const m = new Map<string, typeof blocks>();
    for (const b of blocks) {
      const k = toDateKey(new Date(b.start_at));
      m.set(k, [...(m.get(k) ?? []), b]);
    }
    return m;
  }, [blocks]);

  const todayKey = toDateKey(new Date());
  const navButton = { border: 'none', background: 'transparent', padding: '2px 6px', borderRadius: tokens.radius.sm, color: tokens.color.muted };
  const modeButton = (m: CalendarMode) => ({
    ...navButton, color: config.mode === m ? tokens.color.text : tokens.color.muted, fontWeight: config.mode === m ? 600 : 400,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: tokens.font.size.sm }}>
        <span style={{ flex: 1, fontWeight: 500 }}>
          {config.mode === 'week' ? `${format(days[0], 'MMM d')} – ${format(days[6], 'MMM d, yyyy')}` : format(anchor, 'EEEE, MMM d')}
        </span>
        <button data-testid="calendar-mode-day" style={modeButton('day')} onClick={() => setConfig({ mode: 'day' })}>Day</button>
        <button data-testid="calendar-mode-week" style={modeButton('week')} onClick={() => setConfig({ mode: 'week' })}>Week</button>
        <span style={{ width: 8 }} />
        <button data-testid="calendar-prev" style={navButton} onClick={() => setAnchor((a) => shiftDays(a, -step))}>‹</button>
        <button data-testid="calendar-today" style={navButton} onClick={() => setAnchor(startOfDayLocal(new Date()))}>Today</button>
        <button data-testid="calendar-next" style={navButton} onClick={() => setAnchor((a) => shiftDays(a, step))}>›</button>
      </div>
      <div style={{ display: 'flex', paddingLeft: GUTTER, borderBottom: `1px solid ${tokens.color.border}`, fontSize: tokens.font.size.xs }}>
        {days.map((d) => {
          const isToday = toDateKey(d) === todayKey;
          return (
            <div key={d.toISOString()} style={{ flex: 1, padding: '4px 6px', color: isToday ? tokens.color.accent : tokens.color.muted, fontWeight: isToday ? 600 : 400, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {format(d, 'EEE d')}
            </div>
          );
        })}
      </div>
      <div ref={scrollRef} data-drop-clip style={{ position: 'relative', flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ display: 'flex' }}>
          <div style={{ width: GUTTER, flexShrink: 0, position: 'relative', height: 24 * HOUR_PX }}>
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <div key={h} style={{ position: 'absolute', top: h * HOUR_PX - 7, right: 8, fontSize: tokens.font.size.xs, color: tokens.color.faint }}>
                {format(new Date(2000, 0, 1, h), 'h a')}
              </div>
            ))}
          </div>
          {days.map((d) => (
            <DayColumn key={d.toISOString()} viewId={viewId} date={d} blocks={byDay.get(toDateKey(d)) ?? []} items={items} />
          ))}
        </div>
        {blocks.length === 0 && (
          <div data-testid="calendar-empty" style={{ position: 'sticky', top: 12, marginTop: -24 * HOUR_PX, textAlign: 'center', color: tokens.color.muted, fontSize: tokens.font.size.sm, pointerEvents: 'none' }}>
            Nothing scheduled. Drag an Item here to plan time.
          </div>
        )}
      </div>
    </div>
  );
}
