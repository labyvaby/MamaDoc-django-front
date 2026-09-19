import React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { djangoQueryKeys } from "../../api/queryKeys";
import { useChangesSocket, type ChangeMessage } from "../../hooks/useChangesSocket";
import { usePermissions } from "../../hooks/usePermissions";
import { reactToDealEvent } from "./dealsRealtime";

/** Склейка бурста событий (создание + касание бота приходят подряд). */
const DEBOUNCE_MS = 300;

type Options = {
  /** Открытая воронка; null — доска без фильтра. */
  pipelineId: number | null | undefined;
  /** id сделок, созданных этой вкладкой — на них не празднуем. */
  ownIds: React.MutableRefObject<Set<number>>;
  /** Чужая новая сделка: подсветить карточку, озвучить. */
  onCelebrate: (dealId: number | null) => void;
};

/**
 * Realtime доски сделок: на события `entity: "deal"` из `/ws/changes/`
 * инвалидируем доску и сводку (перезапрос — обычный REST), новые чужие
 * сделки отдаём наверх для подсветки и звука.
 *
 * Сокет открывается и без выбранного филиала: сделки шлются в группу
 * организации. В скрытой вкладке события копятся и выстреливают одним
 * перезапросом при возврате.
 *
 * @returns true, пока сокет открыт — доска замедляет страховочный polling.
 */
export function useDealsRealtime({ pipelineId, ownIds, onCelebrate }: Options): boolean {
  const queryClient = useQueryClient();
  const { activeBranch } = usePermissions();

  const pipelineRef = React.useRef(pipelineId);
  pipelineRef.current = pipelineId;
  const celebrateRef = React.useRef(onCelebrate);
  celebrateRef.current = onCelebrate;

  const pendingRef = React.useRef(false);
  const debounceRef = React.useRef<number | undefined>(undefined);

  const refetch = React.useCallback(() => {
    pendingRef.current = false;
    queryClient.invalidateQueries({ queryKey: djangoQueryKeys.deals.all });
  }, [queryClient]);

  const connected = useChangesSocket({
    branchId: activeBranch?.id,
    enabled: true,
    onMessage: (msg: ChangeMessage) => {
      const reaction = reactToDealEvent(msg, pipelineRef.current, ownIds.current);
      if (!reaction.refetch) return;
      if (document.hidden) {
        pendingRef.current = true;
        return;
      }
      if (reaction.celebrate) celebrateRef.current(msg.objectId);
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(refetch, DEBOUNCE_MS);
    },
  });

  React.useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && pendingRef.current) refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearTimeout(debounceRef.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refetch]);

  return connected;
}
