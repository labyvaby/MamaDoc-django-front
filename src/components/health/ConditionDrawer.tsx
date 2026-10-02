import React from "react";
import {
  Autocomplete,
  Box,
  Collapse,
  FormControlLabel,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import { createCondition, updateCondition, type Condition, type ConditionInput } from "../../api/health";
import { getDiagnoses, type CatalogDiagnosis } from "../../api/medical";
import { DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { doctorEmployeesOnly, useAllActiveEmployees } from "../../hooks/useAllActiveEmployees";
import { ChipGroup, Section } from "../../pages/patient-program/vision/VisionControls";
import { pairGridSx } from "../../pages/patient-program/vision/visionUi";
import { CustomDatePicker } from "../ui";
import { HealthDrawerShell } from "./HealthDrawerShell";
import { CONDITION_STATUSES, CONTROL_INTERVALS, DISPENSARY_END_REASONS, formatDate } from "./healthMeta";
import { useHealthScope, useInvalidateHealth } from "./useHealth";

const EMPTY: ConditionInput = {
  title: "",
  diagnosisId: null,
  diagnosisCode: "",
  status: "active",
  diagnosedOn: null,
  resolvedOn: null,
  isFirstDiagnosis: false,
  isDispensary: false,
  dispensarySince: null,
  dispensaryEndedOn: null,
  dispensaryEndReason: "",
  responsibleDoctorId: null,
  controlIntervalMonths: null,
  lastControlOn: null,
  nextControlOn: null,
  notes: "",
};

function toInput(condition: Condition): ConditionInput {
  return {
    title: condition.title,
    diagnosisId: condition.diagnosisId,
    diagnosisCode: condition.diagnosisCode,
    status: condition.status,
    diagnosedOn: condition.diagnosedOn,
    resolvedOn: condition.resolvedOn,
    isFirstDiagnosis: condition.isFirstDiagnosis,
    isDispensary: condition.isDispensary,
    dispensarySince: condition.dispensarySince,
    dispensaryEndedOn: condition.dispensaryEndedOn,
    dispensaryEndReason: condition.dispensaryEndReason,
    responsibleDoctorId: condition.responsibleDoctor?.id ?? null,
    controlIntervalMonths: condition.controlIntervalMonths,
    lastControlOn: condition.lastControlOn,
    nextControlOn: condition.nextControlOn,
    notes: condition.notes,
  };
}

const DateField: React.FC<{ label: string; value: string | null; onChange: (value: string | null) => void; helper?: string }> = ({
  label,
  value,
  onChange,
  helper,
}) => (
  <CustomDatePicker
    label={label}
    value={value ? dayjs(value) : null}
    onChange={(next) => {
      const date = next as Dayjs | null;
      onChange(date && date.isValid() ? date.format("YYYY-MM-DD") : null);
    }}
    slotProps={{ textField: { size: "small", fullWidth: true, helperText: helper } }}
  />
);

/** Поиск по справочнику МКБ-10 клиники (код или название). */
const DiagnosisSearch: React.FC<{ value: ConditionInput; onPick: (diagnosis: CatalogDiagnosis | null) => void }> = ({
  value,
  onPick,
}) => {
  const [input, setInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  React.useEffect(() => {
    const timer = window.setTimeout(() => setSearch(input.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [input]);
  const query = useQuery({
    queryKey: ["django", "medical", "diagnoses", "search", search],
    queryFn: ({ signal }) => getDiagnoses(search || undefined, signal, { limit: 30 }),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const selected: CatalogDiagnosis | null = value.diagnosisId
    ? { id: value.diagnosisId, code: value.diagnosisCode, title: value.title, displayName: "", isActive: true, sortOrder: 0 }
    : null;
  return (
    <Autocomplete<CatalogDiagnosis>
      size="small"
      options={query.data ?? []}
      value={selected}
      loading={query.isFetching}
      filterOptions={(options) => options}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      getOptionLabel={(option) => `${option.code} — ${option.title}`}
      onInputChange={(_event, next, reason) => {
        if (reason === "input") setInput(next);
      }}
      onChange={(_event, next) => onPick(next)}
      noOptionsText={search ? "Не найдено — впишите диагноз ниже" : "Начните вводить код или название"}
      renderInput={(params) => <TextField {...params} label="Справочник МКБ-10" placeholder="J45 или «астма»" />}
    />
  );
};

interface ConditionDrawerProps {
  open: boolean;
  patientId: number;
  condition: Condition | null;
  onClose: () => void;
}

/** Диагноз: из справочника или своим текстом, «впервые», статус, Д-учёт. */
export const ConditionDrawer: React.FC<ConditionDrawerProps> = ({ open, patientId, condition, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { scope } = useHealthScope();
  const invalidate = useInvalidateHealth(patientId);
  const { employees } = useAllActiveEmployees(open);
  const doctors = React.useMemo(() => doctorEmployeesOnly(employees), [employees]);
  const [form, setForm] = React.useState<ConditionInput>(EMPTY);

  React.useEffect(() => {
    if (open) setForm(condition ? toInput(condition) : { ...EMPTY, diagnosedOn: dayjs().format("YYYY-MM-DD") });
  }, [open, condition]);

  const patch = (next: Partial<ConditionInput>) => setForm((current) => ({ ...current, ...next }));
  const canSave = form.title.trim().length > 0 || form.diagnosisId != null;

  const mutation = useMutation({
    mutationFn: () => {
      const payload: ConditionInput = {
        ...form,
        title: form.title.trim(),
        diagnosisCode: form.diagnosisCode.trim().toUpperCase(),
        notes: form.notes.trim(),
      };
      return condition ? updateCondition(scope, patientId, condition.id, payload) : createCondition(scope, patientId, payload);
    },
    onSuccess: async () => {
      enqueueSnackbar(condition ? "Диагноз обновлён" : "Диагноз добавлен", { variant: "success" });
      await invalidate();
      onClose();
    },
  });

  const nextHint =
    form.isDispensary && form.controlIntervalMonths && !form.nextControlOn
      ? "Посчитается сам: от последнего контроля или постановки + интервал"
      : undefined;

  return (
    <HealthDrawerShell
      open={open}
      title={condition ? "Диагноз" : "Новый диагноз"}
      subtitle={[form.diagnosisCode, form.title].filter(Boolean).join(" · ") || "Выберите из справочника или впишите"}
      pending={mutation.isPending}
      error={mutation.error}
      canSave={canSave}
      saveLabel={condition ? "Сохранить" : "Добавить"}
      onSave={() => mutation.mutate()}
      onClose={onClose}
    >
      <DiagnosisSearch
        value={form}
        onPick={(diagnosis) =>
          diagnosis
            ? patch({ diagnosisId: diagnosis.id, diagnosisCode: diagnosis.code, title: diagnosis.title })
            : patch({ diagnosisId: null })
        }
      />
      <Box sx={pairGridSx}>
        <TextField
          size="small"
          label="Диагноз"
          value={form.title}
          onChange={(event) => patch({ title: event.target.value })}
          required
          fullWidth
        />
        <TextField
          size="small"
          label="Код МКБ-10"
          value={form.diagnosisCode}
          onChange={(event) => patch({ diagnosisCode: event.target.value.toUpperCase() })}
          fullWidth
        />
      </Box>
      <Box sx={pairGridSx}>
        <DateField label="Установлен" value={form.diagnosedOn} onChange={(value) => patch({ diagnosedOn: value })} />
        <FormControlLabel
          sx={{ m: 0 }}
          control={<Switch checked={form.isFirstDiagnosis} onChange={(event) => patch({ isFirstDiagnosis: event.target.checked })} />}
          label={<Typography variant="body2">Установлен впервые (+)</Typography>}
        />
      </Box>
      <Section title="Статус">
        <ChipGroup
          options={CONDITION_STATUSES.filter((option) => condition || option.value !== "refuted")}
          selected={[form.status]}
          tone={(value) => (value === "active" ? "error" : value === "remission" ? "warning" : value === "resolved" ? "success" : "primary")}
          onToggle={(value) =>
            patch({ status: value, resolvedOn: value === "resolved" && !form.resolvedOn ? dayjs().format("YYYY-MM-DD") : form.resolvedOn })
          }
        />
      </Section>
      {form.status === "resolved" && (
        <DateField label="Выздоровление" value={form.resolvedOn} onChange={(value) => patch({ resolvedOn: value })} />
      )}
      <FormControlLabel
        sx={{ m: 0 }}
        control={
          <Switch
            checked={form.isDispensary}
            onChange={(event) =>
              patch({
                isDispensary: event.target.checked,
                dispensarySince: event.target.checked ? form.dispensarySince ?? form.diagnosedOn ?? dayjs().format("YYYY-MM-DD") : null,
              })
            }
          />
        }
        label={<Typography variant="body2">Диспансерное наблюдение (Д-учёт)</Typography>}
      />
      <Collapse in={form.isDispensary} unmountOnExit sx={{ flexShrink: 0 }}>
        <Box sx={{ display: "grid", gap: 2 }}>
          <Box sx={pairGridSx}>
            <DateField label="Под наблюдением с" value={form.dispensarySince} onChange={(value) => patch({ dispensarySince: value })} />
            <TextField
              select
              size="small"
              label="Ответственный врач"
              value={form.responsibleDoctorId ?? ""}
              onChange={(event) => patch({ responsibleDoctorId: event.target.value === "" ? null : Number(event.target.value) })}
              fullWidth
            >
              <MenuItem value="">Не назначен</MenuItem>
              {doctors.map((doctor) => (
                <MenuItem key={doctor.id} value={doctor.id}>
                  {doctor.fullName}
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <Section title="Контроль">
            <ChipGroup<number>
              options={CONTROL_INTERVALS}
              selected={form.controlIntervalMonths ? [form.controlIntervalMonths] : []}
              onToggle={(value) =>
                patch({ controlIntervalMonths: form.controlIntervalMonths === value ? null : value, nextControlOn: null })
              }
            />
          </Section>
          <Box sx={pairGridSx}>
            <DateField
              label="Последний контроль"
              value={form.lastControlOn}
              onChange={(value) => patch({ lastControlOn: value, nextControlOn: null })}
            />
            <DateField label="Следующий контроль" value={form.nextControlOn} onChange={(value) => patch({ nextControlOn: value })} helper={nextHint} />
          </Box>
          {condition?.isDispensary && (
            <>
              <DateField
                label="Снят с учёта"
                value={form.dispensaryEndedOn}
                onChange={(value) => patch({ dispensaryEndedOn: value, dispensaryEndReason: value ? form.dispensaryEndReason || "recovered" : "" })}
                helper={condition.dispensarySince ? `На учёте с ${formatDate(condition.dispensarySince)}` : undefined}
              />
              {form.dispensaryEndedOn && (
                <Section title="Причина снятия">
                  <ChipGroup
                    options={DISPENSARY_END_REASONS}
                    selected={form.dispensaryEndReason ? [form.dispensaryEndReason] : []}
                    onToggle={(value) => patch({ dispensaryEndReason: value })}
                  />
                </Section>
              )}
            </>
          )}
        </Box>
      </Collapse>
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
