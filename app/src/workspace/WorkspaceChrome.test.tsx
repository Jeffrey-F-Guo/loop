import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Shell } from '../app/Shell';
import { qk } from '../api/keys';
import type { SplitNode, WorkspaceResponse } from '../api/types';
import { renderWithProviders } from '../test/render';

const dropboxPanels = () => document.querySelectorAll('[data-view-type="dropbox"]');

afterEach(() => vi.restoreAllMocks());

describe('workspace chrome', () => {
  it('duplicates a view with independent configuration', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Shell />);
    await user.click(await screen.findByTestId('panel-menu-v-dropbox'));
    await user.click(screen.getByTestId('panel-menu-duplicate'));
    await waitFor(() => expect(dropboxPanels()).toHaveLength(2));

    const second = dropboxPanels()[1] as HTMLElement;
    await user.click(within(second).getByTestId('dropbox-section-toggle-completed'));
    await waitFor(() => expect(within(second).getByTestId('dropbox-section-toggle-completed')).toHaveAttribute('aria-pressed', 'true'));
    expect(within(dropboxPanels()[0] as HTMLElement).getByTestId('dropbox-section-toggle-completed')).toHaveAttribute('aria-pressed', 'false');
  });

  it('closes a view and shows the empty state after the last one', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Shell />);
    for (const id of ['v-calendar', 'v-timeline', 'v-dropbox']) {
      await user.click(await screen.findByTestId(`panel-menu-${id}`));
      await user.click(screen.getByTestId('panel-menu-close'));
      await waitFor(() => expect(screen.queryByTestId(`panel-${id}`)).not.toBeInTheDocument());
    }
    expect(screen.getByText('No views open')).toBeInTheDocument();
  });

  it('adds a view from the top bar', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Shell />);
    await screen.findByTestId('panel-v-timeline');
    await user.click(screen.getByTestId('add-view'));
    await user.click(screen.getByTestId('add-view-timeline'));
    await waitFor(() => expect(document.querySelectorAll('[data-view-type="timeline"]')).toHaveLength(2));
  });

  it('dragging a divider resizes its split', async () => {
    const { qc } = renderWithProviders(<Shell />);
    const divider = await screen.findByTestId('divider-s-top-1');
    const container = document.querySelector('[data-split-id="s-top"]') as HTMLElement;
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1008, height: 500, right: 1008, bottom: 500, x: 0, y: 0, toJSON() {} } as DOMRect);
    fireEvent.pointerDown(divider, { clientX: 320, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 420, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 420, pointerId: 1 });
    const layout = qc.getQueryData<WorkspaceResponse>(qk.workspace)!.layout;
    const top = (layout.root as SplitNode).children[0] as SplitNode;
    expect(top.sizes[0]).toBeCloseTo(0.42, 2);
  });
});
