import { QueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import type { ApiClient } from './client';

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>');
  return api;
}

/** Mutations never invalidate the items list: pending optimistic creates would vanish on refetch. */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
      mutations: { retry: 0 },
    },
  });
}
