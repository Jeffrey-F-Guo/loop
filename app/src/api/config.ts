export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';
export const AUTH_MODE: 'dev' | 'supabase' = process.env.EXPO_PUBLIC_AUTH_MODE === 'supabase' ? 'supabase' : 'dev';

const DEV_USER_KEY = 'sprint.devUser';

/** Dev-mode user: ?devUser= (persisted), then localStorage, then EXPO_PUBLIC_DEV_USER. */
export function resolveDevUser(): string | null {
  if (typeof window !== 'undefined') {
    const fromUrl = new URLSearchParams(window.location.search).get('devUser');
    try {
      if (fromUrl) {
        window.localStorage.setItem(DEV_USER_KEY, fromUrl);
        return fromUrl;
      }
      const stored = window.localStorage.getItem(DEV_USER_KEY);
      if (stored) return stored;
    } catch {
      if (fromUrl) return fromUrl;
    }
  }
  return process.env.EXPO_PUBLIC_DEV_USER || null;
}

let accessTokenGetter: (() => string | null) | null = null;
export function setAccessTokenGetter(fn: (() => string | null) | null) {
  accessTokenGetter = fn;
}

export function authHeaders(): Record<string, string> {
  if (AUTH_MODE === 'dev') {
    const user = resolveDevUser();
    return user ? { 'X-Dev-User': user } : {};
  }
  const token = accessTokenGetter?.();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
