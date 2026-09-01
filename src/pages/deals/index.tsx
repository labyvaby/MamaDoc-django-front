import React from "react";
import { Alert, Box, Chip, MenuItem, Snackbar, Stack, TextField, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import dayjs from "dayjs";

import AddOutlined from "@mui/icons-material/AddOutlined";
import FilterAltOffOutlined from "@mui/icons-material/FilterAltOffOutlined";

import { AppButton, ListEmptyState, PageHeader, SegmentedTabs } from "../../components/ui";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import CreateDealDrawer from "../../components/deals/CreateDealDrawer";
import DealDetailDrawer from "../../components/deals/DealDetailDrawer";
import DealBoardView from "./DealBoardView";
import DealsAnalyticsView from "./DealsAnalyticsView";
import { subtleBg } from "../../theme/uiHelpers";
import { useT } from "../../i18n/VerticalProvider";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useCanChecker } from "../../hooks/useCan";
import { useApiOrgId } from "../../hooks/useApiOrgId";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useAllActiveEmployees } from "../../hooks/useAllActiveEmployees";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../../api/queryKeys";
import { formatKGS } from "../../utility/format";
import {
  getDealSources,
  getDealsSummary,
  getLostReasons,
  getPipelines,
  type DealBoardParams,
} from "../../api/deals";
import { DEALS_REFRESH_MS, dealsErrorMessage } from "./meta";

/** Пилюля-фильтр по касаниям: «На сегодня» / «Просрочено». */
type ActionPill = "today" | "overdue" | null;

type DealsTab = "board" | "analytics";

const DealsPage: React.FC = () => {
  const { t } = useT("deals");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const orgId = useApiOrgId();
  const { can, loading: permLoading } = useCanChecker();

  usePageTitle(t("title"));

  const canView = can("deals.list") || can("deals.manage");
  const canCreate = can("deals.create") || can("deals.manage");
  const canUpdate = can("deals.update") || can("deals.manage");
  const canManage = can("deals.manage");
  const canOverrideAmount = can("deals.amount_override") || can("deals.manage");

  const [searchParams, setSearchParams] = useSearchParams();

  const [pipelineId, setPipelineId] = React.useState<number | "">(
    searchParams.get("pipeline") ? Number(searchParams.get("pipeline")) : "",
  );
  // Поиск живёт в локальном state и попадает в URL с задержкой: setSearchParams
  // не батчится, и запись на каждый символ теряет буквы.
  const [search, setSearch] = React.useState(searchParams.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [assigneeId, setAssigneeId] = React.useState<number | "">(
    searchParams.get("assignee") ? Number(searchParams.get("assignee")) : "",
  );
  const [sourceId, setSourceId] = React.useState<number | "">(
    searchParams.get("source") ? Number(searchParams.get("source")) : "",
  );
  const [actionPill, setActionPill] = React.useState<ActionPill>(
    (searchParams.get("action") as ActionPill) ?? null,
  );

  const [tab, setTab] = React.useState<DealsTab>(
    (searchParams.get("tab") as DealsTab) || "board",
  );
  const [createOpen, setCreateOpen] = React.useState(false);
  const [openDealId, setOpenDealId] = React.useState<number | null>(null);
  const [toast, setToast] = React.useState<{ text: string; severity: "error" | "success" } | null>(
    null,
  );

  React.useEffect(() => {
    const next = new URLSearchParams();
    if (tab !== "board") next.set("tab", tab);
    if (pipelineId !== "") next.set("pipeline", String(pipelineId));
    if (debouncedSearch) next.set("q", debouncedSearch);
    if (assigneeId !== "") next.set("assignee", String(assigneeId));
    if (sourceId !== "") next.set("source", String(sourceId));
    if (actionPill) next.set("action", actionPill);
    setSearchParams(next, { replace: true });
  }, [tab, pipelineId, debouncedSearch, assigneeId, sourceId, actionPill, setSearchParams]);

  const { employees } = useAllActiveEmployees(canView && !permLoading);

  const pipelinesQuery = useQuery({
    queryKey: djangoQueryKeys.deals.pipelines(orgId),
    queryFn: ({ signal }) => getPipelines(orgId, false, signal),
    enabled: canView && !permLoading,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const pipelines = React.useMemo(() => pipelinesQuery.data ?? [], [pipelinesQuery.data]);

  /** Воронка по умолчанию — та, что помечена isDefault: с неё начинают работу. */
  const activePipeline = React.useMemo(() => {
    if (pipelineId !== "") return pipelines.find((p) => p.id === pipelineId) ?? null;
    return pipelines.find((p) => p.isDefault) ?? pipelines[0] ?? null;
  }, [pipelines, pipelineId]);

  const sourcesQuery = useQuery({
    queryKey: djangoQueryKeys.deals.sources(orgId),
    queryFn: ({ signal }) => getDealSources(orgId, signal),
    enabled: canView && !permLoading,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const lostReasonsQuery = useQuery({
    queryKey: djangoQueryKeys.deals.lostReasons(orgId),
    queryFn: ({ signal }) => getLostReasons(orgId, signal),
    enabled: canView && !permLoading,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const boardParams: DealBoardParams = React.useMemo(() => {
    const params: DealBoardParams = {};
    if (activePipeline) params.pipelineId = activePipeline.id;
    if (debouncedSearch) params.search = debouncedSearch;
    if (assigneeId !== "") params.assigneeId = assigneeId;
    if (sourceId !== "") params.sourceId = sourceId;
    if (actionPill === "overdue") params.hasOverdueAction = true;
    if (actionPill === "today") {
      // Отдельного фильтра «на сегодня» у бэка нет: это касание до конца дня
      // (граница включающая) плюс только рабочие этапы — иначе в выборку попадут
      // закрытые сделки со старым nextActionAt.
      params.nextActionBefore = dayjs().format("YYYY-MM-DD");
      params.kind = "open";
    }
    return params;
  }, [activePipeline, debouncedSearch, assigneeId, sourceId, actionPill]);

  const summaryQuery = useQuery({
    queryKey: djangoQueryKeys.deals.summary({
      pipelineId: activePipeline?.id,
      organizationId: orgId,
    }),
    queryFn: ({ signal }) =>
      getDealsSummary({ pipelineId: activePipeline?.id, organizationId: orgId }, signal),
    enabled: canView && !permLoading,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    refetchInterval: DEALS_REFRESH_MS,
  });

  const summary = summaryQuery.data;

  const filtersActive =
    debouncedSearch !== "" || assigneeId !== "" || sourceId !== "" || actionPill != null;

  const resetFilters = () => {
    setSearch("");
    setAssigneeId("");
    setSourceId("");
    setActionPill(null);
  };

  if (permLoading) return null;
  if (!canView) return <AccessDenied />;

  const noPipelines = pipelinesQuery.isSuccess && pipelines.length === 0;

  return (
    <Stack sx={{ height: "100%", minHeight: 0, gap: 1.5 }}>
      <PageHeader
        title={t("title")}
        actions={
          canCreate && !noPipelines ? (
            <AppButton startIcon={<AddOutlined />} onClick={() => setCreateOpen(true)}>
              {isMobile ? t("add") : t("addFull")}
            </AppButton>
          ) : undefined
        }
      />

      {noPipelines ? (
        <ListEmptyState
          icon={<FilterAltOffOutlined />}
          title={t("notConfigured")}
          description={t("notConfiguredHint")}
        />
      ) : (
        <>
          <SegmentedTabs<DealsTab>
            tabs={[
              { key: "board", label: t("tabs.board") },
              { key: "analytics", label: t("tabs.analytics") },
            ]}
            value={tab}
            onChange={setTab}
            layoutId="deals-tabs"
          />

          {tab === "analytics" ? (
            <DealsAnalyticsView
              pipelineId={activePipeline?.id}
              orgId={orgId}
              enabled={activePipeline != null}
            />
          ) : (
        <>
          {/* Ряд фильтров пилюлями — тот же паттерн, что на доске задач. */}
          <Stack
            direction="row"
            alignItems="center"
            gap={1}
            flexWrap="wrap"
            sx={{
              px: 1.25,
              py: 1,
              borderRadius: 2,
              bgcolor: subtleBg(theme),
            }}
          >
            {pipelines.length > 1 ? (
              <TextField
                select
                size="small"
                label={t("board.pipeline")}
                value={activePipeline?.id ?? ""}
                onChange={(e) => setPipelineId(e.target.value === "" ? "" : Number(e.target.value))}
                sx={{ minWidth: 180 }}
              >
                {pipelines.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name}
                  </MenuItem>
                ))}
              </TextField>
            ) : null}

            <TextField
              size="small"
              label={t("filters.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ minWidth: 200 }}
            />

            <TextField
              select
              size="small"
              label={t("filters.assignee")}
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value === "" ? "" : Number(e.target.value))}
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="">{t("filters.all")}</MenuItem>
              {employees.map((e) => (
                <MenuItem key={e.id} value={e.id}>
                  {e.fullName}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label={t("filters.source")}
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value === "" ? "" : Number(e.target.value))}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">{t("filters.all")}</MenuItem>
              {(sourcesQuery.data ?? []).map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </TextField>

            <Chip
              label={`${t("filters.today")}${summary ? ` · ${summary.todayActionsCount}` : ""}`}
              size="small"
              variant={actionPill === "today" ? "filled" : "outlined"}
              color={actionPill === "today" ? "primary" : "default"}
              onClick={() => setActionPill(actionPill === "today" ? null : "today")}
            />
            <Chip
              label={`${t("filters.overdue")}${summary ? ` · ${summary.overdueActionsCount}` : ""}`}
              size="small"
              variant={actionPill === "overdue" ? "filled" : "outlined"}
              color={
                actionPill === "overdue"
                  ? "error"
                  : (summary?.overdueActionsCount ?? 0) > 0
                    ? "error"
                    : "default"
              }
              onClick={() => setActionPill(actionPill === "overdue" ? null : "overdue")}
            />

            <Box sx={{ flex: 1, minWidth: 8 }} />

            {/* Итоги воронки: «в работе» — та цифра, на которую смотрит владелец. */}
            {summary ? (
              <Stack direction="row" gap={1.5} alignItems="baseline" sx={{ pr: 0.5 }}>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {t("summary.inWork")}: <b>{summary.openCount}</b> · {formatKGS(summary.openAmount)}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {t("summary.won")}: <b>{summary.wonCount}</b> · {formatKGS(summary.wonAmount)}
                </Typography>
              </Stack>
            ) : null}

            {filtersActive ? (
              <AppButton
                size="small"
                variant="text"
                startIcon={<FilterAltOffOutlined />}
                onClick={resetFilters}
              >
                {t("filters.reset")}
              </AppButton>
            ) : null}
          </Stack>

          {/* Текст бэка важнее нашего: «Permission denied: deals.list» объясняет
              пустой экран, а «не удалось загрузить» — нет. */}
          {pipelinesQuery.isError ? (
            <Alert severity="error" variant="outlined">
              {dealsErrorMessage(pipelinesQuery.error, t("loadError"))}
            </Alert>
          ) : null}

          {/* Воронка без обращений — не пустой экран: этапы показывают, куда
              заводить первое, и подсказка живёт над доской, а не вместо неё. */}
          {!filtersActive && summary?.totalCount === 0 ? (
            <Alert severity="info" variant="outlined">
              {t("emptyHint")}
            </Alert>
          ) : null}

          <DealBoardView
            params={boardParams}
            orgId={orgId}
            lostReasons={lostReasonsQuery.data ?? []}
            onOpenDeal={setOpenDealId}
            onError={(text) => setToast({ text, severity: "error" })}
            canUpdate={canUpdate}
            canManage={canManage}
            enabled={activePipeline != null}
            /* Пустой экран — только когда фильтры отсекли всё: иначе он скрывает
               настроенные этапы, а это единственная навигация по воронке. */
            emptyState={
              filtersActive ? (
                <ListEmptyState icon={<FilterAltOffOutlined />} title={t("emptyFiltered")} />
              ) : undefined
            }
          />
        </>
          )}
        </>
      )}

      <CreateDealDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(deal) => {
          setToast({ text: t("create.created"), severity: "success" });
          setOpenDealId(deal.id);
        }}
        onError={(text) => setToast({ text, severity: "error" })}
        stages={activePipeline?.stages ?? []}
        sources={sourcesQuery.data ?? []}
        pipelineId={activePipeline?.id}
      />

      <DealDetailDrawer
        dealId={openDealId}
        onClose={() => setOpenDealId(null)}
        onError={(text) => setToast({ text, severity: "error" })}
        onNotify={(text) => setToast({ text, severity: "success" })}
        sources={sourcesQuery.data ?? []}
        stages={activePipeline?.stages ?? []}
        lostReasons={lostReasonsQuery.data ?? []}
        canUpdate={canUpdate}
        canManage={canManage}
        canOverrideAmount={canOverrideAmount}
      />

      <Snackbar
        open={toast != null}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={toast?.severity ?? "info"}
          variant="filled"
          onClose={() => setToast(null)}
        >
          {toast?.text}
        </Alert>
      </Snackbar>
    </Stack>
  );
};

export default DealsPage;
