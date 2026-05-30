import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import dayjs, { type Dayjs } from "dayjs";

import { useCanChecker } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import {
  AppointmentFilters,
  type AppointmentStatusFilter,
} from "../../components/appointments/AppointmentFilters";
import { AppointmentsEmptyState } from "../../components/appointments/AppointmentsEmptyState";
import DjangoAddAppointmentDrawer from "./DjangoAddAppointmentDrawer";
import DjangoEditAppointmentDrawer from "./DjangoEditAppointmentDrawer";
import {
  getAppointments,
  getDayCounts,
  type DjangoAppointment,
  type DjangoAppointmentStatus,
} from "../../api/appointments";

type ViewMode = "list" | "day";

export const STATUS_LABELS: Record<DjangoAppointmentStatus, string> = {
  scheduled: "Запланирован",
  waiting: "Ожидает",
  in_progress: "Принимается",
  completed: "Завершён",
  cancelled: "Отменён",
  no_show: "Не пришёл",
};

export const STATUS_COLOR: Record<
  DjangoAppointmentStatus,
  "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning"
> = {
  scheduled: "info",
  waiting: "warning",
  in_progress: "primary",
  completed: "success",
  cancelled: "error",
  no_show: "default",
};

// ── hook: load appointments ───────────────────────────────────────────────────

function useAppointments(params: {
  date: Dayjs | null;
  status: AppointmentStatusFilter;
  search: string;
  branchId?: number;
}) {
  const [items, setItems] = React.useState<DjangoAppointment[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [version, setVersion] = React.useState(0);

  const refresh = React.useCallback(() => setVersion((v) => v + 1), []);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getAppointments({
      date: params.date?.format("YYYY-MM-DD") ?? undefined,
      status: params.status === "all" ? undefined : params.status,
      search: params.search || undefined,
      branchId: params.branchId,
    })
      .then((data) => {
        if (!cancelled) { setItems(data); setLoading(false); }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Ошибка загрузки");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.date?.format("YYYY-MM-DD"), params.status, params.search, params.branchId, version]);

  return { items, loading, error, refresh };
}

// ── hook: day counts for current month ───────────────────────────────────────

function useDayCounts(date: Dayjs | null, branchId?: number) {
  const [counts, setCounts] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    const base = date ?? dayjs();
    const from = base.startOf("month").format("YYYY-MM-DD");
    const to = base.endOf("month").format("YYYY-MM-DD");
    let cancelled = false;

    getDayCounts({ dateFrom: from, dateTo: to, branchId })
      .then((data) => { if (!cancelled) setCounts(data); })
      .catch(() => { /* day-counts is optional — silently ignore */ });

    return () => { cancelled = true; };
  }, [date?.format("YYYY-MM"), branchId]);

  return counts;
}

// ── page ──────────────────────────────────────────────────────────────────────

const AppointmentsPage: React.FC = () => {
  const { can } = useCanChecker();
  const { activeBranch } = usePermissions();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [date, setDate] = React.useState<Dayjs | null>(dayjs());
  const [status, setStatus] = React.useState<AppointmentStatusFilter>("all");
  const [search, setSearch] = React.useState("");
  const [view, setView] = React.useState<ViewMode>("list");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<DjangoAppointment | null>(null);

  const canCreate = can("appointments.create");
  const canUpdate = can("appointments.update");

  const branchId = activeBranch?.id ?? undefined;

  const { items, loading, error, refresh } = useAppointments({
    date, status, search, branchId,
  });

  const dayCounts = useDayCounts(date, branchId);

  // ── day count badge on selected date ─────────────────────────────────────
  const selectedDateStr = date?.format("YYYY-MM-DD") ?? "";
  const countOnDate = selectedDateStr ? (dayCounts[selectedDateStr] ?? null) : null;

  const handleReset = React.useCallback(() => {
    setDate(dayjs());
    setStatus("all");
    setSearch("");
  }, []);

  // Day view: group by hour
  const appointmentsByHour = React.useMemo(() => {
    if (view !== "day") return new Map<number, DjangoAppointment[]>();
    const map = new Map<number, DjangoAppointment[]>();
    for (const appt of items) {
      const h = dayjs(appt.scheduledAt).hour();
      if (!map.has(h)) map.set(h, []);
      map.get(h)!.push(appt);
    }
    return map;
  }, [items, view]);

  return (
    <>
      <Box sx={{ p: { xs: 1, md: 2 }, height: "100%", display: "flex", flexDirection: "column" }}>
        <Stack spacing={2} sx={{ height: "100%" }}>
          {/* ── Header ── */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            alignItems={{ sm: "center" }}
            justifyContent="space-between"
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h5" fontWeight={600}>
                Приёмы
              </Typography>
              {activeBranch?.name && (
                <Typography variant="body2" color="text.secondary">
                  {activeBranch.name}
                </Typography>
              )}
              {/* day count badge */}
              {countOnDate !== null && (
                <Chip
                  label={`${countOnDate} на ${date?.format("D MMM")}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              )}
            </Stack>

            {canCreate && (
              <Button
                variant="contained"
                startIcon={<AddOutlined />}
                onClick={() => setCreateOpen(true)}
                size="small"
              >
                {isMobile ? "Новый" : "Новый приём"}
              </Button>
            )}
          </Stack>

          {/* ── Filters ── */}
          <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 } }}>
            <AppointmentFilters
              date={date}
              onDateChange={setDate}
              status={status}
              onStatusChange={setStatus}
              search={search}
              onSearchChange={setSearch}
              activeBranchName={activeBranch?.name ?? null}
              loading={loading}
              onRefresh={refresh}
              onReset={handleReset}
            />
          </Paper>

          {/* ── View switch + content ── */}
          <Paper
            variant="outlined"
            sx={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ borderBottom: (t) => `1px solid ${t.palette.divider}` }}
            >
              <Tabs
                value={view}
                onChange={(_e, next: ViewMode) => setView(next)}
                sx={{ "& .MuiTab-root": { textTransform: "none", minHeight: 44 } }}
              >
                <Tab
                  value="list"
                  label={
                    loading
                      ? "Список…"
                      : items.length
                        ? `Список (${items.length})`
                        : "Список"
                  }
                />
                <Tab value="day" label="По часам" />
              </Tabs>
            </Stack>

            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                overflow: "auto",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {loading ? (
                <Stack alignItems="center" justifyContent="center" flex={1} spacing={1} py={4}>
                  <CircularProgress size={32} />
                  <Typography variant="caption" color="text.secondary">
                    Загрузка приёмов…
                  </Typography>
                </Stack>
              ) : error ? (
                <Box p={2}>
                  <Alert severity="error" onClose={refresh}>
                    {error}
                  </Alert>
                </Box>
              ) : items.length === 0 ? (
                <Stack
                  alignItems="center"
                  justifyContent="center"
                  flex={1}
                  spacing={1}
                  py={6}
                  color="text.secondary"
                >
                  <EventBusyOutlined sx={{ fontSize: 48, opacity: 0.3 }} />
                  <Typography variant="body2">
                    {date ? `Нет приёмов на ${date.format("D MMMM YYYY")}` : "Нет приёмов"}
                  </Typography>
                </Stack>
              ) : view === "list" ? (
                <AppointmentTable items={items} canUpdate={canUpdate} onEdit={setEditTarget} />
              ) : (
                <DayView
                  appointmentsByHour={appointmentsByHour}
                  canUpdate={canUpdate}
                  onEdit={setEditTarget}
                />
              )}
            </Box>
          </Paper>
        </Stack>
      </Box>

      {/* ── Drawers ── */}
      <DjangoAddAppointmentDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); refresh(); }}
        initialDate={date ? date.format("YYYY-MM-DD") + "T" + dayjs().format("HH:mm") : undefined}
      />

      <DjangoEditAppointmentDrawer
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        appointment={editTarget}
        onSaved={() => { setEditTarget(null); refresh(); }}
      />
    </>
  );
};

// ── Dense appointment table ───────────────────────────────────────────────────

const AppointmentTable: React.FC<{
  items: DjangoAppointment[];
  canUpdate: boolean;
  onEdit: (a: DjangoAppointment) => void;
}> = ({ items, canUpdate, onEdit }) => (
  <Box sx={{ overflowX: "auto" }}>
    {/* header row */}
    <Stack
      direction="row"
      spacing={1}
      sx={{
        px: 2,
        py: 0.75,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "action.hover",
        position: "sticky",
        top: 0,
        zIndex: 1,
      }}
    >
      <Typography variant="caption" fontWeight={600} sx={{ width: 52, flexShrink: 0 }}>Время</Typography>
      <Typography variant="caption" fontWeight={600} sx={{ flex: 2, minWidth: 120 }}>Пациент</Typography>
      <Typography variant="caption" fontWeight={600} sx={{ flex: 2, minWidth: 120, display: { xs: "none", sm: "block" } }}>Услуга / врач</Typography>
      <Typography variant="caption" fontWeight={600} sx={{ width: 90, flexShrink: 0, display: { xs: "none", md: "block" } }}>Цена</Typography>
      <Typography variant="caption" fontWeight={600} sx={{ width: 110, flexShrink: 0 }}>Статус</Typography>
      {canUpdate && <Box sx={{ width: 36, flexShrink: 0 }} />}
    </Stack>

    <Stack divider={<Divider />}>
      {items.map((appt) => (
        <AppointmentRow key={appt.id} appointment={appt} canUpdate={canUpdate} onEdit={onEdit} />
      ))}
    </Stack>
  </Box>
);

// ── Day view ──────────────────────────────────────────────────────────────────

const DayView: React.FC<{
  appointmentsByHour: Map<number, DjangoAppointment[]>;
  canUpdate: boolean;
  onEdit: (a: DjangoAppointment) => void;
}> = ({ appointmentsByHour, canUpdate, onEdit }) => {
  const hours = Array.from(appointmentsByHour.keys()).sort((a, b) => a - b);
  if (hours.length === 0) return <AppointmentsEmptyState />;

  return (
    <Stack spacing={0} sx={{ flex: 1 }}>
      {hours.map((h) => (
        <Box key={h}>
          <Typography
            variant="caption"
            color="text.secondary"
            fontWeight={700}
            sx={{
              display: "block",
              px: 2,
              py: 0.5,
              bgcolor: "action.hover",
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            {String(h).padStart(2, "0")}:00 — {String(h + 1).padStart(2, "0")}:00
          </Typography>
          <Stack divider={<Divider />}>
            {appointmentsByHour.get(h)!.map((appt) => (
              <AppointmentRow key={appt.id} appointment={appt} canUpdate={canUpdate} onEdit={onEdit} />
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
};

// ── Appointment row ───────────────────────────────────────────────────────────

const AppointmentRow: React.FC<{
  appointment: DjangoAppointment;
  canUpdate: boolean;
  onEdit: (a: DjangoAppointment) => void;
}> = ({ appointment: appt, canUpdate, onEdit }) => {
  const time = dayjs(appt.scheduledAt).format("HH:mm");
  const patientName = appt.patient?.fullName ?? "Бронирование";
  const patientPhone = appt.patient?.phone ?? "";
  const firstService = appt.services[0];
  const serviceName = firstService?.service.name ?? "—";
  const employeeName = firstService?.employee.fullName ?? "—";
  const price = firstService?.price ?? appt.totalAmount;
  const showPrice = price && price !== "0.00" && price !== "0";

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{
        px: 2,
        py: 0.75,
        minWidth: 0,
        "&:hover": { bgcolor: "action.hover" },
        transition: "background 150ms",
      }}
    >
      {/* time */}
      <Box sx={{ width: 52, flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography variant="body2" fontWeight={600} lineHeight={1}>
            {time}
          </Typography>
          {appt.isNight
            ? <NightlightOutlined sx={{ fontSize: 11, color: "text.disabled" }} />
            : <WbSunnyOutlined sx={{ fontSize: 11, color: "warning.light" }} />
          }
        </Stack>
      </Box>

      {/* patient */}
      <Box sx={{ flex: 2, minWidth: 120 }}>
        <Typography variant="body2" fontWeight={500} noWrap>
          {patientName}
        </Typography>
        {patientPhone && (
          <Typography variant="caption" color="text.secondary" noWrap display="block">
            {patientPhone}
          </Typography>
        )}
      </Box>

      {/* service / employee */}
      <Box sx={{ flex: 2, minWidth: 120, display: { xs: "none", sm: "block" } }}>
        <Typography variant="body2" noWrap>{serviceName}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap display="block">
          {employeeName}
        </Typography>
      </Box>

      {/* price */}
      <Box sx={{ width: 90, flexShrink: 0, display: { xs: "none", md: "block" } }}>
        {showPrice && (
          <Typography variant="body2" fontWeight={500} color="text.secondary">
            {price} с
          </Typography>
        )}
      </Box>

      {/* status */}
      <Box sx={{ width: 110, flexShrink: 0 }}>
        <Chip
          label={STATUS_LABELS[appt.status] ?? appt.status}
          size="small"
          color={STATUS_COLOR[appt.status] ?? "default"}
          variant="outlined"
          sx={{ fontSize: "0.68rem", height: 20 }}
        />
      </Box>

      {/* edit */}
      {canUpdate && (
        <Box sx={{ width: 36, flexShrink: 0 }}>
          <Tooltip title="Редактировать">
            <IconButton size="small" onClick={() => onEdit(appt)}>
              <EditOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Stack>
  );
};

export default AppointmentsPage;
