import { useEffect, useState } from "react";

/**
 * useState that is saved to localStorage so it survives page reloads.
 * Loads after mount (safe with SSR) and silently falls back to memory-only
 * if storage is unavailable (private mode, blocked site data).
 * When `key` changes (e.g. a per-project chat), the value for the new key is
 * loaded (or `initial`), and nothing is written until that load has happened,
 * so one key's value never leaks into another.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    let next = initial;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) next = JSON.parse(raw) as T;
    } catch {
      /* ignore */
    }
    setValue(next);
    setLoadedKey(key);
    // `initial` is only the fallback for a missing key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (loadedKey !== key) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value, loadedKey]);

  return [value, setValue] as const;
}
