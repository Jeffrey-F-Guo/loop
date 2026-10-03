import { addView } from '../domain/layout';
import { DEFAULT_DROPBOX_SECTIONS } from '../domain/scheduling';
import { tokens } from '../ui/tokens';
import { LayoutNodeView } from './LayoutNodeView';
import { useLayout } from './useWorkspaceLayout';

export function Workspace() {
  const { layout, update } = useLayout();
  if (!layout) return null;
  if (!layout.root) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: tokens.color.muted }}>
        <div>No views open</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => update((l) => addView(l, { type: 'dropbox', config: { sections: [...DEFAULT_DROPBOX_SECTIONS] } }))}>Dropbox</button>
          <button onClick={() => update((l) => addView(l, { type: 'calendar', config: { mode: 'week' } }))}>Calendar</button>
          <button onClick={() => update((l) => addView(l, { type: 'timeline', config: {} }))}>Timeline</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, padding: 8 }}>
      <LayoutNodeView node={layout.root} />
    </div>
  );
}
