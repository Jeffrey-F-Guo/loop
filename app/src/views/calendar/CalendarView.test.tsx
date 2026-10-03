import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi, makeBlock, makeItem } from '../../test/fakeApi';
import { renderWithProviders } from '../../test/render';
import { HOUR_PX } from '../../domain/time';
import { useDragStore } from '../../dnd/dragStore';
import { useItemDetailStore } from '../../ui/itemDetailStore';
import { CalendarView } from './CalendarView';

const local = (d: number, h = 0, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const lastPatch = (api: ReturnType<typeof createFakeApi>) => [...api.calls].reverse().find((c) => c.method === 'PATCH');

function seed() {
  return createFakeApi({
    items: [makeItem({ id: 'i1', title: 'Physics' })],
    blocks: [makeBlock({ id: 'b1', item_id: 'i1', start_at: local(6, 19), end_at: local(6, 20) })],
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 9, 7, 12, 0));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('CalendarView', () => {
  it('renders the week with blocks in the right day column', async () => {
    renderWithProviders(<CalendarView viewId="c1" config={{ mode: 'week' }} setConfig={vi.fn()} />, { api: seed() });
    const tue = await screen.findByTestId('calendar-day-2026-10-06');
    const block = await within(tue).findByTestId('calendar-block-b1');
    expect(block).toHaveAttribute('data-start', '2026-10-06T19:00');
    expect(block).toHaveAttribute('data-end', '2026-10-06T20:00');
    expect(block).toHaveTextContent('Physics');
    expect(screen.getByTestId('calendar-slot-2026-10-06-1900')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-day-2026-10-11')).toBeInTheDocument();
  });

  it('day mode shows only today and the toggle calls setConfig', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const setConfig = vi.fn();
    renderWithProviders(<CalendarView viewId="c1" config={{ mode: 'day' }} setConfig={setConfig} />, { api: seed() });
    expect(await screen.findByTestId('calendar-day-2026-10-07')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-day-2026-10-06')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('calendar-mode-week'));
    expect(setConfig).toHaveBeenCalledWith({ mode: 'week' });
  });

  it('navigating to next week fetches that range', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { api } = renderWithProviders(<CalendarView viewId="c1" config={{ mode: 'week' }} setConfig={vi.fn()} />, { api: seed() });
    await screen.findByTestId('calendar-block-b1');
    await user.click(screen.getByTestId('calendar-next'));
    const nextMon = encodeURIComponent(new Date(2026, 9, 12).toISOString());
    await waitFor(() => expect(api.calls.some((c) => c.path.includes(`start=${nextMon}`))).toBe(true));
    expect(screen.queryByTestId('calendar-block-b1')).not.toBeInTheDocument();
  });

  it('dragging the bottom edge resizes in 15-minute steps', async () => {
    const { api } = renderWithProviders(<CalendarView viewId="c1" config={{ mode: 'week' }} setConfig={vi.fn()} />, { api: seed() });
    const block = await screen.findByTestId('calendar-block-b1');
    vi.spyOn(block, 'getBoundingClientRect').mockReturnValue({ top: 1000, left: 0, width: 100, height: HOUR_PX, right: 100, bottom: 1000 + HOUR_PX, x: 0, y: 1000, toJSON() {} } as DOMRect);
    const handle = screen.getByTestId('calendar-block-resize-b1');
    fireEvent.pointerDown(handle, { clientY: 1000 + HOUR_PX, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 1000 + 2 * HOUR_PX + 5, pointerId: 1 });
    fireEvent.pointerUp(window, { clientY: 1000 + 2 * HOUR_PX + 5, pointerId: 1 });
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ end_at: local(6, 21) }));
  });

  it('never resizes below 15 minutes', async () => {
    const { api } = renderWithProviders(<CalendarView viewId="c1" config={{ mode: 'week' }} setConfig={vi.fn()} />, { api: seed() });
    const block = await screen.findByTestId('calendar-block-b1');
    vi.spyOn(block, 'getBoundingClientRect').mockReturnValue({ top: 1000, left: 0, width: 100, height: HOUR_PX, right: 100, bottom: 1000 + HOUR_PX, x: 0, y: 1000, toJSON() {} } as DOMRect);
    const handle = screen.getByTestId('calendar-block-resize-b1');
    fireEvent.pointerDown(handle, { clientY: 1000 + HOUR_PX, pointerId: 1 });
    fireEvent.pointerUp(window, { clientY: 900, pointerId: 1 });
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ end_at: local(6, 19, 15) }));
  });

  it('finishing a resize does not open the item detail', async () => {
    useItemDetailStore.setState({ itemId: null, anchor: null });
    renderWithProviders(<CalendarView viewId="c1" config={{ mode: 'week' }} setConfig={vi.fn()} />, { api: seed() });
    const block = await screen.findByTestId('calendar-block-b1');
    vi.spyOn(block, 'getBoundingClientRect').mockReturnValue({ top: 1000, left: 0, width: 100, height: HOUR_PX, right: 100, bottom: 1000 + HOUR_PX, x: 0, y: 1000, toJSON() {} } as DOMRect);
    const handle = screen.getByTestId('calendar-block-resize-b1');
    fireEvent.pointerDown(handle, { clientY: 1000 + HOUR_PX, pointerId: 1 });
    fireEvent.pointerUp(window, { clientY: 1000 + 2 * HOUR_PX, pointerId: 1 });
    // The browser then dispatches a click on the common ancestor of mousedown/mouseup: the block.
    fireEvent.click(block);
    expect(useItemDetailStore.getState().itemId).toBeNull();
    fireEvent.click(block); // a later, genuine click still opens it
    expect(useItemDetailStore.getState().itemId).toBe('i1');
    // Opened from the Calendar, so its remove action is "remove this entry".
    expect(useItemDetailStore.getState().source).toEqual({ from: 'calendar', blockId: 'b1' });
  });

  it('resizing stops at the item deadline', async () => {
    const api = createFakeApi({
      items: [makeItem({ id: 'i1', title: 'Physics', open_at: local(5), deadline_at: local(6, 20, 30) })],
      blocks: [makeBlock({ id: 'b1', item_id: 'i1', start_at: local(6, 19), end_at: local(6, 20) })],
    });
    renderWithProviders(<CalendarView viewId="c1" config={{ mode: 'week' }} setConfig={vi.fn()} />, { api });
    const block = await screen.findByTestId('calendar-block-b1');
    vi.spyOn(block, 'getBoundingClientRect').mockReturnValue({ top: 1000, left: 0, width: 100, height: HOUR_PX, right: 100, bottom: 1000 + HOUR_PX, x: 0, y: 1000, toJSON() {} } as DOMRect);
    fireEvent.pointerDown(screen.getByTestId('calendar-block-resize-b1'), { clientY: 1000 + HOUR_PX, pointerId: 1 });
    fireEvent.pointerUp(window, { clientY: 1000 + 3 * HOUR_PX, pointerId: 1 });
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ end_at: local(6, 20, 30) }));
  });

  it("shades days outside the dragged item's range", async () => {
    const api = createFakeApi({ items: [makeItem({ id: 'i1', open_at: local(6), deadline_at: local(8, 23, 59) })] });
    renderWithProviders(<CalendarView viewId="c1" config={{ mode: 'week' }} setConfig={vi.fn()} />, { api });
    await screen.findByTestId('calendar-day-2026-10-05');
    await waitFor(() => expect(api.calls.some((c) => c.path.startsWith('/items'))).toBe(true));
    act(() => useDragStore.getState().begin({ payload: { kind: 'item', itemId: 'i1' }, pointerStart: { x: 0, y: 0 }, activeInitialRect: null }));
    await waitFor(() => expect(screen.getByTestId('calendar-day-2026-10-05')).toHaveAttribute('data-out-of-range', 'true'));
    expect(screen.getByTestId('calendar-day-2026-10-07')).not.toHaveAttribute('data-out-of-range');
    expect(screen.getByTestId('calendar-day-2026-10-09')).toHaveAttribute('data-out-of-range', 'true');
    act(() => useDragStore.getState().end());
    await waitFor(() => expect(screen.getByTestId('calendar-day-2026-10-05')).not.toHaveAttribute('data-out-of-range'));
  });

  it('shows the empty state when nothing is scheduled', async () => {
    renderWithProviders(<CalendarView viewId="c1" config={{ mode: 'week' }} setConfig={vi.fn()} />);
    expect(await screen.findByTestId('calendar-empty')).toHaveTextContent('Nothing scheduled.');
  });
});
