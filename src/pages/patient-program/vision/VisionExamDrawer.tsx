import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Collapse,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  Stack,
  TextField,
  Typography,
  alpha,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
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
import { AcuityPicker, ChipGroup, Section } from "./VisionControls";
import { VisionFullExam } from "./VisionFullExam";
import {
  CONCLUSIONS,
  CORRECTIONS,
  EXAM_TYPES,
  EYE_COLORS,
  EYES,
  NEXT_CHECK,
  RECOMMENDATIONS,
  diagnosisDef,
  optionLabel,
  type EyeColor,
} from "./visionCatalog";
import {
  buildDiagnosisData,
  buildExamData,
  chronicSuggestions,
  diagnosisFromSuggestion,
  diagnosisTitle,
  emptyExamForm,
  examHasContent,
  examTitle,
  examToForm,
  hasFullExam,
  readExam,
  toggleExclusive,
  type ExamForm,
  type VisionDiagnosis,
} from "./visionData";
import { acuityNorm, acuityStatus, ageInMonths, ageLabel, formatAcuity, parseAcuity, type EyeStatus } from "./visionNorms";
import { toggleIn, type ChipTone } from "./visionUi";

const STATUS_TONE: Record<EyeStatus, ChipTone> = { ok: "success", borderline: "warning", low: "error", unknown: "primary" };

interface VisionExamDrawerProps {
  open: boolean;
  enrollmentId: number;
  module: EffectiveProgramModule;
  scope: ActiveScope;
  birthDate: string | null;
  /** Осмотр для правки или запланированная запись, которую проводят; null — новый. */
  record: ProgramModuleRecord | null;
  diagnoses: VisionDiagnosis[];
  /** Цвет глаз с прошлых осмотров — новый осмотр начинается с него. */
  knownEyeColor?: EyeColor | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Осмотр зрения кнопками (ТЗ «Зрение» §5); полный осмотр раскрывается. */
export const VisionExamDrawer: React.FC<VisionExamDrawerProps> = ({
  open,
  enrollmentId,
  module,
  scope,
  birthDate,
  record,
  diagnoses,
  knownEyeColor = null,
  onClose,
  onSaved,
}) => {
  const { enqueueSnackbar } = useSnackbar();
  const editing = record != null && record.status !== "planned";
  const [occurredAt, setOccurredAt] = React.useState<Dayjs | null>(dayjs());
  const [form, setForm] = React.useState<ExamForm>(() => emptyExamForm());
  const [titleTouched, setTitleTouched] = React.useState(false);
  const [fullOpen, setFullOpen] = React.useState(false);
  const [skipChronic, setSkipChronic] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    const next =
      editing && record
        ? examToForm(readExam(record))
        : { ...emptyExamForm(record ? "control" : "preventive"), eyeColor: knownEyeColor ?? ("" as const) };
    setForm(next);
    setOccurredAt(editing && record ? dayjs(record.occurredAt) : dayjs().second(0).millisecond(0));
    setTitleTouched(editing);
    setFullOpen(hasFullExam(next));
    setSkipChronic([]);
  }, [open, record, editing, knownEyeColor]);

  const patch = (next: Partial<ExamForm>) => setForm((current) => ({ ...current, ...next }));
  const months = ageInMonths(birthDate, occurredAt ?? dayjs());
  const norm = acuityNorm(months);
  const tone = (value: string): ChipTone => STATUS_TONE[acuityStatus(parseAcuity(value), norm)];
  const suggestions = chronicSuggestions(form, diagnoses);
  const chosen = suggestions.filter((item) => !skipChronic.includes(item.diagnosis));
  const canSave = Boolean(occurredAt?.isValid()) && form.title.trim() !== "" && examHasContent(form);
  const ageLine =
    months == null
      ? "Нет даты рождения — норму не посчитать"
      : `Ребёнку ${ageLabel(months)} · ${norm != null ? `норма от ${formatAcuity(norm)}` : "по таблице не оценивают"}`;

  const mutation = useMutation({
    mutationFn: async () => {
      const at = occurredAt as Dayjs;
      const payload = {
        occurredAt: at.toISOString(),
        title: form.title.trim(),
        status: "completed",
        notes: form.notes.trim(),
        data: buildExamData(form),
      };
      if (record) await updateProgramModuleRecord(scope, enrollmentId, record.id, payload);
      else await createProgramModuleRecord(scope, enrollmentId, { ...payload, programModuleId: module.id });
      for (const suggestion of chosen) {
        const diagnosis = diagnosisFromSuggestion(suggestion);
        await createProgramModuleRecord(scope, enrollmentId, {
          programModuleId: module.id,
          occurredAt: at.toISOString(),
          title: diagnosisTitle(diagnosis),
          status: "completed",
          notes: "",
          data: buildDiagnosisData(diagnosis),
        });
      }
      if (!editing && form.nextCheckMonths) {
        await createProgramModuleRecord(scope, enrollmentId, {
          programModuleId: module.id,
          occurredAt: at.add(form.nextCheckMonths, "month").hour(10).minute(0).second(0).millisecond(0).toISOString(),
          title: "Плановый осмотр зрения",
          status: "planned",
          notes: "",
          data: { visionKind: "exam", examType: "control" },
        });
      }
    },
    onSuccess: () => {
      enqueueSnackbar(editing ? "Осмотр обновлён" : "Осмотр сохранён", { variant: "success" });
      onSaved();
      onClose();
    },
    // Часть записей могла сохраниться — список обновляем и при ошибке.
    onError: () => onSaved(),
  });

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={mutation.isPending ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100vw", md: 580 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" fontWeight={600}>
            {editing ? "Осмотр зрения" : "Новый осмотр зрения"}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {ageLine}
          </Typography>
        </Box>
        <IconButton onClick={mutation.isPending ? undefined : onClose} aria-label="Закрыть" edge="end">
          <CloseOutlined />
        </IconButton>
      </Stack>
      <Divider />
      <Stack gap={2.25} sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2.5, py: 2 }}>
        {mutation.error && <Alert severity="error">{mutation.error.message}</Alert>}
        <CustomDateTimePicker
          label="Дата и время"
          value={occurredAt}
          onChange={setOccurredAt}
          minutesStep={1}
          slotProps={{ textField: { fullWidth: true, size: "small" } }}
        />
        <Section title="Вид осмотра">
          <ChipGroup
            options={EXAM_TYPES}
            selected={[form.examType]}
            onToggle={(value) => patch({ examType: value, ...(titleTouched ? {} : { title: examTitle(value) }) })}
          />
        </Section>
        <Section title="Цвет глаз">
          <ChipGroup
            options={EYE_COLORS}
            selected={form.eyeColor ? [form.eyeColor] : []}
            onToggle={(value) => patch({ eyeColor: form.eyeColor === value ? "" : value })}
          />
        </Section>
        <TextField
          size="small"
          label="Название записи"
          value={form.title}
          onChange={(event) => {
            setTitleTouched(true);
            patch({ title: event.target.value });
          }}
          required
          fullWidth
        />
        <Section title="Правый глаз · OD">
          <AcuityPicker label="Острота правого глаза" value={form.acuityRight} onChange={(value) => patch({ acuityRight: value })} tone={tone} />
        </Section>
        <Section
          title="Левый глаз · OS"
          action={
            form.acuityRight ? (
              <Button size="small" onClick={() => patch({ acuityLeft: form.acuityRight })} sx={{ textTransform: "none", py: 0 }}>
                как у правого
              </Button>
            ) : undefined
          }
        >
          <AcuityPicker label="Острота левого глаза" value={form.acuityLeft} onChange={(value) => patch({ acuityLeft: value })} tone={tone} />
        </Section>
        <Section title="Коррекция">
          <ChipGroup
            options={CORRECTIONS}
            selected={form.correction ? [form.correction] : []}
            onToggle={(value) => patch({ correction: form.correction === value ? "" : value })}
          />
        </Section>
        <Section title="Заключение">
          <ChipGroup
            options={CONCLUSIONS}
            selected={form.conclusions}
            onToggle={(value) => patch({ conclusions: toggleExclusive(form.conclusions, value, "normal") })}
          />
        </Section>
        {suggestions.length > 0 && (
          <Box sx={(theme) => ({ px: 1.5, py: 1, borderRadius: "12px", bgcolor: alpha(theme.palette.primary.main, 0.06) })}>
            <Typography variant="body2" fontWeight={600}>
              Добавить в хронические диагнозы
            </Typography>
            {suggestions.map((item) => (
              <FormControlLabel
                key={item.diagnosis}
                sx={{ display: "flex", m: 0 }}
                control={
                  <Checkbox
                    size="small"
                    checked={!skipChronic.includes(item.diagnosis)}
                    onChange={(event) =>
                      setSkipChronic((current) =>
                        event.target.checked ? current.filter((code) => code !== item.diagnosis) : [...current, item.diagnosis],
                      )
                    }
                  />
                }
                label={
                  <Typography variant="body2">
                    {diagnosisDef(item.diagnosis)?.label} · {optionLabel(EYES, item.eye)}
                  </Typography>
                }
              />
            ))}
          </Box>
        )}
        <Section title="Рекомендации — нажатие добавляет фразу">
          <ChipGroup
            options={RECOMMENDATIONS}
            selected={form.recommendationCodes}
            onToggle={(value) => patch({ recommendationCodes: toggleIn(form.recommendationCodes, value) })}
          />
          <TextField
            size="small"
            label="Своя рекомендация"
            value={form.recommendationNote}
            onChange={(event) => patch({ recommendationNote: event.target.value })}
            fullWidth
            multiline
            sx={{ mt: 1 }}
          />
        </Section>
        {!editing && (
          <Section title="Следующий осмотр">
            <ChipGroup
              options={NEXT_CHECK}
              selected={form.nextCheckMonths ? [form.nextCheckMonths] : []}
              onToggle={(value) => patch({ nextCheckMonths: form.nextCheckMonths === value ? null : value })}
            />
          </Section>
        )}
        <Button
          onClick={() => setFullOpen((value) => !value)}
          endIcon={
            <ExpandMoreOutlined sx={{ transform: fullOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
          }
          sx={{ alignSelf: "flex-start", textTransform: "none", px: 0 }}
        >
          Полный осмотр офтальмолога
        </Button>
        {/* В прокручиваемой колонке flex-элемент с overflow: hidden сжимается — запрещаем. */}
        <Collapse in={fullOpen} unmountOnExit sx={{ flexShrink: 0 }}>
          <VisionFullExam form={form} patch={patch} />
        </Collapse>
        <TextField
          size="small"
          label="Заметка"
          value={form.notes}
          onChange={(event) => patch({ notes: event.target.value })}
          multiline
          minRows={2}
          fullWidth
        />
      </Stack>
      <Divider />
      <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ px: 2.5, py: 1.5 }}>
        <AppButton onClick={onClose} disabled={mutation.isPending}>
          Отмена
        </AppButton>
        <AppButton variant="contained" loading={mutation.isPending} disabled={!canSave} onClick={() => mutation.mutate()}>
          {editing ? "Сохранить" : "Сохранить осмотр"}
        </AppButton>
      </Stack>
    </Drawer>
  );
};
