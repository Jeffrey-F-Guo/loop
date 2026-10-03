import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Shell } from '../app/Shell';
import { createFakeApi } from '../test/fakeApi';
import { renderWithProviders } from '../test/render';

describe('Workspace', () => {
  it('renders the default layout as three panels', async () => {
    renderWithProviders(<Shell />);
    await waitFor(() => expect(screen.getByTestId('panel-v-dropbox')).toBeInTheDocument());
    expect(screen.getByTestId('panel-v-dropbox')).toHaveAttribute('data-view-type', 'dropbox');
    expect(screen.getByTestId('panel-v-calendar')).toHaveAttribute('data-view-type', 'calendar');
    expect(screen.getByTestId('panel-v-timeline')).toHaveAttribute('data-view-type', 'timeline');
    expect(screen.getByTestId('panel-v-dropbox')).toHaveTextContent('Dropbox');
  });

  it('shows an empty state when no views are open', async () => {
    renderWithProviders(<Shell />, { api: createFakeApi({ layout: { version: 1, root: null } }) });
    await waitFor(() => expect(screen.getByText('No views open')).toBeInTheDocument());
  });
});
