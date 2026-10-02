import React from "react";
import { Alert, Box, MenuItem, TextField } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import {
  createMedication,
  updateMedication,
  type MedicationCourse,
  type MedicationInput,
  type MedicationKind,
} from "../../api/health";
import { doctorEmployeesOnly, useAllActiveEmployees } from "../../hooks/useAllActiveEmployees";
import { ChipGroup, Section } from "../../pages/patient-program/vision/VisionControls";
import { pairGridSx } from "../../pages/patient-program/vision/visionUi";
import { AppButton, CustomDatePicker } from "../ui";
import { HealthDrawerShell } from "./HealthDrawerShell";
import { DOSE_PRESETS, DRUG_PRESETS, MEDICATION_KINDS, MEDICATION_PURPOSES, REACTION_PRESETS } from "./healthMeta";
import { useHealthScope, useInvalidateHealth } from "./useHealth";

const EMPTY: MedicationInput = {
  kind: "antibiotic",
  purpose: "treatment",
  drug: "",
  dose: "",
  startedOn: "",
  endedOn: null,
  courseTotal: "",
  reaction: "",
  prescribedById: null,
  notes: "",
};

function toInput(course: MedicationCourse): MedicationInput {
  return {
    kind: course.kind,
    purpose: course.purpose,
    drug: course.drug,
    dose: course.dose,
    startedOn: course.startedOn,
    endedOn: course.endedOn,
    courseTotal: course.courseTotal,
    reaction: course.reaction,
    prescribedById: course.prescribedBy?.id ?? null,
    notes: course.notes,
  };
}

const asDate = (value: Dayjs | null): string | null => (value && value.isValid() ? value.format("YYYY-MM-DD") : null);

interface MedicationDrawerProps {
  open: boolean;
  patientId: number;
  course: MedicationCourse | null;
  onClose: () => void;
  /** Реакция на препарат — предложить внести аллергию (ничего не создаётся само). */
  onSuggestAllergy: (drug: string, reaction: string) => void;
}

/** Курс препарата: вид, цель, препарат и доза кнопками, даты, реакция. */
export const MedicationDrawer: React.FC<MedicationDrawerProps> = ({ open, patientId, course, onClose, onSuggestAllergy }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { scope } = useHealthScope();
  const invalidate = useInvalidateHealth(patientId);
  const { employees } = useAllActiveEmployees(open);
  const doctors = React.useMemo(() => doctorEmployeesOnly(employees), [employees]);
  const [form, setForm] = React.useState<MedicationInput>(EMPTY);

  React.useEffect(() => {
    if (open) setForm(course ? toInput(course) : { ...EMPTY, startedOn: dayjs().format("YYYY-MM-DD") });
  }, [open, course]);

  const patch = (next: Partial<MedicationInput>) => setForm((current) => ({ ...current, ...next }));
  const endsBefore = Boolean(form.endedOn && form.startedOn && form.endedOn < form.startedOn);
  const canSave = form.drug.trim().length > 0 && Boolean(form.startedOn) && !endsBefore;

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        drug: form.drug.trim(),
        dose: form.dose.trim(),
        courseTotal: form.courseTotal.trim(),
        reaction: form.reaction.trim(),
        notes: form.notes.trim(),
      };
      return course ? updateMedication(scope, patientId, course.id, payload) : createMedication(scope, patientId, payload);
    },
    onSuccess: async () => {
      enqueueSnackbar(course ? "Курс обновлён" : "Курс добавлен", { variant: "success" });
      await invalidate();
      onClose();
    },
  });

  return (
    <HealthDrawerShell
      open={open}
      title={course ? "Курс препарата" : "Новый курс"}
      subtitle={form.drug || "Выберите препарат"}
      pending={mutation.isPending}
      error={mutation.error}
      canSave={canSave}
      saveLabel={course ? "Сохранить" : "Добавить"}
      onSave={() => mutation.mutate()}
      onClose={onClose}
    >
      <Section title="Вид">
        <ChipGroup<MedicationKind>
          options={MEDICATION_KINDS}
          selected={[form.kind]}
          onToggle={(value) => patch({ kind: value, purpose: value === "vitamin_d" ? "prophylaxis" : form.purpose })}
        />
      </Section>
      <Section title="Цель">
        <ChipGroup
          options={MEDICATION_PURPOSES}
          selected={form.purpose ? [form.purpose] : []}
          onToggle={(value) => patch({ purpose: form.purpose === value ? "" : value })}
        />
      </Section>
      <Section title="Препарат">
        {DRUG_PRESETS[form.kind].length > 0 && (
          <ChipGroup<string>
            options={DRUG_PRESETS[form.kind].map((value) => ({ value, label: value }))}
            selected={[form.drug]}
            onToggle={(value) => patch({ drug: form.drug === value ? "" : value })}
          />
        )}
        <TextField
          size="small"
          label="Препарат"
          value={form.drug}
          onChange={(event) => patch({ drug: event.target.value })}
          required
          fullWidth
          sx={{ mt: DRUG_PRESETS[form.kind].length ? 1.25 : 0 }}
        />
      </Section>
      <Section title="Доза и кратность">
        {DOSE_PRESETS[form.kind].length > 0 && (
          <ChipGroup<string>
            options={DOSE_PRESETS[form.kind].map((value) => ({ value, label: value }))}
            selected={[form.dose]}
            onToggle={(value) => patch({ dose: form.dose === value ? "" : value })}
          />
        )}
        <TextField
          size="small"
          placeholder="250 мг 3 раза в день"
          value={form.dose}
          onChange={(event) => patch({ dose: event.target.value })}
          fullWidth
          sx={{ mt: DOSE_PRESETS[form.kind].length ? 1.25 : 0 }}
        />
      </Section>
      <Box sx={pairGridSx}>
        <CustomDatePicker
          label="Начат"
          value={form.startedOn ? dayjs(form.startedOn) : null}
          onChange={(value) => patch({ startedOn: asDate(value as Dayjs | null) ?? "" })}
          slotProps={{ textField: { size: "small", fullWidth: true, required: true } }}
        />
        <CustomDatePicker
          label="Отменён"
          value={form.endedOn ? dayjs(form.endedOn) : null}
          onChange={(value) => patch({ endedOn: asDate(value as Dayjs | null) })}
          slotProps={{
            textField: { size: "small", fullWidth: true, error: endsBefore, helperText: endsBefore ? "Раньше начала" : undefined },
          }}
        />
      </Box>
      <Box sx={pairGridSx}>
        <TextField
          size="small"
          label="Всего на курс"
          placeholder="7 дней"
          value={form.courseTotal}
          onChange={(event) => patch({ courseTotal: event.target.value })}
          fullWidth
        />
        <TextField
          select
          size="small"
          label="Назначил"
          value={form.prescribedById ?? ""}
          onChange={(event) => patch({ prescribedById: event.target.value === "" ? null : Number(event.target.value) })}
          fullWidth
        >
          <MenuItem value="">Не указан</MenuItem>
          {doctors.map((doctor) => (
            <MenuItem key={doctor.id} value={doctor.id}>
              {doctor.fullName}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <Section title="Реакция на препарат">
        <ChipGroup<string>
          options={REACTION_PRESETS.map((value) => ({ value, label: value }))}
          selected={REACTION_PRESETS.filter((value) => form.reaction.toLowerCase() === value.toLowerCase())}
          tone={() => "error"}
          onToggle={(value) => patch({ reaction: form.reaction === value ? "" : value })}
        />
        <TextField
          size="small"
          value={form.reaction}
          onChange={(event) => patch({ reaction: event.target.value })}
          placeholder="Если была"
          fullWidth
          sx={{ mt: 1.25 }}
        />
      </Section>
      {form.reaction.trim() && form.drug.trim() && (
        <Alert
          severity="warning"
          action={
            <AppButton size="small" color="inherit" onClick={() => onSuggestAllergy(form.drug.trim(), form.reaction.trim())}>
              Внести
            </AppButton>
          }
        >
          Реакция на «{form.drug.trim()}» — добавить аллергию, чтобы её видели все?
        </Alert>
      )}
      <TextField
        size="small"
        label="Примечание"
        value={form.notes}
        onChange={(event) => patch({ notes: event.target.value })}
        multiline
        minRows={2}
        fullWidth
      />
    </HealthDrawerShell>
  );
};
