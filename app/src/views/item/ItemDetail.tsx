import { format } from 'date-fns';
import { useState } from 'react';
import { useDeleteItem, useUpdateItem } from '../../api/items';
import type { Item, UpdateItemInput } from '../../api/types';
import { useDeleteWorkBlock, useItemWorkBlocks } from '../../api/workBlocks';
import { atMinutes, fromDateKey, startOfDayLocal, toDateKey } from '../../domain/time';
import { tokens } from '../../ui/tokens';

const label = { fontSize: tokens.font.size.xs, color: tokens.color.muted, textTransform: 'uppercase' as const, letterSpacing: 0.4, marginTop: 14, marginBottom: 4 };
const field = { width: '100%', padding: '6px 8px', border: `1px solid ${tokens.color.border}`, borderRadius: tokens.radius.sm, background: tokens.color.panel, outline: 'none' };
const toTimeValue = (iso: string) => format(new Date(iso), 'HH:mm');
const parseTime = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
};

export function ItemDetail({ item, onClose }: { item: Item; onClose: () => void }) {
  const update = useUpdateItem();
  const del = useDeleteItem();
  const blocks = useItemWorkBlocks(item.id);
  const deleteBlock = useDeleteWorkBlock();
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? '');
  const [dateError, setDateError] = useState<string | null>(null);
  const [deadlineTime, setDeadlineTime] = useState(item.deadline_at ? toTimeValue(item.deadline_at) : '23:59');

  const save = (patch: UpdateItemInput) => update.mutate({ id: item.id, patch });

  const commitTitle = () => {
    const t = title.trim();
    if (!t) return setTitle(item.title);
    if (t !== item.title) save({ title: t });
    setTitle(t);
  };

  const commitDescription = () => {
    const d = description.trim() ? description : null;
    if (d !== item.description) save({ description: d });
  };

  const checkOrder = (open: string | null, deadline: string | null) => {
    if (open && deadline && Date.parse(open) > Date.parse(deadline)) {
      setDateError('Open date must be on or before the deadline');
      return false;
    }
    setDateError(null);
    return true;
  };

  const onOpenDate = (v: string) => {
    const open = v ? startOfDayLocal(fromDateKey(v)).toISOString() : null;
    if (checkOrder(open, item.deadline_at)) save({ open_at: open });
  };

  const onDeadline = (dateKey: string, time: string) => {
    const deadline = dateKey ? atMinutes(fromDateKey(dateKey), parseTime(time || '23:59')).toISOString() : null;
    if (checkOrder(item.open_at, deadline)) save({ deadline_at: deadline });
  };

  return (
    <div
      data-testid="item-detail"
      onMouseDown={(e) => e.stopPropagation()}
      style={{ background: tokens.color.panel, borderRadius: tokens.radius.lg, boxShadow: tokens.shadow.popover, padding: 16 }}
    >
      <input
        data-testid="item-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        maxLength={500}
        style={{ ...field, border: 'none', padding: 0, fontSize: tokens.font.size.lg, fontWeight: 600 }}
      />
      <textarea
        data-testid="item-description"
        value={description}
        placeholder="Add a description"
        onChange={(e) => setDescription(e.target.value)}
        onBlur={commitDescription}
        rows={2}
        style={{ ...field, border: 'none', padding: 0, marginTop: 6, resize: 'vertical', color: tokens.color.muted }}
      />

      <div style={label}>Open</div>
      <input data-testid="item-open-date" type="date" value={item.open_at ? toDateKey(new Date(item.open_at)) : ''} onChange={(e) => onOpenDate(e.target.value)} style={field} />

      <div style={label}>Deadline</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          data-testid="item-deadline-date"
          type="date"
          value={item.deadline_at ? toDateKey(new Date(item.deadline_at)) : ''}
          onChange={(e) => onDeadline(e.target.value, deadlineTime)}
          style={{ ...field, flex: 1 }}
        />
        <input
          data-testid="item-deadline-time"
          type="time"
          step={900}
          value={deadlineTime}
          onChange={(e) => {
            setDeadlineTime(e.target.value);
            if (item.deadline_at) onDeadline(toDateKey(new Date(item.deadline_at)), e.target.value);
          }}
          style={{ ...field, width: 110 }}
        />
      </div>
      {dateError && <div data-testid="item-date-error" style={{ color: tokens.color.danger, fontSize: tokens.font.size.sm, marginTop: 6 }}>{dateError}</div>}

      <div style={label}>Scheduled</div>
      {(blocks.data ?? []).length === 0 && <div style={{ fontSize: tokens.font.size.sm, color: tokens.color.faint }}>Not scheduled</div>}
      {(blocks.data ?? []).map((b) => (
        <div key={b.id} data-testid={`item-block-${b.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: tokens.font.size.sm, padding: '2px 0' }}>
          <span>{format(new Date(b.start_at), 'EEE')} · {format(new Date(b.start_at), 'h:mm')} – {format(new Date(b.end_at), 'h:mm a')}</span>
          <button data-testid={`item-block-delete-${b.id}`} aria-label="Remove block" onClick={() => deleteBlock.mutate({ id: b.id })} style={{ border: 'none', background: 'transparent', color: tokens.color.muted }}>×</button>
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
        <button
          data-testid="item-complete-toggle"
          onClick={() => save({ status: item.status === 'completed' ? 'active' : 'completed' })}
          style={{ border: `1px solid ${tokens.color.border}`, borderRadius: tokens.radius.md, background: 'transparent', color: tokens.color.text, padding: '5px 10px' }}
        >
          {item.status === 'completed' ? 'Reopen' : 'Mark complete'}
        </button>
        <span style={{ flex: 1 }} />
        <button
          data-testid="item-delete"
          onClick={() => {
            if (!window.confirm(`Delete "${item.title}"? Its scheduled blocks will be removed too.`)) return;
            del.mutate({ id: item.id });
            onClose();
          }}
          style={{ border: 'none', background: 'transparent', color: tokens.color.danger, padding: '6px 10px' }}
        >
          Delete
        </button>
        <button
          data-testid="item-done"
          // Edits already saved as they were made (title/description commit on the blur this click causes).
          onClick={onClose}
          style={{ border: 'none', borderRadius: tokens.radius.md, background: tokens.color.accent, color: '#fff', padding: '6px 14px', fontWeight: 500 }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
