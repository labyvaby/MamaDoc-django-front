import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from "@mui/material";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import TipsAndUpdatesOutlined from "@mui/icons-material/TipsAndUpdatesOutlined";
import { useMutation } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useSnackbar } from "notistack";

import { createProgramModuleRecord, updateProgramModuleRecord, type EffectiveProgramModule, type ProgramModuleRecord } from "../../../api/programs";
import { AppButton, CustomDateTimePicker } from "../../../components/ui";
import type { ActiveScope } from "../../../hooks/useActiveScope";
import {
  DIAGNOSES,
  DIAGNOSIS_GROUPS,
  EXAM_TYPES,
  FREQUENT_CONCLUSIONS,
  HEALTHY,
  NEXT_CHECK,
  PLANNED_TITLE,
  QUICK_TONE,
  RECOMMENDATIONS,
  RECOMMENDATION_GROUPS,
  RED_FLAGS,
  diagnosisDef,
  gendered,
  optionLabel,
  type DiagnosisDef,
  type ExamType,
  type QuickTone,
  type Sex,
} from "./neuroCatalog";
import {
  PLANNED_DATA,
  buildDiagnosisData,
  buildExamData,
  diagnosisSuggestions,
  diagnosisTitle,
  emptyDiagnosisForm,
  emptyExamForm,
  emptyTone,
  examHasContent,
  examTitle,
  examToForm,
  hasFullExam,
  isDone,
  markSources,
  plannedCheckAt,
  readExam,
  toggleExclusive,
  type HeadData,
  type NeuroExamForm,
  type NeuroRecords,
} from "./neuroData";
import { buildPicture, evaluateMilestones, type MilestoneMark } from "./neuroMilestones";
import { ageFor, ageLine, fontanelleLevel, nextOrderCheck, orderAgeText, toneLevel, type AgeContext, type NeuroLevel } from "./neuroNorms";
import { examFindings, recommendationHints, type HeadInfo } from "./neuroSignals";
import { Block, BlockTitle, ChipGroup, Section } from "./NeuroControls";
import { FontanelleFields, NeuroFullExam } from "./NeuroFullExam";
import { MilestonePicker } from "./MilestonePicker";
import { LEVEL_TONE, toggleIn } from "./neuroUi";

const REPORTED = [
  { value: "parents", label: "Со слов родителей" },
  { value: "seen", label: "Видел на приёме" },
];

interface NeuroExamDrawerProps {
  open: boolean;
  enrollmentId: number;
  module: EffectiveProgramModule;
  scope: ActiveScope;
  /** Осмотр для правки или плановая запись, которую проводят; null — новый. */
  record: ProgramModuleRecord | null;
  /** Вид нового осмотра. */
  initialType: ExamType;
  records: NeuroRecords;
  ages: AgeContext;
  sex: Sex;
  /** Последний замер окружности головы из «Роста». */
  head: HeadInfo | null;
  canViewHealth: boolean;
  onOpenGrowth?: () => void;
  onClose: () => void;
  onSaved: () => void;
}

const withReported = (marks: Readonly<Record<string, MilestoneMark>>, reported: boolean): Record<string, MilestoneMark> =>
  Object.fromEntries(Object.entries(marks).map(([code, mark]) => [code, { ...mark, reported }]));

const conclusionOption = (def: DiagnosisDef, sex: Sex) => ({ value: def.value, label: `${gendered(def.label, sex)} · ${def.icd}` });

/**
 * Осмотр невролога (ТЗ §5): быстрый скрининг виден всегда — вехи возраста,
 * тонус коротко, родничок, тревожные признаки, заключение, рекомендации,
 * следующий осмотр; полный осмотр раскрывается.
 */
export const NeuroExamDrawer: React.FC<NeuroExamDrawerProps> = ({
  open,
  enrollmentId,
  module,
  scope,
  record,
  initialType,
  records,
  ages,
  sex,
  head,
  canViewHealth,
  onOpenGrowth,
  onClose,
  onSaved,
}) => {
  const { enqueueSnackbar } = useSnackbar();
  const editing = record != null && record.status !== "planned";
  const [occurredAt, setOccurredAt] = React.useState<Dayjs | null>(dayjs());
  const [form, setForm] = React.useState<NeuroExamForm>(() => emptyExamForm());
  const [titleTouched, setTitleTouched] = React.useState(false);
  const [fullOpen, setFullOpen] = React.useState(false);
  const [reported, setReported] = React.useState(true);
  const [skipDiagnoses, setSkipDiagnoses] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    const next = editing && record ? examToForm(readExam(record)) : emptyExamForm(record ? "neurologist" : initialType);
    setForm(next);
    setOccurredAt(editing && record ? dayjs(record.occurredAt) : dayjs().second(0).millisecond(0));
    setTitleTouched(editing);
    setFullOpen(editing ? hasFullExam(next) : next.examType === "neurologist");
    const marks = Object.values(next.milestones);
    setReported(marks.length ? marks.every((mark) => mark.reported) : true);
    setSkipDiagnoses([]);
  }, [open, record, editing, initialType]);

  const patch = (next: Partial<NeuroExamForm>) => setForm((current) => ({ ...current, ...next }));
  const at = (occurredAt?.isValid() ? occurredAt : dayjs()).toISOString();
  const age = ageFor(ages, at);
  const ownId = editing && record ? record.id : null;
  const sources = React.useMemo(() => markSources(records, ownId).filter((source) => !dayjs(source.at).isAfter(dayjs(at))), [records, ownId, at]);
  const views = React.useMemo(
    () => evaluateMilestones(buildPicture([...sources, { recordId: -1, at, createdAt: "9999-12-31T00:00:00Z", marks: form.milestones }]), ages, at),
    [sources, form.milestones, ages, at],
  );
  // Родничок по прежним осмотрам: закрыт — быстрый блок и нейросонография не нужны.
  const closedBefore = records.exams.some(
    (exam) => exam.record.id !== ownId && isDone(exam.record) && !dayjs(exam.record.occurredAt).isAfter(dayjs(at)) && exam.head?.fontanelle?.state === "closed",
  );
  const fontanelleClosed = closedBefore || form.head?.fontanelle?.state === "closed";
  const shapeChanged = form.head?.shape === "plagiocephaly" || form.head?.shape === "synostosis_suspected";
  const fontanelleLevelOf = (f: HeadData["fontanelle"]): NeuroLevel =>
    fontanelleLevel(f, age, { closedAge: f?.closedOn ? ageFor(ages, f.closedOn) : null, headZ: head?.latest.z ?? null, shapeChanged });
  const showQuickFontanelle = !closedBefore && (age == null || age < 24);
  const hints = recommendationHints({ form, views, headLevel: head?.level ?? "unknown", fontanelleClosed });
  const suggestions = diagnosisSuggestions(form.conclusions, records.diagnoses);
  const chosen = suggestions.filter((code) => !skipDiagnoses.includes(code));
  const urgent = examFindings(form, { age, date: at, sex, ages, headZ: head?.latest.z ?? null }).filter((item) => item.level === "urgent");
  const nextOrder = nextOrderCheck(ages.birthDate, at, { questionnairePositive: form.questionnaire === "positive", gapDays: 14 });
  const plannedAt = plannedCheckAt(form, dayjs(at), ages.birthDate);
  const canSave = Boolean(occurredAt?.isValid()) && form.title.trim() !== "" && examHasContent(form);

  const mutation = useMutation({
    mutationFn: async () => {
      const when = occurredAt as Dayjs;
      const body = { ...form, milestones: withReported(form.milestones, reported) };
      const payload = {
        occurredAt: when.toISOString(),
        title: form.title.trim(),
        status: "completed",
        notes: form.notes.trim(),
        data: buildExamData(body, sex, record?.data),
      };
      if (record) await updateProgramModuleRecord(scope, enrollmentId, record.id, payload);
      else await createProgramModuleRecord(scope, enrollmentId, { ...payload, programModuleId: module.id });
      for (const code of chosen) {
        const diagnosis = emptyDiagnosisForm({ diagnosis: code });
        await createProgramModuleRecord(scope, enrollmentId, {
          programModuleId: module.id,
          occurredAt: when.toISOString(),
          title: diagnosisTitle(diagnosis, sex),
          status: "completed",
          notes: "",
          data: buildDiagnosisData(diagnosis),
        });
      }
      const next = editing ? null : plannedCheckAt(form, when, ages.birthDate);
      if (next) {
        await createProgramModuleRecord(scope, enrollmentId, {
          programModuleId: module.id,
          occurredAt: next.toISOString(),
          title: PLANNED_TITLE,
          status: "planned",
          notes: "",
          data: { ...PLANNED_DATA },
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

  // ── Тонус коротко ──────────────────────────────────────────────────────────
  const tone = form.tone ?? emptyTone();
  const asymmetric = tone.symmetry != null && tone.symmetry !== "equal";
  const quickSelected: QuickTone[] = [
    ...(tone.state === "normal" || tone.state === "low" || tone.state === "high" ? [tone.state] : []),
    ...(asymmetric ? (["asym"] as const) : []),
  ];
  const toggleQuickTone = (value: QuickTone) => {
    if (value === "asym") {
      patch({ tone: { ...tone, symmetry: asymmetric ? null : "asym" } });
      return;
    }
    const state = tone.state === value ? null : value;
    patch({ tone: { ...tone, state, symmetry: state === "normal" && !asymmetric ? "equal" : tone.symmetry } });
  };
  const quickToneLevel = (value: QuickTone): NeuroLevel => (value === "normal" ? "ok" : value === "asym" ? "bad" : "warn");

  // ── Заключение ─────────────────────────────────────────────────────────────
  const frequent = [...FREQUENT_CONCLUSIONS, "suspected"];
  const conclusionChips = [...frequent, ...form.conclusions.filter((code) => !frequent.includes(code))]
    .map((code) => diagnosisDef(code))
    .filter((def): def is DiagnosisDef => def != null)
    .map((def) => conclusionOption(def, sex));
  const warnings = form.conclusions.map((code) => diagnosisDef(code)?.warning).filter((text): text is string => Boolean(text));
  const groupLabel = (def: DiagnosisDef) => optionLabel(DIAGNOSIS_GROUPS, def.group);

  const fullProps = {
    form,
    patch,
    age,
    ages,
    sex,
    at,
    fontanelleClosed: closedBefore,
    head,
    canViewHealth,
    onOpenGrowth,
    fontanelleLevelOf,
    quickFontanelle: showQuickFontanelle,
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={mutation.isPending ? undefined : onClose}
      PaperProps={{ sx: { width: { xs: "100vw", md: 680 }, maxWidth: "100vw", display: "flex", flexDirection: "column" } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" fontWeight={600}>
            {editing ? "Осмотр" : record ? "Плановый осмотр невролога" : form.examType === "pediatric" ? "Скрининг развития" : "Новый осмотр невролога"}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {ageLine(ages, at)}
          </Typography>
        </Box>
        <IconButton onClick={mutation.isPending ? undefined : onClose} aria-label="Закрыть" edge="end">
          <CloseOutlined />
        </IconButton>
      </Stack>
      {urgent.length > 0 && (
        <Alert severity="error" sx={{ borderRadius: 0, py: 0.5 }}>
          <b>Срочно:</b> {urgent.map((item) => item.text.toLowerCase()).join("; ")} — в стационар или к неврологу в тот же день.
        </Alert>
      )}
      <Divider />
      <Stack gap={2} sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 2.5, py: 2 }}>
        {mutation.error && <Alert severity="error">{mutation.error.message}</Alert>}
        <CustomDateTimePicker label="Дата и время" value={occurredAt} onChange={setOccurredAt} minutesStep={1} slotProps={{ textField: { fullWidth: true, size: "small" } }} />
        <Section title="Вид осмотра">
          <ChipGroup
            options={EXAM_TYPES}
            selected={[form.examType]}
            onToggle={(value) => {
              patch({ examType: value, ...(titleTouched ? {} : { title: examTitle(value) }) });
              if (value === "neurologist") setFullOpen(true);
            }}
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

        <Block>
          <BlockTitle title="Вехи возраста" note="тот же список, что в «Отметить вехи»" />
          <ChipGroup
            label="Откуда известно"
            options={REPORTED}
            selected={[reported ? "parents" : "seen"]}
            onToggle={(value) => setReported(value === "parents")}
          />
          <MilestonePicker
            sources={sources}
            marks={form.milestones}
            onChange={(milestones) => patch({ milestones })}
            ages={ages}
            at={at}
            sex={sex}
            reported={reported}
          />
        </Block>

        <Block>
          <BlockTitle title="Тонус коротко" level={toneLevel(form.tone, age)} />
          <ChipGroup label="Тонус" options={QUICK_TONE} selected={quickSelected} tone={(value) => LEVEL_TONE[quickToneLevel(value)]} onToggle={toggleQuickTone} />
          {tone.state && !["normal", "low", "high"].includes(tone.state) && (
            <Typography variant="caption" color="text.secondary">
              Подробно в полном осмотре: {tone.state === "physiological" ? "физиологический гипертонус" : tone.state === "dystonia" ? "дистония" : tone.state === "spastic" ? "спастичность" : "ригидность"}
            </Typography>
          )}
        </Block>

        {showQuickFontanelle && (
          <Block>
            <BlockTitle title="Родничок" level={fontanelleLevelOf(form.head?.fontanelle ?? null)} />
            <FontanelleFields head={form.head} onChange={(next) => patch({ head: next })} levelOf={fontanelleLevelOf} birthDate={ages.birthDate} at={at} />
          </Block>
        )}

        <Block>
          <BlockTitle title="Тревожные признаки" level={form.redFlags.length ? (form.redFlags.some((flag) => RED_FLAGS.find((item) => item.value === flag)?.urgent) ? "urgent" : "bad") : "unknown"} note="по умолчанию — нет" />
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, columnGap: 1.5 }}>
            {RED_FLAGS.map((flag) => (
              <FormControlLabel
                key={flag.value}
                sx={{ m: 0, alignItems: "flex-start" }}
                control={
                  <Checkbox
                    size="small"
                    color="error"
                    checked={form.redFlags.includes(flag.value)}
                    onChange={() => patch({ redFlags: toggleIn(form.redFlags, flag.value) })}
                    sx={{ py: 0.5 }}
                  />
                }
                label={
                  <Typography variant="body2" sx={{ pt: 0.6 }}>
                    {gendered(flag.label, sex)}
                    {flag.urgent && (
                      <Typography component="span" variant="caption" color="error.main" fontWeight={700}>
                        {" "}
                        · срочно
                      </Typography>
                    )}
                  </Typography>
                }
              />
            ))}
          </Box>
        </Block>

        <Section title="Заключение">
          <ChipGroup
            options={conclusionChips}
            selected={form.conclusions}
            tone={(value) => (value === HEALTHY ? "success" : "primary")}
            onToggle={(value) => patch({ conclusions: toggleExclusive(form.conclusions, value, HEALTHY) })}
          />
          <Autocomplete
            sx={{ mt: 1 }}
            size="small"
            options={DIAGNOSES.filter((def) => !form.conclusions.includes(def.value))}
            groupBy={groupLabel}
            getOptionLabel={(def) => `${gendered(def.label, sex)} · ${def.icd}`}
            value={null}
            blurOnSelect
            clearOnBlur
            onChange={(_event, def) => {
              if (def) patch({ conclusions: toggleExclusive(form.conclusions, def.value, HEALTHY) });
            }}
            renderInput={(params) => <TextField {...params} label="Найти в каталоге (МКБ-10)" />}
          />
          {warnings.map((text) => (
            <Typography key={text} variant="caption" color="warning.main" display="block" sx={{ mt: 0.5 }}>
              {text}
            </Typography>
          ))}
          <TextField
            size="small"
            label="Своё заключение"
            value={form.conclusionNote}
            onChange={(event) => patch({ conclusionNote: event.target.value })}
            fullWidth
            multiline
            sx={{ mt: 1 }}
          />
        </Section>
        {suggestions.length > 0 && (
          <Box sx={(theme) => ({ px: 1.5, py: 1, borderRadius: "12px", bgcolor: alpha(theme.palette.primary.main, 0.06) })}>
            <Typography variant="body2" fontWeight={600}>
              Добавить в диагнозы
            </Typography>
            {suggestions.map((code) => (
              <FormControlLabel
                key={code}
                sx={{ display: "flex", m: 0 }}
                control={
                  <Checkbox
                    size="small"
                    checked={!skipDiagnoses.includes(code)}
                    onChange={(event) => setSkipDiagnoses((current) => (event.target.checked ? current.filter((item) => item !== code) : [...current, code]))}
                  />
                }
                label={<Typography variant="body2">{gendered(diagnosisDef(code)?.label ?? code, sex)}</Typography>}
              />
            ))}
          </Box>
        )}

        <Section title="Рекомендации — нажатие добавляет фразу">
          <Stack gap={1}>
            {RECOMMENDATION_GROUPS.map((group) => {
              const items = RECOMMENDATIONS.filter((item) => item.group === group.value && (item.value !== "nsg" || !fontanelleClosed || form.recommendationCodes.includes("nsg")));
              return (
                <Box key={group.value}>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                    {group.label}
                  </Typography>
                  <Stack direction="row" flexWrap="wrap" gap={0.75}>
                    {items.map((item) => {
                      const active = form.recommendationCodes.includes(item.value);
                      const hint = hints.get(item.value);
                      const chip = (
                        <Chip
                          key={item.value}
                          size="small"
                          clickable
                          label={item.label}
                          icon={hint && !active ? <TipsAndUpdatesOutlined /> : undefined}
                          color={active ? (item.group === "urgent" ? "error" : "primary") : hint ? "warning" : "default"}
                          variant={active ? "filled" : "outlined"}
                          onClick={() => patch({ recommendationCodes: toggleIn(form.recommendationCodes, item.value) })}
                          aria-pressed={active}
                          sx={{ height: 30, borderRadius: "8px", fontWeight: active ? 600 : 400, borderWidth: hint && !active ? 1.5 : undefined }}
                        />
                      );
                      return hint ? (
                        <Tooltip key={item.value} title={`Подсказка: ${hint}`}>
                          {chip}
                        </Tooltip>
                      ) : (
                        chip
                      );
                    })}
                  </Stack>
                </Box>
              );
            })}
            {hints.size > 0 && (
              <Typography variant="caption" color="text.secondary">
                Подсвечены подсказки по находкам осмотра — сами не выбираются.
              </Typography>
            )}
            <TextField
              size="small"
              label="Своя рекомендация (препараты — только здесь, текстом)"
              value={form.recommendationNote}
              onChange={(event) => patch({ recommendationNote: event.target.value })}
              fullWidth
              multiline
            />
          </Stack>
        </Section>

        {!editing && (
          <Section title="Следующий осмотр">
            <ChipGroup
              options={NEXT_CHECK}
              selected={!form.nextCheckByOrder && form.nextCheckMonths ? [form.nextCheckMonths] : []}
              onToggle={(months) => patch({ nextCheckMonths: form.nextCheckMonths === months && !form.nextCheckByOrder ? null : months, nextCheckByOrder: false })}
            >
              <Chip
                label="к сроку по 211н"
                size="small"
                clickable
                disabled={!nextOrder}
                color={form.nextCheckByOrder ? "primary" : "default"}
                variant={form.nextCheckByOrder ? "filled" : "outlined"}
                aria-pressed={form.nextCheckByOrder}
                onClick={() => patch({ nextCheckByOrder: !form.nextCheckByOrder, nextCheckMonths: null })}
                sx={{ height: 30, borderRadius: "8px", fontWeight: form.nextCheckByOrder ? 600 : 400 }}
              />
            </ChipGroup>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              {plannedAt
                ? `Плановый осмотр — ${plannedAt.format("DD.MM.YYYY")}, попадёт в «Ближайшие события»`
                : nextOrder
                  ? `По 211н следующий осмотр невролога — ${orderAgeText(nextOrder.months)} (${dayjs(nextOrder.date).format("DD.MM.YYYY")})`
                  : ages.birthDate
                    ? "По 211н сроков осмотра невролога больше нет"
                    : "Нет даты рождения — срок по 211н не посчитать"}
            </Typography>
          </Section>
        )}

        <Button
          onClick={() => setFullOpen((value) => !value)}
          endIcon={<ExpandMoreOutlined sx={{ transform: fullOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }} />}
          sx={{ alignSelf: "flex-start", textTransform: "none", px: 0 }}
        >
          Полный осмотр невролога
        </Button>
        {/* В прокручиваемой колонке flex-элемент с overflow: hidden сжимается — запрещаем. */}
        <Collapse in={fullOpen} unmountOnExit sx={{ flexShrink: 0 }}>
          <NeuroFullExam {...fullProps} />
        </Collapse>

        <TextField size="small" label="Заметка" value={form.notes} onChange={(event) => patch({ notes: event.target.value })} multiline minRows={2} fullWidth />
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
