import { useState } from 'react';
import { isTempId, useUpdateItem } from '../../api/items';
import type { Item } from '../../api/types';
import { useTypedDraggable } from '../../dnd/hooks';
import { toRect } from '../../dnd/types';
import { useItemDetailStore } from '../../ui/itemDetailStore';
import { tokens } from '../../ui/tokens';
import { itemMeta } from './itemMeta';

export function ItemRow({ item, viewId }: { item: Item; viewId: string }) {
  const temp = isTempId(item.id);
  const drag = useTypedDraggable({ id: `${viewId}:item:${item.id}`, payload: { kind: 'item', itemId: item.id }, disabled: temp });
  const update = useUpdateItem();
  const openDetail = useItemDetailStore((s) => s.open);
  const [hover, setHover] = useState(false);
  const done = item.status === 'completed';
  const meta = itemMeta(item, new Date());

  return (
    <div
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      data-testid={`item-row-${item.id}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => !temp && openDetail(item.id, toRect(e.currentTarget.getBoundingClientRect()))}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 8px', borderRadius: tokens.radius.md,
        background: hover ? tokens.color.hover : 'transparent', opacity: drag.isDragging ? 0.4 : temp ? 0.7 : 1,
        cursor: temp ? 'default' : 'grab', userSelect: 'none', transition: `background ${tokens.motion.fast}`,
      }}
    >
      <button
        data-testid={`item-complete-${item.id}`}
        aria-label={done ? 'Mark active' : 'Mark complete'}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (!temp) update.mutate({ id: item.id, patch: { status: done ? 'active' : 'completed' } });
        }}
        style={{
          flexShrink: 0, width: 16, height: 16, marginTop: 2, borderRadius: 8, padding: 0,
          border: `1.5px solid ${done ? tokens.color.accent : tokens.color.borderStrong}`,
          background: done ? tokens.color.accent : 'transparent',
        }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          data-role="title"
          style={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: done ? tokens.color.muted : tokens.color.text, textDecoration: done ? 'line-through' : 'none',
          }}
        >
          {item.title}
        </div>
        {meta && <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.muted, marginTop: 1 }}>{meta}</div>}
      </div>
    </div>
  );
}
