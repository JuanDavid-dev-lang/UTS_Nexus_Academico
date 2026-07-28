import { useEffect, useState } from 'react';

/**
 * Debounced value.
 *
 * Search boxes filter large lists on every keystroke; debouncing keeps typing
 * responsive by re-filtering only once the user pauses.
 */
export function useDebounce<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
