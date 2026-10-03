import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, makeBlock, makeItem } from '../../test/fakeApi';
import { renderWithProviders } from '../../test/render';
import { useItemDetailStore } from '../../ui/itemDetailStore';
import { ItemDetailHost } from './ItemDetailHost';

const local = (d: number, h = 0, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const lastPatch = (api: ReturnType<typeof createFakeApi>) => [...api.calls].reverse().find((c) => c.method === 'PATCH');

function setup(over = {}) {
  const item = makeItem({ id: 'i1', title: 'Physics Assignment', description: 'Problems 1-8', ...over });
  const api = createFakeApi({ items: [item], blocks: [makeBlock({ id: 'b1', item_id: 'i1', start_at: local(6, 19), end_at: local(6, 20) })] });
  useItemDetailStore.getState().open('i1');
  return { ...renderWithProviders(<ItemDetailHost />, { api }), item };
}

beforeEach(() => useItemDetailStore.setState({ itemId: null, anchor: null }));
afterEach(() => vi.restoreAllMocks());

describe('ItemDetail', () => {
  it('renders nothing when closed', () => {
    renderWithProviders(<ItemDetailHost />);
    expect(screen.queryByTestId('item-detail')).not.toBeInTheDocument();
  });

  it('commits a title edit on Enter and trims it', async () => {
    const user = userEvent.setup();
    const { api } = setup();
    const title = await screen.findByTestId('item-title');
    await user.clear(title);
    await user.type(title, '  Physics HW  {Enter}');
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ title: 'Physics HW' }));
  });

  it('reverts a blank title without saving', async () => {
    const user = userEvent.setup();
    const { api } = setup();
    const title = await screen.findByTestId('item-title');
    await user.clear(title);
    await user.tab();
    expect(title).toHaveValue('Physics Assignment');
    expect(lastPatch(api)).toBeUndefined();
  });

  it('saves open date at local midnight and deadline at 23:59 by default', async () => {
    const { api } = setup();
    fireEvent.change(await screen.findByTestId('item-open-date'), { target: { value: '2026-10-05' } });
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ open_at: local(5) }));
    fireEvent.change(screen.getByTestId('item-deadline-date'), { target: { value: '2026-10-09' } });
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ deadline_at: local(9, 23, 59) }));
  });

  it('refuses an open date after the deadline and explains why', async () => {
    const { api } = setup({ deadline_at: local(9, 23, 59) });
    fireEvent.change(await screen.findByTestId('item-open-date'), { target: { value: '2026-10-12' } });
    expect(await screen.findByTestId('item-date-error')).toHaveTextContent('Open date must be on or before the deadline');
    expect(lastPatch(api)).toBeUndefined();
  });

  it('clearing the deadline sends null', async () => {
    const { api } = setup({ deadline_at: local(9, 23, 59) });
    fireEvent.change(await screen.findByTestId('item-deadline-date'), { target: { value: '' } });
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ deadline_at: null }));
  });

  it('lists scheduled blocks and can remove one', async () => {
    const user = userEvent.setup();
    const { api } = setup();
    expect(await screen.findByTestId('item-block-b1')).toHaveTextContent('7:00 – 8:00 PM');
    await user.click(screen.getByTestId('item-block-delete-b1'));
    await waitFor(() => expect(api.blocks).toHaveLength(0));
  });

  it('Done completes the item and closes', async () => {
    const user = userEvent.setup();
    const { api } = setup();
    await user.click(await screen.findByTestId('item-done'));
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ status: 'completed' }));
    expect(useItemDetailStore.getState().itemId).toBeNull();
  });

  it('Delete asks for confirmation first', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { api } = setup();
    await user.click(await screen.findByTestId('item-delete'));
    expect(api.items).toHaveLength(1);
    await user.click(screen.getByTestId('item-delete'));
    await waitFor(() => expect(api.items).toHaveLength(0));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(useItemDetailStore.getState().itemId).toBeNull();
  });

  it('Escape closes', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByTestId('item-detail');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('item-detail')).not.toBeInTheDocument();
  });
});
