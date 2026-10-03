import { duplicateView, removeView } from '../domain/layout';
import { Menu } from '../ui/Menu';
import { tokens } from '../ui/tokens';
import { useLayout } from './useWorkspaceLayout';

export function PanelMenu({ viewId }: { viewId: string }) {
  const { update } = useLayout();
  return (
    // Stop pointerdown so opening the menu never starts a panel drag (Task 19).
    <span onPointerDown={(e) => e.stopPropagation()}>
      <Menu
        align="right"
        trigger={({ toggle }) => (
          <button
            data-testid={`panel-menu-${viewId}`}
            aria-label="View options"
            onClick={toggle}
            style={{ border: 'none', background: 'transparent', borderRadius: tokens.radius.sm, padding: '0 6px', color: tokens.color.muted, fontSize: 16, lineHeight: '20px' }}
          >
            ⋯
          </button>
        )}
        items={[
          { key: 'duplicate', label: 'Duplicate view', testID: 'panel-menu-duplicate', onSelect: () => update((l) => duplicateView(l, viewId)) },
          { key: 'close', label: 'Close view', testID: 'panel-menu-close', danger: true, onSelect: () => update((l) => removeView(l, viewId)) },
        ]}
      />
    </span>
  );
}
