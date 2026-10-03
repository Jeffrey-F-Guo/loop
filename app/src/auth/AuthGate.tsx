import { useEffect, type ReactNode } from 'react';
import { AUTH_MODE, setAccessTokenGetter } from '../api/config';
import { LoginScreen } from './LoginScreen';
import { useSupabaseSession } from './supabase';

export function AuthGate({ children, mode = AUTH_MODE }: { children: ReactNode; mode?: 'dev' | 'supabase' }) {
  if (mode === 'dev') return <>{children}</>;
  return <SupabaseGate>{children}</SupabaseGate>;
}

function SupabaseGate({ children }: { children: ReactNode }) {
  const { session, loading } = useSupabaseSession();
  useEffect(() => {
    setAccessTokenGetter(() => session?.access_token ?? null);
  }, [session]);
  if (loading) return null;
  if (!session) return <LoginScreen />;
  return <>{children}</>;
}
