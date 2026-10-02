import React from "react";
import { Box, Chip, Divider, Stack, Typography, alpha, useTheme } from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import { getAppointment } from "../../api/appointments";
import { getGrowth } from "../../api/health";
import { getProgramEnrollments } from "../../api/programs";
import { DJANGO_DETAIL_STALE_TIME_MS, djangoQueryKeys } from "../../api/queryKeys";
import { useActiveScope } from "../../hooks/useActiveScope";
import { usePermissions } from "../../hooks/usePermissions";
import { defaultPosition, growthSex, heightForNorms, normsAge, parseMeasure } from "../../pages/patient-program/growth/growthData";
import { assess, bmi, centileLabel, type GrowthAssessment } from "../../pages/patient-program/growth/growthNorms";
import { growthColor } from "../../pages/patient-program/growth/growthUi";
import { HealthAlertStrip } from "./HealthAlertChip";
import { OnboardingChecklistCard } from "./OnboardingChecklistCard";
import { useHealthAlert, useHealthScope } from "./useHealth";

const CentileChip: React.FC<{ label: string; assessment: GrowthAssessment }> = ({ label, assessment }) => {
  const theme = useTheme();
  const color = growthColor(theme, assessment.status);
  return (
    <Chip
      size="small"
      label={`${label} ${centileLabel(assessment.centile)}`}
      sx={{ height: 22, borderRadius: "6px", fontWeight: 600, bgcolor: alpha(color, 0.16), color }}
    />
  );
};

interface ConclusionHealthStripProps {
  appointmentId: number | null;
  /** Вес и рост из формы — центили ВОЗ по ходу ввода. */
  weightKg?: string;
  heightCm?: string;
}

/**
 * Над формой заключения: аллергии пациента, центили ВОЗ к введённым весу и
 * росту и — если ребёнок на учёте и первичный осмотр не закрыт — чек-лист.
 * Пациента берём из приёма (окно заключения его не получает).
 */
export const ConclusionHealthStrip: React.FC<ConclusionHealthStripProps> = ({ appointmentId, weightKg = "", heightCm = "" }) => {
  const scope = useActiveScope();
  const health = useHealthScope();
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
  const growth = useQuery({
    queryKey: djangoQueryKeys.health.growth(patientId ?? 0, health.orgId),
    queryFn: ({ signal }) => getGrowth(health.scope, patientId as number, signal),
    enabled: clinic && health.ready && patientId != null && canAccess("medical.health.view"),
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });
  const enrollments = useQuery({
    queryKey: djangoQueryKeys.programs.enrollments(patientId ?? 0, scope),
    queryFn: ({ signal }) => getProgramEnrollments(scope, { patientId: patientId as number, limit: 50 }, signal),
    enabled: clinic && canAccess("enrollments.view") && patientId != null && scope.isReady && scope.orgReady,
  });
  const pending = (enrollments.data?.results ?? []).find(
    (enrollment) => enrollment.isEffectivelyActive && !enrollment.onboardingCompletedAt && enrollment.terms.length > 0,
  );

  const centiles = React.useMemo(() => {
    const data = growth.data;
    const at = appointment.data?.scheduledAt;
    if (!data || !at) return [];
    const sex = growthSex(data.sex);
    const gestation = { weeks: data.gestationalAgeWeeks, days: data.gestationalAgeDays };
    const { months } = normsAge(data.birthDate, at, gestation);
    const weight = parseMeasure(weightKg);
    const height = parseMeasure(heightCm);
    const rows: Array<{ label: string; assessment: GrowthAssessment | null }> = [
      { label: "вес", assessment: assess("weight", sex, months, weight) },
      { label: "рост", assessment: assess("height", sex, months, heightForNorms(height, defaultPosition(months), months)) },
      { label: "ИМТ", assessment: assess("bmi", sex, months, bmi(weight, height)) },
    ];
    return rows.filter((row): row is { label: string; assessment: GrowthAssessment } => row.assessment != null);
  }, [growth.data, appointment.data?.scheduledAt, weightKg, heightCm]);

  if (patientId == null) return null;
  // «Аллергий нет» без Д-учёта и группы — полосе нечего сказать.
  const quiet = alert.data?.allergyStatus === "none" && !alert.data.dispensaryCount && !alert.data.healthGroup;
  const showAlert = Boolean(alert.data) && !quiet;
  if (!showAlert && !pending && centiles.length === 0) return null;
  return (
    <>
      <Box sx={{ px: 2, py: 1 }}>
        <Stack gap={1}>
          {showAlert && <HealthAlertStrip patientId={patientId} dense />}
          {centiles.length > 0 && (
            <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap">
              <Typography variant="caption" color="text.secondary">
                Центили ВОЗ:
              </Typography>
              {centiles.map((row) => (
                <CentileChip key={row.label} label={row.label} assessment={row.assessment} />
              ))}
            </Stack>
          )}
          {pending && (
            <OnboardingChecklistCard enrollmentId={pending.id} canComplete={canAccess("medical.health.manage")} dense />
          )}
        </Stack>
      </Box>
      <Divider />
    </>
  );
};
