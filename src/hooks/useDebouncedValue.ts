import React from "react";

/**
 * Значение с задержкой — для поисковых полей: пока пользователь печатает,
 * запрос не уходит.
 *
 * @example
 * const [search, setSearch] = React.useState("");
 * const debouncedSearch = useDebouncedValue(search.trim());
 */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
