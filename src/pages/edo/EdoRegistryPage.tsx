import React from "react";
import { Alert, Box, Button, ButtonBase, FormControlLabel, InputBase, MenuItem, Skeleton, Switch, TextField, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { useSnackbar } from "notistack";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CloudUploadOutlined from "@mui/icons-material/CloudUploadOutlined";
import NotificationsActiveOutlined from "@mui/icons-material/NotificationsActiveOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";

import { ApiError, isModuleDisabled } from "../../api/client";
import {
  EDO_TABS,
  currentStep,
  edoKeys,
  exportEdoTo1C,
  getArchiveSummary,
  getContractsSummary,
  getEdoDocuments,
  getEdoSummary,
  overdueDays,
  remindOverdueEdo,
  type ArchiveSummary,
  type ContractsSummary,
  type EdoDocument,
  type EdoListParams,
  type EdoScope,
  type EdoSummary,
  type EdoTab,
} from "../../api/edo";
import { getRealEstateProjects, realEstateKeys } from "../../api/realestate";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { pillSx } from "../../components/ui";
import { useCanChecker } from "../../hooks/useCan";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { subtleBg } from "../../theme/uiHelpers";
import { formatDateRu, formatKGS } from "../../utility/format";
import { DocumentDrawer } from "./DocumentDrawer";
import { EdoStatusChip } from "./EdoStatusChip";
import { NewDocumentDrawer } from "./NewDocumentDrawer";

const cardSx = { border: 1, borderColor: "divider", borderRadius: "14px", bgcolor: "background.paper" } as const;
const CONTRACT_STATUSES = ["all", "active", "pending", "closed"] as const;

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1).replace(".", ",")} МБ`;
  return `${(bytes / 1024 ** 3).toFixed(1).replace(".", ",")} ГБ`;
};

/**
 * Реестр документов AIVIO: один экран на три среза — ЭДО целиком
 * (`/edo`), реестр договоров (`/edo/contracts`, `scope=contracts`) и
 * архив (`/edo/archive`, `scope=archive`). Карточка — `?doc=<id>`.
 */
export default function EdoRegistryPage({ scope: view }: { scope: EdoScope }) {
  const { t } = useT("edo");
  usePageTitle(t(`page.${view}`));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <Registry key={view} view={view} />
    </Box>
  );
}

function Registry({ view }: { view: EdoScope }) {
  const { t } = useT("edo");
  const theme = useTheme();
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { can } = useCanChecker();
  const canManage = can("edo.manage");
  const enabled = scope.orgReady !== false;

  const [searchParams, setSearchParams] = useSearchParams();
  const docId = Number(searchParams.get("doc")) || null;
  const openDoc = (id: number | null) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("doc", String(id));
        else next.delete("doc");
        return next;
      },
      { replace: true },
    );

  const [tab, setTab] = React.useState<EdoTab>("all");
  const [contractStatus, setContractStatus] = React.useState<string>("all");
  const [year, setYear] = React.useState("all");
  const [notExported, setNotExported] = React.useState(false);
  const [type, setType] = React.useState("all");
  const [projectId, setProjectId] = React.useState<number | null>(null);
  // ?q= — переход по номеру документа (акт АПП из «Приёмки и ключей»): id там не известен.
  const [search, setSearch] = React.useState(() => searchParams.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(search);
  const [createOpen, setCreateOpen] = React.useState(false);

  const params: EdoListParams = React.useMemo(
    () => ({ scope: view, tab, search: debouncedSearch, type, projectId, contractStatus, year, notExported }),
    [view, tab, debouncedSearch, type, projectId, contractStatus, year, notExported],
  );

  // Сводка ЭДО нужна всем трём экранам: из неё типы документов для фильтра.
  const edoSummary = useQuery({
    queryKey: edoKeys.summary(scope, "edo"),
    queryFn: ({ signal }) => getEdoSummary(scope, signal),
    enabled,
    staleTime: 30_000,
  });
  const contractsSummary = useQuery({
    queryKey: edoKeys.summary(scope, "contracts"),
    queryFn: ({ signal }) => getContractsSummary(scope, signal),
    enabled: enabled && view === "contracts",
    staleTime: 30_000,
  });
  const archiveSummary = useQuery({
    queryKey: edoKeys.summary(scope, "archive"),
    queryFn: ({ signal }) => getArchiveSummary(scope, signal),
    enabled: enabled && view === "archive",
    staleTime: 30_000,
  });
  const list = useQuery({
    queryKey: edoKeys.list(scope, params),
    queryFn: ({ signal }) => getEdoDocuments(params, scope, signal),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const mine = useQuery({
    queryKey: edoKeys.list(scope, { ...params, scope: "edo", tab: "mine", search: "", type: "all", projectId: null }),
    queryFn: ({ signal }) => getEdoDocuments({ ...params, scope: "edo", tab: "mine", search: "", type: "all", projectId: null }, scope, signal),
    enabled: enabled && view === "edo",
    staleTime: 30_000,
  });
  // ЖК для фильтра — из модуля продаж; без доступа к нему фильтр просто не показываем.
  const projects = useQuery({
    queryKey: realEstateKeys.projects(scope),
    queryFn: () => getRealEstateProjects(scope),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  }).data;

  const refresh = () => void queryClient.invalidateQueries({ queryKey: edoKeys.all });
  const failed = (error: unknown) => enqueueSnackbar(error instanceof Error ? error.message : t("action.failed"), { variant: "error" });
  const remindOverdue = useMutation({
    mutationFn: () => remindOverdueEdo(scope),
    onSuccess: () => {
      enqueueSnackbar(t("overdueBanner.reminded"), { variant: "success" });
      refresh();
    },
    onError: failed,
  });
  const export1c = useMutation({
    mutationFn: () => exportEdoTo1C(null, scope),
    onSuccess: ({ count }) => {
      enqueueSnackbar(t("toolbar.export1cDone", { count: count ?? 0 }), { variant: "success" });
      refresh();
    },
    onError: failed,
  });

  const error = list.error ?? edoSummary.error;
  if (error) {
    if (isModuleDisabled(error)) return <AccessDenied title={t("page.moduleOff")} description={t("page.moduleOffHint")} showBack={false} />;
    if (error instanceof ApiError && error.status === 403) return <AccessDenied />;
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={refresh}>{t("common.retry")}</Button>}>
        {t("page.loadError")}: {error instanceof Error ? error.message : ""}
      </Alert>
    );
  }

  const summary = edoSummary.data;
  const rows = list.data ?? [];
  const filtered = tab !== "all" || type !== "all" || projectId != null || Boolean(debouncedSearch) || contractStatus !== "all" || year !== "all" || notExported;

  return (
    <>
      <Typography sx={{ mb: 2, fontSize: "0.875rem", color: "text.secondary" }}>{t(`page.${view}Subtitle`)}</Typography>

      {view === "edo" && <EdoKpis summary={summary} />}
      {view === "contracts" && <ContractsKpis summary={contractsSummary.data} />}
      {view === "archive" && <ArchiveKpis summary={archiveSummary.data} />}

      {view === "edo" && summary && summary.overdue > 0 && (
        <Box
          role="status"
          sx={(th) => ({
            mb: 2,
            px: 2,
            py: 1.25,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 1.5,
            borderRadius: "12px",
            border: 1,
            borderColor: alpha(th.palette.warning.main, 0.35),
            bgcolor: alpha(th.palette.warning.main, th.palette.mode === "dark" ? 0.12 : 0.08),
          })}
        >
          <Typography sx={{ fontWeight: 700, fontSize: "0.8125rem", color: "warning.onSurface" }}>{t("overdueBanner.text", { count: summary.overdue })}</Typography>
          <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: "0.75rem", color: "text.secondary" }}>
            {summary.overdueNumbers.join(", ")}
          </Typography>
          {canManage && (
            <Button size="small" variant="outlined" color="warning" startIcon={<NotificationsActiveOutlined />} disabled={remindOverdue.isPending} onClick={() => remindOverdue.mutate()}>
              {t("overdueBanner.remind")}
            </Button>
          )}
        </Box>
      )}

      {view === "edo" && (
        <Box role="tablist" aria-label={t("tab.label")} sx={{ mb: 1.5, display: "flex", gap: 0.75, overflowX: "auto", pb: 0.5 }}>
          {EDO_TABS.map((key) => (
            <ButtonBase key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} sx={(th) => ({ ...pillSx(th, tab === key), whiteSpace: "nowrap", flexShrink: 0 })}>
              {t(`tab.${key}`)}
              {summary?.tabs[key] != null ? ` · ${summary.tabs[key]}` : ""}
            </ButtonBase>
          ))}
        </Box>
      )}
      {view === "contracts" && (
        <Box role="group" sx={{ mb: 1.5, display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {CONTRACT_STATUSES.map((key) => (
            <ButtonBase key={key} aria-pressed={contractStatus === key} onClick={() => setContractStatus(key)} sx={(th) => pillSx(th, contractStatus === key)}>
              {t(`contractStatus.${key}`)}
            </ButtonBase>
          ))}
        </Box>
      )}

      <Box sx={{ mb: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <Box
          sx={(th) => ({
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            px: 1.25,
            height: 36,
            flex: { xs: "1 1 100%", md: "0 1 280px" },
            border: 1,
            borderColor: "divider",
            borderRadius: "9px",
            bgcolor: subtleBg(th),
            "& .MuiSvgIcon-root": { fontSize: 18, color: "text.secondary" },
          })}
        >
          <SearchOutlined />
          <InputBase value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("filter.search")} inputProps={{ "aria-label": t("filter.search") }} sx={{ flex: 1, fontSize: "0.875rem" }} />
        </Box>
        <TextField select size="small" value={type} onChange={(e) => setType(e.target.value)} label={t("filter.type")} sx={{ minWidth: 160 }}>
          <MenuItem value="all">{t("filter.allTypes")}</MenuItem>
          {(summary?.byType ?? []).map((item) => (
            <MenuItem key={item.type} value={item.type}>
              {item.short}
            </MenuItem>
          ))}
        </TextField>
        {projects && projects.length > 0 && (
          <TextField select size="small" value={projectId ?? ""} onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)} label={t("table.project")} sx={{ minWidth: 180 }}>
            <MenuItem value="">{t("filter.allProjects")}</MenuItem>
            {projects.map((project) => (
              <MenuItem key={project.id} value={project.id}>
                {project.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        {view === "archive" && (
          <>
            <TextField select size="small" value={year} onChange={(e) => setYear(e.target.value)} label={t("filter.year")} sx={{ minWidth: 120 }}>
              <MenuItem value="all">{t("filter.allYears")}</MenuItem>
              {(archiveSummary.data?.years ?? []).map((y) => (
                <MenuItem key={y} value={y}>
                  {y}
                </MenuItem>
              ))}
            </TextField>
            <FormControlLabel control={<Switch size="small" checked={notExported} onChange={(_, on) => setNotExported(on)} />} label={t("filter.notExported")} />
          </>
        )}
        <Box sx={{ ml: { md: "auto" }, display: "flex", gap: 1 }}>
          {view === "archive" && canManage && (
            <Button variant="outlined" size="small" startIcon={<CloudUploadOutlined />} disabled={export1c.isPending} onClick={() => export1c.mutate()}>
              {t("toolbar.export1c")}
            </Button>
          )}
          {view !== "archive" && canManage && (
            <Button variant="contained" size="small" startIcon={<AddOutlined />} onClick={() => setCreateOpen(true)}>
              {t("toolbar.newDocument")}
            </Button>
          )}
        </Box>
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: view === "archive" ? "minmax(0, 1fr)" : "minmax(0, 1fr) 320px" }, alignItems: "start" }}>
        <Box sx={{ ...cardSx, overflow: "hidden" }}>
          <DocumentsGrid
            rows={rows}
            loading={list.isFetching}
            emptyText={filtered ? t("table.emptyFiltered") : t("table.empty")}
            onOpen={(doc) => openDoc(doc.id)}
            headerHeight={theme.appLayout?.table?.headerRowHeight ?? 44}
          />
        </Box>
        {view === "edo" && (
          <Box sx={{ display: "grid", gap: 2, minWidth: 0 }}>
            <MineList docs={mine.data} onOpen={openDoc} />
            <Structure summary={summary} />
          </Box>
        )}
        {view === "contracts" && <Expiring summary={contractsSummary.data} onOpen={openDoc} />}
      </Box>

      <DocumentDrawer docId={docId} onClose={() => openDoc(null)} onOpenDoc={openDoc} />
      {canManage && (
        <NewDocumentDrawer
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(doc) => {
            setCreateOpen(false);
            openDoc(doc.id);
          }}
        />
      )}
    </>
  );
}

// ─── KPI ───────────────────────────────────────────────────────────────────

interface KpiItem {
  key: string;
  label: string;
  value: React.ReactNode;
  hint?: string | null;
  tone?: "warning" | "error" | "info" | "success" | null;
}

function KpiRow({ items }: { items: KpiItem[] | null }) {
  return (
    <Box sx={{ mb: 2, display: "grid", gap: 1.5, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" } }}>
      {items
        ? items.map((item) => (
            <Box key={item.key} sx={{ ...cardSx, p: { xs: 1.75, md: 2.25 }, minWidth: 0 }}>
              <Typography noWrap sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>
                {item.label}
              </Typography>
              <Typography noWrap sx={{ mt: 0.75, fontSize: { xs: "1.3rem", md: "1.75rem" }, fontWeight: 700, lineHeight: 1.15, fontVariantNumeric: "tabular-nums", color: item.tone ? `${item.tone}.onSurface` : "text.primary" }}>
                {item.value}
              </Typography>
              {item.hint && (
                <Typography component="span" sx={(th) => ({ mt: 0.75, display: "inline-block", px: 0.75, py: 0.2, borderRadius: "6px", fontSize: "0.72rem", bgcolor: subtleBg(th, true), color: "text.secondary" })}>
                  {item.hint}
                </Typography>
              )}
            </Box>
          ))
        : [0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={104} sx={{ borderRadius: "14px" }} />)}
    </Box>
  );
}

function EdoKpis({ summary }: { summary: EdoSummary | undefined }) {
  const { t } = useT("edo");
  return (
    <KpiRow
      items={
        summary
          ? [
              { key: "review", label: t("kpi.review"), value: summary.review, hint: summary.overdue ? t("kpi.overdue", { count: summary.overdue }) : null, tone: "warning" },
              { key: "mine", label: t("kpi.waitingMine"), value: summary.waitingMyDecision, tone: summary.waitingMyDecision ? "error" : null },
              { key: "signing", label: t("kpi.signing"), value: summary.signing, hint: t("kpi.signingCounterparty", { count: summary.signingWaitingCounterparty }) },
              { key: "signed", label: t("kpi.signedMonth"), value: summary.signedThisMonth, hint: t("kpi.avgApproval", { hours: summary.avgApprovalHours }) },
            ]
          : null
      }
    />
  );
}

function ContractsKpis({ summary }: { summary: ContractsSummary | undefined }) {
  const { t } = useT("edo");
  return (
    <KpiRow
      items={
        summary
          ? [
              { key: "portfolio", label: t("kpi.portfolio"), value: formatKGS(summary.portfolio), hint: t("kpi.buyers", { count: summary.buyersCount }) },
              { key: "active", label: t("kpi.contractsActive"), value: summary.activeCount, tone: "success" },
              { key: "pending", label: t("kpi.contractsPending"), value: summary.pendingCount, tone: "info" },
              { key: "closed", label: t("kpi.contractsClosed"), value: summary.closedCount },
            ]
          : null
      }
    />
  );
}

function ArchiveKpis({ summary }: { summary: ArchiveSummary | undefined }) {
  const { t } = useT("edo");
  return (
    <KpiRow
      items={
        summary
          ? [
              { key: "total", label: t("kpi.archiveTotal"), value: summary.total, hint: t("kpi.storage", { size: formatBytes(summary.storageBytes) }) },
              { key: "exported", label: t("kpi.archiveExported"), value: summary.exportedCount, tone: "success" },
              { key: "pending", label: t("kpi.archivePending"), value: summary.pendingExportCount, tone: summary.pendingExportCount ? "warning" : null },
              { key: "terminated", label: t("kpi.archiveTerminated"), value: summary.terminatedCount },
            ]
          : null
      }
    />
  );
}

// ─── Таблица ───────────────────────────────────────────────────────────────

function DocumentsGrid({ rows, loading, emptyText, onOpen, headerHeight }: { rows: EdoDocument[]; loading: boolean; emptyText: string; onOpen: (doc: EdoDocument) => void; headerHeight: number }) {
  const { t } = useT("edo");
  const columns = React.useMemo<GridColDef<EdoDocument>[]>(
    () => [
      {
        field: "number",
        headerName: t("table.number"),
        minWidth: 150,
        flex: 0.8,
        renderCell: ({ row }) => (
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 700, fontSize: "0.8125rem" }}>
              {row.number}
            </Typography>
            <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
              {row.typeShort} · {t(`direction.${row.direction}`, { defaultValue: row.direction })}
            </Typography>
          </Box>
        ),
      },
      {
        field: "title",
        headerName: t("table.document"),
        flex: 1.6,
        minWidth: 220,
        renderCell: ({ row }) => (
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, fontSize: "0.8125rem", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{row.title}</Typography>
            <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
              {row.counterparty}
            </Typography>
          </Box>
        ),
      },
      { field: "projectName", headerName: t("table.project"), flex: 0.8, minWidth: 120, valueGetter: (_, row) => row.projectName ?? "—" },
      {
        field: "amount",
        headerName: t("table.amount"),
        minWidth: 130,
        align: "right",
        headerAlign: "right",
        renderCell: ({ row }) => <Box sx={{ fontVariantNumeric: "tabular-nums" }}>{row.amount ? formatKGS(row.amount) : "—"}</Box>,
      },
      { field: "date", headerName: t("table.date"), minWidth: 105, valueGetter: (_, row) => formatDateRu(row.date) },
      {
        field: "step",
        headerName: t("table.step"),
        flex: 1,
        minWidth: 170,
        sortable: false,
        renderCell: ({ row }) => {
          const step = currentStep(row);
          if (step)
            return (
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 600, fontSize: "0.8125rem" }}>
                  {step.approverName || step.name}
                </Typography>
                <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                  {step.position}
                </Typography>
              </Box>
            );
          if (row.status === "signing" && row.waitingCounterparty) return <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("table.waitingCounterparty")}</Typography>;
          if (row.signedAt) return <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("table.signedAt", { date: formatDateRu(row.signedAt) })}</Typography>;
          return "—";
        },
      },
      {
        field: "deadline",
        headerName: t("table.deadline"),
        minWidth: 140,
        renderCell: ({ row }) => {
          const days = overdueDays(row);
          if (days) return <EdoStatusChip status="rejected" tone="error" label={t("table.overdueDays", { count: days })} />;
          return row.deadline ? formatDateRu(row.deadline) : "—";
        },
      },
      {
        field: "status",
        headerName: t("table.status"),
        minWidth: 140,
        renderCell: ({ row }) => <EdoStatusChip status={row.status} label={row.statusLabel || t(`status.${row.status}`)} />,
      },
    ],
    [t],
  );
  return (
    <DataGrid<EdoDocument>
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      loading={loading}
      rowHeight={64}
      columnHeaderHeight={headerHeight}
      disableColumnMenu
      disableRowSelectionOnClick
      autoHeight
      initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
      pageSizeOptions={[25, 50, 100]}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: emptyText }}
      onRowClick={({ row }) => onOpen(row)}
      getRowClassName={({ row }) => (row.overdue ? "row-overdue" : "")}
      sx={(th) => ({
        border: 0,
        "& .MuiDataGrid-row": { cursor: "pointer" },
        "& .MuiDataGrid-columnHeaders": { bgcolor: subtleBg(th) },
        // DataGrid ставит ячейке line-height во всю строку — двухстрочные ячейки и чипы от этого раздувает.
        "& .MuiDataGrid-cell": { display: "flex", alignItems: "center", lineHeight: 1.4 },
        "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within": { outline: "none" },
      })}
    />
  );
}

// ─── Правая колонка ────────────────────────────────────────────────────────

function SideCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Box sx={{ ...cardSx, p: 2, minWidth: 0, overflow: "hidden" }}>
      <Typography component="h2" sx={{ fontWeight: 700, fontSize: "1rem" }}>
        {title}
      </Typography>
      {hint && <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{hint}</Typography>}
      <Box sx={{ mt: 1.25 }}>{children}</Box>
    </Box>
  );
}

function MineList({ docs, onOpen }: { docs: EdoDocument[] | undefined; onOpen: (id: number) => void }) {
  const { t } = useT("edo");
  return (
    <SideCard title={t("side.mineTitle")}>
      {!docs ? (
        <Skeleton variant="rounded" height={80} />
      ) : docs.length === 0 ? (
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("side.mineEmpty")}</Typography>
      ) : (
        <Box sx={{ display: "grid", gap: 1 }}>
          {docs.slice(0, 6).map((doc) => {
            const days = overdueDays(doc);
            return (
              <ButtonBase key={doc.id} onClick={() => onOpen(doc.id)} sx={{ p: 1.25, display: "block", minWidth: 0, textAlign: "left", border: 1, borderColor: "divider", borderRadius: "10px" }}>
                <Typography sx={{ fontWeight: 600, fontSize: "0.8125rem" }}>{doc.title}</Typography>
                <Box sx={{ mt: 0.5, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                  <Typography noWrap sx={{ minWidth: 0, fontSize: "0.72rem", color: "text.secondary" }}>
                    {doc.number}
                    {doc.amount ? ` · ${formatKGS(doc.amount)}` : ""}
                  </Typography>
                  {days > 0 && <EdoStatusChip status="rejected" tone="error" label={t("table.overdueDays", { count: days })} />}
                </Box>
              </ButtonBase>
            );
          })}
        </Box>
      )}
    </SideCard>
  );
}

function Structure({ summary }: { summary: EdoSummary | undefined }) {
  const { t } = useT("edo");
  if (!summary || summary.byType.length === 0) return null;
  const max = Math.max(...summary.byType.map((b) => b.count), 1);
  return (
    <SideCard title={t("side.structure")} hint={t("side.structureHint")}>
      <Box sx={{ display: "grid", gap: 0.75 }}>
        {summary.byType.map((item) => (
          <Box key={item.type} sx={{ display: "grid", gridTemplateColumns: "90px 1fr 28px", alignItems: "center", gap: 1, fontSize: "0.75rem" }}>
            <Typography noWrap sx={{ fontSize: "0.75rem" }}>
              {item.short}
            </Typography>
            <Box sx={(th) => ({ height: 6, borderRadius: 99, bgcolor: subtleBg(th, true), overflow: "hidden" })}>
              <Box sx={{ height: "100%", width: `${(item.count / max) * 100}%`, bgcolor: "primary.main", borderRadius: 99 }} />
            </Box>
            <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, textAlign: "right" }}>{item.count}</Typography>
          </Box>
        ))}
      </Box>
    </SideCard>
  );
}

function Expiring({ summary, onOpen }: { summary: ContractsSummary | undefined; onOpen: (id: number) => void }) {
  const { t } = useT("edo");
  return (
    <SideCard title={t("side.expiring")}>
      {!summary ? (
        <Skeleton variant="rounded" height={80} />
      ) : summary.expiring.length === 0 ? (
        <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary" }}>{t("side.expiringEmpty")}</Typography>
      ) : (
        <Box sx={{ display: "grid", gap: 0.5 }}>
          {summary.expiring.map((item) => (
            <ButtonBase key={item.id} onClick={() => onOpen(item.id)} sx={{ py: 0.75, display: "flex", justifyContent: "space-between", gap: 1, textAlign: "left", borderBottom: 1, borderColor: "divider" }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 600, fontSize: "0.8125rem" }}>
                  {item.number}
                </Typography>
                <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                  {item.counterparty} · {formatDateRu(item.validUntil)}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: item.daysLeft <= 7 ? "error.onSurface" : "warning.onSurface", whiteSpace: "nowrap" }}>
                {t("side.daysLeft", { count: item.daysLeft })}
              </Typography>
            </ButtonBase>
          ))}
        </Box>
      )}
    </SideCard>
  );
}
