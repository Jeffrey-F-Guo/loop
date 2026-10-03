import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useApi } from '../api/ApiProvider';
import { qk } from '../api/keys';
import type { Layout, WorkspaceResponse } from '../api/types';
import { useWorkspace } from '../api/workspace';
import { DEFAULT_LAYOUT, normalize, upgradeLegacyConfigs, validateLayout } from '../domain/layout';
import { showToast } from '../ui/toastStore';

export const SAVE_DEBOUNCE_MS = 500;

export interface LayoutApi {
  layout: Layout | null;
  isLoading: boolean;
  update: (fn: (l: Layout) => Layout) => void;
}

export const LayoutContext = createContext<LayoutApi | null>(null);

export function useLayout(): LayoutApi {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used inside <LayoutContext.Provider>');
  return ctx;
}

/** Owns the workspace layout: cache-first edits, debounced PUT, flush on unload. Call once (Shell). */
export function useWorkspaceLayout(): LayoutApi {
  const api = useApi();
  const qc = useQueryClient();
  const query = useWorkspace();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Layout | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const layout = pending.current;
    pending.current = null;
    if (layout) {
      api.request('PUT', '/workspace', { layout }, { keepalive: true }).catch(() => showToast("Couldn't save layout"));
    }
  }, [api]);

  const schedule = useCallback((layout: Layout) => {
    pending.current = layout;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [flush]);

  const data = query.data;
  const valid = !!data && validateLayout(data.layout);

  useEffect(() => {
    if (data && !validateLayout(data.layout)) {
      qc.setQueryData<WorkspaceResponse>(qk.workspace, { ...data, layout: DEFAULT_LAYOUT });
      schedule(DEFAULT_LAYOUT);
      return;
    }
    const upgraded = data && upgradeLegacyConfigs(data.layout);
    if (data && upgraded !== data.layout) {
      qc.setQueryData<WorkspaceResponse>(qk.workspace, { ...data, layout: upgraded! });
      schedule(upgraded!);
    }
  }, [data, qc, schedule]);

  useEffect(() => {
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [flush]);

  const update = useCallback((fn: (l: Layout) => Layout) => {
    const cur = qc.getQueryData<WorkspaceResponse>(qk.workspace);
    if (!cur) return;
    const next = normalize(fn(cur.layout));
    qc.setQueryData<WorkspaceResponse>(qk.workspace, { ...cur, layout: next });
    schedule(next);
  }, [qc, schedule]);

  return useMemo(() => ({
    layout: data ? (valid ? upgradeLegacyConfigs(data.layout) : DEFAULT_LAYOUT) : null,
    isLoading: query.isLoading,
    update,
  }), [data, valid, query.isLoading, update]);
}
