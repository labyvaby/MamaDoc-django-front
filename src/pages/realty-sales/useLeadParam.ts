import React from "react";
import { useSearchParams } from "react-router";

/**
 * Открытая карточка — в адресе (`?<name>=<id>`): ссылкой можно поделиться,
 * F5 её не закрывает.
 */
export function useIdParam(name: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const id = Number(searchParams.get(name)) || null;
  const open = React.useCallback(
    (next: number | null) =>
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next) params.set(name, String(next));
          else params.delete(name);
          return params;
        },
        { replace: true },
      ),
    [name, setSearchParams],
  );
  return [id, open] as const;
}

/** Карточка заявки — `?lead=<id>`. */
export const useLeadParam = () => useIdParam("lead");
