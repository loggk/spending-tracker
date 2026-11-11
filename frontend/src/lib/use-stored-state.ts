import { useCallback, useState } from 'react';

/**
 * State backed by localStorage, for view preferences the API does not hold.
 * Storage can throw (private mode, blocked site data), so every access is
 * guarded and a bad value simply falls back.
 */
export function useStoredState<T>(
  key: string,
  fallback: T,
  parse: (raw: unknown) => T | null,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return (raw === null ? null : parse(JSON.parse(raw))) ?? fallback;
    } catch {
      return fallback;
    }
  });

  const store = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // A preference that cannot be saved is not worth interrupting anyone for.
      }
    },
    [key],
  );

  return [value, store];
}
