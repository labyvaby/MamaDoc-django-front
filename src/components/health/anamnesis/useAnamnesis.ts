import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import {
  getConditions,
  getFamily,
  getGrowth,
  getHospitalizations,
  getLifeAnamnesis,
  type Condition,
  type FamilyMember,
  type GrowthData,
  type Hospitalization,
  type LifeAnamnesis,
  type PatientHealth,
} from "../../../api/health";
import { DJANGO_DETAIL_STALE_TIME_MS, DJANGO_LIST_STALE_TIME_MS, djangoQueryKeys } from "../../../api/queryKeys";
import {
  getPatientHistory,
  getPatientSchedule,
  type VaccinationRecord,
  type VaccinationScheduleSlot,
} from "../../../api/vaccinations";
import { useApiOrgId } from "../../../hooks/useApiOrgId";
import { usePermissions } from "../../../hooks/usePermissions";
import { usePatientHealth, useHealthScope } from "../useHealth";
import type { AnamnesisInput } from "./anamnesisTypes";
import type { ChildSex } from "./russian";

/** Права раздела: просмотр, правка, закрытые сведения, прививки (ТЗ §6). */
export interface AnamnesisAccess {
  canView: boolean;
  canManage: boolean;
  /** `medical.health.sensitive.view` — без него закрытого блока нет вовсе. */
  canSeeSensitive: boolean;
  canSeeVaccinations: boolean;
}

export function useAnamnesisAccess(): AnamnesisAccess {
  const { canAccess } = usePermissions();
  const canView = canAccess("medical.health.view");
  const canManage = canAccess("medical.health.manage");
  const canSeeSensitive = canAccess("medical.health.sensitive.view");
  const canSeeVaccinations = canAccess("vaccinations.view");
  return React.useMemo(
    () => ({ canView, canManage, canSeeSensitive, canSeeVaccinations }),
    [canView, canManage, canSeeSensitive, canSeeVaccinations],
  );
}

export interface AnamnesisSources {
  life: LifeAnamnesis;
  health: PatientHealth;
  growth: GrowthData;
  family: FamilyMember[];
  /** `conditions/?status=all`; null — ещё нет, берём диагнозы из `health/`. */
  conditions: Condition[] | null;
  hospitalizations: Hospitalization[];
  schedule: VaccinationScheduleSlot[] | null;
  history: VaccinationRecord[] | null;
}

/**
 * Вход чистых функций из ответов сервера. Закрытые сведения — только при праве
 * и если сервер их отдал; прививки — только при `vaccinations.view`.
 * «Операции и травмы» и отметка «болезней не было» пока не подключены.
 */
export function assembleAnamnesisInput(sources: AnamnesisSources, access: Pick<AnamnesisAccess, "canSeeSensitive" | "canSeeVaccinations">): AnamnesisInput {
  const { life, health, growth } = sources;
  const profile = health.profile;
  const sex: ChildSex = growth.sex === "male" || growth.sex === "female" ? growth.sex : "";
  const canSeeSensitive = access.canSeeSensitive && life.sensitiveAccess;
  return {
    sex,
    birthDate: growth.birthDate,
    profile,
    perinatal: life.perinatal,
    social: life.social,
    sensitive: canSeeSensitive ? life.sensitive : null,
    sensitiveAccess: canSeeSensitive,
    sensitiveFilled: life.sensitiveFilled,
    screenings: life.screenings,
    riskGroups: life.riskGroups,
    family: sources.family,
    allergies: health.allergies.filter((allergy) => allergy.status === "active"),
    conditions: (sources.conditions ?? health.conditions).filter((condition) => condition.status !== "refuted"),
    hospitalizations: sources.hospitalizations,
    noPastIllnesses: null,
    feeding: growth.feeding,
    complementaryFeedingOn: growth.complementaryFeedingOn ?? profile.complementaryFeedingOn,
    surgeries: null,
    vaccinations:
      access.canSeeVaccinations && (sources.schedule || sources.history)
        ? {
            records: (sources.history ?? []).map((record) => ({
              vaccineName: record.vaccineName,
              administeredAt: record.administeredAt,
              status: String(record.status),
            })),
            schedule: (sources.schedule ?? []).map((slot) => ({
              vaccineName: slot.vaccineName,
              status: slot.status,
              scheduledDate: slot.scheduledDate,
            })),
          }
        : null,
  };
}

export function useLifeAnamnesis(patientId: number | null | undefined, enabled = true) {
  const { orgId, scope, ready } = useHealthScope();
  return useQuery({
    queryKey: djangoQueryKeys.health.lifeAnamnesis(patientId ?? 0, orgId),
    queryFn: ({ signal }) => getLifeAnamnesis(scope, patientId as number, signal),
    enabled: enabled && ready && patientId != null,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });
}

/** После записи под `life-anamnesis/`: ответ — то же тело, что GET; кладём его и сбрасываем медкарту. */
export function useApplyLifeAnamnesis(patientId: number): (data: LifeAnamnesis | void) => Promise<void> {
  const queryClient = useQueryClient();
  const { orgId } = useHealthScope();
  return React.useCallback(
    async (data) => {
      if (data && typeof data === "object" && "perinatal" in data) {
        queryClient.setQueryData(djangoQueryKeys.health.lifeAnamnesis(patientId, orgId), data);
      }
      await queryClient.invalidateQueries({ queryKey: djangoQueryKeys.health.patient(patientId) });
    },
    [queryClient, orgId, patientId],
  );
}

interface InputOptions {
  /** Дата расчёта (YYYY-MM-DD): книжка — сегодня, заключение — дата приёма. */
  at?: string;
  enabled?: boolean;
}

/**
 * Собирает вход чистых функций из ответов `growth/`, `health/`,
 * `conditions/?status=all`, `hospitalizations/`, `family/`, `life-anamnesis/`
 * и прививок (если есть `vaccinations.view`). «Операции и травмы» и отметка
 * «болезней не было» соседних разделов пока не подключены — их фраз нет.
 */
export function useAnamnesisInput(patientId: number | null | undefined, options: InputOptions = {}) {
  const enabled = options.enabled ?? true;
  const at = options.at ?? dayjs().format("YYYY-MM-DD");
  const { orgId, scope, ready } = useHealthScope();
  const access = useAnamnesisAccess();
  const apiOrgId = useApiOrgId();
  const on = enabled && ready && patientId != null && access.canView;
  const id = patientId ?? 0;

  const life = useLifeAnamnesis(patientId, on);
  const health = usePatientHealth(patientId, on);
  const growth = useQuery({
    queryKey: djangoQueryKeys.health.growth(id, orgId),
    queryFn: ({ signal }) => getGrowth(scope, id, signal),
    enabled: on,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });
  const conditions = useQuery({
    queryKey: djangoQueryKeys.health.conditions(id, { status: "all" }, orgId),
    queryFn: ({ signal }) => getConditions(scope, id, { status: "all" }, signal),
    enabled: on,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const hospitalizations = useQuery({
    queryKey: djangoQueryKeys.health.hospitalizations(id, orgId),
    queryFn: ({ signal }) => getHospitalizations(scope, id, signal),
    enabled: on,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const family = useQuery({
    queryKey: djangoQueryKeys.health.family(id, orgId),
    queryFn: ({ signal }) => getFamily(scope, id, signal),
    enabled: on,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const vaccinesOn = on && access.canSeeVaccinations;
  const schedule = useQuery({
    queryKey: djangoQueryKeys.vaccinations.patientSchedule(id),
    queryFn: ({ signal }) => getPatientSchedule(id, apiOrgId, signal),
    enabled: vaccinesOn,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const history = useQuery({
    queryKey: djangoQueryKeys.vaccinations.patientHistory(id),
    queryFn: ({ signal }) => getPatientHistory(id, apiOrgId, signal),
    enabled: vaccinesOn,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  const input = React.useMemo<AnamnesisInput | null>(
    () =>
      life.data && health.data && growth.data && family.data
        ? assembleAnamnesisInput(
            {
              life: life.data,
              health: health.data,
              growth: growth.data,
              family: family.data,
              conditions: conditions.data ?? null,
              hospitalizations: hospitalizations.data ?? [],
              schedule: schedule.data ?? null,
              history: history.data ?? null,
            },
            access,
          )
        : null,
    [
      life.data,
      health.data,
      growth.data,
      family.data,
      conditions.data,
      hospitalizations.data,
      schedule.data,
      history.data,
      access,
    ],
  );

  return {
    at,
    input,
    access,
    life: life.data ?? null,
    health: health.data ?? null,
    growth: growth.data ?? null,
    isLoading: life.isLoading || health.isLoading || growth.isLoading || family.isLoading,
    isError: life.isError || health.isError || growth.isError || family.isError,
  };
}
