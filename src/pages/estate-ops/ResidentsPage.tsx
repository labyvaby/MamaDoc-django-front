import React from "react";
import { Box, Button, MenuItem, Skeleton, TextField, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { useSnackbar } from "notistack";
import dayjs from "dayjs";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CampaignOutlined from "@mui/icons-material/CampaignOutlined";

import {
  REQUEST_FILTERS,
  estateOpsKeys,
  getHouses,
  getNotices,
  getRequestsSummary,
  getResidentRequests,
  runNoticeAction,
  type Notice,
  type RequestFilter,
  type ResidentRequest,
} from "../../api/estateOps";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { StatusPill } from "../construction/shared";
import { useConstructionProjects } from "../construction/hooks";
import { cardSx } from "../estate-dashboard/format";
import { EmptyNote, InfoRow, PillTabs, SubPill, TwoLines } from "../realty-finance/shared";
import { CardHeader, KpiCards, ScreenError, SearchBox } from "../realty-sales/shared";
import { useIdParam } from "../realty-sales/useLeadParam";
import { noticeTone, requestTone } from "./format";
import { useRefreshOps } from "./hooks";
import { NewRequestDrawer, NoticeDrawer, RequestDrawer, SlaBadge } from "./ResidentsForms";

type Tab = "requests" | "notices" | "houses";
const TABS: Tab[] = ["requests", "notices", "houses"];

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/**
 * «Сервис жильцов» застройщика (AIVIO, гайд `frontend-hr-ops.md` §5):
 * обращения с SLA и перепиской (чип по умолчанию — «Открытые», список уже по
 * остатку SLA), уведомления по дому, дома. Карточка — `?request=`.
 * Действия — `estate_ops.manage`.
 */
export default function ResidentsPage() {
  const { t } = useT("estateOps");
  usePageTitle(t("residents.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <ResidentsScreen />
    </Box>
  );
}

function ResidentsScreen() {
  const { t } = useT("estateOps");
  const scope = useRealtyScope();
  const refresh = useRefreshOps();
  const { enqueueSnackbar } = useSnackbar();
  const canManage = useCan("estate_ops.manage");
  const [searchParams, setSearchParams] = useSearchParams();
  const [requestId, openRequest] = useIdParam("request");
  const tabParam = searchParams.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "requests";
  const [status, setStatus] = React.useState<RequestFilter>("open");
  const [projectId, setProjectId] = React.useState<number | "">("");
  const [search, setSearch] = React.useState("");
  const q = useDebounced(search, 350);
  const [dialog, setDialog] = React.useState<"request" | "notice" | null>(null);
  const enabled = scope.orgReady !== false;
  const project = projectId === "" ? null : projectId;

  const summary = useQuery({ queryKey: estateOpsKeys.requestsSummary(scope, project), queryFn: ({ signal }) => getRequestsSummary(project, scope, signal), enabled, staleTime: 30_000, placeholderData: keepPreviousData });
  const params = { status, projectId: project, search: q };
  const requests = useQuery({ queryKey: estateOpsKeys.requests(scope, params), queryFn: ({ signal }) => getResidentRequests(params, scope, signal), enabled: enabled && tab === "requests", staleTime: 30_000, placeholderData: keepPreviousData });
  const notices = useQuery({ queryKey: estateOpsKeys.notices(scope, project), queryFn: ({ signal }) => getNotices(project, scope, signal), enabled: enabled && tab === "notices", staleTime: 30_000 });
  const houses = useQuery({ queryKey: estateOpsKeys.houses(scope), queryFn: ({ signal }) => getHouses(scope, signal), enabled: enabled && tab === "houses", staleTime: 60_000 });
  const projects = useConstructionProjects().data ?? [];
  const noticeAction = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "send" | "cancel" }) => runNoticeAction(id, action, scope),
    onSuccess: (_, { action }) => {
      refresh();
      enqueueSnackbar(action === "send" ? t("residents.notices.sent") : t("residents.notices.cancelled"), { variant: "success" });
    },
    onError: (error) => enqueueSnackbar(error instanceof Error && error.message ? error.message : t("common.failed"), { variant: "error" }),
  });

  const setTab = (next: Tab) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "requests") p.delete("tab");
        else p.set("tab", next);
        return p;
      },
      { replace: true },
    );

  if (summary.error) return <ScreenError error={summary.error} title={t("residents.loadError")} onRetry={() => void summary.refetch()} />;
  const s = summary.data;
  // Категории для формы — из сводки и уже загруженного списка (справочника кодов у фронта нет).
  const categories = Array.from(new Map([...(s?.byCategory ?? []), ...(requests.data ?? []).map((r) => ({ category: r.category, categoryLabel: r.categoryLabel, count: 0 }))].filter((c) => c.category).map((c) => [c.category, c])).values());
  const listError = requests.error ?? notices.error ?? houses.error;

  return (
    <>
      <Box sx={{ mb: 1.5, pt: 0.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ flex: "1 1 240px", fontSize: "0.875rem", color: "text.secondary" }}>{t("residents.subtitle")}</Typography>
        {canManage && (
          <>
            <Button size="small" variant="outlined" startIcon={<CampaignOutlined />} onClick={() => setDialog("notice")} sx={{ whiteSpace: "nowrap" }}>
              {t("residents.newNotice")}
            </Button>
            <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => setDialog("request")} sx={{ whiteSpace: "nowrap" }}>
              {t("residents.new")}
            </Button>
          </>
        )}
      </Box>

      <KpiCards
        items={
          s
            ? [
                { key: "open", label: t("residents.kpi.open"), value: String(s.open), hint: t("residents.kpi.openHint", { count: s.new }), tone: s.new > 0 ? "warning" : null },
                { key: "overdue", label: t("residents.kpi.overdue"), value: String(s.overdue), tone: s.overdue > 0 ? "error" : null },
                { key: "avg", label: t("residents.kpi.avg"), value: s.avgResolutionHours != null ? t("residents.kpi.avgValue", { hours: s.avgResolutionHours.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) }) : "—" },
                { key: "rating", label: t("residents.kpi.rating"), value: s.rating != null ? `${s.rating.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ★` : "—", hint: t("residents.kpi.ratingHint", { count: s.ratedCount }) },
              ]
            : null
        }
      />

      <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <PillTabs<Tab> value={tab} onChange={setTab} tabs={TABS.map((key) => ({ key, label: t(`residents.tabs.${key}`) }))} />
        {tab !== "houses" && (
          <Box sx={{ ml: { md: "auto" }, display: "flex", alignItems: "center", gap: 1, flexWrap: { xs: "wrap", md: "nowrap" }, flex: { xs: "1 1 100%", md: "0 1 auto" } }}>
            <TextField
              select
              size="small"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value === "" ? "" : Number(e.target.value))}
              SelectProps={{ displayEmpty: true }}
              sx={{ minWidth: 180, "& .MuiInputBase-root": { height: 32, fontSize: "0.875rem" } }}
              inputProps={{ "aria-label": t("common.allProjects") }}
            >
              <MenuItem value="">{t("common.allProjects")}</MenuItem>
              {projects.map((p) => (
                <MenuItem key={p.projectId} value={p.projectId}>
                  {p.projectName}
                </MenuItem>
              ))}
            </TextField>
            {tab === "requests" && <SearchBox value={search} onChange={setSearch} placeholder={t("residents.search")} />}
          </Box>
        )}
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", xl: "minmax(0, 1fr) 300px" }, alignItems: "start" }}>
        <Box sx={{ minWidth: 0 }}>
          {listError ? (
            <ScreenError error={listError} onRetry={() => void (tab === "requests" ? requests : tab === "notices" ? notices : houses).refetch()} />
          ) : tab === "requests" ? (
            <>
              <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {REQUEST_FILTERS.map((key) => (
                  <SubPill key={key} active={status === key} onClick={() => setStatus(key)} label={t(`residents.filter.${key}`)} />
                ))}
              </Box>
              <Box sx={{ ...cardSx, overflow: "hidden" }}>
                <RequestsGrid rows={requests.data ?? []} loading={requests.isFetching} filtered={Boolean(q.trim()) || project != null || status !== "open"} onOpen={(r) => openRequest(r.id)} />
              </Box>
            </>
          ) : tab === "notices" ? (
            <NoticesList data={notices.data} canManage={canManage} busy={noticeAction.isPending} onAction={(id, action) => noticeAction.mutate({ id, action })} />
          ) : (
            <HousesView data={houses.data} />
          )}
        </Box>
        <Box sx={{ display: "grid", gap: 2, minWidth: 0, alignItems: "start", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))", xl: "minmax(0, 1fr)" } }}>
          <Box sx={{ ...cardSx, minWidth: 0 }}>
            <CardHeader title={t("residents.byCategory")} />
            <Box sx={{ px: 2.25, pb: 1.5 }}>
              {(s?.byCategory ?? []).length === 0 && <Typography sx={{ pb: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t("common.empty")}</Typography>}
              {s?.byCategory.map((c) => (
                <InfoRow key={c.category} label={c.categoryLabel} value={String(c.count)} />
              ))}
            </Box>
          </Box>
          <Box sx={{ ...cardSx, minWidth: 0 }}>
            <CardHeader title={t("residents.slaNorms")} />
            <Box sx={{ px: 2.25, pb: 1.5 }}>
              {s?.slaNorms.map((n) => (
                <InfoRow key={n.label} label={n.label} value={t("residents.slaValue", { hours: n.hours })} />
              ))}
            </Box>
          </Box>
        </Box>
      </Box>

      <RequestDrawer id={requestId} preview={requests.data?.find((r) => r.id === requestId) ?? null} canManage={canManage} onClose={() => openRequest(null)} />
      <NewRequestDrawer open={dialog === "request"} categories={categories} onClose={() => setDialog(null)} onCreated={openRequest} />
      <NoticeDrawer open={dialog === "notice"} onClose={() => setDialog(null)} />
    </>
  );
}

function RequestsGrid({ rows, loading, filtered, onOpen }: { rows: ResidentRequest[]; loading: boolean; filtered: boolean; onOpen: (row: ResidentRequest) => void }) {
  const { t } = useT("estateOps");
  const columns: GridColDef<ResidentRequest>[] = [
    {
      field: "title",
      headerName: t("residents.table.request"),
      flex: 1.5,
      minWidth: 240,
      renderCell: ({ row }) => (
        <TwoLines
          strong
          top={row.title}
          bottom={
            <>
              {[row.number, row.created && dayjs(row.created).format("DD.MM HH:mm")].filter(Boolean).join(" · ")}
              {row.urgent && (
                <Box component="span" sx={{ ml: 0.75, color: "error.main", fontWeight: 700 }}>
                  {t("residents.urgent")}
                </Box>
              )}
            </>
          }
        />
      ),
    },
    { field: "resident", headerName: t("residents.table.resident"), flex: 1, minWidth: 170, renderCell: ({ row }) => <TwoLines top={row.resident || "—"} bottom={[row.projectName, row.unitNumber != null && t("residents.table.unitValue", { number: row.unitNumber })].filter(Boolean).join(" · ") || null} /> },
    { field: "categoryLabel", headerName: t("residents.table.category"), width: 140, renderCell: ({ row }) => <TwoLines top={row.categoryLabel || "—"} /> },
    { field: "slaLeftHours", headerName: t("residents.table.sla"), width: 150, renderCell: ({ row }) => <SlaBadge r={row} /> },
    { field: "assignee", headerName: t("residents.table.assignee"), width: 160, renderCell: ({ row }) => <TwoLines top={row.assignee || "—"} /> },
    { field: "status", headerName: t("residents.table.status"), width: 140, renderCell: ({ row }) => <StatusPill label={row.statusLabel || row.status} tone={requestTone(row.status)} /> },
  ];
  return (
    <DataGrid<ResidentRequest>
      rows={rows}
      columns={columns}
      loading={loading && rows.length === 0}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: filtered ? t("common.emptyFiltered") : t("common.empty") }}
      getRowHeight={() => "auto"}
      onRowClick={({ row }) => onOpen(row)}
      disableRowSelectionOnClick
      disableColumnMenu
      autoHeight
      initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
      pageSizeOptions={[25, 50, 100]}
      sx={{ border: 0, "& .MuiDataGrid-row": { cursor: "pointer" }, "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" } }}
    />
  );
}

function NoticesList({ data, canManage, busy, onAction }: { data: Notice[] | undefined; canManage: boolean; busy: boolean; onAction: (id: number, action: "send" | "cancel") => void }) {
  const { t } = useT("estateOps");
  if (!data) return <Skeleton variant="rounded" height={240} sx={{ borderRadius: "14px" }} />;
  if (data.length === 0)
    return (
      <Box sx={cardSx}>
        <EmptyNote text={t("common.empty")} />
      </Box>
    );
  return (
    <Box sx={{ ...cardSx, overflow: "hidden" }}>
      {data.map((n) => (
        <Box key={n.id} sx={{ px: 2.25, py: 1.5, display: "grid", gap: 0.5, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
          <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
            <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: "0.875rem" }}>{n.title}</Typography>
            <StatusPill label={n.statusLabel || n.status} tone={noticeTone(n.status)} />
          </Box>
          <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", whiteSpace: "pre-wrap" }}>{n.text}</Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Typography sx={{ flex: 1, minWidth: 0, fontSize: "0.72rem", color: "text.secondary" }}>
              {[n.number, n.projectName, n.audience, n.channel || n.channels.join(" + "), (n.sentAt ?? n.scheduledAt) && dayjs(n.sentAt ?? n.scheduledAt).format("DD.MM.YYYY HH:mm"), n.author].filter(Boolean).join(" · ")}
            </Typography>
            {n.deliveredPct != null && <StatusPill label={t("residents.notices.delivered", { pct: n.deliveredPct.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) })} tone="success" />}
            {canManage && n.status === "scheduled" && (
              <>
                <Button size="small" onClick={() => onAction(n.id, "send")} disabled={busy}>
                  {t("residents.notices.send")}
                </Button>
                <Button size="small" color="error" onClick={() => onAction(n.id, "cancel")} disabled={busy}>
                  {t("residents.notices.cancel")}
                </Button>
              </>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function HousesView({ data }: { data: Awaited<ReturnType<typeof getHouses>> | undefined }) {
  const { t } = useT("estateOps");
  if (!data) return <Skeleton variant="rounded" height={240} sx={{ borderRadius: "14px" }} />;
  if (data.length === 0)
    return (
      <Box sx={cardSx}>
        <EmptyNote text={t("common.empty")} />
      </Box>
    );
  return (
    <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" } }}>
      {data.map((h) => (
        <Box key={h.projectId} sx={{ ...cardSx, p: 2, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }}>{h.projectName}</Typography>
          <Typography sx={{ mb: 1, fontSize: "0.72rem", color: "text.secondary" }}>{h.address}</Typography>
          <InfoRow label={t("residents.houses.requests")} value={`${h.requestsTotal} · ${t("residents.houses.closed", { count: h.requestsClosed })}`} />
          <InfoRow label={t("residents.houses.settled")} value={t("residents.houses.settledValue", { settled: h.settled, sold: h.sold })} />
          <InfoRow label={t("residents.houses.uk")} value={h.managementCompany || t("residents.houses.ukDefault")} />
          {h.byCategory.length > 0 && (
            <Typography sx={{ mt: 0.75, fontSize: "0.72rem", color: "text.secondary" }}>{h.byCategory.map((c) => `${c.categoryLabel} ${c.count}`).join(" · ")}</Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}
