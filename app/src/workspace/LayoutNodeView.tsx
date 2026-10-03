import { Fragment, useRef } from 'react';
import type { LayoutNode, SplitNode } from '../api/types';
import { Divider } from './Divider';
import { Panel } from './Panel';

export const GUTTER_PX = 8;

export function LayoutNodeView({ node }: { node: LayoutNode }) {
  if (node.kind === 'view') return <Panel node={node} />;
  return <SplitView node={node} />;
}

function SplitView({ node }: { node: SplitNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} data-split-id={node.id} style={{ display: 'flex', flexDirection: node.direction, width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}>
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          {i > 0 && <Divider split={node} index={i} containerRef={ref} />}
          <div style={{ flex: `${node.sizes[i]} 1 0px`, display: 'flex', minWidth: 0, minHeight: 0 }}>
            <LayoutNodeView node={child} />
          </div>
        </Fragment>
      ))}
    </div>
  );
}
