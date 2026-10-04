import React from "react";
import { Alert, Box, ButtonBase, Stack, Typography } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import HistoryEduOutlined from "@mui/icons-material/HistoryEduOutlined";
import LocalHospitalOutlined from "@mui/icons-material/LocalHospitalOutlined";
import { useMutation, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useSnackbar } from "notistack";

import {
  createChildhoodInfection,
  getConditions,
  updateChildhoodInfection,
  type Condition,
  type ConditionInput,
  type Hospitalization,
  type HospitalizationInput,
  type IllnessEpisode,
  type IllnessHistory,
  type IllnessVisit,
  type InfectionSummary,
} from "../../api/health";
import type { PatientGender } from "../../api/patients";
import { DJANGO_LIST_STALE_TIME_MS, djangoQueryKeys } from "../../api/queryKeys";
import { usePermissions } from "../../hooks/usePermissions";
import { subtleBorder } from "../../theme/uiHelpers";
import { AppButton, AppCard, ListEmptyState, ListLoadingSkeleton, SegmentedTabs } from "../ui";
import { ChildhoodInfectionDrawer } from "./ChildhoodInfectionDrawer";
import { ChildhoodInfectionsGrid } from "./ChildhoodInfectionsGrid";
import { ChronicConditions } from "./ChronicConditions";
import { ConditionDrawer } from "./ConditionDrawer";
import { AttachmentStrip } from "./HealthFilesField";
import { healthErrorText } from "./healthForms";
import { HealthHeaderButton } from "./HealthHeaderButton";
import { HospitalizationDrawer } from "./HospitalizationDrawer";
import {
  byGender,
  groupRibbonByYear,
  illnessTabCounts,
  notHadQuickPayload,
  ribbonItems,
  sourcesLine,
  stayDocsCaption,
  stayPeriod,
  type IllnessTab,
  type InfectionDrawerMode,
} from "./illnessData";
import { IllnessRibbon, Tag, type RibbonHandlers } from "./IllnessRibbon";
import { IllnessSummaryPanel } from "./IllnessSummaryPanel";
import { cardContainerSx, whenCardWide } from "./illnessUi";
import { useHealthScope, useIllnessHistory, useInvalidateHealth } from "./useHealth";

/** Госпитализация во вкладке «Госпитализации»: даты, стационар, диагноз, документы. */
const StayCard: React.FC<{ row: Hospitalization; canManage: boolean; onOpen: (row: Hospitalization) => void }> = ({ row, canManage, onOpen }) => {
  const attachments = row.attachments ?? [];
  const body = (
    <Stack direction="row" gap={1.25} alignItems="flex-start" sx={{ width: "100%", textAlign: "left" }}>
      <LocalHospitalOutlined fontSize="small" color="error" sx={{ mt: 0.25 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" gap={0.75} alignItems="baseline" flexWrap="wrap">
          <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
            {stayPeriod(row)}
          </Typography>
          <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: "anywhere" }}>
            {row.facility}
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ overflowWrap: "anywhere" }}>
          {[row.conditionTitle ?? row.diagnosisTitle, row.notes].filter(Boolean).join(" · ") || "Диагноз не указан"}
        </Typography>
      </Box>
      {!row.dischargedOn && <Tag tone="error">в стационаре</Tag>}
    </Stack>
  );
  return (
    <Box sx={(theme) => ({ p: 1.5, borderRadius: "12px", border: `1px solid ${subtleBorder(theme)}` })}>
      {canManage ? (
        <ButtonBase onClick={() => onOpen(row)} sx={{ display: "block", width: "100%", borderRadius: "8px" }}>
          {body}
        </ButtonBase>
      ) : (
        body
      )}
      <AttachmentStrip attachments={attachments} caption={stayDocsCaption(attachments)} indent />
    </Box>
  );
};

/** Первое заключение случая — источник для «Хронического». */
function firstConclusionId(episode: IllnessEpisode): number | null {
  const visits = [...episode.visits].sort((a, b) => a.on.localeCompare(b.on));
  return visits.find((visit) => visit.conclusionId != null)?.conclusionId ?? null;
}

interface ConditionDrawerState {
  open: boolean;
  condition: Condition | null;
  initial?: Partial<ConditionInput>;
}

interface StayDrawerState {
  open: boolean;
  row: Hospitalization | null;
  initial?: Partial<HospitalizationInput>;
}

interface IllnessHistorySectionProps {
  patientId: number;
  canManage: boolean;
  /** Название раздела книжки; в карточке пациента — «История болезней». */
  title?: string;
  /** Пол — для «болела / болел / болел(а)». */
  gender?: PatientGender | null;
  /** Для печати архивного заключения. */
  patientName?: string | null;
}

const NO_CONDITIONS: Condition[] = [];

// Карточка заключения тянет генератор PDF (~1 МБ) — грузим её только по кнопке «Заключение».
const IllnessConclusionDrawer = React.lazy(() =>
  import("./IllnessConclusionDrawer").then((module) => ({ default: module.IllnessConclusionDrawer })),
);

/**
 * «История болезней» (ТЗ 2026-10-04 §4.1) — электронный лист заключительных
 * диагнозов 112/у: хронические и Д-учёт сверху, счётчики за 12 месяцев с
 * подсказкой «часто болеющий», лента перенесённых болезней по годам (сама
 * собирается из заключений приёмов и архива; лечённое в другом месте врач
 * вносит вручную), госпитализации и детские инфекции.
 */
export const IllnessHistorySection: React.FC<IllnessHistorySectionProps> = ({
  patientId,
  canManage,
  title = "История болезней",
  gender,
  patientName,
}) => {
  const { enqueueSnackbar } = useSnackbar();
  const { orgId, scope, ready } = useHealthScope();
  const { canAccess } = usePermissions();
  const canViewConclusions = canAccess("medical.conclusions.view");
  const invalidate = useInvalidateHealth(patientId);
  const query = useIllnessHistory(patientId);
  const history: IllnessHistory | undefined = query.data;
  const [tab, setTab] = React.useState<IllnessTab>("all");
  const [showRefuted, setShowRefuted] = React.useState(false);
  const [conditionDrawer, setConditionDrawer] = React.useState<ConditionDrawerState>({ open: false, condition: null });
  const [stayDrawer, setStayDrawer] = React.useState<StayDrawerState>({ open: false, row: null });
  const [infection, setInfection] = React.useState<{ open: boolean; info: InfectionSummary | null; mode: InfectionDrawerMode }>({
    open: false,
    info: null,
    mode: "edit",
  });
  const [conclusionVisit, setConclusionVisit] = React.useState<IllnessVisit | null>(null);
  // Однажды открытое окно заключения остаётся в дереве — закрывается с анимацией.
  const [conclusionMounted, setConclusionMounted] = React.useState(false);

  // Ошибочно внесённые хронические — по переключателю, как раньше.
  const chronicAll = useQuery({
    queryKey: djangoQueryKeys.health.conditions(patientId, { kind: "chronic", status: "all" }, orgId),
    queryFn: ({ signal }) => getConditions(scope, patientId, { kind: "chronic", status: "all" }, signal),
    enabled: ready && showRefuted,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  // Перенесённые, внесённые вручную, — целиком для окна «Изменить» и «Хроническое».
  const pastAll = useQuery({
    queryKey: djangoQueryKeys.health.conditions(patientId, { kind: "past", status: "all" }, orgId),
    queryFn: ({ signal }) => getConditions(scope, patientId, { kind: "past", status: "all" }, signal),
    enabled: ready && canManage,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  const notHad = useMutation({
    mutationFn: (info: InfectionSummary) => {
      const payload = notHadQuickPayload(info);
      return info.record
        ? updateChildhoodInfection(scope, patientId, info.record.id, payload)
        : createChildhoodInfection(scope, patientId, payload);
    },
    onSuccess: async (_row, info) => {
      enqueueSnackbar(`${info.name}: ${byGender(gender, "не болела", "не болел", "не болел(а)")}, со слов родителей`, { variant: "success" });
      await invalidate();
    },
    onError: (error) => enqueueSnackbar(healthErrorText(error), { variant: "error" }),
  });

  const today = React.useMemo(() => (history?.today ? dayjs(history.today) : dayjs()), [history?.today]);
  const allGroups = React.useMemo(() => (history ? groupRibbonByYear(ribbonItems(history, "all")) : []), [history]);
  const pastGroups = React.useMemo(() => (history ? groupRibbonByYear(ribbonItems(history, "episodes")) : []), [history]);
  const chronic = history ? (showRefuted ? chronicAll.data ?? history.chronic : history.chronic) : NO_CONDITIONS;
  const counts = history ? illnessTabCounts(history) : null;
  const birthDate = history?.birthDate ?? null;
  const hasChronicBlock = chronic.length > 0;
  const empty =
    history != null &&
    !history.episodes.length &&
    !history.chronic.length &&
    !history.hospitalizations.length &&
    !history.infections.some((info) => info.status !== "unknown");

  const manualCondition = (episode: IllnessEpisode): Condition | null => {
    const found = pastAll.data?.find((row) => row.id === episode.conditionId) ?? null;
    if (!found) {
      enqueueSnackbar(
        pastAll.isLoading ? "Запись ещё загружается — попробуйте через секунду" : "Не удалось открыть запись — обновите страницу",
        { variant: pastAll.isLoading ? "info" : "error" },
      );
    }
    return found;
  };

  const handlers: RibbonHandlers = {
    canManage,
    canViewConclusions,
    onChronic: (episode) => {
      if (episode.source === "manual") {
        // Внесённая вручную: вид — «хроническое», статус — «активно»; Д-учёт можно поставить сразу.
        const condition = manualCondition(episode);
        if (condition) setConditionDrawer({ open: true, condition, initial: { kind: "chronic", status: "active" } });
        return;
      }
      const first = episode.diagnoses[0];
      setConditionDrawer({
        open: true,
        condition: null,
        initial: {
          kind: "chronic",
          status: "active",
          diagnosisId: episode.diagnosisId,
          diagnosisCode: first?.code ?? "",
          title: first?.title ?? "",
          diagnosedOn: episode.startedOn,
          datePrecision: episode.datePrecision,
          sourceConclusionId: firstConclusionId(episode),
        },
      });
    },
    onStayFromEpisode: (episode) => {
      const first = episode.diagnoses[0];
      setStayDrawer({
        open: true,
        row: null,
        initial: {
          admittedOn: episode.startedOn,
          diagnosisTitle: [first?.code, first?.title].filter(Boolean).join(" "),
          // Хроническое той же рубрики есть в списке окна — выбираем его.
          conditionId: episode.isChronic && episode.source !== "manual" ? episode.conditionId : null,
        },
      });
    },
    onEditManual: (episode) => {
      const condition = manualCondition(episode);
      if (condition) setConditionDrawer({ open: true, condition });
    },
    onOpenStay: (row) => setStayDrawer({ open: true, row }),
    onOpenInfection: (info) => setInfection({ open: true, info, mode: "edit" }),
    onConclusion: (visit) => {
      setConclusionMounted(true);
      setConclusionVisit(visit);
    },
  };

  const addIllness = () => setConditionDrawer({ open: true, condition: null, initial: { kind: "past" } });
  const addChronic = () => setConditionDrawer({ open: true, condition: null, initial: { kind: "chronic" } });

  const chronicBlock = (
    <ChronicConditions
      conditions={chronic}
      stats={history?.chronicStats ?? []}
      canManage={canManage}
      showRefuted={showRefuted}
      onToggleRefuted={setShowRefuted}
      onEdit={(condition) => setConditionDrawer({ open: true, condition })}
      onAdd={tab === "chronic" ? addChronic : undefined}
    />
  );

  const ribbon = (groups: typeof allGroups, emptyText: string) =>
    groups.length ? (
      <IllnessRibbon groups={groups} birthDate={birthDate} handlers={handlers} />
    ) : (
      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
        {emptyText}
      </Typography>
    );

  let content: React.ReactNode = null;
  if (history && counts) {
    if (tab === "all") {
      content = empty ? (
        <ListEmptyState
          icon={<HistoryEduOutlined />}
          title="Болезней в истории пока нет"
          description="Они появятся сами из заключений приёмов; то, что лечили в другом месте, внесите кнопкой «Внести болезнь»."
          action={
            canManage ? (
              <AppButton variant="outlined" startIcon={<AddOutlined />} onClick={addIllness}>
                Внести болезнь
              </AppButton>
            ) : undefined
          }
        />
      ) : (
        <Stack gap={2}>
          <Box
            sx={{
              display: "grid",
              gap: 1.5,
              alignItems: "start",
              gridTemplateColumns: "minmax(0, 1fr)",
              // Рядом — только в широкой карточке (книжка); в колонке карточки пациента — друг под другом.
              ...(hasChronicBlock ? { [whenCardWide(820)]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } } : {}),
            }}
          >
            {hasChronicBlock && chronicBlock}
            <IllnessSummaryPanel summary={history.summary} episodes={history.episodes} today={today} />
          </Box>
          {ribbon(allGroups, "Перенесённых болезней пока нет.")}
        </Stack>
      );
    } else if (tab === "chronic") {
      content = chronicBlock;
    } else if (tab === "past") {
      content = ribbon(
        pastGroups,
        "Перенесённых болезней пока нет. Они появятся сами из заключений приёмов; то, что лечили в другом месте, внесите кнопкой «Внести болезнь».",
      );
    } else if (tab === "hospitalizations") {
      content = history.hospitalizations.length ? (
        <Stack gap={1}>
          {history.hospitalizations.map((row) => (
            <StayCard key={row.id} row={row} canManage={canManage} onOpen={(item) => setStayDrawer({ open: true, row: item })} />
          ))}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
          Госпитализаций не внесено.
        </Typography>
      );
    } else {
      content = (
        <ChildhoodInfectionsGrid
          infections={history.infections}
          gender={gender}
          canManage={canManage}
          savingInfection={notHad.isPending ? notHad.variables?.infection ?? null : null}
          onNotHad={(info) => notHad.mutate(info)}
          onOpen={(info, mode) => setInfection({ open: true, info, mode })}
        />
      );
    }
  }

  return (
    <>
      <AppCard
        variant="outlined"
        sx={cardContainerSx}
        header={
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1.5} sx={{ px: 2, pt: 2 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" fontWeight={700}>
                {title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {history ? sourcesLine(history.summary.sources) : query.isLoading ? "Загрузка…" : "Перенесённые болезни, хронические, госпитализации"}
              </Typography>
            </Box>
            {canManage && (
              <Stack direction="row" gap={1} sx={{ flexShrink: 0 }}>
                <HealthHeaderButton label="Госпитализация" icon={<LocalHospitalOutlined />} onClick={() => setStayDrawer({ open: true, row: null })} />
                <HealthHeaderButton label="Внести болезнь" icon={<AddOutlined />} contained onClick={addIllness} />
              </Stack>
            )}
          </Stack>
        }
      >
        {query.isError ? (
          <Alert severity="error">Не удалось загрузить раздел «{title}».</Alert>
        ) : query.isLoading || !history || !counts ? (
          <ListLoadingSkeleton rows={3} />
        ) : (
          <Stack gap={2}>
            <Box sx={{ overflowX: "auto", maxWidth: "100%", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
              <SegmentedTabs<IllnessTab>
                layoutId={`illness-tabs-${patientId}`}
                value={tab}
                onChange={setTab}
                tabs={[
                  { key: "all", label: "Все" },
                  { key: "chronic", label: "Хронические", badge: counts.chronic },
                  { key: "past", label: "Перенесённые", badge: counts.past },
                  { key: "hospitalizations", label: "Госпитализации", badge: counts.hospitalizations },
                  { key: "infections", label: "Детские инфекции", badge: counts.infections },
                ]}
              />
            </Box>
            {content}
          </Stack>
        )}
      </AppCard>
      <ConditionDrawer
        open={conditionDrawer.open}
        patientId={patientId}
        condition={conditionDrawer.condition}
        initial={conditionDrawer.initial}
        birthDate={birthDate}
        episodes={history?.episodes}
        // Запись остаётся до конца анимации закрытия — заголовок окна не мигает.
        onClose={() => setConditionDrawer((current) => ({ ...current, open: false }))}
      />
      <HospitalizationDrawer
        open={stayDrawer.open}
        patientId={patientId}
        hospitalization={stayDrawer.row}
        initial={stayDrawer.initial}
        conditions={history?.chronic ?? NO_CONDITIONS}
        onClose={() => setStayDrawer((current) => ({ ...current, open: false }))}
      />
      <ChildhoodInfectionDrawer
        open={infection.open}
        patientId={patientId}
        info={infection.info}
        mode={infection.mode}
        birthDate={birthDate}
        gender={gender}
        onClose={() => setInfection((current) => ({ ...current, open: false }))}
      />
      {conclusionMounted && (
        <React.Suspense fallback={null}>
          <IllnessConclusionDrawer
            patientId={patientId}
            visit={conclusionVisit}
            patientName={patientName}
            birthDate={birthDate}
            onClose={() => setConclusionVisit(null)}
          />
        </React.Suspense>
      )}
    </>
  );
};
