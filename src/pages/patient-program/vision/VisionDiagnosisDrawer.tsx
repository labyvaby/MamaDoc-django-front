import React from "react";
import {
  Alert,
  Box,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { useMutation } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import {
  createProgramModuleRecord,
  updateProgramModuleRecord,
  type EffectiveProgramModule,
  type ProgramModuleRecord,
} from "../../../api/programs";
import { AppButton, CustomDatePicker } from "../../../components/ui";
import type { ActiveScope } from "../../../hooks/useActiveScope";
import { ChipGroup, DiopterField, Section } from "./VisionControls";
import { CHRONIC_DIAGNOSES, DEGREES, DIAGNOSIS_STATES, EYES, diagnosisDef } from "./visionCatalog";
import {
  buildDiagnosisData,
  diagnosisTitle,
  diagnosisToForm,
  diagnosisValid,
  emptyDiagnosisForm,
  readDiagnosis,
  type DiagnosisForm,
} from "./visionData";
import { pairGridSx } from "./visionUi";

interface VisionDiagnosisDrawerProps {
  open: boolean;
  enrollmentId: number;
  module: EffectiveProgramModule;
  scope: ActiveScope;
  /** Диагноз для правки; null — новый. */
  record: ProgramModuleRecord | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Хронический диагноз глаз: из каталога с МКБ, глаз, степень/вид, Д-учёт, состояние. */
export const VisionDiagnosisDrawer: React.FC<VisionDiagnosisDrawerProps> = ({
  open,
  enrollmentId,
  module,
  scope,
  record,
  onClose,
  onSaved,
}) => {
  const { enqueueSnackbar } = useSnackbar();
  const [form, setForm] = React.useState<DiagnosisForm>(() => emptyDiagnosisForm());
  const [since, setSince] = React.useState<Dayjs | null>(dayjs());

  React.useEffect(() => {
    if (!open) return;
    setForm(record ? diagnosisToForm(readDiagnosis(record)) : emptyDiagnosisForm());
    setSince(record ? dayjs(record.occurredAt) : dayjs());
  }, [open, record]);

  const patch = (next: Partial<DiagnosisForm>) => setForm((current) => ({ ...current, ...next }));
  const def = diagnosisDef(form.diagnosis);
  const title = diagnosisTitle(form);
  const canSave = diagnosisValid(form) && Boolean(since?.isValid());

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        occurredAt: (since as Dayjs).hour(12).minute(0).second(0).millisecond(0).toISOString(),
        title,
        status: "completed",
        notes: form.notes.trim(),
        data: buildDiagnosisData(form),
      };
      return record
        ? updateProgramModuleRecord(scope, enrollmentId, record.id, payload)
        : createProgramModuleRecord(scope, enrollmentId, { ...payload, programModuleId: module.id });
    },
    onSuccess: () => {
      enqueueSnackbar(record ? "Диагноз обновлён" : "Диагноз добавлен", { variant: "success" });
      onSaved();
      onClose();
    },
  });

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
            {record ? "Хронический диагноз" : "Новый хронический диагноз"}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {title ? `${title}${form.eye ? ` · ${form.eye}` : ""}${def?.icd ? ` · ${def.icd}` : ""}` : "Выберите диагноз"}
          </Typography>
        </Box>
        <IconButton onClick={mutation.isPending ? undefined : onClose} aria-label="Закрыть" edge="end">
          <CloseOutlined />
        </IconButton>
      </Stack>
      <Divider />
      <Stack gap={2.25} sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2.5, py: 2 }}>
        {mutation.error && <Alert severity="error">{mutation.error.message}</Alert>}
        <Section title="Диагноз">
          <ChipGroup
            options={CHRONIC_DIAGNOSES}
            selected={form.diagnosis ? [form.diagnosis] : []}
            onToggle={(value) =>
              patch({ diagnosis: value, degree: "", subtype: "", icd: value === "other" ? form.icd : diagnosisDef(value)?.icd ?? "" })
            }
          />
        </Section>
        {form.diagnosis === "other" && (
          <Box sx={pairGridSx}>
            <TextField size="small" label="Название" value={form.customLabel} onChange={(event) => patch({ customLabel: event.target.value })} required />
            <TextField size="small" label="Код МКБ-10" value={form.icd} onChange={(event) => patch({ icd: event.target.value.toUpperCase() })} />
          </Box>
        )}
        <Section title="Глаз">
          <ChipGroup options={EYES} selected={form.eye ? [form.eye] : []} onToggle={(value) => patch({ eye: form.eye === value ? "" : value })} />
        </Section>
        {def?.subtypes && (
          <Section title="Вид">
            <ChipGroup
              options={def.subtypes}
              selected={form.subtype ? [form.subtype] : []}
              onToggle={(value) => patch({ subtype: form.subtype === value ? "" : value })}
            />
          </Section>
        )}
        {def?.degrees && (
          <Section title="Степень">
            <ChipGroup
              options={DEGREES}
              selected={form.degree ? [form.degree] : []}
              onToggle={(value) => patch({ degree: form.degree === value ? "" : value })}
            />
          </Section>
        )}
        {form.diagnosis === "astigmatism" && (
          <Box sx={pairGridSx}>
            <DiopterField label="Цилиндр" value={form.cylinder} onChange={(value) => patch({ cylinder: value })} />
            <TextField size="small" label="Ось, °" value={form.axis} onChange={(event) => patch({ axis: event.target.value })} inputProps={{ inputMode: "numeric" }} />
          </Box>
        )}
        <CustomDatePicker
          label="С какого числа"
          value={since}
          onChange={(value) => setSince(value as Dayjs | null)}
          slotProps={{ textField: { size: "small", fullWidth: true } }}
        />
        <FormControlLabel
          sx={{ m: 0 }}
          control={<Switch checked={form.dispensary} onChange={(event) => patch({ dispensary: event.target.checked })} />}
          label={<Typography variant="body2">На Д-учёте у офтальмолога</Typography>}
        />
        <Section title="Состояние">
          <ChipGroup
            options={DIAGNOSIS_STATES}
            selected={[form.state]}
            onToggle={(value) =>
              patch({ state: value, resolvedOn: value === "resolved" && !form.resolvedOn ? dayjs().format("YYYY-MM-DD") : form.resolvedOn })
            }
          />
        </Section>
        {form.state === "resolved" && (
          <CustomDatePicker
            label="Снят"
            value={form.resolvedOn ? dayjs(form.resolvedOn) : null}
            onChange={(value) => {
              const date = value as Dayjs | null;
              patch({ resolvedOn: date && date.isValid() ? date.format("YYYY-MM-DD") : "" });
            }}
            slotProps={{ textField: { size: "small", fullWidth: true } }}
          />
        )}
        <TextField size="small" label="Примечание" value={form.notes} onChange={(event) => patch({ notes: event.target.value })} multiline minRows={2} fullWidth />
      </Stack>
      <Divider />
      <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ px: 2.5, py: 1.5 }}>
        <AppButton onClick={onClose} disabled={mutation.isPending}>
          Отмена
        </AppButton>
        <AppButton variant="contained" loading={mutation.isPending} disabled={!canSave} onClick={() => mutation.mutate()}>
          {record ? "Сохранить" : "Добавить"}
        </AppButton>
      </Stack>
    </Drawer>
  );
};
