import React from "react";
import { useSearchParams } from "react-router";

/** Открытая карточка заявки — в адресе (`?lead=<id>`): ссылкой можно поделиться, F5 её не закрывает. */
export function useLeadParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  const leadId = Number(searchParams.get("lead")) || null;
  const openLead = React.useCallback(
    (id: number | null) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set("lead", String(id));
          else next.delete("lead");
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );
  return [leadId, openLead] as const;
}
