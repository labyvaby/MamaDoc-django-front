import React from "react";
import { Box, Stack, Typography } from "@mui/material";

import type { DjangoPatient } from "../../api/patients";
import { GrowthSection } from "../../pages/patient-program/growth/GrowthSection";
import { AllergiesSection } from "./AllergiesSection";
import { BirthHistorySection } from "./BirthHistorySection";
import { ConditionsSection } from "./ConditionsSection";
import { FamilySection } from "./FamilySection";
import { HealthChangesLog } from "./HealthChangesLog";
import { HealthProfileCard } from "./HealthProfileCard";
import { MedicationsSection } from "./MedicationsSection";
import { isChild } from "./healthMeta";
import { useHealthAccess } from "./useHealth";

/**
 * Вкладка «Здоровье» карточки пациента: аллергии, диагнозы и Д-учёт,
 * профиль, сведения о рождении и паспорт семьи (детские блоки — до 18 лет
 * или без даты рождения), журнал изменений.
 */
export const PatientHealthPanel: React.FC<{ patient: DjangoPatient | null }> = ({ patient }) => {
  const { canManage } = useHealthAccess();

  if (!patient) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: 1,
          bgcolor: "background.paper",
        }}
      >
        <Typography color="text.secondary">Выберите пациента</Typography>
      </Box>
    );
  }

  const child = isChild(patient.birthDate);
  return (
    // Колонка карточки сама не прокручивается — прокрутка внутри вкладки;
    // карточки не сжимаются (у Card overflow: hidden, иначе flex их обрежет).
    <Stack gap={2} sx={{ height: "100%", minHeight: 0, overflowY: "auto", pb: 2, pr: 0.5, "& > *": { flexShrink: 0 } }}>
      <AllergiesSection patientId={patient.id} canManage={canManage} />
      <ConditionsSection patientId={patient.id} canManage={canManage} />
      <MedicationsSection patientId={patient.id} canManage={canManage} />
      {child && <GrowthSection patientId={patient.id} canManage={canManage} />}
      <HealthProfileCard patientId={patient.id} birthDate={patient.birthDate} canManage={canManage} />
      {child && <BirthHistorySection patientId={patient.id} birthDate={patient.birthDate} canManage={canManage} />}
      {child && <FamilySection patientId={patient.id} canManage={canManage} />}
      <HealthChangesLog patientId={patient.id} />
    </Stack>
  );
};

export default PatientHealthPanel;
