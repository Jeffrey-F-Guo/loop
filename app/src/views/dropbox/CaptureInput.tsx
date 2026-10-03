import { useEffect, useRef, useState } from 'react';
import { tempId, useCreateItem } from '../../api/items';
import { registerCapture } from '../../ui/captureBus';
import { tokens } from '../../ui/tokens';

export function CaptureInput() {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const create = useCreateItem();

  useEffect(() => registerCapture(() => ref.current?.focus()), []);

  return (
    <input
      ref={ref}
      data-testid="dropbox-input"
      placeholder="Add something..."
      maxLength={500}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') ref.current?.blur();
        if (e.key !== 'Enter') return;
        const title = value.trim();
        if (!title) return;
        create.mutate({ tempId: tempId('i'), input: { title } });
        setValue('');
      }}
      style={{
        width: '100%', padding: '8px 10px', border: `1px solid ${tokens.color.border}`, borderRadius: tokens.radius.md,
        background: tokens.color.panel, outline: 'none', fontSize: tokens.font.size.md,
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = tokens.color.accent)}
      onBlur={(e) => (e.currentTarget.style.borderColor = tokens.color.border)}
    />
  );
}
