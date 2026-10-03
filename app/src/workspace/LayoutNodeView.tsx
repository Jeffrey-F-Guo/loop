import { Fragment } from 'react';
import type { LayoutNode } from '../api/types';
import { Panel } from './Panel';

export const GUTTER_PX = 8;

export function LayoutNodeView({ node }: { node: LayoutNode }) {
  if (node.kind === 'view') return <Panel node={node} />;
  return (
    <div style={{ display: 'flex', flexDirection: node.direction, width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}>
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          {i > 0 && <div style={{ flex: `0 0 ${GUTTER_PX}px` }} />}
          <div style={{ flex: `${node.sizes[i]} 1 0px`, display: 'flex', minWidth: 0, minHeight: 0 }}>
            <LayoutNodeView node={child} />
          </div>
        </Fragment>
      ))}
    </div>
  );
}
