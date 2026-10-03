import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  useSupabaseSession: () => ({ session: null, loading: false }),
  getSupabase: () => ({ auth: { signInWithOAuth: vi.fn() } }),
}));

import { AuthGate } from './AuthGate';

describe('AuthGate', () => {
  it('dev mode renders the app without login', () => {
    render(<AuthGate mode="dev"><div>app</div></AuthGate>);
    expect(screen.getByText('app')).toBeInTheDocument();
  });

  it('supabase mode without a session shows Google and Apple login', () => {
    render(<AuthGate mode="supabase"><div>app</div></AuthGate>);
    expect(screen.queryByText('app')).not.toBeInTheDocument();
    expect(screen.getByText('Continue with Google')).toBeInTheDocument();
    expect(screen.getByText('Continue with Apple')).toBeInTheDocument();
  });
});
