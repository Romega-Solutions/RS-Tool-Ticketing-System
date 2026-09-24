'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

// localStorage-backed state that is safe to server-render.
//
// Reading localStorage in a useState initializer makes the first client render
// differ from the server HTML (React #418). useSyncExternalStore renders the
// server snapshot (null → fallback) during hydration, then re-renders with the
// stored value — no mismatch and no setState-in-effect.

const LOCAL_EVENT = 'persisted-json-change';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);       // other tabs
  window.addEventListener(LOCAL_EVENT, onChange);     // this tab
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(LOCAL_EVENT, onChange);
  };
}

function readRaw(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/**
 * `parse` receives the JSON-decoded stored value and must return a valid `T`
 * (validate/clean it there). It is only called when something is stored and
 * decodes; otherwise `fallback` is returned. Keep `fallback` and `parse`
 * stable (module-level) — they are memo dependencies.
 */
export function usePersistedJson<T>(
  key: string,
  fallback: T,
  parse: (stored: unknown) => T,
): [T, (next: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null,
  );

  const value = useMemo(() => {
    if (raw == null) return fallback;
    try { return parse(JSON.parse(raw)); } catch { return fallback; }
  }, [raw, fallback, parse]);

  const setValue = useCallback((next: T) => {
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
    window.dispatchEvent(new Event(LOCAL_EVENT));
  }, [key]);

  return [value, setValue];
}
