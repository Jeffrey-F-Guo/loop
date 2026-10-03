import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DropboxSection } from '../../api/types';
import { createFakeApi, makeItem } from '../../test/fakeApi';
import { renderWithProviders } from '../../test/render';
import { useItemDetailStore } from '../../ui/itemDetailStore';
import { DropboxView } from './DropboxView';

const view = (sections: DropboxSection[] = ['scheduled', 'unscheduled'], setConfig = vi.fn()) => (
  <DropboxView viewId="v1" config={{ sections }} setConfig={setConfig} />
);
const sectionTitles = (s: DropboxSection) =>
  within(screen.getByTestId(`dropbox-section-${s}`)).queryAllByTestId(/^item-row-/).map((r) => r.querySelector('[data-role="title"]')?.textContent);
const titles = () => screen.queryAllByTestId(/^item-row-/).map((r) => r.querySelector('[data-role="title"]')?.textContent);

beforeEach(() => useItemDetailStore.setState({ itemId: null, anchor: null }));
afterEach(() => vi.restoreAllMocks());

describe('DropboxView', () => {
  it('shows the empty state', async () => {
    renderWithProviders(view());
    expect(await screen.findByText('Nothing here yet.')).toBeInTheDocument();
    expect(screen.getByText('Add something whenever it comes up.')).toBeInTheDocument();
  });

  it('Enter creates an item, clears the input, and keeps focus', async () => {
    const user = userEvent.setup();
    const { api } = renderWithProviders(view());
    const input = await screen.findByTestId('dropbox-input');
    await user.click(input);
    await user.type(input, 'Physics homework{Enter}');
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    await waitFor(() => expect(titles()).toEqual(['Physics homework']));
    expect(api.items).toHaveLength(1);
  });

  it('ignores whitespace-only input', async () => {
    const user = userEvent.setup();
    const { api } = renderWithProviders(view());
    const input = await screen.findByTestId('dropbox-input');
    await user.type(input, '   {Enter}');
    expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('rapid brain-dump: every Enter lands, newest first, even before the server answers', async () => {
    const user = userEvent.setup();
    const api = createFakeApi();
    renderWithProviders(view(), { api });
    const input = await screen.findByTestId('dropbox-input');
    await screen.findByText('Nothing here yet.'); // items query settled before holding responses
    const release = api.hold();
    await user.type(input, 'A{Enter}B{Enter}C{Enter}');
    expect(titles()).toEqual(['C', 'B', 'A']);
    await act(async () => release());
    await waitFor(() => expect(api.items).toHaveLength(3));
    expect(titles()).toEqual(['C', 'B', 'A']);
  });

  const seeded = () => {
    const api = createFakeApi({
      items: [makeItem({ title: 'planned' }), makeItem({ title: 'loose' }), makeItem({ title: 'finished', status: 'completed' })],
    });
    api.blocks.push({ id: 'b', item_id: api.items[0].id, start_at: '2026-10-06T16:00:00Z', end_at: '2026-10-06T17:00:00Z', created_at: '', updated_at: '' });
    return api;
  };

  it('lists each shown section under its own heading, Scheduled and Not scheduled by default', async () => {
    renderWithProviders(view(), { api: seeded() });
    await waitFor(() => expect(sectionTitles('scheduled')).toEqual(['planned']));
    expect(sectionTitles('unscheduled')).toEqual(['loose']);
    expect(screen.queryByTestId('dropbox-section-completed')).not.toBeInTheDocument();
    expect(screen.getByTestId('dropbox-section-scheduled')).toHaveTextContent('Scheduled');
    expect(screen.getByTestId('dropbox-section-unscheduled')).toHaveTextContent('Not scheduled');
  });

  it('shows all three sections at once when turned on', async () => {
    renderWithProviders(view(['scheduled', 'unscheduled', 'completed']), { api: seeded() });
    await waitFor(() => expect(sectionTitles('completed')).toEqual(['finished']));
    expect(sectionTitles('scheduled')).toEqual(['planned']);
    expect(sectionTitles('unscheduled')).toEqual(['loose']);
  });

  it('section toggles replace the filter: turning one on or off calls setConfig', async () => {
    const user = userEvent.setup();
    const setConfig = vi.fn();
    renderWithProviders(view(['scheduled', 'unscheduled'], setConfig));
    expect(await screen.findByTestId('dropbox-section-toggle-scheduled')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('dropbox-section-toggle-completed')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('dropbox-filter')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('dropbox-section-toggle-completed'));
    expect(setConfig).toHaveBeenLastCalledWith({ sections: ['scheduled', 'unscheduled', 'completed'] });
    await user.click(screen.getByTestId('dropbox-section-toggle-scheduled'));
    expect(setConfig).toHaveBeenLastCalledWith({ sections: ['unscheduled'] });
  });

  it('the only section shown cannot be turned off', async () => {
    const user = userEvent.setup();
    const setConfig = vi.fn();
    renderWithProviders(view(['completed'], setConfig));
    await user.click(await screen.findByTestId('dropbox-section-toggle-completed'));
    expect(setConfig).not.toHaveBeenCalled();
  });

  it('completing an item removes it from the active list', async () => {
    const user = userEvent.setup();
    const it = makeItem({ title: 'Call dentist' });
    const { api } = renderWithProviders(view(), { api: createFakeApi({ items: [it] }) });
    await user.click(await screen.findByTestId(`item-complete-${it.id}`));
    await waitFor(() => expect(screen.queryByTestId(`item-row-${it.id}`)).not.toBeInTheDocument());
    expect(api.calls.at(-1)).toMatchObject({ method: 'PATCH', body: { status: 'completed' } });
    expect(useItemDetailStore.getState().itemId).toBeNull();
  });

  it('clicking a row opens the item detail', async () => {
    const user = userEvent.setup();
    const it = makeItem({ title: 'Read paper' });
    renderWithProviders(view(), { api: createFakeApi({ items: [it] }) });
    await user.click(within(await screen.findByTestId(`item-row-${it.id}`)).getByText('Read paper'));
    expect(useItemDetailStore.getState().itemId).toBe(it.id);
  });
});
