import React from "react";
import { Box, Button, MenuItem, Skeleton, TextField, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";

import { auditCsv, estateSettingsKeys, getAudit, getAuditSummary, type AuditEntry, type AuditSummary } from "../../api/estateSettings";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { ProgressBar } from "../construction/shared";
import { cardSx } from "../estate-dashboard/format";
import { EmptyNote } from "../realty-finance/shared";
import { CardHeader, KpiCards, ScreenError, SearchBox } from "../realty-sales/shared";
import { shareOf } from "../estate-analytics/format";
import { downloadBlob } from "./xlsx";

const PAGE = 150;
const COLS = ["ts", "user", "role", "action", "target", "details", "module"] as const;

/**
 * «Аудит» застройщика (AIVIO, гайд `frontend-settings.md` §5): неизменяемый
 * журнал организации (`GET /audit/`, страницы по 150 — «Показать ещё»),
 * поиск и фильтр по роли — на бэке, «Активность по ролям» и «Целостность» —
 * из `/audit/summary/`. CSV — из загруженного списка. Право — `integrations.view`.
 */
export default function EstateAuditPage() {
  const { t } = useT("estateSettings");
  usePageTitle(t("audit.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <AuditScreen />
    </Box>
  );
}

function AuditScreen() {
  const { t } = useT("estateSettings");
  const scope = useRealtyScope();
  const [search, setSearch] = React.useState("");
  const [role, setRole] = React.useState("");
  const debounced = useDebouncedValue(search);
  const enabled = scope.orgReady !== false;
  const summary = useQuery({ queryKey: estateSettingsKeys.auditSummary(scope), queryFn: ({ signal }) => getAuditSummary(scope, signal), enabled, staleTime: 30_000 });
  const params = React.useMemo(() => ({ search: debounced, role }), [debounced, role]);
  const audit = useInfiniteQuery({
    queryKey: estateSettingsKeys.audit(scope, params),
    queryFn: ({ pageParam, signal }) => getAudit({ ...params, limit: PAGE, offset: pageParam || undefined }, scope, signal),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.length < PAGE ? undefined : pages.length * PAGE),
    enabled,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  if (summary.error) return <ScreenError error={summary.error} title={t("common.loadError")} onRetry={() => void summary.refetch()} />;
  const s = summary.data;
  const rows = audit.data?.pages.flat() ?? [];
  const headers = COLS.map((c) => t(`audit.col.${c}`));

  const columns: GridColDef<AuditEntry>[] = [
    { field: "ts", headerName: headers[0], width: 140, valueFormatter: (value: string) => (value ? dayjs(value).format("DD.MM.YYYY HH:mm") : "—") },
    { field: "user", headerName: headers[1], width: 170 },
    { field: "role", headerName: headers[2], width: 170 },
    { field: "action", headerName: headers[3], flex: 1, minWidth: 180 },
    { field: "target", headerName: headers[4], width: 150 },
    { field: "details", headerName: headers[5], flex: 1.2, minWidth: 200 },
    { field: "moduleLabel", headerName: headers[6], width: 130 },
  ];

  return (
    <>
      <Typography sx={{ mb: 1.5, pt: 0.5, fontSize: "0.875rem", color: "text.secondary" }}>{t("audit.subtitle")}</Typography>
      <KpiCards
        items={
          s
            ? [
                { key: "total", label: t("audit.kpi.total"), value: s.total.toLocaleString("ru-RU") },
                { key: "today", label: t("audit.kpi.today"), value: s.today.toLocaleString("ru-RU") },
                { key: "roles", label: t("audit.kpi.roles"), value: String(s.activeRoles) },
                { key: "retention", label: t("audit.kpi.retention"), value: s.retention || "—" },
              ]
            : null
        }
      />
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 300px" }, alignItems: "start" }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ mb: 1.25, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <SearchBox value={search} onChange={setSearch} placeholder={t("audit.search")} />
            <TextField select size="small" value={role} onChange={(e) => setRole(e.target.value)} sx={{ minWidth: 200 }} SelectProps={{ displayEmpty: true }} inputProps={{ "aria-label": t("audit.col.role") }}>
              <MenuItem value="">{t("audit.allRoles")}</MenuItem>
              {(s?.byRole ?? []).map((r) => (
                <MenuItem key={r.role} value={r.role}>
                  {r.role}
                </MenuItem>
              ))}
            </TextField>
            <Button
              size="small"
              variant="outlined"
              startIcon={<FileDownloadOutlined />}
              disabled={rows.length === 0}
              onClick={() => downloadBlob(new Blob([auditCsv(rows, headers)], { type: "text/csv;charset=utf-8" }), `audit-${new Date().toISOString().slice(0, 10)}.csv`)}
              sx={{ ml: { md: "auto" }, whiteSpace: "nowrap" }}
            >
              {t("audit.export")}
            </Button>
          </Box>
          {audit.error ? (
            <ScreenError error={audit.error} title={t("common.loadError")} onRetry={() => void audit.refetch()} />
          ) : (
            <Box sx={{ ...cardSx, overflow: "hidden" }}>
              <DataGrid<AuditEntry>
                rows={rows}
                columns={columns}
                loading={audit.isFetching && !audit.isFetchingNextPage && rows.length === 0}
                localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: debounced || role ? t("common.emptyFiltered") : t("common.empty") }}
                getRowHeight={() => "auto"}
                disableRowSelectionOnClick
                disableColumnMenu
                autoHeight
                hideFooter
                sx={{ border: 0, "& .MuiDataGrid-cell": { display: "flex", alignItems: "center", py: 0.75, whiteSpace: "normal" } }}
              />
              <Box sx={{ px: 2.25, py: 1.25, display: "flex", alignItems: "center", gap: 1, borderTop: 1, borderColor: "divider" }}>
                <Typography sx={{ flex: 1, fontSize: "0.75rem", color: "text.secondary" }}>{t("audit.shown", { shown: rows.length })}</Typography>
                {audit.hasNextPage && (
                  <Button size="small" onClick={() => void audit.fetchNextPage()} disabled={audit.isFetchingNextPage}>
                    {t("common.loadMore")}
                  </Button>
                )}
              </Box>
            </Box>
          )}
        </Box>
        <Box sx={{ display: "grid", gap: 1.5, minWidth: 0 }}>
          <ByRole summary={s} active={role} onPick={(r) => setRole((prev) => (prev === r ? "" : r))} />
          <Integrity summary={s} />
        </Box>
      </Box>
    </>
  );
}

function ByRole({ summary, active, onPick }: { summary: AuditSummary | undefined; active: string; onPick: (role: string) => void }) {
  const { t } = useT("estateSettings");
  const max = Math.max(0, ...(summary?.byRole ?? []).map((r) => r.count));
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("audit.byRole")} />
      {!summary ? (
        <Box sx={{ px: 2.25, pb: 2 }}>
          <Skeleton variant="rounded" height={120} />
        </Box>
      ) : summary.byRole.length === 0 ? (
        <EmptyNote text={t("common.empty")} />
      ) : (
        <Box sx={{ px: 1.25, pb: 1.5, display: "grid", gap: 0.25 }}>
          {summary.byRole.map((r) => (
            <Box
              key={r.role}
              component="button"
              type="button"
              onClick={() => onPick(r.role)}
              aria-pressed={active === r.role}
              sx={{ all: "unset", cursor: "pointer", px: 1, py: 0.6, borderRadius: "8px", bgcolor: active === r.role ? "action.selected" : "transparent", "&:hover": { bgcolor: "action.hover" }, "&:focus-visible": { outline: 2, outlineColor: "primary.main" } }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mb: 0.4 }}>
                <Typography noWrap sx={{ fontSize: "0.8125rem" }}>
                  {r.role || "—"}
                </Typography>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{r.count}</Typography>
              </Box>
              <ProgressBar value={shareOf(r.count, max)} height={5} />
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function Integrity({ summary }: { summary: AuditSummary | undefined }) {
  const { t } = useT("estateSettings");
  return (
    <Box sx={{ ...cardSx, minWidth: 0 }}>
      <CardHeader title={t("audit.integrity")} />
      <Box sx={{ px: 2.25, pb: 2 }}>
        {!summary ? (
          <Skeleton variant="rounded" height={60} />
        ) : (
          <>
            {summary.lastHash && <Typography sx={{ fontFamily: "monospace", fontSize: "0.75rem", color: "text.secondary", wordBreak: "break-all" }}>{`sha256:${summary.lastHash}`}</Typography>}
            <Typography sx={{ mt: 0.75, fontSize: "0.8125rem", fontWeight: 600, color: summary.integrityOk ? "success.main" : "error.main" }}>
              {summary.integrityOk ? t("audit.integrityOk", { count: summary.integrityChecked }) : t("audit.integrityBroken", { id: summary.integrityBrokenId ?? "?" })}
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
}
