import { useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";

import { getRealEstateProjects, realEstateKeys } from "../../api/realestate";
import { getTreasuryAccounts, getTreasuryMeta, treasuryKeys } from "../../api/treasury";
import { useRealtyScope } from "../../hooks/useRealtyScope";

/** Справочники `/meta/` (статьи, источники, типы долгов) — живут долго. */
export function useTreasuryMeta(enabled = true) {
  const scope = useRealtyScope();
  return useQuery({
    queryKey: treasuryKeys.meta(scope),
    queryFn: ({ signal }) => getTreasuryMeta(scope, signal),
    enabled: enabled && scope.orgReady !== false,
    staleTime: 10 * 60_000,
  });
}

/** Счета за 30 дней — общий ключ с вкладкой «Счета» кассы. */
export function useTreasuryAccounts(enabled = true) {
  const scope = useRealtyScope();
  return useQuery({
    queryKey: treasuryKeys.accounts(scope, 30),
    queryFn: ({ signal }) => getTreasuryAccounts(30, scope, signal),
    enabled: enabled && scope.orgReady !== false,
    staleTime: 60_000,
  });
}

/** ЖК организации для селекта «Объект». */
export function useProjectOptions(enabled = true) {
  const scope = useRealtyScope();
  const query = useQuery({
    queryKey: realEstateKeys.projects(scope),
    queryFn: () => getRealEstateProjects(scope),
    enabled: enabled && scope.orgReady !== false,
    staleTime: 5 * 60_000,
  });
  return React.useMemo(() => (query.data ?? []).map((p) => ({ id: Number(p.id), name: p.name })).filter((p) => Number.isFinite(p.id)), [query.data]);
}

/**
 * После любого действия в финансах перечитать всё дерево treasury: оплата
 * планового платежа закрывает долг в кредиторке, операция меняет остатки
 * и бюджет — точечная инвалидация здесь ошибалась бы.
 */
export function useRefreshTreasury() {
  const queryClient = useQueryClient();
  return React.useCallback(() => void queryClient.invalidateQueries({ queryKey: treasuryKeys.all }), [queryClient]);
}
