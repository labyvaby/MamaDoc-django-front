import React from "react";
import { Alert, Box, Divider, Drawer, FormControlLabel, IconButton, Stack, Switch, TextField, Typography } from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { useMutation } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import { createProgramModuleRecord, updateProgramModuleRecord, type EffectiveProgramModule, type ProgramModuleRecord } from "../../../api/programs";
import { AppButton, CustomDatePicker } from "../../../components/ui";
import type { ActiveScope } from "../../../hooks/useActiveScope";
import { DIAGNOSIS_GROUPS, DIAGNOSIS_SIDES, DIAGNOSIS_STATES, diagnosisDef, gendered, type Sex } from "./neuroCatalog";
import {
  DIAGNOSIS_CHOICES,
  buildDiagnosisData,
  diagnosisTitle,
  diagnosisToForm,
  diagnosisValid,
  emptyDiagnosisForm,
  formIcd,
  readDiagnosis,
  type DiagnosisForm,
} from "./neuroData";
import { ChipGroup, Section } from "./NeuroControls";
import { pairGridSx } from "./neuroUi";

interface NeuroDiagnosisDrawerProps {
  open: boolean;
  enrollmentId: number;
  module: EffectiveProgramModule;
  scope: ActiveScope;
  /** Диагноз для правки; null — новый. */
  record: ProgramModuleRecord | null;
  sex: Sex;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Диагноз (ТЗ §5): кнопками по группам каталога или «Другой»; вариант меняет
 * код; сторона — у парезов, паралича лицевого нерва, кривошеи; Д-учёт,
 * состояние; снять — «снят» и дата.
 */
export const NeuroDiagnosisDrawer: React.FC<NeuroDiagnosisDrawerProps> = ({ open, enrollmentId, module, scope, record, sex, onClose, onSaved }) => {
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
  const title = diagnosisTitle(form, sex);
  const icd = formIcd(form);
  const canSave = diagnosisValid(form) && Boolean(since?.isValid());

  const choose = (code: string) => {
    const next = diagnosisDef(code);
    patch({
      diagnosis: code,
      variant: next?.variants?.[0]?.value ?? "",
      icd: code === "other" ? form.icd : next?.icd ?? "",
      side: next?.sided ? form.side : "",
    });
  };

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        occurredAt: (since as Dayjs).hour(12).minute(0).second(0).millisecond(0).toISOString(),
        title,
        status: "completed",
        notes: form.notes.trim(),
        data: buildDiagnosisData(form, record?.data),
      };
      return record ? updateProgramModuleRecord(scope, enrollmentId, record.id, payload) : createProgramModuleRecord(scope, enrollmentId, { ...payload, programModuleId: module.id });
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
      PaperProps={{ sx: { width: { xs: "100vw", md: 560 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" fontWeight={600}>
            {record ? "Диагноз" : "Новый диагноз"}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {title ? `${title}${icd ? ` · ${icd}` : ""}` : "Выберите диагноз"}
          </Typography>
        </Box>
        <IconButton onClick={mutation.isPending ? undefined : onClose} aria-label="Закрыть" edge="end">
          <CloseOutlined />
        </IconButton>
      </Stack>
      <Divider />
      <Stack gap={2.25} sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2.5, py: 2 }}>
        {mutation.error && <Alert severity="error">{mutation.error.message}</Alert>}
        {DIAGNOSIS_GROUPS.filter((group) => group.value !== "exam").map((group) => (
          <Section key={group.value} title={group.label}>
            <ChipGroup
              options={DIAGNOSIS_CHOICES.filter((item) => item.group === group.value).map((item) => ({ value: item.value, label: `${gendered(item.label, sex)} · ${item.icd}` }))}
              selected={form.diagnosis ? [form.diagnosis] : []}
              onToggle={choose}
            />
          </Section>
        ))}
        <Section title="Другой">
          <ChipGroup options={[{ value: "other", label: "Другой — название и код вручную" }]} selected={form.diagnosis === "other" ? ["other"] : []} onToggle={choose} />
        </Section>
        {form.diagnosis === "other" && (
          <Box sx={pairGridSx}>
            <TextField size="small" label="Название" value={form.customLabel} onChange={(event) => patch({ customLabel: event.target.value })} required />
            <TextField size="small" label="Код МКБ-10" value={form.icd} onChange={(event) => patch({ icd: event.target.value.toUpperCase() })} />
          </Box>
        )}
        {form.diagnosis === "other" && (
          <Typography variant="caption" color="text.secondary">
            Умственная отсталость (F70–F79) — только по заключению психиатра.
          </Typography>
        )}
        {def?.refine && (
          <TextField size="small" label="Код МКБ-10" value={form.icd} onChange={(event) => patch({ icd: event.target.value.toUpperCase() })} helperText="Кнопка даёт неуточнённый код — уточните его" sx={{ maxWidth: 260 }} />
        )}
        {def?.warning && <Alert severity="warning">{def.warning}</Alert>}
        {def?.variants && (
          <Section title={`Вариант — меняет код (${icd})`}>
            <ChipGroup
              options={def.variants.map((item) => ({ value: item.value, label: `${item.label} · ${item.icd}` }))}
              selected={form.variant ? [form.variant] : []}
              onToggle={(variant) => patch({ variant })}
            />
          </Section>
        )}
        {(def?.sided || form.diagnosis === "other") && (
          <Section title="Сторона">
            <ChipGroup options={DIAGNOSIS_SIDES} selected={form.side ? [form.side] : []} onToggle={(value) => patch({ side: form.side === value ? "" : value })} />
          </Section>
        )}
        <CustomDatePicker label="С какого числа" value={since} onChange={(value) => setSince(value as Dayjs | null)} slotProps={{ textField: { size: "small", fullWidth: true } }} />
        <FormControlLabel
          sx={{ m: 0 }}
          control={<Switch checked={form.dispensary} onChange={(event) => patch({ dispensary: event.target.checked })} />}
          label={<Typography variant="body2">На Д-учёте у невролога</Typography>}
        />
        <Section title="Состояние">
          <ChipGroup
            options={DIAGNOSIS_STATES}
            selected={[form.state]}
            onToggle={(value) => patch({ state: value, resolvedOn: value === "resolved" && !form.resolvedOn ? dayjs().format("YYYY-MM-DD") : form.resolvedOn })}
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
