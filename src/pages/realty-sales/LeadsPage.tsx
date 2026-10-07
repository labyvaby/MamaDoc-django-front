import React from "react";
import { Box, Button, ButtonBase, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { useSnackbar } from "notistack";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";

import { LEAD_STAGES, downloadLeadsCsv, getLeads, getLeadsConversion, leadsStats, realtyLeadKeys, type Lead, type LeadStage, type LeadsFilter } from "../../api/realtyLeads";
import { pillSx } from "../../components/ui";
import { useCan } from "../../hooks/useCan";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { formatKGS } from "../../utility/format";
import { formatPhoneDisplay } from "../../utility/phone";
import { cardSx } from "../estate-dashboard/format";
import { tempColor } from "./format";
import { LeadDrawer } from "./LeadDrawer";
import { NewLeadDrawer } from "./NewLeadDrawer";
import { LeadsKpis, ScreenError, SearchBox } from "./shared";
import { useLeadParam } from "./useLeadParam";

const FILTERS: readonly LeadsFilter[] = ["active", "notask", "overdue"];

/**
 * «Лиды и клиенты» застройщика (AIVIO): те же лиды, что на воронке, таблицей
 * (гайд `frontend-sales.md` §3). Чипы «Без дела» / «Просроченные» считаются из
 * списка на клиенте; экспорт — CSV бэка с теми же фильтрами. Клиент — это сам
 * лид: отдельного справочника покупателей у застройщика нет.
 * Переходы из «Аналитики CRM» сужают список адресом: `?stage=`, `?managerId=`,
 * `?filter=notask` (снимаются крестиком на чипе).
 */
export default function RealtyLeadsPage() {
  const { t } = useT("realtySales");
  usePageTitle(t("leads.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <LeadsScreen />
    </Box>
  );
}

function LeadsScreen() {
  const { t } = useT("realtySales");
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const scope = useRealtyScope();
  const canManage = useCan("realty.manage");
  const [leadId, openLead] = useLeadParam();
  const [searchParams, setSearchParams] = useSearchParams();
  const stageParam = searchParams.get("stage");
  const stage = LEAD_STAGES.includes(stageParam as LeadStage) ? (stageParam as LeadStage) : undefined;
  const managerId = Number(searchParams.get("managerId")) || null;
  const [filter, setFilter] = React.useState<LeadsFilter>(() => (FILTERS.includes(searchParams.get("filter") as LeadsFilter) ? (searchParams.get("filter") as LeadsFilter) : "active"));
  const clearUrlFilter = (name: "stage" | "managerId") =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(name);
        return next;
      },
      { replace: true },
    );
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [createOpen, setCreateOpen] = React.useState(false);

  // Один запрос без фильтра чипа: счётчики всех трёх чипов — из него (гайд §3).
  const params = React.useMemo(() => ({ search: debouncedSearch, stage, managerId }), [debouncedSearch, stage, managerId]);
  const list = useQuery({
    queryKey: realtyLeadKeys.list(scope, params),
    queryFn: ({ signal }) => getLeads(params, scope, signal),
    enabled: scope.orgReady !== false,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const conversion = useQuery({
    queryKey: realtyLeadKeys.conversion(scope),
    queryFn: ({ signal }) => getLeadsConversion(scope, signal),
    enabled: scope.orgReady !== false,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const exportCsv = useMutation({
    mutationFn: () => downloadLeadsCsv({ search: debouncedSearch, filter, stage, managerId }, scope),
    onError: () => enqueueSnackbar(t("toolbar.exportFailed"), { variant: "error" }),
  });

  if (list.error) return <ScreenError error={list.error} onRetry={() => void list.refetch()} />;


  const all = list.data;
  const stats = all ? leadsStats(all) : null;
  const rows = (all ?? []).filter((lead) => (filter === "notask" ? !lead.task.trim() : filter === "overdue" ? lead.overdue : true));
  const countOf = (key: LeadsFilter) => (stats ? (key === "active" ? stats.count : stats[key]) : null);

  const columns: GridColDef<Lead>[] = [
    {
      field: "client",
      headerName: t("table.client"),
      flex: 1.2,
      minWidth: 180,
      renderCell: ({ row }) => (
        <Box sx={{ py: 0.75, minWidth: 0, display: "flex", gap: 1, alignItems: "flex-start" }}>
          <Box sx={{ mt: "7px", width: 8, height: 8, borderRadius: "50%", flexShrink: 0, bgcolor: tempColor(theme, row.temp) }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: "0.875rem", fontWeight: 600 }}>
              {row.client}
            </Typography>
            <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
              {row.phone ? formatPhoneDisplay(row.phone) : "—"}
            </Typography>
          </Box>
        </Box>
      ),
    },
    {
      field: "project",
      headerName: t("table.project"),
      flex: 1.2,
      minWidth: 180,
      renderCell: ({ row }) => (
        <Box sx={{ py: 0.75, minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: "0.875rem" }}>
            {row.project || "—"}
          </Typography>
          <Typography noWrap sx={{ fontSize: "0.75rem", color: "text.secondary" }}>
            {row.location || row.projectName || ""}
          </Typography>
        </Box>
      ),
    },
    { field: "budget", headerName: t("table.budget"), width: 140, type: "number", valueFormatter: (value: number) => (value > 0 ? formatKGS(value) : "—") },
    { field: "stageName", headerName: t("table.stage"), width: 160 },
    { field: "source", headerName: t("table.source"), width: 120, valueFormatter: (value: string) => value || "—" },
    { field: "manager", headerName: t("table.manager"), width: 160, valueFormatter: (value: string | null) => value || "—" },
    {
      field: "task",
      headerName: t("table.task"),
      flex: 1,
      minWidth: 180,
      renderCell: ({ row }) =>
        row.task ? (
          <Typography noWrap sx={{ fontSize: "0.875rem", color: row.overdue ? "error.main" : "text.primary" }}>
            {row.overdue ? `⚠ ${row.task} · ${t("table.overdue")}` : row.task}
          </Typography>
        ) : (
          <Typography noWrap sx={{ fontSize: "0.875rem", color: "warning.main" }}>
            {t("table.noTask")}
          </Typography>
        ),
    },
  ];

  return (
    <>
      <Typography sx={{ mb: 1.5, pt: 0.5, fontSize: "0.875rem", color: "text.secondary" }}>{t("leads.subtitle")}</Typography>
      <LeadsKpis list={all} conversion={conversion.data} />

      <Box sx={{ mb: 1.5, pr: 0.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75 }}>
        {FILTERS.map((key) => (
          <ButtonBase key={key} aria-pressed={filter === key} onClick={() => setFilter(key)} sx={(th) => ({ ...pillSx(th, filter === key), whiteSpace: "nowrap" })}>
            {t(`chips.${key}`)}
            {countOf(key) != null ? ` · ${countOf(key)}` : ""}
          </ButtonBase>
        ))}
        {stage && <UrlFilterChip label={t("leads.byStage", { name: t(`stages.${stage}`) })} onClear={() => clearUrlFilter("stage")} />}
        {managerId != null && (
          <UrlFilterChip label={t("leads.byManager", { name: all?.find((lead) => lead.managerId === managerId)?.manager ?? `#${managerId}` })} onClear={() => clearUrlFilter("managerId")} />
        )}
        <Box sx={{ ml: { md: "auto" }, display: "flex", alignItems: "center", gap: 1, flexWrap: { xs: "wrap", md: "nowrap" }, flex: { xs: "1 1 100%", md: "0 1 auto" } }}>
          <SearchBox value={search} onChange={setSearch} placeholder={t("toolbar.search")} />
          <Button variant="outlined" size="small" startIcon={<FileDownloadOutlined />} disabled={exportCsv.isPending} onClick={() => exportCsv.mutate()} sx={{ whiteSpace: "nowrap", flexShrink: 0 }}>
            {t("toolbar.export")}
          </Button>
          {canManage && (
            <Button variant="contained" size="small" startIcon={<AddOutlined />} onClick={() => setCreateOpen(true)} sx={{ whiteSpace: "nowrap", flexShrink: 0 }}>
              {t("toolbar.newLead")}
            </Button>
          )}
        </Box>
      </Box>

      <Box sx={{ ...cardSx, overflow: "hidden" }}>
        <DataGrid<Lead>
          rows={rows}
          columns={columns}
          loading={list.isFetching}
          localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: filter !== "active" || debouncedSearch || stage || managerId != null ? t("table.emptyFiltered") : t("table.empty") }}
          getRowHeight={() => "auto"}
          onRowClick={({ row }) => openLead(row.id)}
          disableRowSelectionOnClick
          disableColumnMenu
          autoHeight
          hideFooter={rows.length <= 100}
          initialState={{ pagination: { paginationModel: { pageSize: 100 } } }}
          pageSizeOptions={[100]}
          sx={{ border: 0, "& .MuiDataGrid-row": { cursor: "pointer" }, "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" } }}
        />
      </Box>

      <LeadDrawer leadId={leadId} onClose={() => openLead(null)} />
      {canManage && (
        <NewLeadDrawer
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(lead) => {
            setCreateOpen(false);
            openLead(lead.id);
          }}
        />
      )}
    </>
  );
}

/** Фильтр, пришедший адресом (из аналитики): активный чип с крестиком. */
function UrlFilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  const { t } = useT("realtySales");
  return (
    <ButtonBase aria-label={t("leads.clearFilter", { label })} onClick={onClear} sx={(th) => ({ ...pillSx(th, true), whiteSpace: "nowrap", gap: 0.5 })}>
      {label}
      <CloseOutlined sx={{ fontSize: 14 }} />
    </ButtonBase>
  );
}
