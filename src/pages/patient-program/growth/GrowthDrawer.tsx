import React from "react";
import { Box, Chip, IconButton, InputAdornment, TextField, Typography, alpha, useTheme } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import RemoveOutlined from "@mui/icons-material/RemoveOutlined";
import { useMutation } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import { createMeasurement, deleteMeasurement, updateMeasurement, type MeasurementPosition } from "../../../api/health";
import { HealthDrawerShell } from "../../../components/health/HealthDrawerShell";
import { useHealthScope, useInvalidateHealth } from "../../../components/health/useHealth";
import { AppButton, CustomDatePicker } from "../../../components/ui";
import { ageLabel } from "../vision/visionNorms";
import { ChipGroup, Section } from "../vision/VisionControls";
import {
  buildMeasurementInput,
  defaultPosition,
  emptyGrowthForm,
  growthFormValid,
  growthToForm,
  heightForNorms,
  normsAge,
  parseMeasure,
  stepValue,
  type Gestation,
  type GrowthForm,
  type Measurement,
} from "./growthData";
import { assess, bmi, bmiVerdict, centileLabel, type GrowthIndicator, type GrowthSex } from "./growthNorms";
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
  /** Значение для норм (рост с поправкой лёжа/стоя). */
  normsValue?: number | null;
}

/** Поле замера: ± шагом и сразу центиль ВОЗ для возраста ребёнка. */
const MeasureField: React.FC<MeasureFieldProps> = ({ label, unit, value, step, onChange, indicator, sex, months, normsValue }) => {
  const theme = useTheme();
  const assessment = indicator ? assess(indicator, sex, months, normsValue ?? parseMeasure(value)) : null;
  const color = growthColor(theme, assessment?.status ?? "unknown");
  const digits = step < 0.1 ? 3 : 1;
  return (
    <Box>
      <TextField
        size="small"
        fullWidth
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputProps={{ inputMode: "decimal" }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <IconButton size="small" edge="start" aria-label={`${label}: минус`} onClick={() => onChange(stepValue(value, -step, digits))}>
                <RemoveOutlined fontSize="inherit" />
              </IconButton>
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
                {unit}
              </Typography>
              <IconButton size="small" edge="end" aria-label={`${label}: плюс`} onClick={() => onChange(stepValue(value, step, digits))}>
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

const POSITIONS: ReadonlyArray<{ value: Exclude<MeasurementPosition, "">; label: string }> = [
  { value: "recumbent", label: "Лёжа (длина)" },
  { value: "standing", label: "Стоя (рост)" },
];

interface GrowthDrawerProps {
  open: boolean;
  patientId: number;
  birthDate: string | null;
  sex: GrowthSex | null;
  gestation: Gestation | null;
  /** Замер для правки (только ручной); null — новый. */
  measurement: Measurement | null;
  onClose: () => void;
}

/** Замер: дата, рост лёжа или стоя, вес, голова, грудь — с центилями по ходу ввода. */
export const GrowthDrawer: React.FC<GrowthDrawerProps> = ({ open, patientId, birthDate, sex, gestation, measurement, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { scope } = useHealthScope();
  const invalidate = useInvalidateHealth(patientId);
  const today = dayjs().format("YYYY-MM-DD");
  const [form, setForm] = React.useState<GrowthForm>(() => emptyGrowthForm(today, "recumbent"));

  React.useEffect(() => {
    if (!open) return;
    const date = dayjs().format("YYYY-MM-DD");
    setForm(
      measurement
        ? growthToForm(measurement)
        : emptyGrowthForm(date, defaultPosition(normsAge(birthDate, date, gestation).months)),
    );
  }, [open, measurement, birthDate, gestation]);

  const patch = (next: Partial<GrowthForm>) => setForm((current) => ({ ...current, ...next }));
  const { months, corrected } = normsAge(birthDate, form.measuredOn || today, gestation);
  const height = parseMeasure(form.heightCm);
  const bodyMass = bmi(parseMeasure(form.weightKg), height);
  const bmiAssessment = assess("bmi", sex, months, bodyMass);

  const save = useMutation({
    mutationFn: () => {
      const payload = buildMeasurementInput(form);
      return measurement?.id != null
        ? updateMeasurement(scope, patientId, measurement.id, payload)
        : createMeasurement(scope, patientId, payload);
    },
    onSuccess: async () => {
      enqueueSnackbar(measurement ? "Замер обновлён" : "Замер сохранён", { variant: "success" });
      await invalidate();
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteMeasurement(scope, patientId, measurement?.id as number),
    onSuccess: async () => {
      enqueueSnackbar("Замер удалён", { variant: "success" });
      await invalidate();
      onClose();
    },
  });

  const field = (props: Omit<MeasureFieldProps, "sex" | "months">) => <MeasureField {...props} sex={sex} months={months} />;
  const ageText =
    months == null
      ? birthDate
        ? "До срока доношенности центили не считаются"
        : "Нет даты рождения — центили не посчитать"
      : `${corrected ? "Скорректированный возраст " : "Ребёнку "}${ageLabel(Math.floor(months))}`;

  return (
    <HealthDrawerShell
      open={open}
      title={measurement ? "Замер" : "Новый замер"}
      subtitle={`${ageText}${!sex && months != null ? " · не указан пол — центилей нет" : ""}`}
      pending={save.isPending || remove.isPending}
      error={save.error ?? remove.error}
      canSave={growthFormValid(form)}
      saveLabel={measurement ? "Сохранить" : "Сохранить замер"}
      onSave={() => save.mutate()}
      onClose={onClose}
      footerStart={
        measurement?.id != null ? (
          <AppButton color="error" startIcon={<DeleteOutlineOutlined />} loading={remove.isPending} onClick={() => remove.mutate()}>
            Удалить
          </AppButton>
        ) : undefined
      }
    >
      <CustomDatePicker
        label="Дата замера"
        value={form.measuredOn ? dayjs(form.measuredOn) : null}
        onChange={(value) => {
          const date = value as Dayjs | null;
          patch({ measuredOn: date && date.isValid() ? date.format("YYYY-MM-DD") : "" });
        }}
        slotProps={{ textField: { size: "small", fullWidth: true } }}
      />
      <Section title="Как мерили рост">
        <ChipGroup
          options={POSITIONS}
          selected={form.position ? [form.position] : []}
          onToggle={(value) => patch({ position: value })}
        />
      </Section>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" } }}>
        {field({
          label: form.position === "standing" ? "Рост" : "Длина",
          unit: "см",
          value: form.heightCm,
          step: 0.5,
          onChange: (value) => patch({ heightCm: value }),
          indicator: "height",
          normsValue: heightForNorms(height, form.position, months),
        })}
        {field({ label: "Вес", unit: "кг", value: form.weightKg, step: 0.1, onChange: (value) => patch({ weightKg: value }), indicator: "weight" })}
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
    </HealthDrawerShell>
  );
};
