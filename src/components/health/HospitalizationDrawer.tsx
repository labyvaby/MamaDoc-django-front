import React from "react";
import { Box, MenuItem, TextField } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import {
  createHospitalization,
  updateHospitalization,
  type Condition,
  type Hospitalization,
  type HospitalizationInput,
} from "../../api/health";
import { pairGridSx } from "../../pages/patient-program/vision/visionUi";
import { CustomDatePicker } from "../ui";
import { HealthDrawerShell } from "./HealthDrawerShell";
import { useHealthScope, useInvalidateHealth } from "./useHealth";

const EMPTY: HospitalizationInput = {
  facility: "",
  admittedOn: "",
  dischargedOn: null,
  conditionId: null,
  diagnosisTitle: "",
  notes: "",
};

function toInput(row: Hospitalization): HospitalizationInput {
  return {
    facility: row.facility,
    admittedOn: row.admittedOn,
    dischargedOn: row.dischargedOn,
    conditionId: row.conditionId,
    diagnosisTitle: row.diagnosisTitle,
    notes: row.notes,
  };
}

const asDate = (value: Dayjs | null): string | null => (value && value.isValid() ? value.format("YYYY-MM-DD") : null);

interface HospitalizationDrawerProps {
  open: boolean;
  patientId: number;
  hospitalization: Hospitalization | null;
  /** Диагнозы пациента для выбора. */
  conditions: ReadonlyArray<Condition>;
  onClose: () => void;
}

/** «Отметка о госпитализации»: стационар, даты, диагноз из списка или текстом. */
export const HospitalizationDrawer: React.FC<HospitalizationDrawerProps> = ({
  open,
  patientId,
  hospitalization,
  conditions,
  onClose,
}) => {
  const { enqueueSnackbar } = useSnackbar();
  const { scope } = useHealthScope();
  const invalidate = useInvalidateHealth(patientId);
  const [form, setForm] = React.useState<HospitalizationInput>(EMPTY);

  React.useEffect(() => {
    if (open) setForm(hospitalization ? toInput(hospitalization) : EMPTY);
  }, [open, hospitalization]);

  const patch = (next: Partial<HospitalizationInput>) => setForm((current) => ({ ...current, ...next }));
  const dischargeBefore = Boolean(form.dischargedOn && form.admittedOn && form.dischargedOn < form.admittedOn);
  const canSave = form.facility.trim().length > 0 && Boolean(form.admittedOn) && !dischargeBefore;

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { ...form, facility: form.facility.trim(), diagnosisTitle: form.diagnosisTitle.trim(), notes: form.notes.trim() };
      return hospitalization
        ? updateHospitalization(scope, patientId, hospitalization.id, payload)
        : createHospitalization(scope, patientId, payload);
    },
    onSuccess: async () => {
      enqueueSnackbar(hospitalization ? "Госпитализация обновлена" : "Госпитализация добавлена", { variant: "success" });
      await invalidate();
      onClose();
    },
  });

  return (
    <HealthDrawerShell
      open={open}
      title={hospitalization ? "Госпитализация" : "Новая госпитализация"}
      subtitle={form.facility || "Стационар и даты"}
      pending={mutation.isPending}
      error={mutation.error}
      canSave={canSave}
      saveLabel={hospitalization ? "Сохранить" : "Добавить"}
      onSave={() => mutation.mutate()}
      onClose={onClose}
    >
      <TextField
        size="small"
        label="Стационар"
        placeholder="Например, РДКБ, инфекционное отделение"
        value={form.facility}
        onChange={(event) => patch({ facility: event.target.value })}
        required
        fullWidth
      />
      <Box sx={pairGridSx}>
        <CustomDatePicker
          label="Поступил"
          value={form.admittedOn ? dayjs(form.admittedOn) : null}
          onChange={(value) => patch({ admittedOn: asDate(value as Dayjs | null) ?? "" })}
          slotProps={{ textField: { size: "small", fullWidth: true, required: true } }}
        />
        <CustomDatePicker
          label="Выписан"
          value={form.dischargedOn ? dayjs(form.dischargedOn) : null}
          onChange={(value) => patch({ dischargedOn: asDate(value as Dayjs | null) })}
          slotProps={{
            textField: {
              size: "small",
              fullWidth: true,
              error: dischargeBefore,
              helperText: dischargeBefore ? "Раньше поступления" : undefined,
            },
          }}
        />
      </Box>
      <TextField
        select
        size="small"
        label="Диагноз из списка"
        value={form.conditionId ?? ""}
        onChange={(event) => patch({ conditionId: event.target.value === "" ? null : Number(event.target.value) })}
        fullWidth
      >
        <MenuItem value="">Нет в списке</MenuItem>
        {conditions.map((condition) => (
          <MenuItem key={condition.id} value={condition.id}>
            {[condition.diagnosisCode, condition.title].filter(Boolean).join(" · ")}
          </MenuItem>
        ))}
      </TextField>
      {form.conditionId == null && (
        <TextField
          size="small"
          label="Диагноз"
          value={form.diagnosisTitle}
          onChange={(event) => patch({ diagnosisTitle: event.target.value })}
          fullWidth
        />
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
