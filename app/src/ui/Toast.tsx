import { tokens } from './tokens';
import { useToastStore } from './toastStore';

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 100, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          data-testid="toast"
          role="status"
          style={{
            padding: '8px 12px', borderRadius: tokens.radius.md, background: tokens.color.text, color: '#fff',
            fontSize: tokens.font.size.sm, boxShadow: tokens.shadow.popover,
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
