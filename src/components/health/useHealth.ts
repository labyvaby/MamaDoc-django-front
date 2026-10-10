import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getHealthAlert, getIllnessHistory, getPatientHealth, getSurgeries } from "../../api/health";
import { DJANGO_DETAIL_STALE_TIME_MS, DJANGO_LIST_STALE_TIME_MS, djangoQueryKeys } from "../../api/queryKeys";
import { orgWide, type Scope } from "../../api/scope";
import { useActiveScope } from "../../hooks/useActiveScope";
import { usePermissions } from "../../hooks/usePermissions";

export interface HealthScope {
  orgId: number | undefined;
  scope: Scope;
  ready: boolean;
}

/** Организация скоупа: пациент ищется в скоупе пациентов, филиал не нужен. */
export function useHealthScope(): HealthScope {
  const active = useActiveScope();
  const orgId = active.organizationId;
  const scope = React.useMemo(() => orgWide(orgId), [orgId]);
  return { orgId, scope, ready: active.isReady && active.orgReady };
}

/** Права медпрофиля: просмотр и ведение (и модуль «Приёмы» включён). */
export function useHealthAccess(): { canView: boolean; canManage: boolean } {
  const { canAccess } = usePermissions();
  return { canView: canAccess("medical.health.view"), canManage: canAccess("medical.health.manage") };
}

/** Профиль, действующие аллергии, диагнозы и алерт одним запросом. */
export function usePatientHealth(patientId: number | null | undefined, enabled = true) {
  const { orgId, scope, ready } = useHealthScope();
  return useQuery({
    queryKey: djangoQueryKeys.health.summary(patientId ?? 0, orgId),
    queryFn: ({ signal }) => getPatientHealth(scope, patientId as number, signal),
    enabled: enabled && ready && patientId != null,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });
}

/** «История болезней» одним ответом: случаи из приёмов, хронические, госпитализации, инфекции. */
export function useIllnessHistory(patientId: number | null | undefined, enabled = true) {
  const { orgId, scope, ready } = useHealthScope();
  return useQuery({
    queryKey: djangoQueryKeys.health.illnessHistory(patientId ?? 0, orgId),
    queryFn: ({ signal }) => getIllnessHistory(scope, patientId as number, signal),
    enabled: enabled && ready && patientId != null,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
}

/** Операции, травмы, процедуры и переливания — вместе с ошибочно внесёнными: их прячет экран. */
export function usePatientSurgeries(patientId: number | null | undefined, enabled = true) {
  const { orgId, scope, ready } = useHealthScope();
  return useQuery({
    queryKey: djangoQueryKeys.health.surgeries(patientId ?? 0, orgId),
    queryFn: ({ signal }) => getSurgeries(scope, patientId as number, { status: "all" }, signal),
    enabled: enabled && ready && patientId != null,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
}

/** Сбросить всё по медпрофилю пациента (алерт, списки, журнал). */
export function useInvalidateHealth(patientId: number | null | undefined): () => Promise<void> {
  const queryClient = useQueryClient();
  return React.useCallback(async () => {
    if (patientId == null) return;
    await queryClient.invalidateQueries({ queryKey: djangoQueryKeys.health.patient(patientId) });
  }, [queryClient, patientId]);
}

/** Алерт пациента: виден всем, у кого есть карточка (`patients.view`), только в клинике. */
export function useHealthAlert(patientId: number | null | undefined, enabled = true) {
  const { orgId, scope, ready } = useHealthScope();
  const { canAccess, activeOrganization } = usePermissions();
  // Медпрофиль есть только у клиник: салону и отелю запрос не нужен.
  const isClinic = activeOrganization?.vertical === "clinic";
  return useQuery({
    queryKey: djangoQueryKeys.health.alert(patientId ?? 0, orgId),
    queryFn: ({ signal }) => getHealthAlert(scope, patientId as number, signal),
    enabled: enabled && ready && isClinic && patientId != null && canAccess("patients.view"),
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });
}
