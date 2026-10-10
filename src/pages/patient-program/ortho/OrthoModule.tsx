import React from "react";
import { Alert, Box, Stack, Typography } from "@mui/material";
import AccessibilityNewOutlined from "@mui/icons-material/AccessibilityNewOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import FactCheckOutlined from "@mui/icons-material/FactCheckOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { getProgramModuleRecords, type EffectiveProgramModule, type ProgramModuleRecord } from "../../../api/programs";
import { djangoQueryKeys } from "../../../api/queryKeys";
import { AppButton, AppCard, ListEmptyState } from "../../../components/ui";
import type { ActiveScope } from "../../../hooks/useActiveScope";
import { NextCheckLine } from "../vision/VisionLatest";
import type { ExamType } from "./orthoCatalog";
import { classifyOrthoRecords, conductedByToday } from "./orthoData";
import { OrthoDiagnoses } from "./OrthoDiagnoses";
import { OrthoDiagnosisDrawer } from "./OrthoDiagnosisDrawer";
import { OrthoExamDrawer } from "./OrthoExamDrawer";
import { OrthoHistory } from "./OrthoHistory";
import { OrthoLatest } from "./OrthoLatest";
import { ageMonths, ageText } from "./orthoNorms";
import { scheduleRows } from "./orthoSchedule";
import { OrthoScheduleStrip } from "./OrthoScheduleStrip";
import { OrthoTrendChart } from "./OrthoTrendChart";
import { orthoTrend } from "./orthoTrend";

interface OrthoModuleProps {
  enrollmentId: number;
  module: EffectiveProgramModule;
  scope: ActiveScope;
  canManage: boolean;
  icon: React.ReactNode;
  birthDate: string | null;
}

interface DrawerState {
  open: boolean;
  record: ProgramModuleRecord | null;
  type: ExamType;
}

const CLOSED: DrawerState = { open: false, record: null, type: "orthopedist" };

/**
 * Раздел «Опорно-двигательная система» (ТЗ §4): хронические диагнозы,
 * последний осмотр с рисунками по цифрам, сроки по 211н, динамика, история.
 */
export const OrthoModule: React.FC<OrthoModuleProps> = ({ enrollmentId, module, scope, canManage, icon, birthDate }) => {
  const queryClient = useQueryClient();
  const queryKey = djangoQueryKeys.programs.records(enrollmentId, module.id, scope);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getProgramModuleRecords(scope, enrollmentId, module.id, signal),
    enabled: scope.isReady && scope.orgReady,
  });
  const [exam, setExam] = React.useState<DrawerState>(CLOSED);
  const [diagnosis, setDiagnosis] = React.useState<{ open: boolean; record: ProgramModuleRecord | null }>({ open: false, record: null });

  const records = React.useMemo(() => classifyOrthoRecords(query.data?.results ?? []), [query.data]);
  // запись с датой в будущем — ошибка ввода: в истории она есть, последним осмотром не считается
  const done = React.useMemo(() => conductedByToday(records.exams.filter((item) => item.record.status !== "missed")), [records]);
  const trend = React.useMemo(() => orthoTrend(done), [done]);
  const schedule = React.useMemo(
    () => scheduleRows(done.map((item) => item.record.occurredAt), birthDate),
    [done, birthDate],
  );
  const latest = done[0] ?? null;
  const nextPlanned = records.planned[0] ?? null;
  const empty = !records.exams.length && !records.diagnoses.length && !records.planned.length;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.programs.upcoming(enrollmentId, scope) });
  };
  const openExam = (record: ProgramModuleRecord | null, type: ExamType = "orthopedist") => setExam({ open: true, record, type });

  const subheader = latest
    ? [
        "Последний осмотр",
        dayjs(latest.record.occurredAt).format("DD.MM.YYYY"),
        ageText(ageMonths(birthDate, latest.record.occurredAt)),
        latest.record.createdByName ?? "",
        nextPlanned ? `следующий ${dayjs(nextPlanned.occurredAt).format("DD.MM.YYYY")}` : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "Стопы, ноги, суставы, спина и осанка";

  return (
    <>
      <AppCard
        variant="outlined"
        header={
          <Stack direction="row" flexWrap="wrap" justifyContent="space-between" alignItems="center" columnGap={1.5} rowGap={1.25} sx={{ px: 2, pt: 2 }}>
            {/* кнопкам не хватает места рядом с названием — уходят под него, название в одну строку */}
            <Box sx={{ minWidth: 0, flex: "1 1 340px" }}>
              <Typography variant="h6" fontWeight={700}>
                {module.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {subheader}
              </Typography>
            </Box>
            {canManage && (
              <Stack direction="row" gap={1} flexWrap="wrap">
                <AppButton variant="outlined" size="small" startIcon={<AddOutlined />} onClick={() => setDiagnosis({ open: true, record: null })}>
                  Диагноз
                </AppButton>
                <AppButton variant="outlined" size="small" startIcon={<FactCheckOutlined />} onClick={() => openExam(null, "screening")}>
                  Скрининг педиатра
                </AppButton>
                <AppButton variant="contained" size="small" startIcon={<AccessibilityNewOutlined />} onClick={() => openExam(null, "orthopedist")}>
                  Осмотр ортопеда
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
            title="Осмотров пока нет"
            description="Суставы, стопы, ноги, спина и осанка заполняются кнопками; рисунки строятся по цифрам осмотра."
            action={
              canManage ? (
                <AppButton variant="outlined" startIcon={<AccessibilityNewOutlined />} onClick={() => openExam(null)}>
                  Провести осмотр
                </AppButton>
              ) : undefined
            }
          />
        ) : (
          <Stack gap={2.5}>
            {records.diagnoses.length > 0 && (
              <OrthoDiagnoses diagnoses={records.diagnoses} canManage={canManage} onEdit={(record) => setDiagnosis({ open: true, record })} />
            )}
            {latest ? (
              <OrthoLatest
                exams={done}
                birthDate={birthDate}
                nextPlanned={nextPlanned}
                canManage={canManage}
                onConduct={(record) => openExam(record, "control")}
              />
            ) : (
              nextPlanned && <NextCheckLine planned={nextPlanned} canManage={canManage} onConduct={(record) => openExam(record, "control")} />
            )}
            {birthDate && <OrthoScheduleStrip rows={schedule} />}
            <OrthoTrendChart trend={trend} />
            {records.exams.length > 0 && (
              <OrthoHistory exams={records.exams} birthDate={birthDate} canManage={canManage} onEdit={(record) => openExam(record)} />
            )}
          </Stack>
        )}
      </AppCard>
      <OrthoExamDrawer
        open={exam.open}
        enrollmentId={enrollmentId}
        module={module}
        scope={scope}
        birthDate={birthDate}
        record={exam.record}
        initialType={exam.type}
        diagnoses={records.diagnoses}
        onClose={() => setExam(CLOSED)}
        onSaved={refresh}
      />
      <OrthoDiagnosisDrawer
        open={diagnosis.open}
        enrollmentId={enrollmentId}
        module={module}
        scope={scope}
        record={diagnosis.record}
        onClose={() => setDiagnosis({ open: false, record: null })}
        onSaved={refresh}
      />
    </>
  );
};
