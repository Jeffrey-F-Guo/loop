import { useState, type RefObject } from 'react';
import type { SplitNode } from '../api/types';
import { setSizes } from '../domain/layout';
import { tokens } from '../ui/tokens';
import { GUTTER_PX } from './LayoutNodeView';
import { MIN_PANEL_PX, resizePair } from './resize';
import { useLayout } from './useWorkspaceLayout';

export function Divider({ split, index, containerRef }: { split: SplitNode; index: number; containerRef: RefObject<HTMLDivElement | null> }) {
  const { update } = useLayout();
  const [state, setState] = useState<'idle' | 'hover' | 'active'>('idle');
  const horizontal = split.direction === 'row';

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current!.getBoundingClientRect();
    const usable = (horizontal ? rect.width : rect.height) - GUTTER_PX * (split.children.length - 1);
    const start = horizontal ? e.clientX : e.clientY;
    const startSizes = split.sizes;
    setState('active');
    const onMove = (ev: PointerEvent) => {
      const delta = ((horizontal ? ev.clientX : ev.clientY) - start) / usable;
      update((l) => setSizes(l, split.id, resizePair(startSizes, index, delta, MIN_PANEL_PX / usable)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setState('idle');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      data-testid={`divider-${split.id}-${index}`}
      onPointerDown={onPointerDown}
      onMouseEnter={() => state === 'idle' && setState('hover')}
      onMouseLeave={() => state === 'hover' && setState('idle')}
      style={{ flex: `0 0 ${GUTTER_PX}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: horizontal ? 'col-resize' : 'row-resize' }}
    >
      <div
        style={{
          width: horizontal ? 2 : '100%', height: horizontal ? '100%' : 2, borderRadius: 1,
          background: state === 'idle' ? 'transparent' : state === 'hover' ? tokens.color.borderStrong : tokens.color.accent,
          transition: `background ${tokens.motion.fast}`,
        }}
      />
    </div>
  );
}
