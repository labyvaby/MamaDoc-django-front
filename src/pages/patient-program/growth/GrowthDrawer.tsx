import React from "react";
import { Alert, Box, Chip, Divider, Drawer, IconButton, InputAdornment, Stack, TextField, Typography, alpha, useTheme } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import RemoveOutlined from "@mui/icons-material/RemoveOutlined";
import { useMutation } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import {
  createProgramModuleRecord,
  updateProgramModuleRecord,
  type EffectiveProgramModule,
  type ProgramModuleRecord,
} from "../../../api/programs";
import { AppButton, CustomDateTimePicker } from "../../../components/ui";
import type { ActiveScope } from "../../../hooks/useActiveScope";
import { ageLabel } from "../vision/visionNorms";
import {
  buildGrowthData,
  emptyGrowthForm,
  growthFormValid,
  growthToForm,
  parseMeasure,
  readMeasurement,
  stepValue,
  type GrowthForm,
} from "./growthData";
import { ageMonths, assess, bmi, bmiVerdict, centileLabel, type GrowthIndicator, type GrowthSex } from "./growthNorms";
import { formatNumber, growthColor } from "./growthUi";

interface MeasureFieldProps {
  label: string;
  unit: string;
  value: string;
  step: number;
  onChange: (value: string) => void;
  indicator: GrowthIndicator | null;
  sex: GrowthSex | null;
  months: number | null;
  required?: boolean;
}

/** Поле замера: ± шагом и сразу центиль ВОЗ для возраста ребёнка. */
const MeasureField: React.FC<MeasureFieldProps> = ({ label, unit, value, step, onChange, indicator, sex, months, required }) => {
  const theme = useTheme();
  const assessment = indicator ? assess(indicator, sex, months, parseMeasure(value)) : null;
  const color = growthColor(theme, assessment?.status ?? "unknown");
  return (
    <Box>
      <TextField
        size="small"
        fullWidth
        required={required}
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputProps={{ inputMode: "decimal" }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <IconButton size="small" edge="start" aria-label={`${label}: минус`} onClick={() => onChange(stepValue(value, -step, 1))}>
                <RemoveOutlined fontSize="inherit" />
              </IconButton>
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
                {unit}
              </Typography>
              <IconButton size="small" edge="end" aria-label={`${label}: плюс`} onClick={() => onChange(stepValue(value, step, 1))}>
                <AddOutlined fontSize="inherit" />
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
      <Box sx={{ minHeight: 26, mt: 0.5 }}>
        {assessment && (
          <Chip
            size="small"
            label={centileLabel(assessment.centile)}
            sx={{ height: 22, borderRadius: "6px", fontWeight: 600, bgcolor: alpha(color, 0.16), color }}
          />
        )}
      </Box>
    </Box>
  );
};

interface GrowthDrawerProps {
  open: boolean;
  enrollmentId: number;
  module: EffectiveProgramModule;
  scope: ActiveScope;
  birthDate: string | null;
  sex: GrowthSex | null;
  /** Замер для правки; null — новый. */
  record: ProgramModuleRecord | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Замер: рост и вес (обязательны), голова, грудь — с центилями по ходу ввода. */
export const GrowthDrawer: React.FC<GrowthDrawerProps> = ({ open, enrollmentId, module, scope, birthDate, sex, record, onClose, onSaved }) => {
  const { enqueueSnackbar } = useSnackbar();
  const [occurredAt, setOccurredAt] = React.useState<Dayjs | null>(dayjs());
  const [form, setForm] = React.useState<GrowthForm>(() => emptyGrowthForm());

  React.useEffect(() => {
    if (!open) return;
    setForm(record ? growthToForm(readMeasurement(record, birthDate)) : emptyGrowthForm());
    setOccurredAt(record ? dayjs(record.occurredAt) : dayjs().second(0).millisecond(0));
  }, [open, record, birthDate]);

  const patch = (next: Partial<GrowthForm>) => setForm((current) => ({ ...current, ...next }));
  const months = ageMonths(birthDate, occurredAt ?? dayjs());
  const bodyMass = bmi(parseMeasure(form.weightKg), parseMeasure(form.heightCm));
  const bmiAssessment = assess("bmi", sex, months, bodyMass);
  const canSave = Boolean(occurredAt?.isValid()) && growthFormValid(form);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        occurredAt: (occurredAt as Dayjs).toISOString(),
        title: record?.title || "Антропометрия",
        status: "completed",
        notes: form.notes.trim(),
        data: buildGrowthData(form),
      };
      return record
        ? updateProgramModuleRecord(scope, enrollmentId, record.id, payload)
        : createProgramModuleRecord(scope, enrollmentId, { ...payload, programModuleId: module.id });
    },
    onSuccess: () => {
      enqueueSnackbar(record ? "Замер обновлён" : "Замер сохранён", { variant: "success" });
      onSaved();
      onClose();
    },
  });

  const field = (props: Omit<MeasureFieldProps, "sex" | "months">) => <MeasureField {...props} sex={sex} months={months} />;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={mutation.isPending ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100vw", md: 520 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" fontWeight={600}>
            {record ? "Замер" : "Новый замер"}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {months == null ? "Нет даты рождения — центили не посчитать" : `Ребёнку ${ageLabel(Math.floor(months))}`}
            {!sex && months != null ? " · не указан пол — центилей нет" : ""}
          </Typography>
        </Box>
        <IconButton onClick={mutation.isPending ? undefined : onClose} aria-label="Закрыть" edge="end">
          <CloseOutlined />
        </IconButton>
      </Stack>
      <Divider />
      <Stack gap={1.5} sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2.5, py: 2 }}>
        {mutation.error && <Alert severity="error">{mutation.error.message}</Alert>}
        <CustomDateTimePicker
          label="Дата и время"
          value={occurredAt}
          onChange={setOccurredAt}
          minutesStep={1}
          slotProps={{ textField: { fullWidth: true, size: "small" } }}
        />
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" } }}>
          {field({ label: "Рост", unit: "см", value: form.heightCm, step: 0.5, onChange: (value) => patch({ heightCm: value }), indicator: "height", required: true })}
          {field({ label: "Вес", unit: "кг", value: form.weightKg, step: 0.1, onChange: (value) => patch({ weightKg: value }), indicator: "weight", required: true })}
          {field({ label: "Окружность головы", unit: "см", value: form.headCm, step: 0.5, onChange: (value) => patch({ headCm: value }), indicator: "head" })}
          {field({ label: "Окружность груди", unit: "см", value: form.chestCm, step: 0.5, onChange: (value) => patch({ chestCm: value }), indicator: null })}
        </Box>
        {bodyMass != null && (
          <Typography variant="body2">
            Индекс массы тела <b>{formatNumber(bodyMass, 1)}</b>
            {bmiAssessment ? ` · ${centileLabel(bmiAssessment.centile)} · ${bmiVerdict(bmiAssessment.z, months)}` : ""}
          </Typography>
        )}
        <TextField size="small" label="Заметка" value={form.notes} onChange={(event) => patch({ notes: event.target.value })} multiline minRows={2} fullWidth />
      </Stack>
      <Divider />
      <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ px: 2.5, py: 1.5 }}>
        <AppButton onClick={onClose} disabled={mutation.isPending}>
          Отмена
        </AppButton>
        <AppButton variant="contained" loading={mutation.isPending} disabled={!canSave} onClick={() => mutation.mutate()}>
          {record ? "Сохранить" : "Сохранить замер"}
        </AppButton>
      </Stack>
    </Drawer>
  );
};
