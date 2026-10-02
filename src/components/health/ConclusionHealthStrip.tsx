import React from "react";
import { Box, Divider, Stack } from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import { getAppointment } from "../../api/appointments";
import { getProgramEnrollments } from "../../api/programs";
import { DJANGO_DETAIL_STALE_TIME_MS, djangoQueryKeys } from "../../api/queryKeys";
import { useActiveScope } from "../../hooks/useActiveScope";
import { usePermissions } from "../../hooks/usePermissions";
import { HealthAlertStrip } from "./HealthAlertChip";
import { useHealthAlert } from "./useHealth";
import { OnboardingChecklistCard } from "./OnboardingChecklistCard";

/**
 * Над формой заключения: аллергии пациента и — если ребёнок на учёте и
 * первичный осмотр не закрыт — чек-лист осмотра. Пациента берём из приёма
 * (окно заключения его не получает), запрос общий с карточкой приёма.
 */
export const ConclusionHealthStrip: React.FC<{ appointmentId: number | null }> = ({ appointmentId }) => {
  const scope = useActiveScope();
  const { activeOrganization, canAccess } = usePermissions();
  const clinic = activeOrganization?.vertical === "clinic";
  const appointment = useQuery({
    queryKey: djangoQueryKeys.appointments.detail(appointmentId ?? 0),
    queryFn: () => getAppointment(appointmentId as number),
    enabled: clinic && appointmentId != null,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });
  const patientId = appointment.data?.patient?.id ?? null;
  const alert = useHealthAlert(patientId);
  const canSeeEnrollments = canAccess("enrollments.view");
  const enrollments = useQuery({
    queryKey: djangoQueryKeys.programs.enrollments(patientId ?? 0, scope),
    queryFn: ({ signal }) => getProgramEnrollments(scope, { patientId: patientId as number, limit: 50 }, signal),
    enabled: clinic && canSeeEnrollments && patientId != null && scope.isReady && scope.orgReady,
  });
  const pending = (enrollments.data?.results ?? []).find(
    (enrollment) => enrollment.isEffectivelyActive && !enrollment.onboardingCompletedAt && enrollment.terms.length > 0,
  );

  if (patientId == null) return null;
  // «Аллергий нет» без Д-учёта и группы — полосе нечего сказать.
  const quiet = alert.data?.allergyStatus === "none" && !alert.data.dispensaryCount && !alert.data.healthGroup;
  if ((!alert.data || quiet) && !pending) return null;
  return (
    <>
      <Box sx={{ px: 2, py: 1 }}>
        <Stack gap={1}>
          {!quiet && <HealthAlertStrip patientId={patientId} dense />}
          {pending && (
            <OnboardingChecklistCard enrollmentId={pending.id} canComplete={canAccess("medical.health.manage")} dense />
          )}
        </Stack>
      </Box>
      <Divider />
    </>
  );
};
