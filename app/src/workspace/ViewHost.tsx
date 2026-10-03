import type { ViewNode } from '../api/types';
import { setViewConfig } from '../domain/layout';
import { CalendarView } from '../views/calendar/CalendarView';
import { DropboxView } from '../views/dropbox/DropboxView';
import { TimelineView } from '../views/timeline/TimelineView';
import { useLayout } from './useWorkspaceLayout';

export function ViewHost({ node }: { node: ViewNode }) {
  const { update } = useLayout();
  const v = node.view;
  switch (v.type) {
    case 'dropbox':
      return <DropboxView viewId={node.id} config={v.config} setConfig={(c) => update((l) => setViewConfig(l, node.id, c))} />;
    case 'timeline':
      return <TimelineView viewId={node.id} config={v.config} setConfig={(c) => update((l) => setViewConfig(l, node.id, c))} />;
    case 'calendar':
      return <CalendarView viewId={node.id} config={v.config} setConfig={(c) => update((l) => setViewConfig(l, node.id, c))} />;
  }
}
