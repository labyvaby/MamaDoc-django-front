import React from "react";
import { Alert, Box, Stack, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { getProgramModuleRecords, type EffectiveProgramModule, type ProgramModuleRecord } from "../../../api/programs";
import { djangoQueryKeys } from "../../../api/queryKeys";
import { AppButton, AppCard, ListEmptyState } from "../../../components/ui";
import type { ActiveScope } from "../../../hooks/useActiveScope";
import { VisionDiagnoses } from "./VisionDiagnoses";
import { VisionDiagnosisDrawer } from "./VisionDiagnosisDrawer";
import { VisionExamDrawer } from "./VisionExamDrawer";
import { VisionHistory } from "./VisionHistory";
import { NextCheckLine, VisionLatest } from "./VisionLatest";
import { VisionTrendChart } from "./VisionTrendChart";
import { classifyVisionRecords } from "./visionData";
import { ageInMonths, ageLabel } from "./visionNorms";
import { trendPoints, visionSignals } from "./visionSignals";

interface VisionModuleProps {
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
}

const CLOSED: DrawerState = { open: false, record: null };

/**
 * Раздел «Зрение» (ТЗ «Зрение» §4): хронические диагнозы, последний осмотр
 * двумя глазами с цветом нормы, сигналы, динамика и история.
 */
export const VisionModule: React.FC<VisionModuleProps> = ({ enrollmentId, module, scope, canManage, icon, birthDate }) => {
  const queryClient = useQueryClient();
  const queryKey = djangoQueryKeys.programs.records(enrollmentId, module.id, scope);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getProgramModuleRecords(scope, enrollmentId, module.id, signal),
    enabled: scope.isReady && scope.orgReady,
  });
  const [exam, setExam] = React.useState<DrawerState>(CLOSED);
  const [diagnosis, setDiagnosis] = React.useState<DrawerState>(CLOSED);

  const records = React.useMemo(() => classifyVisionRecords(query.data?.results ?? []), [query.data]);
  const done = React.useMemo(() => records.exams.filter((item) => item.record.status !== "missed"), [records]);
  const signals = React.useMemo(() => visionSignals(done), [done]);
  const points = React.useMemo(() => trendPoints(done, birthDate), [done, birthDate]);
  const latest = done[0] ?? null;
  const nextPlanned = records.planned[0] ?? null;
  const empty = !records.exams.length && !records.diagnoses.length && !records.planned.length;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.programs.upcoming(enrollmentId, scope) });
  };
  const openExam = (record: ProgramModuleRecord | null) => setExam({ open: true, record });
  const openDiagnosis = (record: ProgramModuleRecord | null) => setDiagnosis({ open: true, record });

  const subheader = latest
    ? [
        "Последний осмотр",
        dayjs(latest.record.occurredAt).format("DD.MM.YYYY"),
        ageLabel(ageInMonths(birthDate, latest.record.occurredAt)),
        latest.record.createdByName ?? "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "Острота зрения, диагнозы и динамика";

  return (
    <>
      <AppCard
        variant="outlined"
        header={
          // Своя шапка: на телефоне кнопки уходят под заголовок, а не сжимают его.
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            alignItems={{ md: "center" }}
            gap={1.5}
            sx={{ px: 2, pt: 2 }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" fontWeight={700}>
                {module.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {subheader}
              </Typography>
            </Box>
            {canManage && (
              <Stack direction="row" gap={1} flexWrap="wrap" sx={{ flexShrink: 0 }}>
                <AppButton variant="outlined" size="small" startIcon={<AddOutlined />} onClick={() => openDiagnosis(null)}>
                  Диагноз
                </AppButton>
                <AppButton variant="contained" size="small" startIcon={<VisibilityOutlined />} onClick={() => openExam(null)}>
                  Осмотр зрения
                </AppButton>
              </Stack>
            )}
          </Stack>
        }
      >
        {query.error ? (
          <Alert severity="error">Не удалось загрузить раздел «Зрение».</Alert>
        ) : query.isLoading ? (
          <Typography variant="body2" color="text.secondary">
            Загрузка…
          </Typography>
        ) : empty ? (
          <ListEmptyState
            icon={icon}
            title="Осмотров пока нет"
            description="Острота глаз, заключение и рекомендации заполняются кнопками."
            action={
              canManage ? (
                <AppButton variant="outlined" startIcon={<VisibilityOutlined />} onClick={() => openExam(null)}>
                  Провести осмотр
                </AppButton>
              ) : undefined
            }
          />
        ) : (
          <Stack gap={2.5}>
            {records.diagnoses.length > 0 && (
              <VisionDiagnoses diagnoses={records.diagnoses} signals={signals} canManage={canManage} onEdit={openDiagnosis} />
            )}
            {latest ? (
              <VisionLatest
                latest={latest}
                previous={done.slice(1)}
                birthDate={birthDate}
                signals={signals}
                nextPlanned={nextPlanned}
                canManage={canManage}
                onConduct={openExam}
              />
            ) : (
              nextPlanned && <NextCheckLine planned={nextPlanned} canManage={canManage} onConduct={openExam} />
            )}
            {points.length >= 2 && <VisionTrendChart points={points} />}
            {records.exams.length > 0 && (
              <VisionHistory exams={records.exams} birthDate={birthDate} canManage={canManage} onEdit={openExam} />
            )}
          </Stack>
        )}
      </AppCard>
      <VisionExamDrawer
        open={exam.open}
        enrollmentId={enrollmentId}
        module={module}
        scope={scope}
        birthDate={birthDate}
        record={exam.record}
        diagnoses={records.diagnoses}
        knownEyeColor={records.exams.find((item) => item.eyeColor)?.eyeColor ?? null}
        onClose={() => setExam(CLOSED)}
        onSaved={refresh}
      />
      <VisionDiagnosisDrawer
        open={diagnosis.open}
        enrollmentId={enrollmentId}
        module={module}
        scope={scope}
        record={diagnosis.record}
        onClose={() => setDiagnosis(CLOSED)}
        onSaved={refresh}
      />
    </>
  );
};
