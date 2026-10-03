import { addView } from '../domain/layout';
import { DEFAULT_DROPBOX_SECTIONS } from '../domain/scheduling';
import { Menu } from '../ui/Menu';
import { tokens } from '../ui/tokens';
import { useLayout } from '../workspace/useWorkspaceLayout';

export function AddViewMenu() {
  const { update } = useLayout();
  return (
    <Menu
      align="right"
      trigger={({ toggle }) => (
        <button data-testid="add-view" onClick={toggle} style={{ border: 'none', background: 'transparent', padding: '4px 8px', borderRadius: tokens.radius.sm, color: tokens.color.muted }}>
          + View
        </button>
      )}
      items={[
        { key: 'dropbox', label: 'Dropbox', testID: 'add-view-dropbox', onSelect: () => update((l) => addView(l, { type: 'dropbox', config: { sections: [...DEFAULT_DROPBOX_SECTIONS] } })) },
        { key: 'calendar', label: 'Calendar', testID: 'add-view-calendar', onSelect: () => update((l) => addView(l, { type: 'calendar', config: { mode: 'week' } })) },
        { key: 'timeline', label: 'Timeline', testID: 'add-view-timeline', onSelect: () => update((l) => addView(l, { type: 'timeline', config: {} })) },
      ]}
    />
  );
}
