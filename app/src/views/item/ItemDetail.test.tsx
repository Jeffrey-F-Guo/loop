import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, makeBlock, makeItem } from '../../test/fakeApi';
import { renderWithProviders } from '../../test/render';
import { useItemDetailStore, type DetailSource } from '../../ui/itemDetailStore';
import { ItemDetailHost } from './ItemDetailHost';

const local = (d: number, h = 0, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const lastPatch = (api: ReturnType<typeof createFakeApi>) => [...api.calls].reverse().find((c) => c.method === 'PATCH');

function setup(over = {}, source?: DetailSource) {
  const item = makeItem({ id: 'i1', title: 'Physics Assignment', description: 'Problems 1-8', ...over });
  const api = createFakeApi({
    items: [item],
    blocks: [
      makeBlock({ id: 'b1', item_id: 'i1', start_at: local(6, 19), end_at: local(6, 20) }),
      makeBlock({ id: 'b2', item_id: 'i1', start_at: local(7, 19), end_at: local(7, 20) }),
    ],
  });
  useItemDetailStore.getState().open('i1', null, source);
  return { ...renderWithProviders(<ItemDetailHost />, { api }), item };
}

beforeEach(() => useItemDetailStore.setState({ itemId: null, anchor: null, source: { from: 'list' } }));
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

  it('refuses a deadline that would leave a scheduled block outside the range', async () => {
    const { api } = setup({ open_at: local(5), deadline_at: local(9, 23, 59) }); // block b1 is Tue 7 PM
    await screen.findByTestId('item-block-b1');
    fireEvent.change(screen.getByTestId('item-deadline-date'), { target: { value: '2026-10-05' } });
    expect(await screen.findByTestId('item-date-error')).toHaveTextContent('A scheduled block falls outside these dates');
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
    await waitFor(() => expect(api.blocks.map((b) => b.id)).toEqual(['b2']));
  });

  it('Done saves pending edits and closes without completing the item', async () => {
    const user = userEvent.setup();
    const { api } = setup();
    const title = await screen.findByTestId('item-title');
    await user.clear(title);
    await user.type(title, 'Physics HW'); // no Enter / blur yet
    await user.click(screen.getByTestId('item-done'));
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ title: 'Physics HW' }));
    expect(api.calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    expect(api.items[0].status).toBe('active');
    expect(useItemDetailStore.getState().itemId).toBeNull();
  });

  it('Mark complete completes the item and the button becomes Reopen', async () => {
    const user = userEvent.setup();
    const { api } = setup();
    await user.click(await screen.findByTestId('item-complete-toggle'));
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ status: 'completed' }));
    expect(await screen.findByTestId('item-complete-toggle')).toHaveTextContent('Reopen');
    await user.click(screen.getByTestId('item-complete-toggle'));
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ status: 'active' }));
  });

  it('from the task list, Delete is the only removal offered and removes the whole task', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { api } = setup({}, { from: 'list' });
    await screen.findByTestId('item-delete');
    expect(screen.queryByTestId('item-remove-block')).not.toBeInTheDocument();
    expect(screen.queryByTestId('item-remove-from-timeline')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('item-delete'));
    await waitFor(() => expect(api.items).toHaveLength(0));
    expect(api.blocks).toHaveLength(0);
  });

  it('from the Calendar, removing deletes only that calendar entry and keeps the task', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm');
    const { api } = setup({}, { from: 'calendar', blockId: 'b1' });
    expect(await screen.findByTestId('item-remove-block')).toHaveTextContent('Remove from calendar');
    expect(screen.queryByTestId('item-delete')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('item-remove-block'));
    await waitFor(() => expect(api.blocks.map((b) => b.id)).toEqual(['b2']));
    expect(api.items).toHaveLength(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(useItemDetailStore.getState().itemId).toBeNull();
  });

  it('from the Timeline, removing clears the dates and every calendar entry but keeps the task', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { api } = setup({ open_at: local(5), deadline_at: local(9, 23, 59) }, { from: 'timeline' });
    expect(await screen.findByTestId('item-remove-from-timeline')).toHaveTextContent('Remove from timeline');
    expect(screen.queryByTestId('item-delete')).not.toBeInTheDocument();
    await screen.findByTestId('item-block-b2');
    await user.click(screen.getByTestId('item-remove-from-timeline'));
    expect(api.calls.some((c) => c.path.endsWith('/unschedule'))).toBe(false);
    expect(confirm.mock.calls[0][0]).toContain('2 calendar blocks');
    await user.click(screen.getByTestId('item-remove-from-timeline'));
    await waitFor(() => expect(api.blocks).toHaveLength(0));
    expect(api.items).toHaveLength(1);
    expect(api.items[0]).toMatchObject({ open_at: null, deadline_at: null });
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
