import type { CSSProperties } from 'react';
import { useDragStore } from '../dnd/dragStore';
import { useTypedDroppable } from '../dnd/hooks';
import type { DockEdge } from '../domain/layout';
import { tokens } from '../ui/tokens';

const EDGES: DockEdge[] = ['left', 'right', 'top', 'bottom', 'center'];

const ZONE: Record<DockEdge, CSSProperties> = {
  left: { left: 0, top: 0, bottom: 0, width: '25%' },
  right: { right: 0, top: 0, bottom: 0, width: '25%' },
  top: { top: 0, left: '25%', right: '25%', height: '30%' },
  bottom: { bottom: 0, left: '25%', right: '25%', height: '30%' },
  center: { top: '30%', bottom: '30%', left: '25%', right: '25%' },
};

const PREVIEW: Record<DockEdge, CSSProperties> = {
  left: { left: 4, top: 4, bottom: 4, width: 'calc(50% - 8px)' },
  right: { right: 4, top: 4, bottom: 4, width: 'calc(50% - 8px)' },
  top: { top: 4, left: 4, right: 4, height: 'calc(50% - 8px)' },
  bottom: { bottom: 4, left: 4, right: 4, height: 'calc(50% - 8px)' },
  center: { inset: 4 },
};

function Zone({ viewId, edge }: { viewId: string; edge: DockEdge }) {
  const { setNodeRef, isOver } = useTypedDroppable({ id: `dock:${viewId}:${edge}`, drop: { kind: 'panelZone', viewId, edge } });
  return (
    <>
      <div ref={setNodeRef} data-testid={`dock-zone-${viewId}-${edge}`} style={{ position: 'absolute', ...ZONE[edge] }} />
      {isOver && (
        <div
          style={{
            position: 'absolute', ...PREVIEW[edge], pointerEvents: 'none', borderRadius: tokens.radius.md,
            background: tokens.color.accentSoft, border: `2px solid ${tokens.color.accent}`,
            transition: `all ${tokens.motion.base}`,
          }}
        />
      )}
    </>
  );
}

export function DockZones({ viewId }: { viewId: string }) {
  const payload = useDragStore((s) => s.payload);
  if (!payload || payload.kind !== 'panel' || payload.viewId === viewId) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
      {EDGES.map((edge) => <Zone key={edge} viewId={viewId} edge={edge} />)}
    </div>
  );
}
