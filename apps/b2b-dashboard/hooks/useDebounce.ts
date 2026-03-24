import { useState, useEffect } from "react";

/**
 * Returns a debounced version of `value` that only updates after
 * `delay` milliseconds have passed since the last change.
 *
 * Use this for search inputs to avoid triggering expensive filters
 * (or Supabase queries) on every keystroke.
 *
 * @example
 * const debouncedSearch = useDebounce(searchInput, 300);
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
