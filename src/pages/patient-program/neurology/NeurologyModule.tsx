import React from "react";
import { Alert, Box, Stack, Typography } from "@mui/material";
import ChecklistOutlined from "@mui/icons-material/ChecklistOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import PsychologyOutlined from "@mui/icons-material/PsychologyOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { getGrowth } from "../../../api/health";
import { getProgramModuleRecords, type EffectiveProgramModule, type ProgramModuleRecord } from "../../../api/programs";
import { DJANGO_DETAIL_STALE_TIME_MS, djangoQueryKeys } from "../../../api/queryKeys";
import { orgWide } from "../../../api/scope";
import { AppButton, AppCard, ListEmptyState, SegmentedTabs } from "../../../components/ui";
import type { ActiveScope } from "../../../hooks/useActiveScope";
import { assessMeasurement, readGrowth } from "../growth/growthData";
import { NextCheckLine } from "../vision/VisionLatest";
import { MilestoneRibbonCard } from "./MilestoneRibbon";
import { MarkSources, MilestoneSpheres, type MarkSourceRow } from "./MilestoneSpheres";
import { MilestonesDrawer } from "./MilestonesDrawer";
import { NeuroBanner } from "./NeuroBanner";
import { sexOf, type ExamType } from "./neuroCatalog";
import { classifyNeuroRecords, isDone, markSources, reflexExams } from "./neuroData";
import { NeuroDiagnoses } from "./NeuroDiagnoses";
import { NeuroDiagnosisDrawer } from "./NeuroDiagnosisDrawer";
import { NeuroExamDrawer } from "./NeuroExamDrawer";
import { NeuroHistory } from "./NeuroHistory";
import { WHO_MILESTONES, buildPicture, evaluateMilestones, lateMilestones, lateText } from "./neuroMilestones";
import { ageText, neuroAge, nextOrderCheck, orderAgeText, type AgeContext } from "./neuroNorms";
import { buildBanner, collectSignals, headInfo, summaryChips, type HeadMeasure } from "./neuroSignals";
import { NeuroSummary } from "./NeuroSummary";
import { ReflexMapCard } from "./ReflexMap";

export interface NeurologyModuleProps {
  enrollmentId: number;
  module: EffectiveProgramModule;
  scope: ActiveScope;
  /** Добавлять и править записи — `enrollments.manage` при действующем подключении. */
  canManage: boolean;
  icon: React.ReactNode;
  birthDate: string | null;
  patientId: number;
  /** Пол из карточки пациента — пока нет данных медкарты. */
  gender: string | null;
  /** Право `medical.health.view`: окружность головы и срок гестации из «Роста». */
  canViewHealth: boolean;
  /** Открыть раздел «Рост» — «Внести замер». */
  onOpenGrowth?: () => void;
}

type Tab = "development" | "exams" | "reflexes" | "diagnoses";

interface ExamDrawerState {
  open: boolean;
  record: ProgramModuleRecord | null;
  type: ExamType;
}

const CLOSED_EXAM: ExamDrawerState = { open: false, record: null, type: "neurologist" };
const CLOSED = { open: false, record: null as ProgramModuleRecord | null };

/**
 * Раздел «Неврология и развитие» (ТЗ §4): шапка, баннер тревожных признаков,
 * вкладки «Развитие», «Осмотры», «Рефлексы», «Диагнозы»; окна осмотра,
 * отметки вех и диагноза.
 */
export const NeurologyModule: React.FC<NeurologyModuleProps> = ({
  enrollmentId,
  module,
  scope,
  canManage,
  icon,
  birthDate: patientBirthDate,
  patientId,
  gender,
  canViewHealth,
  onOpenGrowth,
}) => {
  const queryClient = useQueryClient();
  const queryKey = djangoQueryKeys.programs.records(enrollmentId, module.id, scope);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getProgramModuleRecords(scope, enrollmentId, module.id, signal),
    enabled: scope.isReady && scope.orgReady,
  });
  // Тот же запрос и ключ, что у «Роста»: второй раз не грузится.
  const growth = useQuery({
    queryKey: djangoQueryKeys.health.growth(patientId, scope.organizationId),
    queryFn: ({ signal }) => getGrowth(orgWide(scope.organizationId), patientId, signal),
    enabled: canViewHealth && scope.isReady && scope.orgReady,
    staleTime: DJANGO_DETAIL_STALE_TIME_MS,
  });
  const [tab, setTab] = React.useState<Tab>("development");
  const [exam, setExam] = React.useState<ExamDrawerState>(CLOSED_EXAM);
  const [milestones, setMilestones] = React.useState(CLOSED);
  const [diagnosis, setDiagnosis] = React.useState(CLOSED);

  const growthData = canViewHealth ? growth.data : undefined;
  const birthDate = patientBirthDate ?? growthData?.birthDate ?? null;
  const weeks = growthData?.gestationalAgeWeeks ?? null;
  const days = growthData?.gestationalAgeDays ?? null;
  const sex = sexOf(growthData?.sex ?? gender);
  const ages: AgeContext = React.useMemo(() => ({ birthDate, gestation: weeks == null ? null : { weeks, days } }), [birthDate, weeks, days]);
  const today = dayjs().format("YYYY-MM-DD");

  const records = React.useMemo(() => classifyNeuroRecords(query.data?.results ?? []), [query.data]);
  const done = React.useMemo(() => records.exams.filter((item) => isDone(item.record)), [records]);
  const sources = React.useMemo(() => markSources(records), [records]);
  const views = React.useMemo(() => evaluateMilestones(buildPicture(sources), ages, today), [sources, ages, today]);
  const head = React.useMemo(() => {
    if (!growthData) return null;
    const list = readGrowth(growthData).filter((item) => item.headCm != null);
    const measure = (index: number): HeadMeasure | null => {
      const item = list[index];
      if (!item || item.headCm == null) return null;
      return { at: item.at, cm: item.headCm, z: assessMeasurement(item, "headCm", sex)?.z ?? null };
    };
    return headInfo(measure(0), measure(1));
  }, [growthData, sex]);
  const input = { views, exams: records.exams, ages, today, sex, head };
  const banner = buildBanner(collectSignals(input));
  const chips = summaryChips(input);
  const age = neuroAge(ages, today);
  const latest = done[0] ?? null;
  const planned = records.planned[0] ?? null;
  const late = lateMilestones(views);
  const order = nextOrderCheck(birthDate, dayjs(today).subtract(1, "day").format("YYYY-MM-DD"), {
    questionnairePositive: latest?.questionnaire === "positive",
  });
  const orderHint = order ? `По 211н следующий осмотр невролога — ${orderAgeText(order.months)} (${dayjs(order.date).format("DD.MM.YYYY")})` : "";
  const markRows: MarkSourceRow[] = React.useMemo(
    () =>
      [
        ...done.filter((item) => Object.keys(item.milestones).length).map((item) => ({ record: item.record, marks: item.milestones, exam: true })),
        ...records.milestoneRecords.filter((item) => isDone(item.record)).map((item) => ({ record: item.record, marks: item.marks, exam: false })),
      ].sort((a, b) => dayjs(b.record.occurredAt).valueOf() - dayjs(a.record.occurredAt).valueOf()),
    [done, records.milestoneRecords],
  );
  const lastMarks = markRows[0] ?? null;
  const hasWhoMarks = WHO_MILESTONES.some((def) => views.get(def.code)?.entry);
  const showRibbon = age.months != null && (age.months <= 36 || hasWhoMarks);
  const showReflexes = reflexExams(done).length > 0 || (age.months != null && age.months < 18);
  const empty = !records.exams.length && !records.milestoneRecords.length && !records.diagnoses.length && !records.planned.length;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.programs.upcoming(enrollmentId, scope) });
  };
  const openExam = (record: ProgramModuleRecord | null, type: ExamType = "neurologist") => setExam({ open: true, record, type });
  const openMilestones = (record: ProgramModuleRecord | null = null) => setMilestones({ open: true, record });

  const subheader = [
    latest ? `${latest.record.title} ${dayjs(latest.record.occurredAt).format("DD.MM.YYYY")}` : "",
    lastMarks && lastMarks.record.id !== latest?.record.id ? `вехи отмечены ${dayjs(lastMarks.record.occurredAt).format("DD.MM.YYYY")}` : "",
    age.passport != null ? `${ageText(age.passport)}${age.corrected ? (age.months != null ? ` (скорр. ${ageText(age.months)})` : " (до срока доношенности)") : ""}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const notices = [
    !birthDate ? "Нет даты рождения — нормы по возрасту не считаются" : "",
    !canViewHealth ? "Нет доступа к медкарте — возраст без поправки на срок рождения" : "",
  ].filter(Boolean);

  const activeDiagnoses = records.diagnoses.filter((item) => item.state !== "resolved").length;
  const tabs = [
    { key: "development" as const, label: "Развитие" },
    { key: "exams" as const, label: "Осмотры", badge: records.exams.length },
    ...(showReflexes ? [{ key: "reflexes" as const, label: "Рефлексы" }] : []),
    { key: "diagnoses" as const, label: "Диагнозы", badge: activeDiagnoses || undefined },
  ];
  const current: Tab = tabs.some((item) => item.key === tab) ? tab : "development";

  const nextLine = planned ? (
    <NextCheckLine planned={planned} canManage={canManage} onConduct={(record) => openExam(record)} until hint={orderHint || undefined} />
  ) : orderHint ? (
    <Stack direction="row" gap={1} alignItems="center" sx={{ color: "text.secondary" }}>
      <EventOutlined fontSize="small" />
      <Typography variant="body2">{orderHint}</Typography>
    </Stack>
  ) : null;

  return (
    <>
      <AppCard
        variant="outlined"
        header={
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} gap={1.5} sx={{ px: 2, pt: 2 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" fontWeight={700}>
                {module.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {subheader || "Вехи развития, осмотр невролога, рефлексы и диагнозы"}
              </Typography>
              {notices.map((text) => (
                <Typography key={text} variant="caption" color="text.secondary" display="block">
                  {text}
                </Typography>
              ))}
            </Box>
            {canManage && !empty && (
              <Stack direction="row" gap={1} flexWrap="wrap" sx={{ flexShrink: 0 }}>
                <AppButton variant="outlined" size="small" startIcon={<ChecklistOutlined />} onClick={() => openMilestones()}>
                  Отметить вехи
                </AppButton>
                <AppButton variant="contained" size="small" startIcon={<PsychologyOutlined />} onClick={() => openExam(null)}>
                  Осмотр невролога
                </AppButton>
              </Stack>
            )}
          </Stack>
        }
      >
        {query.error ? (
          <Alert severity="error">Не удалось загрузить раздел.</Alert>
        ) : query.isLoading ? (
          <Typography variant="body2" color="text.secondary">
            Загрузка…
          </Typography>
        ) : empty ? (
          <ListEmptyState
            icon={icon}
            title="Отметьте вехи или проведите первый осмотр"
            description="Лента развития строится по нормам ВОЗ, осмотр невролога заполняется кнопками."
            action={
              canManage ? (
                <Stack direction="row" gap={1} flexWrap="wrap" justifyContent="center">
                  <AppButton variant="outlined" startIcon={<ChecklistOutlined />} onClick={() => openMilestones()}>
                    Отметить вехи
                  </AppButton>
                  <AppButton variant="contained" startIcon={<PsychologyOutlined />} onClick={() => openExam(null)}>
                    Осмотр невролога
                  </AppButton>
                </Stack>
              ) : undefined
            }
          />
        ) : (
          <Stack gap={2}>
            {banner && <NeuroBanner banner={banner} canManage={canManage} onMarkMilestones={() => openMilestones()} />}
            <SegmentedTabs<Tab> tabs={tabs} value={current} onChange={setTab} layoutId={`neuro-tabs-${module.id}`} />
            {current === "development" && (
              <Stack gap={2.5}>
                <NeuroSummary chips={chips} />
                {nextLine}
                {showRibbon && age.months != null && (
                  <Box>
                    <MilestoneRibbonCard views={views} todayAge={age.months} corrected={age.corrected} birthDate={birthDate} sex={sex} />
                  </Box>
                )}
                {late.length > 0 && (
                  <Typography variant="body2">
                    <b>Освоено позже обычного:</b> {late.map((view) => lateText(view, birthDate, sex)).join("; ")}
                  </Typography>
                )}
                <MilestoneSpheres views={views} todayAge={age.months} birthDate={birthDate} sex={sex} />
                <MarkSources
                  rows={markRows}
                  birthDate={birthDate}
                  sex={sex}
                  canManage={canManage}
                  onEdit={(row) => (row.exam ? openExam(row.record) : openMilestones(row.record))}
                />
              </Stack>
            )}
            {current === "exams" && (
              <Stack gap={1.5}>
                {planned && <NextCheckLine planned={planned} canManage={canManage} onConduct={(record) => openExam(record)} until />}
                <NeuroHistory exams={records.exams} ages={ages} sex={sex} canManage={canManage} onEdit={(record) => openExam(record)} />
              </Stack>
            )}
            {current === "reflexes" && <ReflexMapCard exams={done} ages={ages} />}
            {current === "diagnoses" && (
              <NeuroDiagnoses
                diagnoses={records.diagnoses}
                canManage={canManage}
                onAdd={() => setDiagnosis({ open: true, record: null })}
                onEdit={(record) => setDiagnosis({ open: true, record })}
              />
            )}
          </Stack>
        )}
      </AppCard>
      <NeuroExamDrawer
        open={exam.open}
        enrollmentId={enrollmentId}
        module={module}
        scope={scope}
        record={exam.record}
        initialType={exam.type}
        records={records}
        ages={ages}
        sex={sex}
        head={head}
        canViewHealth={canViewHealth}
        onOpenGrowth={
          onOpenGrowth
            ? () => {
                setExam(CLOSED_EXAM);
                onOpenGrowth();
              }
            : undefined
        }
        onClose={() => setExam(CLOSED_EXAM)}
        onSaved={refresh}
      />
      <MilestonesDrawer
        open={milestones.open}
        enrollmentId={enrollmentId}
        module={module}
        scope={scope}
        record={milestones.record}
        records={records}
        ages={ages}
        sex={sex}
        onClose={() => setMilestones(CLOSED)}
        onSaved={refresh}
      />
      <NeuroDiagnosisDrawer
        open={diagnosis.open}
        enrollmentId={enrollmentId}
        module={module}
        scope={scope}
        record={diagnosis.record}
        sex={sex}
        onClose={() => setDiagnosis(CLOSED)}
        onSaved={refresh}
      />
    </>
  );
};
