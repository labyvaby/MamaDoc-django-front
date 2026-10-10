import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
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
import {
  CONCLUSIONS,
  EXAM_TYPES,
  NEXT_CHECK,
  RECOMMENDATIONS,
  RED_FLAGS,
  diagnosisDef,
  type ExamType,
  type OrthoBlock,
} from "./orthoCatalog";
import { ChipGroup, Section } from "./OrthoControls";
import {
  buildDiagnosisData,
  buildExamData,
  chronicSuggestions,
  diagnosisTitle,
  emptyDiagnosisForm,
  emptyExamForm,
  examHasContent,
  examTitle,
  examToForm,
  ALL_BLOCKS,
  blocksForAge,
  filledBlocks,
  readExam,
  toggleExclusive,
  type EditorBlock,
  type OrthoDiagnosis,
  type OrthoExamForm,
} from "./orthoData";
import { FootBlock, HipsBlock, LegsBlock, NeckBlock, OtherBlock, SpineBlock } from "./OrthoExamBlocks";
import { ageMonths, ageText, ageWeeks } from "./orthoNorms";
import { toggleIn } from "./orthoUi";

interface OrthoExamDrawerProps {
  open: boolean;
  enrollmentId: number;
  module: EffectiveProgramModule;
  scope: ActiveScope;
  birthDate: string | null;
  /** Осмотр для правки или запланированная запись, которую проводят; null — новый. */
  record: ProgramModuleRecord | null;
  /** Вид нового осмотра — от кнопки, которой открыли окно. */
  initialType: ExamType;
  diagnoses: OrthoDiagnosis[];
  onClose: () => void;
  onSaved: () => void;
}

/** Осмотр опорно-двигательной системы кнопками (ТЗ §5). */
export const OrthoExamDrawer: React.FC<OrthoExamDrawerProps> = ({
  open,
  enrollmentId,
  module,
  scope,
  birthDate,
  record,
  initialType,
  diagnoses,
  onClose,
  onSaved,
}) => {
  const { enqueueSnackbar } = useSnackbar();
  const editing = record != null && record.status !== "planned";
  const [occurredAt, setOccurredAt] = React.useState<Dayjs | null>(dayjs());
  const [form, setForm] = React.useState<OrthoExamForm>(() => emptyExamForm());
  const [titleTouched, setTitleTouched] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);
  const [skipChronic, setSkipChronic] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    const next = editing && record ? examToForm(readExam(record)) : emptyExamForm(record ? "control" : initialType);
    setForm(next);
    setOccurredAt(editing && record ? dayjs(record.occurredAt) : dayjs().second(0).millisecond(0));
    setTitleTouched(editing);
    setShowAll(false);
    setSkipChronic([]);
  }, [open, record, editing, initialType]);

  const patch = (next: Partial<OrthoExamForm>) => setForm((current) => ({ ...current, ...next }));
  const at = occurredAt ?? dayjs();
  const months = ageMonths(birthDate, at);
  const weeks = ageWeeks(birthDate, at);
  const full = form.examType !== "screening";
  const shown = React.useMemo(() => {
    // Сначала блоки возраста (с 3 лет — спина первой), потом остальные по порядку.
    const ordered = [...new Set<EditorBlock>([...blocksForAge(months), ...ALL_BLOCKS])];
    const filled = filledBlocks(form);
    const visible = showAll ? ordered : ordered.filter((block) => blocksForAge(months).includes(block) || filled.includes(block));
    // Скрининг педиатра — без «грудной клетки и Бейтона».
    return visible.filter((block) => block !== "other" || full || filled.includes("other"));
  }, [showAll, months, form, full]);
  const hidden = ALL_BLOCKS.length - shown.length;
  const relevant = new Set<OrthoBlock>([...shown, "other"]);
  const conclusionOptions = CONCLUSIONS.filter(
    (item) => item.normal || showAll || relevant.has(item.block) || form.conclusions.includes(item.value),
  );
  const recommendationOptions = RECOMMENDATIONS.filter(
    (item) => showAll || relevant.has(item.block) || form.recommendationCodes.includes(item.value),
  );
  const suggestions = chronicSuggestions(form.conclusions, diagnoses);
  const chosen = suggestions.filter((code) => !skipChronic.includes(code));
  const canSave = Boolean(occurredAt?.isValid()) && form.title.trim() !== "" && examHasContent(form);
  const ageLine = months == null ? "Нет даты рождения — нормы по возрасту не посчитать" : `Ребёнку ${ageText(months)}`;

  const mutation = useMutation({
    mutationFn: async () => {
      const when = occurredAt as Dayjs;
      const payload = {
        occurredAt: when.toISOString(),
        title: form.title.trim(),
        status: "completed",
        notes: form.notes.trim(),
        data: buildExamData(form),
      };
      if (record) await updateProgramModuleRecord(scope, enrollmentId, record.id, payload);
      else await createProgramModuleRecord(scope, enrollmentId, { ...payload, programModuleId: module.id });
      for (const code of chosen) {
        const diagnosis = emptyDiagnosisForm({ diagnosis: code });
        await createProgramModuleRecord(scope, enrollmentId, {
          programModuleId: module.id,
          occurredAt: when.toISOString(),
          title: diagnosisTitle(diagnosis),
          status: "completed",
          notes: "",
          data: buildDiagnosisData(diagnosis),
        });
      }
      if (!editing && form.nextCheckMonths) {
        await createProgramModuleRecord(scope, enrollmentId, {
          programModuleId: module.id,
          occurredAt: when.add(form.nextCheckMonths, "month").hour(10).minute(0).second(0).millisecond(0).toISOString(),
          title: "Плановый осмотр ортопеда",
          status: "planned",
          notes: "",
          data: { orthoKind: "exam", examType: "control" },
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

  const blockProps = { full, months, weeks };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={mutation.isPending ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100vw", md: 640 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" fontWeight={600}>
            {editing ? "Осмотр" : form.examType === "screening" ? "Скрининг педиатра" : "Новый осмотр ортопеда"}
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
      <Stack gap={2} sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2.5, py: 2 }}>
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

        {shown.map((block) => {
          if (block === "hips") return <HipsBlock key={block} value={form.hips} onChange={(hips) => patch({ hips })} {...blockProps} />;
          if (block === "neck") return <NeckBlock key={block} value={form.neck} onChange={(neck) => patch({ neck })} {...blockProps} />;
          if (block === "foot") return <FootBlock key={block} value={form.foot} onChange={(foot) => patch({ foot })} {...blockProps} />;
          if (block === "legs") return <LegsBlock key={block} value={form.legs} onChange={(legs) => patch({ legs })} {...blockProps} />;
          if (block === "spine") return <SpineBlock key={block} value={form.spine} onChange={(spine) => patch({ spine })} {...blockProps} />;
          return (
            <OtherBlock
              key={block}
              chest={form.chest}
              beighton={form.beighton}
              months={months}
              onChest={(chest) => patch({ chest: chest as OrthoExamForm["chest"] })}
              onBeighton={(beighton) => patch({ beighton })}
            />
          );
        })}
        {hidden > 0 && (
          <Button
            onClick={() => setShowAll(true)}
            endIcon={<ExpandMoreOutlined />}
            sx={{ alignSelf: "flex-start", textTransform: "none", px: 0 }}
          >
            Все блоки — ещё {hidden}
          </Button>
        )}

        <Section title="Красные признаки — всегда отклонение">
          <ChipGroup
            options={RED_FLAGS}
            selected={form.redFlags}
            tone={() => "error"}
            onToggle={(flag) => patch({ redFlags: toggleIn(form.redFlags, flag) })}
          />
        </Section>
        <Section title="Заключение">
          <ChipGroup
            options={conclusionOptions.map((item) => ({ value: item.value, label: item.icd ? `${item.label} · ${item.icd}` : item.label }))}
            selected={form.conclusions}
            onToggle={(value) => patch({ conclusions: toggleExclusive(form.conclusions, value, "normal") })}
          />
        </Section>
        {suggestions.length > 0 && (
          <Box sx={(theme) => ({ px: 1.5, py: 1, borderRadius: "12px", bgcolor: alpha(theme.palette.primary.main, 0.06) })}>
            <Typography variant="body2" fontWeight={600}>
              Добавить в хронические диагнозы
            </Typography>
            {suggestions.map((code) => (
              <FormControlLabel
                key={code}
                sx={{ display: "flex", m: 0 }}
                control={
                  <Checkbox
                    size="small"
                    checked={!skipChronic.includes(code)}
                    onChange={(event) =>
                      setSkipChronic((current) => (event.target.checked ? current.filter((item) => item !== code) : [...current, code]))
                    }
                  />
                }
                label={<Typography variant="body2">{diagnosisDef(code)?.label}</Typography>}
              />
            ))}
          </Box>
        )}
        <Section title="Рекомендации — нажатие добавляет фразу">
          <ChipGroup
            options={recommendationOptions}
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
