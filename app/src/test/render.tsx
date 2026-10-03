import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { ApiProvider } from '../api/ApiProvider';
import { createFakeApi, type FakeApi } from './fakeApi';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });
}

export function createWrapper(api: FakeApi = createFakeApi()) {
  const qc = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider client={api}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </ApiProvider>
  );
  return { wrapper, qc, api };
}

export function renderWithProviders(ui: ReactElement, opts: { api?: FakeApi } = {}) {
  const { wrapper, qc, api } = createWrapper(opts.api);
  return { ...render(ui, { wrapper }), qc, api };
}
