import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Layout } from '../api/types';
import { DEFAULT_LAYOUT, setViewConfig } from '../domain/layout';
import { createFakeApi } from '../test/fakeApi';
import { createWrapper } from '../test/render';
import { SAVE_DEBOUNCE_MS, useWorkspaceLayout } from './useWorkspaceLayout';

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

const puts = (api: ReturnType<typeof createFakeApi>) => api.calls.filter((c) => c.method === 'PUT');

describe('useWorkspaceLayout', () => {
  it('coalesces rapid layout edits into one debounced PUT', async () => {
    const api = createFakeApi();
    const { wrapper } = createWrapper(api);
    const { result } = renderHook(() => useWorkspaceLayout(), { wrapper });
    await waitFor(() => expect(result.current.layout).not.toBeNull());

    act(() => {
      result.current.update((l) => setViewConfig(l, 'v-dropbox', { sections: ['scheduled'] }));
      result.current.update((l) => setViewConfig(l, 'v-dropbox', { sections: ['unscheduled'] }));
      result.current.update((l) => setViewConfig(l, 'v-calendar', { mode: 'day' }));
    });
    expect(puts(api)).toHaveLength(0);
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS + 10);
    });
    await waitFor(() => expect(puts(api)).toHaveLength(1));
    const saved = (puts(api)[0].body as { layout: Layout }).layout;
    expect(JSON.stringify(saved)).toContain('"unscheduled"');
    expect(JSON.stringify(saved)).toContain('"day"');
  });

  it('falls back to the default layout when the stored one is invalid, and re-saves it', async () => {
    const api = createFakeApi({ layout: { version: 1, root: { kind: 'split', id: 's', direction: 'row', sizes: [1], children: [] } } as unknown as Layout });
    const { wrapper } = createWrapper(api);
    const { result } = renderHook(() => useWorkspaceLayout(), { wrapper });
    await waitFor(() => expect(result.current.layout).toEqual(DEFAULT_LAYOUT));
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS + 10);
    });
    await waitFor(() => expect(puts(api)).toHaveLength(1));
  });

  it('upgrades a stored pre-sections Dropbox config and re-saves it', async () => {
    const stored = structuredClone(DEFAULT_LAYOUT);
    const json = JSON.stringify(stored).replace('{"sections":["scheduled","unscheduled"]}', '{"filter":"completed"}');
    const api = createFakeApi({ layout: JSON.parse(json) as Layout });
    const { wrapper } = createWrapper(api);
    const { result } = renderHook(() => useWorkspaceLayout(), { wrapper });
    await waitFor(() => expect(result.current.layout).toEqual(setViewConfig(DEFAULT_LAYOUT, 'v-dropbox', { sections: ['completed'] })));
    await act(async () => {
      vi.advanceTimersByTime(SAVE_DEBOUNCE_MS + 10);
    });
    await waitFor(() => expect(puts(api)).toHaveLength(1));
    expect(JSON.stringify(puts(api)[0].body)).toContain('{"sections":["completed"]}');
  });

  it('flushes a pending save on unmount', async () => {
    const api = createFakeApi();
    const { wrapper } = createWrapper(api);
    const { result, unmount } = renderHook(() => useWorkspaceLayout(), { wrapper });
    await waitFor(() => expect(result.current.layout).not.toBeNull());
    act(() => result.current.update((l) => setViewConfig(l, 'v-dropbox', { sections: ['completed'] })));
    unmount();
    await waitFor(() => expect(puts(api)).toHaveLength(1));
  });
});
