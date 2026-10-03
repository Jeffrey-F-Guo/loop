import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Shell } from '../app/Shell';
import { useDragStore } from '../dnd/dragStore';
import { renderWithProviders } from '../test/render';

afterEach(() => useDragStore.getState().end());

describe('DockZones', () => {
  it('are hidden when nothing is being dragged', async () => {
    renderWithProviders(<Shell />);
    await screen.findByTestId('panel-v-dropbox');
    expect(screen.queryByTestId('dock-zone-v-dropbox-left')).not.toBeInTheDocument();
  });

  it('appear on every other panel while a panel is dragged', async () => {
    renderWithProviders(<Shell />);
    await screen.findByTestId('panel-v-dropbox');
    act(() => useDragStore.getState().begin({ payload: { kind: 'panel', viewId: 'v-calendar' }, pointerStart: { x: 0, y: 0 }, activeInitialRect: null }));
    await waitFor(() => expect(screen.getByTestId('dock-zone-v-dropbox-left')).toBeInTheDocument());
    for (const edge of ['left', 'right', 'top', 'bottom', 'center']) {
      expect(screen.getByTestId(`dock-zone-v-timeline-${edge}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('dock-zone-v-calendar-left')).not.toBeInTheDocument();
  });

  it('do not appear while dragging an item', async () => {
    renderWithProviders(<Shell />);
    await screen.findByTestId('panel-v-dropbox');
    act(() => useDragStore.getState().begin({ payload: { kind: 'item', itemId: 'x' }, pointerStart: { x: 0, y: 0 }, activeInitialRect: null }));
    expect(screen.queryByTestId('dock-zone-v-dropbox-left')).not.toBeInTheDocument();
  });
});
