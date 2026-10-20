import { useEffect, useState } from 'react';

/** The value as it was once it stopped changing for `delay` ms; for work too heavy to redo per keystroke */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
