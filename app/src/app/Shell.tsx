import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { dockView } from '../domain/layout';
import { DndProvider, type DockAction } from '../dnd/DndProvider';
import { focusCapture } from '../ui/captureBus';
import { ToastHost } from '../ui/Toast';
import { ItemDetailHost } from '../views/item/ItemDetailHost';
import { LayoutContext, useWorkspaceLayout } from '../workspace/useWorkspaceLayout';
import { Workspace } from '../workspace/Workspace';
import { AddViewMenu } from './AddViewMenu';
import { TopBar } from './TopBar';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export function Shell() {
  const layoutApi = useWorkspaceLayout();
  const { update } = layoutApi;
  const onDock = useCallback((a: DockAction) => update((l) => dockView(l, a.viewId, a.targetViewId, a.edge)), [update]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        focusCapture();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <LayoutContext.Provider value={layoutApi}>
      <DndProvider onDock={onDock}>
        <View style={{ flex: 1, height: '100%' }}>
          <TopBar right={<AddViewMenu />} />
          <Workspace />
        </View>
        <ItemDetailHost />
        <ToastHost />
      </DndProvider>
    </LayoutContext.Provider>
  );
}
