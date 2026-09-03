import type { QueryClient } from '@tanstack/react-query';

/**
 * NISFLOW FINANCE — CLIENT-SIDE DATA RESET UTILITY
 * 
 * Centralized registry and purge routine for all client-side application state.
 * Safely clears React Query cache, NisFlow local storage keys, session cache,
 * and service-worker runtime caches without destroying Supabase Auth credentials.
 */

export const NISFLOW_LOCALSTORAGE_KEYS = [
  'nisflow_snapshot_date',
  'nisflow_onboarding_completed',
] as const;

export interface ClientResetResult {
  reactQueryCleared: boolean;
  localStorageKeysRemoved: string[];
  sessionStorageKeysRemoved: string[];
  serviceWorkerCachesCleared: boolean;
}

/**
 * Clears only NisFlow financial and application state while strictly preserving
 * authentication session tokens (e.g. Supabase `sb-*` tokens and browser credentials).
 */
export async function clearUserFinancialClientState(queryClient?: QueryClient | null): Promise<ClientResetResult> {
  const result: ClientResetResult = {
    reactQueryCleared: false,
    localStorageKeysRemoved: [],
    sessionStorageKeysRemoved: [],
    serviceWorkerCachesCleared: false,
  };

  // 1. Clear React Query in-memory cache and subscriptions
  if (queryClient) {
    try {
      queryClient.clear();
      result.reactQueryCleared = true;
    } catch (err) {
      console.warn('[CLIENT_RESET] React Query clear failed:', err);
    }
  }

  // 2. Clear strictly NisFlow-owned localStorage keys
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      for (const key of NISFLOW_LOCALSTORAGE_KEYS) {
        if (window.localStorage.getItem(key) !== null) {
          window.localStorage.removeItem(key);
          result.localStorageKeysRemoved.push(key);
        }
      }

      // Also scan for any dynamic keys starting with 'nisflow_' (excluding auth tokens)
      const allKeys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith('nisflow_') && !k.startsWith('sb-')) {
          allKeys.push(k);
        }
      }
      for (const k of allKeys) {
        if (!result.localStorageKeysRemoved.includes(k)) {
          window.localStorage.removeItem(k);
          result.localStorageKeysRemoved.push(k);
        }
      }
    } catch (err) {
      console.warn('[CLIENT_RESET] LocalStorage cleanup failed:', err);
    }
  }

  // 3. Clear strictly NisFlow-owned sessionStorage keys
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const sessionKeysToRemove: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k && (k.startsWith('nisflow_') || k.startsWith('nisflow-')) && !k.startsWith('sb-')) {
          sessionKeysToRemove.push(k);
        }
      }
      for (const k of sessionKeysToRemove) {
        window.sessionStorage.removeItem(k);
        result.sessionStorageKeysRemoved.push(k);
      }
    } catch (err) {
      console.warn('[CLIENT_RESET] SessionStorage cleanup failed:', err);
    }
  }

  // 4. Invalidate service worker runtime dynamic caches (if supported)
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cacheNames = await window.caches.keys();
      for (const cacheName of cacheNames) {
        // Only clear dynamic/runtime caches, static assets remain intact
        if (cacheName.includes('runtime') || cacheName.includes('data')) {
          await window.caches.delete(cacheName);
        }
      }
      result.serviceWorkerCachesCleared = true;
    } catch (err) {
      console.warn('[CLIENT_RESET] Cache storage cleanup failed:', err);
    }
  }

  return result;
}
