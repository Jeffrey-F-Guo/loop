import type { ViewNode } from '../api/types';
import { useTypedDraggable } from '../dnd/hooks';
import { tokens } from '../ui/tokens';
import { DockZones } from './DockZones';
import { PanelMenu } from './PanelMenu';
import { panelTitle } from './panelTitle';
import { ViewHost } from './ViewHost';

export function Panel({ node }: { node: ViewNode }) {
  const drag = useTypedDraggable({ id: `panel:${node.id}`, payload: { kind: 'panel', viewId: node.id } });
  return (
    <div
      data-testid={`panel-${node.id}`}
      data-view-type={node.view.type}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minWidth: 0, minHeight: 0,
        background: tokens.color.panel, border: `1px solid ${tokens.color.border}`, borderRadius: tokens.radius.lg, overflow: 'hidden',
        opacity: drag.isDragging ? 0.5 : 1,
      }}
    >
      <div
        ref={drag.setNodeRef}
        {...drag.listeners}
        {...drag.attributes}
        data-testid={`panel-header-${node.id}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 8px 0 12px', flexShrink: 0,
          borderBottom: `1px solid ${tokens.color.border}`, fontSize: tokens.font.size.sm, fontWeight: 600, cursor: 'grab',
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{panelTitle(node.view)}</span>
        <PanelMenu viewId={node.id} />
      </div>
      <div data-drop-clip style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ViewHost node={node} />
      </div>
      <DockZones viewId={node.id} />
    </div>
  );
}
