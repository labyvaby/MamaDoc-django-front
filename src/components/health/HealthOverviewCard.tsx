import React from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import HealthAndSafetyOutlined from "@mui/icons-material/HealthAndSafetyOutlined";

import { usePermissions } from "../../hooks/usePermissions";
import { AppCard } from "../ui";
import { HealthAlertStrip } from "./HealthAlertChip";
import { OnboardingChecklistCard } from "./OnboardingChecklistCard";
import { bloodLabel, controlState, formatDate, healthGroupLabel, onDispensary } from "./healthMeta";
import { useHealthAccess, usePatientHealth } from "./useHealth";

interface HealthOverviewCardProps {
  patientId: number;
  enrollmentId: number;
  /** Первичный осмотр ещё не закрыт — показать чек-лист. */
  onboardingOpen: boolean;
}

/** «Главное о здоровье» в обзоре книжки: алерт, группы, Д-учёт, чек-лист. */
export const HealthOverviewCard: React.FC<HealthOverviewCardProps> = ({ patientId, enrollmentId, onboardingOpen }) => {
  const { canView, canManage } = useHealthAccess();
  const { activeOrganization } = usePermissions();
  // Медпрофиль — только у клиник (книжка фитнеса его не показывает).
  const visible = canView && activeOrganization?.vertical === "clinic";
  const summary = usePatientHealth(patientId, visible);
  if (!visible) return null;
  const data = summary.data;
  const observed = (data?.conditions ?? []).filter(onDispensary);
  const nextControl = observed
    .map((condition) => condition.nextControlOn)
    .filter((date): date is string => Boolean(date))
    .sort()[0];
  const overdue = observed.some((condition) => controlState(condition) === "overdue");

  return (
    <AppCard
      variant="outlined"
      header={
        <Stack direction="row" gap={1} alignItems="center" sx={{ px: 2, pt: 2 }}>
          <HealthAndSafetyOutlined color="primary" />
          <Typography variant="h6" fontWeight={700}>
            Главное о здоровье
          </Typography>
        </Stack>
      }
    >
      <Stack gap={1.5}>
        <HealthAlertStrip patientId={patientId} />
        {data && (
          <Stack direction="row" gap={0.75} flexWrap="wrap">
            <Chip
              size="small"
              variant="outlined"
              label={data.profile.healthGroup ? `Группа здоровья ${healthGroupLabel(data.profile.healthGroup)}` : "Группа здоровья не указана"}
            />
            <Chip size="small" variant="outlined" label={`Кровь: ${bloodLabel(data.profile)}`} />
            {observed.length > 0 && (
              <Chip
                size="small"
                color={overdue ? "error" : "primary"}
                variant="outlined"
                label={`Д-учёт: ${observed.length}${nextControl ? ` · контроль ${formatDate(nextControl)}` : ""}`}
              />
            )}
          </Stack>
        )}
        {observed.length > 0 && (
          <Box>
            {observed.slice(0, 3).map((condition) => (
              <Typography key={condition.id} variant="body2" color="text.secondary">
                {[condition.diagnosisCode, condition.title].filter(Boolean).join(" · ")}
              </Typography>
            ))}
          </Box>
        )}
        {onboardingOpen && <OnboardingChecklistCard enrollmentId={enrollmentId} canComplete={canManage} />}
      </Stack>
    </AppCard>
  );
};
