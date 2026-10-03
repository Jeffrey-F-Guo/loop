import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DropboxFilter } from '../../api/types';
import { createFakeApi, makeItem } from '../../test/fakeApi';
import { renderWithProviders } from '../../test/render';
import { useItemDetailStore } from '../../ui/itemDetailStore';
import { DropboxView } from './DropboxView';

const view = (filter: DropboxFilter = 'all', setConfig = vi.fn()) => (
  <DropboxView viewId="v1" config={{ filter }} setConfig={setConfig} />
);
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

  it('applies its own filter', async () => {
    const api = createFakeApi({ items: [makeItem({ title: 'planned', work_block_count: 0 }), makeItem({ title: 'loose' })] });
    api.blocks.push({ id: 'b', item_id: api.items[0].id, start_at: '2026-10-06T16:00:00Z', end_at: '2026-10-06T17:00:00Z', created_at: '', updated_at: '' });
    renderWithProviders(view('unscheduled'), { api });
    await waitFor(() => expect(titles()).toEqual(['loose']));
  });

  it('changing the filter calls setConfig', async () => {
    const user = userEvent.setup();
    const setConfig = vi.fn();
    renderWithProviders(view('all', setConfig));
    await user.click(await screen.findByTestId('dropbox-filter'));
    await user.click(screen.getByTestId('dropbox-filter-option-scheduled'));
    expect(setConfig).toHaveBeenCalledWith({ filter: 'scheduled' });
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
