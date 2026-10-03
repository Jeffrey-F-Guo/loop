import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { qk } from '../../api/keys';
import { useDragStore } from '../../dnd/dragStore';
import { createFakeApi, makeBlock, makeItem } from '../../test/fakeApi';
import { renderWithProviders } from '../../test/render';
import { useItemDetailStore } from '../../ui/itemDetailStore';
import { TimelineView } from './TimelineView';

const local = (d: number, h = 0, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const view = <TimelineView viewId="t1" config={{}} setConfig={vi.fn()} />;
const DAYS_WIDTH = 700; // 100px per day

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 9, 7, 12, 0));
  const real = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.role === 'timeline-days') return { left: 0, top: 0, width: DAYS_WIDTH, height: 300, right: DAYS_WIDTH, bottom: 300, x: 0, y: 0, toJSON() {} } as DOMRect;
    return real.call(this);
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const ranged = () => makeItem({ id: 'i1', title: 'Physics', open_at: local(5), deadline_at: local(9, 23, 59) });
const lastPatch = (api: ReturnType<typeof createFakeApi>) => [...api.calls].reverse().find((c) => c.method === 'PATCH');

describe('TimelineView', () => {
  it('renders a bar for Mon → Fri and day columns as drop targets', async () => {
    renderWithProviders(view, { api: createFakeApi({ items: [ranged()] }) });
    const bar = await screen.findByTestId('timeline-bar-i1');
    expect(bar).toHaveAttribute('data-open-date', '2026-10-05');
    expect(bar).toHaveAttribute('data-deadline-date', '2026-10-09');
    expect(screen.getByTestId('timeline-day-2026-10-05')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-day-2026-10-11')).toBeInTheDocument();
  });

  it("shows each task's total scheduled time on its bar or marker", async () => {
    const api = createFakeApi({
      items: [ranged(), makeItem({ id: 'm', deadline_at: local(8, 23, 59) }), makeItem({ id: 'none', open_at: local(5), deadline_at: local(6, 23, 59) })],
      blocks: [
        makeBlock({ item_id: 'i1', start_at: local(6, 19), end_at: local(6, 20) }),
        makeBlock({ item_id: 'i1', start_at: local(13, 9), end_at: local(13, 10, 30) }), // another week still counts
        makeBlock({ item_id: 'm', start_at: local(7, 9), end_at: local(7, 9, 45) }),
      ],
    });
    renderWithProviders(view, { api });
    expect(await screen.findByTestId('timeline-time-i1')).toHaveTextContent('2h 30m');
    expect(screen.getByTestId('timeline-time-m')).toHaveTextContent('45m');
    await screen.findByTestId('timeline-bar-none');
    expect(screen.queryByTestId('timeline-time-none')).not.toBeInTheDocument();
  });

  it('clicking a bar opens the task with the Timeline as its context', async () => {
    useItemDetailStore.setState({ itemId: null, anchor: null, source: { from: 'list' } });
    renderWithProviders(view, { api: createFakeApi({ items: [ranged()] }) });
    fireEvent.click(within(await screen.findByTestId('timeline-bar-i1')).getByText('Physics'));
    expect(useItemDetailStore.getState()).toMatchObject({ itemId: 'i1', source: { from: 'timeline' } });
  });

  it('renders a deadline-only item as a marker', async () => {
    renderWithProviders(view, { api: createFakeApi({ items: [makeItem({ id: 'm', deadline_at: local(8, 23, 59) })] }) });
    expect(await screen.findByTestId('timeline-marker-m')).toHaveAttribute('data-deadline-date', '2026-10-08');
  });

  it('shows the empty state and navigates weeks', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(view, { api: createFakeApi({ items: [ranged()] }) });
    await screen.findByTestId('timeline-bar-i1');
    await user.click(screen.getByTestId('timeline-next'));
    expect(screen.queryByTestId('timeline-bar-i1')).not.toBeInTheDocument();
    expect(screen.getByTestId('timeline-empty')).toHaveTextContent('No dated Items in this period.');
    await user.click(screen.getByTestId('timeline-today'));
    expect(screen.getByTestId('timeline-bar-i1')).toBeInTheDocument();
  });

  it('dragging the right edge to Sunday moves only the deadline', async () => {
    const { api } = renderWithProviders(view, { api: createFakeApi({ items: [ranged()] }) });
    const handle = await screen.findByTestId('timeline-bar-right-i1');
    fireEvent.pointerDown(handle, { clientX: 450, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 650, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 650, pointerId: 1 });
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ deadline_at: local(11, 23, 59) }));
  });

  it('dragging the left edge past the deadline clamps to a one-day range', async () => {
    const { api } = renderWithProviders(view, { api: createFakeApi({ items: [ranged()] }) });
    const handle = await screen.findByTestId('timeline-bar-left-i1');
    fireEvent.pointerDown(handle, { clientX: 50, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 690, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 690, pointerId: 1 });
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ open_at: local(9) }));
  });

  it('an edge released on its own day sends nothing', async () => {
    const { api } = renderWithProviders(view, { api: createFakeApi({ items: [ranged()] }) });
    const handle = await screen.findByTestId('timeline-bar-right-i1');
    fireEvent.pointerDown(handle, { clientX: 450, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 460, pointerId: 1 });
    await new Promise((r) => setTimeout(r, 20));
    expect(lastPatch(api)).toBeUndefined();
  });

  it("an edge drag never strands the item's scheduled blocks, even ones the Calendar hasn't loaded", async () => {
    const api = createFakeApi({
      items: [ranged()],
      blocks: [makeBlock({ id: 'b1', item_id: 'i1', start_at: local(7, 19), end_at: local(7, 20) })], // Wed
    });
    const { qc } = renderWithProviders(view, { api });
    const handle = await screen.findByTestId('timeline-bar-right-i1');
    fireEvent.pointerDown(handle, { clientX: 450, pointerId: 1 });
    await waitFor(() => expect(qc.getQueryData(qk.workBlocksItem('i1'))).toBeDefined()); // fetched on grab
    fireEvent.pointerUp(window, { clientX: 50, pointerId: 1 }); // released over Monday
    await waitFor(() => expect(lastPatch(api)?.body).toEqual({ deadline_at: local(7, 23, 59) }));
  });

  it('the bar follows the pointer by whole days while being moved', async () => {
    renderWithProviders(view, { api: createFakeApi({ items: [ranged()] }) });
    const bar = await screen.findByTestId('timeline-bar-i1');
    act(() => {
      useDragStore.getState().begin({ payload: { kind: 'timelineBar', itemId: 'i1' }, pointerStart: { x: 150, y: 10 }, activeInitialRect: null });
      useDragStore.getState().move({ x: 360, y: 10 }); // +2.1 columns of 100px
    });
    await waitFor(() => expect(bar).toHaveAttribute('data-preview-shift', '2'));
    act(() => useDragStore.getState().move({ x: 360, y: 900 })); // left the Timeline (e.g. toward the Calendar)
    await waitFor(() => expect(bar).not.toHaveAttribute('data-preview-shift'));
    act(() => useDragStore.getState().end());
  });
});
