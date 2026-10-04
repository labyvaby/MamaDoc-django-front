import React from "react";
import { Alert, TextField, Typography } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import {
  createChildhoodInfection,
  updateChildhoodInfection,
  type ChildhoodInfectionInput,
  type InfectionEvidence,
  type InfectionStatus,
  type InfectionSummary,
} from "../../api/health";
import type { PatientGender } from "../../api/patients";
import { ChipGroup, Section } from "../../pages/patient-program/vision/VisionControls";
import { HealthDrawerShell } from "./HealthDrawerShell";
import {
  EVIDENCE_OPTIONS,
  byGender,
  infectionForm,
  infectionPayload,
  infectionStatusOptions,
  infectionVaccineHint,
  precisionDateError,
  type InfectionDrawerMode,
} from "./illnessData";
import { PrecisionDateField } from "./PrecisionDateField";
import { useHealthScope, useInvalidateHealth } from "./useHealth";

interface ChildhoodInfectionDrawerProps {
  open: boolean;
  patientId: number;
  info: InfectionSummary | null;
  mode: InfectionDrawerMode;
  birthDate?: string | null;
  gender?: PatientGender | null;
  onClose: () => void;
}

/** Отметка о детской инфекции: болел(а) или нет, когда, откуда известно (§5). */
export const ChildhoodInfectionDrawer: React.FC<ChildhoodInfectionDrawerProps> = ({
  open,
  patientId,
  info,
  mode,
  birthDate,
  gender,
  onClose,
}) => {
  const { enqueueSnackbar } = useSnackbar();
  const { scope } = useHealthScope();
  const invalidate = useInvalidateHealth(patientId);
  const [form, setForm] = React.useState<ChildhoodInfectionInput | null>(null);

  React.useEffect(() => {
    if (open && info) setForm(infectionForm(info, mode));
  }, [open, info, mode]);

  const patch = (next: Partial<ChildhoodInfectionInput>) => setForm((current) => (current ? { ...current, ...next } : current));
  const had = form?.status === "had";
  const dateError = form && had ? precisionDateError(form.occurredOn, form.datePrecision, birthDate) : null;
  const hint = form && info ? infectionVaccineHint({ infection: info.infection, status: form.status }, gender) : null;

  const mutation = useMutation({
    mutationFn: () => {
      const current = form as ChildhoodInfectionInput;
      const record = info?.record;
      return record
        ? updateChildhoodInfection(scope, patientId, record.id, infectionPayload(current, "update"))
        : createChildhoodInfection(scope, patientId, infectionPayload(current, "create"));
    },
    onSuccess: async () => {
      enqueueSnackbar("Отметка сохранена", { variant: "success" });
      await invalidate();
      onClose();
    },
  });

  return (
    <HealthDrawerShell
      open={open}
      title={info?.name ?? "Детская инфекция"}
      subtitle={info ? `МКБ-10: ${info.codes.join(", ")}` : undefined}
      pending={mutation.isPending}
      error={mutation.error}
      canSave={Boolean(form) && !dateError}
      saveLabel="Сохранить"
      onSave={() => mutation.mutate()}
      onClose={onClose}
    >
      {form && (
        <>
          <Section title={byGender(gender, "Болела?", "Болел?", "Болел(а)?")}>
            <ChipGroup<InfectionStatus>
              label="Болел(а) ли"
              options={infectionStatusOptions(gender)}
              selected={[form.status]}
              tone={(value) => (value === "had" ? "warning" : value === "not_had" ? "success" : "primary")}
              onToggle={(status) => patch({ status })}
            />
          </Section>
          {had && (
            <PrecisionDateField
              label="Когда — можно только год"
              value={form.occurredOn}
              precision={form.datePrecision}
              birthDate={birthDate}
              onChange={(occurredOn, datePrecision) => patch({ occurredOn, datePrecision })}
            />
          )}
          {form.status !== "unknown" && (
            <Section title="Откуда известно">
              <ChipGroup<InfectionEvidence>
                options={EVIDENCE_OPTIONS}
                selected={form.evidence ? [form.evidence] : []}
                onToggle={(evidence) => patch({ evidence: form.evidence === evidence ? "" : evidence })}
              />
            </Section>
          )}
          {mode === "confirm" && form.sourceConclusionId && (
            <Typography variant="caption" color="text.secondary">
              Отметка сошлётся на заключение приёма, где поставлен диагноз.
            </Typography>
          )}
          {hint && <Alert severity="info">{hint}</Alert>}
          {form.status === "unknown" && info?.record && (
            <Typography variant="caption" color="text.secondary">
              «Нет сведений» вместо удаления: отметка останется в журнале изменений.
            </Typography>
          )}
          <TextField
            size="small"
            label="Заметка"
            value={form.notes}
            onChange={(event) => patch({ notes: event.target.value })}
            multiline
            minRows={2}
            fullWidth
          />
        </>
      )}
    </HealthDrawerShell>
  );
};
