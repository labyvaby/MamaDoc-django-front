import React from "react";
import { Alert, Box, Button, IconButton, MenuItem, Skeleton, TextField, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import { useSnackbar } from "notistack";
import dayjs from "dayjs";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import PlayArrowOutlined from "@mui/icons-material/PlayArrowOutlined";
import StopOutlined from "@mui/icons-material/StopOutlined";
import SyncOutlined from "@mui/icons-material/SyncOutlined";

import { acsKeys, acsTone, getAccessDevices, getAccessLog, getMyShift, shiftDuration, syncAccessDevices, toggleMyShift, type AccessRow, type MyShift } from "../../api/acs";
import { fillTimesheet } from "../../api/personnel";
import { useCan } from "../../hooks/useCan";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRealtyScope } from "../../hooks/useRealtyScope";
import { useT } from "../../i18n/VerticalProvider";
import { StatusPill } from "../construction/shared";
import { cardSx } from "../estate-dashboard/format";
import { InfoRow, TwoLines } from "../realty-finance/shared";
import { CardHeader, KpiCards, ScreenError } from "../realty-sales/shared";
import { EmployeeDrawer } from "./StaffDrawers";
import { useCanManageStaff, useDepartments, useRefreshPersonnel } from "./hooks";

/**
 * «СКУД» застройщика (AIVIO, гайд `frontend-acs.md`): «Моя смена», журнал
 * проходов за день (`/access-log/?date=`), устройства, правила учёта. День —
 * `?date=`. Без `attendance.manage` бэк отдаёт только свои проходы.
 */
export default function AcsPage() {
  const { t } = useT("personnel");
  usePageTitle(t("acs.title"));
  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", pb: 2 }}>
      <AcsScreen />
    </Box>
  );
}

const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

function AcsScreen() {
  const { t } = useT("personnel");
  const scope = useRealtyScope();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const refresh = useRefreshPersonnel();
  const { enqueueSnackbar } = useSnackbar();
  const canSync = useCan(["attendance.manage", "construction.manage"]);
  const canFill = useCan("personnel.manage");
  const canManageStaff = useCanManageStaff();
  const [searchParams, setSearchParams] = useSearchParams();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get("date") ?? "") ? (searchParams.get("date") as string) : null;
  const [deptId, setDeptId] = React.useState<number | "">("");
  const [employeeId, setEmployeeId] = React.useState<number | null>(null);
  const dept = deptId === "" ? null : deptId;
  const enabled = scope.orgReady !== false;
  const departments = useDepartments().data ?? [];

  const log = useQuery({ queryKey: acsKeys.log(scope, date, dept), queryFn: ({ signal }) => getAccessLog(date, dept, scope, signal), enabled, staleTime: 30_000, placeholderData: keepPreviousData, refetchInterval: date == null ? 60_000 : false });
  const devices = useQuery({ queryKey: acsKeys.devices(scope), queryFn: ({ signal }) => getAccessDevices(scope, signal), enabled, staleTime: 60_000 });
  const onError = (error: unknown) => enqueueSnackbar(message(error, t("common.failed")), { variant: "error" });
  const sync = useMutation({
    mutationFn: () => syncAccessDevices(scope),
    onSuccess: (list) => {
      queryClient.setQueryData(acsKeys.devices(scope), list);
      void queryClient.invalidateQueries({ queryKey: acsKeys.all });
      enqueueSnackbar(t("acs.synced", { count: list.filter((d) => d.status === "online").length }), { variant: "success" });
    },
    onError,
  });
  const l = log.data;
  const fill = useMutation({
    mutationFn: () => fillTimesheet(l?.month ?? dayjs().format("YYYY-MM"), "acs", scope),
    onSuccess: ({ filled }) => {
      refresh();
      enqueueSnackbar(t("acs.filled", { count: filled }), { variant: "success" });
      navigate(`/personnel/timesheet?month=${l?.month ?? dayjs().format("YYYY-MM")}`);
    },
    onError,
  });
  const setDate = (next: string | null) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next) p.set("date", next);
        else p.delete("date");
        return p;
      },
      { replace: true },
    );

  if (log.error) return <ScreenError error={log.error} title={t("acs.loadError")} onRetry={() => void log.refetch()} />;

  return (
    <>
      <MyShiftCard />

      <Box sx={{ mb: 1.5, display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <IconButton size="small" aria-label={t("common.prev")} disabled={!l?.prevDate} onClick={() => l?.prevDate && setDate(l.prevDate)}>
            <ChevronLeftOutlined />
          </IconButton>
          <Typography sx={{ minWidth: 190, textAlign: "center", fontWeight: 700 }}>
            {l ? `${dayjs(l.date).locale("ru").format("D MMMM")} · ${l.weekday}` : "…"}
            {l?.isToday ? ` · ${t("acs.today")}` : ""}
          </Typography>
          <IconButton size="small" aria-label={t("common.next")} disabled={!l?.nextDate} onClick={() => l?.nextDate && setDate(l.nextDate)}>
            <ChevronRightOutlined />
          </IconButton>
        </Box>
        <Box sx={{ ml: "auto", display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          <TextField
            select
            size="small"
            value={deptId}
            onChange={(e) => setDeptId(e.target.value === "" ? "" : Number(e.target.value))}
            SelectProps={{ displayEmpty: true }}
            sx={{ minWidth: 180, "& .MuiInputBase-root": { height: 32, fontSize: "0.875rem" } }}
            inputProps={{ "aria-label": t("common.allDepartments") }}
          >
            <MenuItem value="">{t("common.allDepartments")}</MenuItem>
            {departments.map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {d.name}
              </MenuItem>
            ))}
          </TextField>
          {canSync && (
            <Button size="small" variant="outlined" startIcon={<SyncOutlined />} onClick={() => sync.mutate()} disabled={sync.isPending} sx={{ whiteSpace: "nowrap" }}>
              {t("acs.sync")}
            </Button>
          )}
          {canFill && (
            <Button size="small" variant="contained" onClick={() => fill.mutate()} disabled={fill.isPending || !l} sx={{ whiteSpace: "nowrap" }}>
              {t("acs.fill")}
            </Button>
          )}
        </Box>
      </Box>

      <KpiCards
        items={
          l
            ? [
                { key: "onSite", label: t("acs.kpi.onSite"), value: String(l.onSiteCount), hint: t("acs.kpi.onSiteHint", { total: l.staffCount, absent: l.absentCount }) },
                { key: "late", label: t("acs.kpi.late"), value: String(l.lateMonthCount), tone: l.lateMonthCount > 10 ? "warning" : null },
                { key: "avg", label: t("acs.kpi.avg"), value: t("acs.kpi.avgValue", { hours: l.avgHoursMonth.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) }) },
                { key: "devices", label: t("acs.kpi.devices"), value: `${l.devicesOnline} / ${l.devicesTotal}`, tone: l.devicesOnline < l.devicesTotal ? "error" : null },
              ]
            : null
        }
      />

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", xl: "minmax(0, 1fr) 320px" }, alignItems: "start" }}>
        <Box sx={{ ...cardSx, minWidth: 0, overflow: "hidden" }}>
          <CardHeader title={t("acs.table.title")} subtitle={l ? t("acs.table.subtitle", { count: l.markedCount }) : undefined} />
          <PassesGrid rows={l?.rows ?? []} loading={log.isFetching} onOpen={(row) => setEmployeeId(row.employeeId)} />
        </Box>
        <Box sx={{ display: "grid", gap: 2, minWidth: 0, alignItems: "start", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))", xl: "minmax(0, 1fr)" } }}>
          <Box sx={{ ...cardSx, minWidth: 0 }}>
            <CardHeader title={t("acs.devices.title")} />
            <Box sx={{ px: 2.25, pb: 1.5 }}>
              {!devices.data && <Skeleton variant="rounded" height={120} />}
              {devices.data?.length === 0 && <Typography sx={{ pb: 1, fontSize: "0.8125rem", color: "text.secondary" }}>{t("acs.devices.empty")}</Typography>}
              {devices.data?.map((d) => (
                <Box key={d.id} sx={{ py: 0.9, display: "flex", alignItems: "center", gap: 1, borderTop: 1, borderColor: "divider", "&:first-of-type": { borderTop: 0 } }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, bgcolor: d.status === "online" ? "success.main" : "error.main" }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                      {d.name}
                    </Typography>
                    <Typography noWrap sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                      {[d.type, d.lastSync && t("acs.devices.sync", { time: dayjs(d.lastSync).format("HH:mm") })].filter(Boolean).join(" · ")}
                    </Typography>
                  </Box>
                  <StatusPill label={d.statusLabel || d.status} tone={d.status === "online" ? "success" : "error"} />
                </Box>
              ))}
              <Typography sx={{ pt: 1, fontSize: "0.72rem", color: "text.secondary" }}>{t("acs.devices.note")}</Typography>
            </Box>
          </Box>
          <Box sx={{ ...cardSx, minWidth: 0 }}>
            <CardHeader title={t("acs.rules")} />
            <Box sx={{ px: 2.25, pb: 1.5 }}>
              {(l?.rules ?? []).map((r) => (
                <InfoRow key={r.label} label={r.label} value={r.value} />
              ))}
            </Box>
          </Box>
        </Box>
      </Box>

      <EmployeeDrawer id={employeeId} preview={null} canManage={canManageStaff} onClose={() => setEmployeeId(null)} />
    </>
  );
}

function PassesGrid({ rows, loading, onOpen }: { rows: AccessRow[]; loading: boolean; onOpen: (row: AccessRow) => void }) {
  const { t } = useT("personnel");
  const columns: GridColDef<AccessRow>[] = [
    { field: "employeeName", headerName: t("acs.table.employee"), flex: 1.3, minWidth: 210, renderCell: ({ row }) => <TwoLines strong top={row.employeeName} bottom={[row.position, row.departmentName].filter(Boolean).join(" · ") || null} /> },
    { field: "pointName", headerName: t("acs.table.point"), flex: 1, minWidth: 160, renderCell: ({ row }) => <TwoLines top={row.pointName || "—"} /> },
    {
      field: "checkIn",
      headerName: t("acs.table.in"),
      width: 100,
      renderCell: ({ row }) => <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: row.isLate ? "warning.main" : "text.primary", fontVariantNumeric: "tabular-nums" }}>{row.checkIn ?? "—"}</Typography>,
    },
    {
      field: "checkOut",
      headerName: t("acs.table.out"),
      width: 110,
      renderCell: ({ row }) =>
        row.checkOut ? (
          <Typography sx={{ fontSize: "0.875rem", fontVariantNumeric: "tabular-nums" }}>{row.checkOut}</Typography>
        ) : row.isOnSite ? (
          <Typography sx={{ fontSize: "0.8125rem", color: "success.main", fontWeight: 600 }}>{t("acs.table.onSite")}</Typography>
        ) : (
          "—"
        ),
    },
    {
      field: "hours",
      headerName: t("acs.table.hours"),
      width: 120,
      renderCell: ({ row }) => (
        <Typography sx={{ fontSize: "0.875rem", fontVariantNumeric: "tabular-nums" }}>
          {row.hours != null ? t("acs.table.hoursValue", { hours: row.hours.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) }) : row.isOnSite ? t("acs.table.going") : t("acs.table.hoursValue", { hours: 0 })}
        </Typography>
      ),
    },
    { field: "status", headerName: t("acs.table.status"), width: 170, renderCell: ({ row }) => <StatusPill label={row.statusLabel || row.status} tone={acsTone(row.statusTone)} /> },
  ];
  return (
    <DataGrid<AccessRow>
      rows={rows}
      columns={columns}
      getRowId={(row) => row.employeeId}
      loading={loading && rows.length === 0}
      localeText={{ ...ruRU.components.MuiDataGrid.defaultProps.localeText, noRowsLabel: t("common.empty") }}
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

/** «Моя смена»: сеть офиса определяет сервер по IP; таймер активной смены — раз в 30 с на клиенте. */
function MyShiftCard() {
  const { t } = useT("personnel");
  const scope = useRealtyScope();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const canClock = useCan("attendance.clock");
  const shift = useQuery({ queryKey: acsKeys.shift(scope), queryFn: ({ signal }) => getMyShift(scope, signal), enabled: scope.orgReady !== false, staleTime: 30_000, retry: false });
  const [, tick] = React.useState(0);
  const s = shift.data;
  React.useEffect(() => {
    if (s?.status !== "active") return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [s?.status]);
  const toggle = useMutation({
    mutationFn: (action: "start" | "end") => toggleMyShift(action, scope),
    onSuccess: (fresh, action) => {
      queryClient.setQueryData<MyShift>(acsKeys.shift(scope), fresh);
      void queryClient.invalidateQueries({ queryKey: acsKeys.all });
      const d = shiftDuration(fresh.minutes);
      enqueueSnackbar(action === "start" ? t("acs.shift.started", { time: fresh.startedAt ? dayjs(fresh.startedAt).format("HH:mm") : "", name: fresh.employeeName }) : t("acs.shift.ended", d), { variant: "success" });
    },
    onError: (error) => {
      enqueueSnackbar(message(error, t("common.failed")), { variant: "error" });
      void shift.refetch();
    },
  });
  if (shift.error) return null;
  if (!s) return <Skeleton variant="rounded" height={96} sx={{ mb: 2, borderRadius: "14px" }} />;
  const minutes = s.status === "active" && s.startedAt ? dayjs().diff(dayjs(s.startedAt), "minute") : s.minutes;
  const d = shiftDuration(minutes);
  return (
    <Box sx={{ ...cardSx, mb: 2, p: 2, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
      <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{t("acs.shift.title")}</Typography>
        <Typography sx={{ fontWeight: 700 }}>{s.employeeName || t("acs.shift.noEmployee")}</Typography>
        <Typography sx={{ fontSize: "0.75rem", color: "text.secondary" }}>{[s.position, s.pointName && t("acs.shift.point", { point: s.pointName })].filter(Boolean).join(" · ")}</Typography>
      </Box>
      <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: s.network.isOffice ? "success.main" : s.network.configured ? "error.main" : "text.secondary" }}>
          {s.network.isOffice || !s.network.configured ? t("acs.shift.network", { label: s.network.label }) : t("acs.shift.mobile")}
          {s.network.currentIp ? ` · ${s.network.currentIp}` : ""}
        </Typography>
        {s.network.hint && <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{s.network.hint}</Typography>}
      </Box>
      <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {s.status === "active"
            ? `${t("acs.shift.active", { time: s.startedAt ? dayjs(s.startedAt).format("HH:mm") : "" })} · ${t("acs.shift.duration", d)}`
            : s.status === "finished"
              ? `${t("acs.shift.finished", { from: s.startedAt ? dayjs(s.startedAt).format("HH:mm") : "—", to: s.endedAt ? dayjs(s.endedAt).format("HH:mm") : "—" })} · ${t("acs.shift.duration", d)}`
              : t("acs.shift.none")}
        </Typography>
        {s.status === "none" && <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{t("acs.shift.norm", { hours: s.normHours, lunch: s.lunchMinutes })}</Typography>}
      </Box>
      {canClock && s.employeeId != null && s.status !== "finished" && (
        <Box sx={{ display: "grid", justifyItems: "end", gap: 0.5 }}>
          {s.status === "active" ? (
            <Button variant="outlined" color="error" startIcon={<StopOutlined />} disabled={!s.canEnd || toggle.isPending} onClick={() => toggle.mutate("end")}>
              {t("acs.shift.end")}
            </Button>
          ) : (
            <Button variant="contained" startIcon={<PlayArrowOutlined />} disabled={!s.canStart || toggle.isPending} onClick={() => toggle.mutate("start")}>
              {t("acs.shift.start")}
            </Button>
          )}
          {s.hint && <Typography sx={{ maxWidth: 260, textAlign: "right", fontSize: "0.72rem", color: "text.secondary" }}>{s.hint}</Typography>}
        </Box>
      )}
      {s.employeeId == null && <Alert severity="info" sx={{ flex: "1 1 100%" }}>{t("acs.shift.noEmployee")}</Alert>}
    </Box>
  );
}
