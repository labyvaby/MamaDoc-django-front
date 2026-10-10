import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import dayjs from "dayjs";

import type { PatientGender } from "../../api/patients";
import { usePermissions } from "../../hooks/usePermissions";
import { subtleBg } from "../../theme/uiHelpers";
import { vaccinationInfectionsLine } from "./illnessData";
import { TRANSFUSION_VACCINE_HINT, recentTransfusion, transfusionLead } from "./surgeryData";
import { useHealthAccess, useIllnessHistory, usePatientSurgeries } from "./useHealth";

/**
 * Серая строка над календарём «Прививок и проб» (ТЗ 2026-10-04 §4.3):
 * «Переболела: розеола (01.2026). Не болела: ветряная оспа.» и строка о
 * переливании крови за 11 месяцев. С правом `medical.health.view`; без
 * отметок строк нет.
 */
export const VaccinationHealthNote: React.FC<{ patientId: number; gender?: PatientGender | null }> = ({ patientId, gender }) => {
  const { canView } = useHealthAccess();
  const { activeOrganization } = usePermissions();
  const visible = canView && activeOrganization?.vertical === "clinic";
  const history = useIllnessHistory(patientId, visible);
  const surgeries = usePatientSurgeries(patientId, visible);
  if (!visible) return null;
  const infections = history.data ? vaccinationInfectionsLine(history.data.infections, gender) : null;
  const today = history.data?.today ? dayjs(history.data.today) : dayjs();
  const transfusion = recentTransfusion(surgeries.data ?? [], today);
  if (!infections && !transfusion) return null;
  return (
    <Stack
      gap={0.5}
      sx={(theme) => ({ px: 1.5, py: 1, mb: 1.5, borderRadius: "10px", bgcolor: subtleBg(theme, true), flexShrink: 0 })}
    >
      {infections && (
        <Typography variant="body2" color="text.secondary">
          {infections}
        </Typography>
      )}
      {transfusion && (
        <Stack direction="row" gap={0.75} alignItems="flex-start">
          <InfoOutlined sx={{ fontSize: 16, mt: "3px", color: "info.main" }} />
          <Typography variant="body2" color="text.secondary">
            <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
              {transfusionLead(transfusion)}.
            </Box>{" "}
            {TRANSFUSION_VACCINE_HINT}
          </Typography>
        </Stack>
      )}
    </Stack>
  );
};
