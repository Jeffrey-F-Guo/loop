import { useEffect, useRef, useState, type ReactNode } from 'react';
import { tokens } from './tokens';

export interface MenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  testID?: string;
  danger?: boolean;
  checked?: boolean;
}

export function Menu({ trigger, items, align = 'left' }: {
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', [align]: 0, zIndex: 50, minWidth: 160, padding: 4,
            background: tokens.color.panel, borderRadius: tokens.radius.md, boxShadow: tokens.shadow.popover,
          }}
        >
          {items.map((it) => (
            <button
              key={it.key}
              role="menuitem"
              data-testid={it.testID}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              style={{
                display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '6px 8px', border: 'none', borderRadius: tokens.radius.sm, background: 'transparent',
                textAlign: 'left', fontSize: tokens.font.size.sm,
                color: it.danger ? tokens.color.danger : tokens.color.text,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = tokens.color.hover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span>{it.label}</span>
              {it.checked && <span style={{ color: tokens.color.accent }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
