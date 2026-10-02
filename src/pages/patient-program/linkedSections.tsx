import React from "react";
import { Alert, Box, ButtonBase, Collapse, Stack, Typography } from "@mui/material";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import { useQuery } from "@tanstack/react-query";

import type { DjangoPatient } from "../../api/patients";
import { getProgramModuleRecords, type EffectiveProgramModule } from "../../api/programs";
import { djangoQueryKeys } from "../../api/queryKeys";
import { AllergiesSection } from "../../components/health/AllergiesSection";
import { BirthHistorySection } from "../../components/health/BirthHistorySection";
import { ConditionsSection } from "../../components/health/ConditionsSection";
import { FamilySection } from "../../components/health/FamilySection";
import { MedicationsSection } from "../../components/health/MedicationsSection";
import { useHealthAccess } from "../../components/health/useHealth";
import type { ActiveScope } from "../../hooks/useActiveScope";
import PatientVaccinationsPanel from "../patients/components/PatientVaccinationsPanel";
import { BookAppointments } from "./BookAppointments";
import { GrowthSection } from "./growth/GrowthSection";
import { systemType } from "./linkedSectionTypes";
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
}

/** Содержимое связанного раздела: компонент медкарты, прививок или приёмов. */
export const LinkedSection: React.FC<LinkedSectionProps> = ({
  module,
  patient,
  enrollmentId,
  scope,
  icon,
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
      content = <ConditionsSection patientId={patient.id} canManage={canManage} title={module.name} />;
      break;
    case "growth":
      content = <GrowthSection patientId={patient.id} title={module.name} canManage={canManage} />;
      break;
    case "medications":
      content = <MedicationsSection patientId={patient.id} canManage={canManage} title={module.name} />;
      break;
    case "vaccination":
      content = <PatientVaccinationsPanel patient={patient} />;
      break;
    case "visits":
      content = <BookAppointments patientId={patient.id} scope={scope} />;
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
