import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiProvider, createAppQueryClient } from './src/api/ApiProvider';
import { createApiClient } from './src/api/client';
import { API_URL, authHeaders } from './src/api/config';
import { Shell } from './src/app/Shell';
import { AuthGate } from './src/auth/AuthGate';
import { injectGlobalStyles } from './src/ui/globalStyles';

injectGlobalStyles();

export default function App() {
  const [queryClient] = useState(createAppQueryClient);
  const [api] = useState(() => createApiClient({ baseUrl: API_URL, headers: authHeaders }));
  return (
    <ApiProvider client={api}>
      <QueryClientProvider client={queryClient}>
        <AuthGate>
          <Shell />
        </AuthGate>
      </QueryClientProvider>
    </ApiProvider>
  );
}
