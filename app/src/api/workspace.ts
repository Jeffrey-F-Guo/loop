import { useQuery } from '@tanstack/react-query';
import { useApi } from './ApiProvider';
import { qk } from './keys';
import type { WorkspaceResponse } from './types';

export function useWorkspace() {
  const api = useApi();
  return useQuery({
    queryKey: qk.workspace,
    queryFn: () => api.request<WorkspaceResponse>('GET', '/workspace'),
    staleTime: Infinity,
  });
}
