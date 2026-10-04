import React from "react";
import { Alert, Box, ButtonBase, Collapse, Stack, Typography } from "@mui/material";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import { useQuery } from "@tanstack/react-query";

import type { DjangoPatient } from "../../api/patients";
import { getProgramModuleRecords, type EffectiveProgramModule } from "../../api/programs";
import { djangoQueryKeys } from "../../api/queryKeys";
import { AllergiesSection } from "../../components/health/AllergiesSection";
import { BirthHistorySection } from "../../components/health/BirthHistorySection";
import { FamilySection } from "../../components/health/FamilySection";
import { IllnessHistorySection } from "../../components/health/IllnessHistorySection";
import { LifeAnamnesisSection } from "../../components/health/anamnesis/LifeAnamnesisSection";
import { MedicationsSection } from "../../components/health/MedicationsSection";
import { SurgeriesSection } from "../../components/health/SurgeriesSection";
import { useHealthAccess } from "../../components/health/useHealth";
import type { ActiveScope } from "../../hooks/useActiveScope";
import PatientCalendarPanel from "../patients/components/PatientCalendarPanel";
import PatientVaccinationsPanel from "../patients/components/PatientVaccinationsPanel";
import { BookAppointments } from "./BookAppointments";
import { FeedingBookSection } from "./growth/FeedingBookSection";
import { GrowthSection } from "./growth/GrowthSection";
import { systemType, type SystemSectionType } from "./linkedSectionTypes";
import { ModuleRecords } from "./ModuleRecords";

/** Записи, внесённые в раздел, пока он был разделом конструктора, — только просмотр. */
const LegacyRecords: React.FC<{ enrollmentId: number; module: EffectiveProgramModule; scope: ActiveScope; icon: React.ReactNode }> = ({
  enrollmentId,
  module,
  scope,
  icon,
}) => {
  const [open, setOpen] = React.useState(false);
  const query = useQuery({
    queryKey: djangoQueryKeys.programs.records(enrollmentId, module.id, scope),
    queryFn: ({ signal }) => getProgramModuleRecords(scope, enrollmentId, module.id, signal),
    enabled: scope.isReady && scope.orgReady,
  });
  const count = query.data?.count ?? 0;
  if (!count) return null;
  return (
    <Box>
      <ButtonBase onClick={() => setOpen((value) => !value)} sx={{ borderRadius: "8px", px: 0.5, gap: 0.5, color: "text.secondary" }}>
        <ExpandMoreOutlined fontSize="small" sx={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
        <Typography variant="body2" fontWeight={600}>
          Внесено вручную ранее: {count}
        </Typography>
      </ButtonBase>
      <Collapse in={open} unmountOnExit sx={{ flexShrink: 0, mt: 1 }}>
        <ModuleRecords enrollmentId={enrollmentId} module={module} scope={scope} canManage={false} icon={icon} />
      </Collapse>
    </Box>
  );
};

interface LinkedSectionProps {
  module: EffectiveProgramModule;
  patient: DjangoPatient;
  enrollmentId: number;
  scope: ActiveScope;
  icon: React.ReactNode;
  /** Перейти в другой раздел книжки (ссылки из «Анамнеза жизни»). */
  openSection?: (type: SystemSectionType) => void;
  hasSection?: (type: SystemSectionType) => boolean;
}

/** Содержимое связанного раздела: компонент медкарты, прививок или приёмов. */
export const LinkedSection: React.FC<LinkedSectionProps> = ({
  module,
  patient,
  enrollmentId,
  scope,
  icon,
  openSection,
  hasSection,
}) => {
  const { canManage } = useHealthAccess();
  const type = systemType(module);
  let content: React.ReactNode;
  switch (type) {
    case "family":
      content = <FamilySection patientId={patient.id} canManage={canManage} title={module.name} />;
      break;
    case "birth_history":
      content = <BirthHistorySection patientId={patient.id} birthDate={patient.birthDate} canManage={canManage} title={module.name} />;
      break;
    case "allergies":
      content = <AllergiesSection patientId={patient.id} canManage={canManage} title={module.name} />;
      break;
    case "conditions":
      content = (
        <IllnessHistorySection
          patientId={patient.id}
          canManage={canManage}
          title={module.name}
          gender={patient.gender}
          patientName={patient.fullName}
        />
      );
      break;
    case "surgeries":
      content = <SurgeriesSection patientId={patient.id} canManage={canManage} birthDate={patient.birthDate} title={module.name} />;
      break;
    case "growth":
      // Вскармливание — отдельным разделом, если он есть в программе; иначе внизу «Роста».
      content = <GrowthSection patientId={patient.id} title={module.name} canManage={canManage} showFeeding={!hasSection?.("feeding")} />;
      break;
    case "feeding":
      content = <FeedingBookSection patientId={patient.id} title={module.name} canManage={canManage} />;
      break;
    case "medications":
      content = <MedicationsSection patientId={patient.id} canManage={canManage} title={module.name} />;
      break;
    case "vaccination":
      // Календарь прививок (возрастные точки национального календаря) — как во
      // вкладке карточки пациента; под ним записи прививок, реакции и пробы.
      content = (
        <Stack spacing={2}>
          <PatientCalendarPanel patient={patient} />
          <PatientVaccinationsPanel patient={patient} />
        </Stack>
      );
      break;
    case "visits":
      content = <BookAppointments patientId={patient.id} birthDate={patient.birthDate ?? null} scope={scope} />;
      break;
    case "life_anamnesis":
      content = (
        <LifeAnamnesisSection
          patientId={patient.id}
          title={module.name}
          openSection={openSection ? (type) => openSection(type as SystemSectionType) : undefined}
          hasSection={hasSection ? (type) => hasSection(type as SystemSectionType) : undefined}
        />
      );
      break;
    default:
      content = <Alert severity="info">Раздел «{module.name}» появится на следующих этапах.</Alert>;
  }
  return (
    <Stack gap={1.5}>
      {content}
      <LegacyRecords enrollmentId={enrollmentId} module={module} scope={scope} icon={icon} />
    </Stack>
  );
};
