import React from "react";
import { Box, Button, ButtonBase, LinearProgress, Skeleton, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import AddIcCallOutlined from "@mui/icons-material/AddIcCallOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import PriorityHighOutlined from "@mui/icons-material/PriorityHighOutlined";

import {
  CALL_FILTERS,
  callsNeedingAttention,
  downloadCallsCsv,
  formatCallDuration,
  getCalls,
  getCallsSummary,
  realtyCallKeys,
  type Call,
  type CallFilter,
  type CallsSummary,
} from "../../api/realtyCalls";
import { pillSx } from "../../components/ui";
import { useCan } from "../../hooks/useCan";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatPhoneDisplay } from "../../utility/phone";
import { cardSx } from "../estate-dashboard/format";
import { CallDirectionChip } from "./CallDirectionChip";
import { CallDrawer } from "./CallDrawer";
import { callTimeLabel, initials } from "./format";
import { NewCallDrawer } from "./NewCallDrawer";
import { CardHeader, KpiCards, ScreenError, SearchBox } from "./shared";
import { useIdParam } from "./useLeadParam";

/**
 * «Звонки и записи» застройщика (AIVIO, гайд `frontend-sales.md` §4): KPI и
 * счётчики чипов — из `/calls/summary/`, журнал — `/calls/?filter=&search=`,
 * карточка — шторка `?call=<id>`. Телефонии нет: звонок записывает менеджер
 * (`realty.manage`), плеер — только когда бэк прислал ссылку на запись.
 */
export default function RealtyCallsPage() {
  const { t } = useT("realtySales");
  usePageTitle(t("calls.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <CallsScreen />
    </Box>
  );
}

function CallsScreen() {
  const { t } = useT("realtySales");
  const { enqueueSnackbar } = useSnackbar();
  const scope = useRealtyScope();
  const canManage = useCan("realty.manage");
  const [callId, openCall] = useIdParam("call");
  const [filter, setFilter] = React.useState<CallFilter>("all");
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [createOpen, setCreateOpen] = React.useState(false);

  const params = React.useMemo(() => ({ filter, search: debouncedSearch }), [filter, debouncedSearch]);
  const list = useQuery({
    queryKey: realtyCallKeys.list(scope, params),
    queryFn: ({ signal }) => getCalls(params, scope, signal),
    enabled: scope.orgReady !== false,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const summary = useQuery({
    queryKey: realtyCallKeys.summary(scope),
    queryFn: ({ signal }) => getCallsSummary(scope, signal),
    enabled: scope.orgReady !== false,
    staleTime: 30_000,
  });
  // «Требуют внимания» — по всему журналу, а не по выбранному чипу.
  const allParams = React.useMemo(() => ({}), []);
  const all = useQuery({
    queryKey: realtyCallKeys.list(scope, allParams),
    queryFn: ({ signal }) => getCalls(allParams, scope, signal),
    enabled: scope.orgReady !== false,
    staleTime: 30_000,
  });
  const exportCsv = useMutation({
    mutationFn: () => downloadCallsCsv(params, scope),
    onError: () => enqueueSnackbar(t("calls.exportFailed"), { variant: "error" }),
  });

  if (list.error) return <ScreenError error={list.error} onRetry={() => void list.refetch()} title={t("calls.loadError")} />;

  const s = summary.data;
  const rows = list.data ?? [];

  return (
    <>
      <Typography sx={{ mb: 1.5, pt: 0.5, fontSize: "0.875rem", color: "text.secondary" }}>{t("calls.subtitle")}</Typography>
      <KpiCards
        items={
          s
            ? [
                { key: "today", label: t("calls.kpi.today"), value: String(s.today) },
                { key: "average", label: t("calls.kpi.average"), value: formatCallDuration(s.averageSeconds) },
                { key: "answerRate", label: t("calls.kpi.answerRate"), value: `${s.answerRate}%`, tone: s.answerRate >= 70 ? "success" : null },
                { key: "missed", label: t("calls.kpi.missed"), value: String(s.missedToday), tone: s.missedToday > 0 ? "error" : null },
              ]
            : null
        }
      />

      <Box sx={{ mb: 1.5, pr: 0.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75 }}>
        {CALL_FILTERS.map((key) => (
          <ButtonBase key={key} aria-pressed={filter === key} onClick={() => setFilter(key)} sx={(th) => ({ ...pillSx(th, filter === key), whiteSpace: "nowrap" })}>
            {t(`calls.filters.${key}`)}
            {s ? ` · ${s.counts[key]}` : ""}
          </ButtonBase>
        ))}
        <Box sx={{ ml: { md: "auto" }, display: "flex", alignItems: "center", gap: 1, flexWrap: { xs: "wrap", md: "nowrap" }, flex: { xs: "1 1 100%", md: "0 1 auto" } }}>
          <SearchBox value={search} onChange={setSearch} placeholder={t("calls.search")} />
          <Button variant="outlined" size="small" startIcon={<FileDownloadOutlined />} disabled={exportCsv.isPending} onClick={() => exportCsv.mutate()} sx={{ whiteSpace: "nowrap", flexShrink: 0 }}>
            {t("calls.export")}
          </Button>
          {canManage && (
            <Button variant="contained" size="small" startIcon={<AddIcCallOutlined />} onClick={() => setCreateOpen(true)} sx={{ whiteSpace: "nowrap", flexShrink: 0 }}>
              {t("calls.new")}
            </Button>
          )}
        </Box>
      </Box>

      <Box sx={{ display: "grid", gap: 1.5, alignItems: "start", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 320px" } }}>
        <Box sx={{ ...cardSx, overflow: "hidden", minWidth: 0 }}>
          <CardHeader title={t("calls.journal")} subtitle={t("calls.journalHint")} />
          <CallsGrid rows={rows} loading={list.isFetching} filtered={filter !== "all" || Boolean(debouncedSearch)} onOpen={openCall} />
        </Box>
        <Box sx={{ display: "grid", gap: 1.5, minWidth: 0 }}>
          <QualityCard summary={s} />
          <AttentionCard calls={all.data} onOpen={openCall} />
        </Box>
      </Box>

      <CallDrawer callId={callId} onClose={() => openCall(null)} />
      {canManage && (
        <NewCallDrawer
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(call) => {
            setCreateOpen(false);
            openCall(call.id);
          }}
        />
      )}
    </>
  );
}

function CallsGrid({ rows, loading, filtered, onOpen }: { rows: Call[]; loading: boolean; filtered: boolean; onOpen: (id: number) => void }) {
  const { t } = useT("realtySales");
  const columns: GridColDef<Call>[] = [
    {
      field: "client",
      headerName: t("calls.table.client"),
      flex: 1.4,
      minWidth: 220,
      renderCell: ({ row }) => (
        <Box sx={{ py: 1, minWidth: 0, display: "flex", gap: 1.25, alignItems: "center" }}>
          <Box
            aria-hidden
            sx={(th) => ({
              width: 34,
              height: 34,
              flexShrink: 0,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              fontSize: "0.75rem",
              fontWeight: 700,
              bgcolor: subtleBg(th, true),
              color: "text.secondary",
            })}
          >
            {initials(row.client)}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: "0.875rem", fontWeight: 600 }}>
              {row.client || "—"}
            </Typography>
            <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
              {[callTimeLabel(row.at, t), row.phone && formatPhoneDisplay(row.phone)].filter(Boolean).join(" · ")}
            </Typography>
            {(row.project || row.deal) && (
              <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                {[row.project, row.deal].filter(Boolean).join(" · ")}
              </Typography>
            )}
          </Box>
        </Box>
      ),
    },
    { field: "direction", headerName: t("calls.table.direction"), width: 140, renderCell: ({ row }) => <CallDirectionChip call={row} /> },
    {
      field: "result",
      headerName: t("calls.table.result"),
      flex: 1,
      minWidth: 160,
      renderCell: ({ row }) => (
        <Box sx={{ py: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
            {row.result || row.statusLabel || "—"}
          </Typography>
          <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            {row.manager || ""}
          </Typography>
        </Box>
      ),
    },
    {
      field: "recording",
      headerName: t("calls.table.recording"),
      width: 96,
      renderCell: ({ row }) =>
        row.recording ? (
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }}>
            <Box component="span" sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "error.main" }} />
            {formatCallDuration(row.seconds)}
          </Box>
        ) : (
          <Typography sx={{ color: "text.disabled" }}>—</Typography>
        ),
    },
    {
      field: "seconds",
      headerName: t("calls.table.duration"),
      width: 132,
      renderCell: ({ row }) => (
        <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{row.seconds > 0 ? formatCallDuration(row.seconds) : "—"}</Typography>
      ),
    },
    { field: "open", headerName: "", width: 44, sortable: false, renderCell: () => <ChevronRightOutlined sx={{ color: "text.secondary" }} /> },
  ];
  return (
    <DataGrid<Call>
      rows={rows}
      columns={columns}
      loading={loading}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: filtered ? t("calls.table.emptyFiltered") : t("calls.table.empty") }}
      getRowHeight={() => "auto"}
      onRowClick={({ row }) => onOpen(row.id)}
      disableRowSelectionOnClick
      disableColumnMenu
      autoHeight
      hideFooter={rows.length <= 100}
      initialState={{ pagination: { paginationModel: { pageSize: 100 } } }}
      pageSizeOptions={[100]}
      sx={{
        border: 0,
        borderTop: 1,
        borderColor: "divider",
        borderRadius: 0,
        "& .MuiDataGrid-row": { cursor: "pointer" },
        "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" },
      }}
    />
  );
}

/** «Контроль качества»: средняя оценка разговоров и полосы по менеджерам. */
function QualityCard({ summary }: { summary: CallsSummary | undefined }) {
  const { t } = useT("realtySales");
  const theme = useTheme();
  const score = summary?.averageQuality ?? null;
  const verdict = score == null ? t("calls.quality.none") : score >= 85 ? t("calls.quality.great") : score >= 70 ? t("calls.quality.good") : t("calls.quality.low");
  const tone = (value: number) => (value >= 90 ? theme.palette.success.main : value >= 70 ? theme.palette.primary.main : theme.palette.warning.main);
  return (
    <Box sx={{ ...cardSx, pb: 1.5, minWidth: 0 }}>
      <CardHeader title={t("calls.quality.title")} subtitle={t("calls.quality.hint")} />
      <Box sx={{ px: 2.25 }}>
        {!summary ? (
          <Skeleton variant="rounded" height={140} />
        ) : (
          <>
            <Box sx={(th) => ({ px: 2, py: 1.5, mb: 1.5, borderRadius: "12px", bgcolor: subtleBg(th, true), display: "flex", alignItems: "center", gap: 1.5 })}>
              <Typography sx={{ fontSize: "2rem", fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {score ?? "—"}
                <Box component="span" sx={{ fontSize: "0.8rem", fontWeight: 500, color: "text.secondary" }}>
                  /100
                </Box>
              </Typography>
              <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }}>{verdict}</Typography>
            </Box>
            {summary.managerQuality.map((m) => (
              <Box key={m.managerId} sx={{ py: 0.75 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                  <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                    {m.name}
                  </Typography>
                  <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{m.score}</Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.max(0, Math.min(100, m.score))}
                  aria-label={m.name}
                  sx={(th) => ({ my: 0.5, height: 5, borderRadius: 3, bgcolor: subtleBg(th, true), "& .MuiLinearProgress-bar": { borderRadius: 3, bgcolor: tone(m.score) } })}
                />
                <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{t("calls.quality.analyzed", { count: m.count })}</Typography>
              </Box>
            ))}
          </>
        )}
      </Box>
    </Box>
  );
}

/** «Требуют внимания»: пропущенные и звонки со следующим шагом — клик открывает карточку. */
function AttentionCard({ calls, onOpen }: { calls: Call[] | undefined; onOpen: (id: number) => void }) {
  const { t } = useT("realtySales");
  const items = calls ? callsNeedingAttention(calls) : null;
  return (
    <Box sx={{ ...cardSx, pb: 1, minWidth: 0, overflow: "hidden" }}>
      <CardHeader title={t("calls.attention.title")} subtitle={t("calls.attention.hint")} />
      {!items && (
        <Box sx={{ px: 2.25 }}>
          <Skeleton variant="rounded" height={96} />
        </Box>
      )}
      {items?.length === 0 && <Typography sx={{ px: 2.25, pb: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t("calls.attention.empty")}</Typography>}
      {items?.map((call) => {
        const missed = call.status === "missed" || call.status === "no-answer";
        return (
          <ButtonBase
            key={call.id}
            onClick={() => onOpen(call.id)}
            sx={(th) => ({ width: "100%", px: 2.25, py: 1, display: "flex", alignItems: "center", gap: 1.25, textAlign: "left", "&:hover": { bgcolor: subtleBg(th) } })}
          >
            <Box
              aria-hidden
              sx={(th) => ({
                width: 28,
                height: 28,
                flexShrink: 0,
                borderRadius: "8px",
                display: "grid",
                placeItems: "center",
                bgcolor: subtleBg(th, true),
                color: missed ? "error.main" : "text.secondary",
              })}
            >
              <PriorityHighOutlined sx={{ fontSize: 16 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                {call.nextAction || call.client}
              </Typography>
              <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                {[call.status === "missed" ? t("calls.attention.missed") : missed ? t("calls.status.no-answer") : call.result, call.client].filter(Boolean).join(" · ")}
              </Typography>
            </Box>
            <ChevronRightOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
          </ButtonBase>
        );
      })}
    </Box>
  );
}
