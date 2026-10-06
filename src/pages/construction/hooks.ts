import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { constructionKeys, getContractors, getProjectsOverview, getStageGroups } from "../../api/construction";
import { getNomenclature, getWarehouses, supplyKeys } from "../../api/supply";
import { treasuryKeys } from "../../api/treasury";
import { useRealtyScope } from "../../hooks/useRealtyScope";

/** ЖК, видимые стройке (тот же список, что «Сводка по объектам»). */
export function useConstructionProjects(enabled = true) {
  const scope = useRealtyScope();
  return useQuery({
    queryKey: constructionKeys.overview(scope),
    queryFn: ({ signal }) => getProjectsOverview(scope, signal),
    enabled: enabled && scope.orgReady !== false,
    staleTime: 60_000,
  });
}

/** Подрядчики — общий справочник организации, для селектов. */
export function useContractorOptions(enabled = true) {
  const scope = useRealtyScope();
  const query = useQuery({
    queryKey: constructionKeys.contractors(scope),
    queryFn: ({ signal }) => getContractors(scope, signal),
    enabled: enabled && scope.orgReady !== false,
    staleTime: 60_000,
  });
  return React.useMemo(() => (query.data ?? []).filter((c) => c.isActive), [query.data]);
}

export function useStageGroups(enabled = true) {
  const scope = useRealtyScope();
  return useQuery({
    queryKey: constructionKeys.groups(scope),
    queryFn: ({ signal }) => getStageGroups(scope, signal),
    enabled: enabled && scope.orgReady !== false,
    staleTime: 30 * 60_000,
  });
}

/**
 * После действия перечитать всё дерево стройки: акт меняет долг подрядчика,
 * дефект — карточку этапа, прогресс — сводку и «Сводку по объектам».
 */
export function useRefreshConstruction() {
  const queryClient = useQueryClient();
  return React.useCallback(() => void queryClient.invalidateQueries({ queryKey: constructionKeys.all }), [queryClient]);
}

/**
 * После действия в снабжении перечитать снабжение и склад, а также финансы:
 * приёмка заказа заводит кредиторку, списание на объект — факт бюджета.
 */
export function useRefreshSupply() {
  const queryClient = useQueryClient();
  return React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: supplyKeys.all });
    void queryClient.invalidateQueries({ queryKey: treasuryKeys.all });
  }, [queryClient]);
}

/** Номенклатура — общий справочник организации. */
export function useNomenclature(enabled = true) {
  const scope = useRealtyScope();
  return useQuery({
    queryKey: supplyKeys.nomenclature(scope),
    queryFn: ({ signal }) => getNomenclature(scope, signal),
    enabled: enabled && scope.orgReady !== false,
    staleTime: 10 * 60_000,
  });
}

export function useWarehouses(enabled = true) {
  const scope = useRealtyScope();
  return useQuery({
    queryKey: supplyKeys.warehouses(scope),
    queryFn: ({ signal }) => getWarehouses(scope, signal),
    enabled: enabled && scope.orgReady !== false,
    staleTime: 60_000,
  });
}
