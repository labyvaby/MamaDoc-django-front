import React from "react";
import { Box, Button, ButtonBase, CircularProgress, IconButton, MenuItem, Skeleton, TextField, Typography, alpha, useTheme } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import AddOutlined from "@mui/icons-material/AddOutlined";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";

import {
  HANDOVER_STATUSES,
  estateOpsKeys,
  getHandoverSummary,
  getHandovers,
  getOpenHandoverDefects,
  getReadiness,
  getWaitingHandovers,
  weekRange,
  type Handover,
  type WaitingHandover,
} from "../../api/estateOps";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { StatusPill } from "../construction/shared";
import { useConstructionProjects } from "../construction/hooks";
import { cardSx } from "../estate-dashboard/format";
import { EmptyNote, PillTabs, SubPill, TwoLines } from "../realty-finance/shared";
import { CardHeader, KpiCards, ScreenError, SearchBox } from "../realty-sales/shared";
import { useIdParam } from "../realty-sales/useLeadParam";
import { handoverTone } from "./format";
import { HandoverDrawer, NewHandoverDrawer } from "./HandoverDrawer";

type Tab = "calendar" | "list" | "readiness";
const TABS: Tab[] = ["calendar", "list", "readiness"];

/**
 * «Приёмка и ключи» застройщика (AIVIO, гайд `frontend-hr-ops.md` §4):
 * календарь приёмок недели по менеджерам, все приёмки, готовность к
 * заселению; «Сегодня», «Ждут приёмку», «Дефекты на устранении». Карточка —
 * `?handover=`. Действия — `estate_ops.manage` (по умолчанию только юрист).
 */
export default function HandoverPage() {
  const { t } = useT("estateOps");
  usePageTitle(t("handover.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <HandoverScreen />
    </Box>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function HandoverScreen() {
  const { t } = useT("estateOps");
  const scope = useRealtyScope();
  const canManage = useCan("estate_ops.manage");
  const [searchParams, setSearchParams] = useSearchParams();
  const [handoverId, openHandover] = useIdParam("handover");
  const tabParam = searchParams.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "calendar";
  const [anchor, setAnchor] = React.useState(() => dayjs().format("YYYY-MM-DD"));
  const [projectId, setProjectId] = React.useState<number | "">("");
  const [status, setStatus] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const q = useDebounced(search, 350);
  const [preset, setPreset] = React.useState<{ waiting: WaitingHandover | null; date: string | null; managerId: number | null } | null>(null);
  const enabled = scope.orgReady !== false;
  const today = dayjs().format("YYYY-MM-DD");
  const week = weekRange(anchor);
  const project = projectId === "" ? null : projectId;

  const summary = useQuery({ queryKey: estateOpsKeys.handoverSummary(scope, project), queryFn: ({ signal }) => getHandoverSummary(project, scope, signal), enabled, staleTime: 30_000, placeholderData: keepPreviousData });
  const weekParams = { dateFrom: week.from, dateTo: week.to };
  const weekList = useQuery({ queryKey: estateOpsKeys.handovers(scope, weekParams), queryFn: ({ signal }) => getHandovers(weekParams, scope, signal), enabled: enabled && tab === "calendar", staleTime: 30_000, placeholderData: keepPreviousData });
  const listParams = { projectId: project, status: status === "all" ? "" : status, search: q };
  const all = useQuery({ queryKey: estateOpsKeys.handovers(scope, listParams), queryFn: ({ signal }) => getHandovers(listParams, scope, signal), enabled: enabled && tab === "list", staleTime: 30_000, placeholderData: keepPreviousData });
  const todayParams = { date: today };
  const todayList = useQuery({ queryKey: estateOpsKeys.handovers(scope, todayParams), queryFn: ({ signal }) => getHandovers(todayParams, scope, signal), enabled, staleTime: 30_000 });
  const waiting = useQuery({ queryKey: estateOpsKeys.waiting(scope), queryFn: ({ signal }) => getWaitingHandovers(scope, signal), enabled, staleTime: 30_000 });
  const defects = useQuery({ queryKey: estateOpsKeys.openDefects(scope), queryFn: ({ signal }) => getOpenHandoverDefects(scope, signal), enabled, staleTime: 30_000 });
  const readiness = useQuery({ queryKey: estateOpsKeys.readiness(scope), queryFn: ({ signal }) => getReadiness(scope, signal), enabled: enabled && tab === "readiness", staleTime: 60_000 });
  const projects = useConstructionProjects().data ?? [];

  const setTab = (next: Tab) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "calendar") p.delete("tab");
        else p.set("tab", next);
        return p;
      },
      { replace: true },
    );

  if (summary.error) return <ScreenError error={summary.error} title={t("handover.loadError")} onRetry={() => void summary.refetch()} />;
  const s = summary.data;
  const listError = weekList.error ?? all.error ?? readiness.error;
  const preview = [...(weekList.data ?? []), ...(all.data ?? []), ...(todayList.data ?? [])].find((h) => h.id === handoverId) ?? null;

  return (
    <>
      <Box sx={{ mb: 1.5, pt: 0.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography sx={{ flex: "1 1 240px", fontSize: "0.875rem", color: "text.secondary" }}>{t("handover.subtitle")}</Typography>
        {canManage && (
          <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={() => setPreset({ waiting: null, date: null, managerId: null })} sx={{ whiteSpace: "nowrap" }}>
            {t("handover.new")}
          </Button>
        )}
      </Box>

      <KpiCards
        items={
          s
            ? [
                { key: "week", label: t("handover.kpi.week"), value: String(s.weekAhead), hint: t("handover.kpi.weekHint", { today: s.today, total: s.scheduledTotal }) },
                { key: "defects", label: t("handover.kpi.defects"), value: String(s.withDefects), hint: t("handover.kpi.defectsHint", { count: s.openDefects }), tone: s.withDefects > 0 ? "warning" : null },
                { key: "keys", label: t("handover.kpi.keys"), value: String(s.keysIssued), hint: t("handover.kpi.keysHint", { pct: s.keysIssuedPct.toLocaleString("ru-RU", { maximumFractionDigits: 1 }), sold: s.soldUnits }), tone: s.keysIssued > 0 ? "success" : null },
                { key: "avg", label: t("handover.kpi.avg"), value: s.avgDays != null ? t("handover.kpi.avgValue", { days: s.avgDays.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) }) : "—" },
              ]
            : null
        }
      />

      <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <PillTabs<Tab> value={tab} onChange={setTab} tabs={TABS.map((key) => ({ key, label: t(`handover.tabs.${key}`) }))} />
        {tab === "list" && (
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
            <SearchBox value={search} onChange={setSearch} placeholder={t("handover.search")} />
          </Box>
        )}
      </Box>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", xl: "minmax(0, 1fr) 320px" }, alignItems: "start" }}>
        <Box sx={{ minWidth: 0 }}>
          {listError ? (
            <ScreenError error={listError} onRetry={() => void (tab === "calendar" ? weekList : tab === "list" ? all : readiness).refetch()} />
          ) : tab === "calendar" ? (
            <WeekCalendar
              week={week}
              items={weekList.data}
              today={today}
              canManage={canManage}
              onShift={(delta) => setAnchor(dayjs(anchor).add(delta * 7, "day").format("YYYY-MM-DD"))}
              onOpen={openHandover}
              onAdd={(date, managerId) => setPreset({ waiting: null, date, managerId })}
            />
          ) : tab === "list" ? (
            <>
              <Box sx={{ mb: 1.25, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {(["all", ...HANDOVER_STATUSES] as const).map((key) => (
                  <SubPill key={key} active={status === key} onClick={() => setStatus(key)} label={t(`handover.status.${key}`)} />
                ))}
              </Box>
              <Box sx={{ ...cardSx, overflow: "hidden" }}>
                <HandoversGrid rows={all.data ?? []} loading={all.isFetching} filtered={Boolean(q.trim()) || project != null || status !== "all"} onOpen={(row) => openHandover(row.id)} />
              </Box>
            </>
          ) : (
            <Readiness data={readiness.data} />
          )}
        </Box>

        <Box sx={{ display: "grid", gap: 2, minWidth: 0, alignItems: "start", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(3, minmax(0, 1fr))", xl: "minmax(0, 1fr)" } }}>
          <Box sx={{ ...cardSx, minWidth: 0 }}>
            <CardHeader title={t("handover.today")} />
            <Box sx={{ px: 2.25, pb: 1.5 }}>
              {todayList.data?.length === 0 && <Typography sx={{ pb: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t("handover.todayEmpty")}</Typography>}
              {todayList.data?.map((h) => (
                <ButtonBase key={h.id} onClick={() => openHandover(h.id)} sx={{ width: "100%", py: 0.9, display: "flex", alignItems: "baseline", gap: 1, textAlign: "left", borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                  <Typography sx={{ width: 44, flexShrink: 0, fontSize: "0.8125rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{h.time}</Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                      {h.buyer}
                    </Typography>
                    <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                      {[h.projectName, h.unitNumber != null && `кв. ${h.unitNumber}`].filter(Boolean).join(" · ")}
                    </Typography>
                  </Box>
                  <StatusPill label={h.statusLabel || h.status} tone={handoverTone(h.status)} />
                </ButtonBase>
              ))}
            </Box>
          </Box>
          <Box sx={{ ...cardSx, minWidth: 0 }}>
            <CardHeader title={t("handover.waiting")} subtitle={waiting.data ? String(waiting.data.length) : undefined} />
            <Box sx={{ px: 2.25, pb: 1.5 }}>
              {waiting.data?.length === 0 && <Typography sx={{ pb: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t("handover.waitingEmpty")}</Typography>}
              {waiting.data?.map((w) => (
                <Box key={w.billingAccountId} sx={{ py: 0.9, display: "flex", alignItems: "center", gap: 1, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                      {w.buyer}
                    </Typography>
                    <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                      {[w.projectName, w.unitNumber != null && `кв. ${w.unitNumber}`, w.contract].filter(Boolean).join(" · ")}
                    </Typography>
                  </Box>
                  {canManage && (
                    <Button size="small" onClick={() => setPreset({ waiting: w, date: null, managerId: null })}>
                      {t("handover.assign")}
                    </Button>
                  )}
                </Box>
              ))}
            </Box>
          </Box>
          <Box sx={{ ...cardSx, minWidth: 0 }}>
            <CardHeader title={t("handover.openDefects")} subtitle={defects.data ? String(defects.data.length) : undefined} />
            <Box sx={{ px: 2.25, pb: 1.5 }}>
              {defects.data?.length === 0 && <Typography sx={{ pb: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t("handover.openDefectsEmpty")}</Typography>}
              {defects.data?.map((d) => (
                <ButtonBase key={d.id} onClick={() => openHandover(d.handoverId)} sx={{ width: "100%", py: 0.9, display: "block", textAlign: "left", borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                  <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                    {d.title}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: "0.72rem", color: d.overdueDays > 0 ? "error.main" : "text.secondary" }}>
                    {[d.handoverNumber, d.unitNumber != null && `кв. ${d.unitNumber}`, d.overdueDays > 0 ? t("handover.overdue", { days: t("common.days", { count: d.overdueDays }) }) : d.fixBy && t("handover.until", { date: dayjs(d.fixBy).format("DD.MM") })].filter(Boolean).join(" · ")}
                  </Typography>
                </ButtonBase>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>

      <HandoverDrawer id={handoverId} preview={preview} canManage={canManage} onClose={() => openHandover(null)} />
      <NewHandoverDrawer preset={preset} onClose={() => setPreset(null)} onCreated={openHandover} />
    </>
  );
}

/** Неделя по менеджерам: строки — уникальные `manager` из ответа (гайд §4). */
function WeekCalendar({
  week,
  items,
  today,
  canManage,
  onShift,
  onOpen,
  onAdd,
}: {
  week: { from: string; to: string; days: string[] };
  items: Handover[] | undefined;
  today: string;
  canManage: boolean;
  onShift: (delta: number) => void;
  onOpen: (id: number) => void;
  onAdd: (date: string, managerId: number | null) => void;
}) {
  const { t } = useT("estateOps");
  const theme = useTheme();
  const managers = Array.from(new Map((items ?? []).map((h) => [h.manager || "—", h.managerId] as const)).entries());
  const label = `${dayjs(week.from).locale("ru").format("D MMM")} — ${dayjs(week.to).locale("ru").format("D MMM YYYY")}`;
  return (
    <Box sx={{ ...cardSx, overflow: "hidden" }}>
      <Box sx={{ px: 2, py: 1.25, display: "flex", alignItems: "center", gap: 1, borderBottom: 1, borderColor: "divider" }}>
        <IconButton size="small" aria-label={t("common.prev")} onClick={() => onShift(-1)}>
          <ChevronLeftOutlined />
        </IconButton>
        <Typography sx={{ minWidth: 190, textAlign: "center", fontWeight: 700 }}>{label}</Typography>
        <IconButton size="small" aria-label={t("common.next")} onClick={() => onShift(1)}>
          <ChevronRightOutlined />
        </IconButton>
      </Box>
      {!items ? (
        <Box sx={{ p: 2 }}>
          <Skeleton variant="rounded" height={220} />
        </Box>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Box sx={{ minWidth: 820 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "180px repeat(7, minmax(0, 1fr))", borderBottom: 1, borderColor: "divider" }}>
              <Typography sx={{ px: 1.5, py: 0.75, fontSize: "0.72rem", fontWeight: 700, color: "text.secondary" }}>{t("handover.calendar.manager")}</Typography>
              {week.days.map((d) => (
                <Typography key={d} sx={{ px: 1, py: 0.75, fontSize: "0.72rem", fontWeight: 700, color: d === today ? "primary.main" : "text.secondary", textTransform: "capitalize" }}>
                  {dayjs(d).locale("ru").format("dd, D")}
                </Typography>
              ))}
            </Box>
            {managers.length === 0 && <EmptyNote text={t("handover.calendar.empty")} />}
            {managers.map(([manager, managerId]) => {
              const mine = (items ?? []).filter((h) => (h.manager || "—") === manager);
              return (
                <Box key={manager} sx={{ display: "grid", gridTemplateColumns: "180px repeat(7, minmax(0, 1fr))", borderBottom: 1, borderColor: "divider", "&:last-of-type": { borderBottom: 0 } }}>
                  <Box sx={{ px: 1.5, py: 1, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                      {manager}
                    </Typography>
                    <Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>{t("handover.calendar.slots", { count: mine.length })}</Typography>
                  </Box>
                  {week.days.map((d) => {
                    const cell = mine.filter((h) => h.date === d).sort((a, b) => a.time.localeCompare(b.time));
                    return (
                      <Box key={d} sx={{ p: 0.5, minWidth: 0, display: "grid", gap: 0.5, alignContent: "start", borderLeft: 1, borderColor: "divider", bgcolor: d === today ? alpha(theme.palette.primary.main, 0.04) : "transparent" }}>
                        {cell.map((h) => {
                          const tone = handoverTone(h.status);
                          return (
                            <ButtonBase
                              key={h.id}
                              onClick={() => onOpen(h.id)}
                              title={`${h.number} · ${h.buyer}`}
                              sx={{ px: 0.75, py: 0.5, borderRadius: "6px", display: "block", textAlign: "left", borderLeft: 3, borderColor: tone ? `${tone}.main` : "divider", bgcolor: "action.hover", minWidth: 0 }}
                            >
                              <Typography sx={{ fontSize: "0.7rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{h.time}</Typography>
                              <Typography noWrap sx={{ fontSize: "0.7rem" }}>
                                {h.unitNumber != null ? `кв. ${h.unitNumber}` : h.number}
                              </Typography>
                            </ButtonBase>
                          );
                        })}
                        {canManage && d >= today && (
                          <ButtonBase onClick={() => onAdd(d, managerId)} aria-label={t("handover.calendar.add")} sx={{ height: 20, borderRadius: "6px", color: "text.disabled", "&:hover": { color: "primary.main", bgcolor: "action.hover" } }}>
                            <AddOutlined sx={{ fontSize: 16 }} />
                          </ButtonBase>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function HandoversGrid({ rows, loading, filtered, onOpen }: { rows: Handover[]; loading: boolean; filtered: boolean; onOpen: (row: Handover) => void }) {
  const { t } = useT("estateOps");
  const columns: GridColDef<Handover>[] = [
    { field: "number", headerName: t("handover.table.number"), width: 120, renderCell: ({ row }) => <TwoLines strong top={row.number} bottom={row.projectName || null} /> },
    { field: "unitNumber", headerName: t("handover.table.unit"), width: 150, renderCell: ({ row }) => <TwoLines top={row.unitNumber != null ? t("handover.table.unitValue", { number: row.unitNumber, floor: row.floor ?? "—" }) : "—"} bottom={row.area != null ? `${row.area} м²` : null} /> },
    { field: "buyer", headerName: t("handover.table.buyer"), flex: 1, minWidth: 170, renderCell: ({ row }) => <TwoLines top={row.buyer} bottom={row.manager || null} /> },
    { field: "date", headerName: t("handover.table.date"), width: 130, renderCell: ({ row }) => <TwoLines top={row.date ? dayjs(row.date).format("DD.MM.YYYY") : "—"} bottom={row.time || null} /> },
    { field: "checklistChecked", headerName: t("handover.table.checklist"), width: 110, renderCell: ({ row }) => <TwoLines top={`${row.checklistChecked}/${row.checklistTotal}`} /> },
    {
      field: "defectsOpen",
      headerName: t("handover.table.defects"),
      width: 120,
      renderCell: ({ row }) => (
        <Typography sx={{ fontSize: "0.8125rem", color: row.defectsOpen > 0 ? "warning.main" : row.defectsTotal > 0 ? "success.main" : "text.secondary" }}>
          {row.defectsOpen > 0 ? t("handover.table.defectsOpen", { count: row.defectsOpen }) : row.defectsTotal > 0 ? t("handover.table.defectsDone") : "—"}
        </Typography>
      ),
    },
    { field: "status", headerName: t("handover.table.status"), width: 150, renderCell: ({ row }) => <StatusPill label={row.statusLabel || row.status} tone={handoverTone(row.status)} /> },
  ];
  return (
    <DataGrid<Handover>
      rows={rows}
      columns={columns}
      loading={loading && rows.length === 0}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: filtered ? t("common.emptyFiltered") : t("common.empty") }}
      getRowHeight={() => "auto"}
      onRowClick={({ row }) => onOpen(row)}
      disableRowSelectionOnClick
      disableColumnMenu
      autoHeight
      hideFooter
      sx={{ border: 0, "& .MuiDataGrid-row": { cursor: "pointer" }, "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" } }}
    />
  );
}

function Readiness({ data }: { data: Awaited<ReturnType<typeof getReadiness>> | undefined }) {
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
      {data.map((p) => (
        <Box key={p.projectId} sx={{ ...cardSx, p: 2, minWidth: 0, display: "grid", gap: 1.25 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box sx={{ position: "relative", width: 56, height: 56, flexShrink: 0 }}>
              <CircularProgress variant="determinate" value={100} size={56} thickness={4} sx={{ color: "action.hover", position: "absolute" }} />
              <CircularProgress variant="determinate" value={Math.min(100, p.donePct)} size={56} thickness={4} sx={{ color: "success.main", position: "absolute" }} />
              <Typography sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: "0.8125rem", fontWeight: 700 }}>{Math.round(p.donePct)}%</Typography>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography noWrap sx={{ fontWeight: 700 }}>
                {p.projectName}
              </Typography>
              <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                {p.address}
              </Typography>
              <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                {[t("handover.readiness.construction", { pct: p.constructionReadiness }), p.deadlineLabel && t("handover.readiness.deadline", { label: p.deadlineLabel })].filter(Boolean).join(" · ")}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 0.75 }}>
            {(
              [
                ["sold", p.sold],
                ["scheduled", p.scheduled],
                ["inspected", p.inspected],
                ["done", p.done],
              ] as const
            ).map(([key, value]) => (
              <Box key={key} sx={{ px: 1, py: 0.75, border: 1, borderColor: "divider", borderRadius: "8px", minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: "0.68rem", color: "text.secondary" }}>
                  {t(`handover.readiness.${key}`)}
                </Typography>
                <Typography sx={{ fontSize: "0.875rem", fontWeight: 700 }}>{value}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
