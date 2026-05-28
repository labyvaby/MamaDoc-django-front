import React from "react";
import {
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
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
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
  type DjangoAppointment,
  type DjangoAppointmentStatus,
} from "../../api/appointments";

type ViewMode = "list" | "day";

const STATUS_LABELS: Record<DjangoAppointmentStatus, string> = {
  scheduled: "Запланирован",
  waiting: "Ожидает",
  in_progress: "Принимается",
  completed: "Завершён",
  cancelled: "Отменён",
  no_show: "Не пришёл",
};

const STATUS_COLOR: Record<
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
      .then((data) => { if (!cancelled) { setItems(data); setLoading(false); } })
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

// ── page ──────────────────────────────────────────────────────────────────────

const AppointmentsPage: React.FC = () => {
  const { can } = useCanChecker();
  const { activeBranch } = usePermissions();

  const [date, setDate] = React.useState<Dayjs | null>(dayjs());
  const [status, setStatus] = React.useState<AppointmentStatusFilter>("all");
  const [search, setSearch] = React.useState("");
  const [view, setView] = React.useState<ViewMode>("list");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<DjangoAppointment | null>(null);

  const canCreate = can("appointments.create");
  const canUpdate = can("appointments.update");

  const { items, loading, error, refresh } = useAppointments({
    date,
    status,
    search,
    branchId: activeBranch?.id ?? undefined,
  });

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
      <Box sx={{ p: { xs: 1, md: 2 }, height: "100%" }}>
        <Stack spacing={2} sx={{ height: "100%" }}>
          {/* ── Header ── */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            alignItems={{ sm: "center" }}
            justifyContent="space-between"
          >
            <Stack direction="row" spacing={1.5} alignItems="baseline">
              <Typography variant="h5" fontWeight={600}>
                Приёмы
              </Typography>
              {activeBranch?.name && (
                <Typography variant="body2" color="text.secondary">
                  {activeBranch.name}
                </Typography>
              )}
            </Stack>

            {canCreate && (
              <Button
                variant="contained"
                startIcon={<AddOutlined />}
                onClick={() => setCreateOpen(true)}
                size="small"
              >
                Новый приём
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
            />
          </Paper>

          {/* ── View switch + content ── */}
          <Paper
            variant="outlined"
            sx={{
              flex: 1,
              minHeight: 320,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <Tabs
              value={view}
              onChange={(_e, next: ViewMode) => setView(next)}
              sx={{
                borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
                "& .MuiTab-root": { textTransform: "none", minHeight: 44 },
              }}
            >
              <Tab value="list" label={`Список${items.length ? ` (${items.length})` : ""}`} />
              <Tab value="day" label="День" />
            </Tabs>

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
                <Stack
                  alignItems="center"
                  justifyContent="center"
                  flex={1}
                  spacing={1}
                  py={4}
                >
                  <CircularProgress />
                  <Typography variant="caption" color="text.secondary">
                    Загрузка приёмов…
                  </Typography>
                </Stack>
              ) : error ? (
                <Box p={2}>
                  <Typography color="error" variant="body2">
                    {error}
                  </Typography>
                </Box>
              ) : items.length === 0 ? (
                <Box sx={{ flex: 1, display: "flex", flexDirection: "column", p: { xs: 1.5, md: 2 } }}>
                  <AppointmentsEmptyState />
                </Box>
              ) : view === "list" ? (
                <ListView
                  items={items}
                  canUpdate={canUpdate}
                  onEdit={setEditTarget}
                />
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

// ── List view ─────────────────────────────────────────────────────────────────

const ListView: React.FC<{
  items: DjangoAppointment[];
  canUpdate: boolean;
  onEdit: (a: DjangoAppointment) => void;
}> = ({ items, canUpdate, onEdit }) => (
  <Stack divider={<Divider />} sx={{ flex: 1 }}>
    {items.map((appt) => (
      <AppointmentRow
        key={appt.id}
        appointment={appt}
        canUpdate={canUpdate}
        onEdit={onEdit}
      />
    ))}
  </Stack>
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
    <Stack spacing={1} sx={{ p: { xs: 1.5, md: 2 }, flex: 1 }}>
      {hours.map((h) => (
        <Box key={h}>
          <Typography
            variant="caption"
            color="text.secondary"
            fontWeight={600}
            sx={{ display: "block", mb: 0.5 }}
          >
            {String(h).padStart(2, "0")}:00
          </Typography>
          <Stack spacing={0.5} divider={<Divider />}>
            {appointmentsByHour.get(h)!.map((appt) => (
              <AppointmentRow
                key={appt.id}
                appointment={appt}
                canUpdate={canUpdate}
                onEdit={onEdit}
              />
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
};

// ── Single appointment row ────────────────────────────────────────────────────

const AppointmentRow: React.FC<{
  appointment: DjangoAppointment;
  canUpdate: boolean;
  onEdit: (a: DjangoAppointment) => void;
}> = ({ appointment: appt, canUpdate, onEdit }) => {
  const time = dayjs(appt.scheduledAt).format("HH:mm");
  const patientName = appt.patient?.fullName ?? "Бронирование";
  const serviceNames = appt.services.map((s) => s.service.name).join(", ");
  const employeeNames = [
    ...new Set(appt.services.map((s) => s.employee.fullName)),
  ].join(", ");

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={{ py: 1, px: { xs: 1.5, md: 2 }, minWidth: 0 }}
    >
      {/* time + night indicator */}
      <Box sx={{ flexShrink: 0, width: 44, textAlign: "center" }}>
        <Typography variant="body2" fontWeight={600} lineHeight={1.2}>
          {time}
        </Typography>
        {appt.isNight && (
          <NightlightOutlined sx={{ fontSize: 12, color: "text.disabled" }} />
        )}
        {!appt.isNight && (
          <WbSunnyOutlined sx={{ fontSize: 12, color: "warning.light" }} />
        )}
      </Box>

      {/* main content */}
      <Box flex={1} minWidth={0}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
          <Typography variant="body2" fontWeight={600} noWrap>
            {patientName}
          </Typography>
          <Chip
            label={STATUS_LABELS[appt.status] ?? appt.status}
            size="small"
            color={STATUS_COLOR[appt.status] ?? "default"}
            variant="outlined"
            sx={{ height: 20, fontSize: "0.7rem" }}
          />
        </Stack>
        {serviceNames && (
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            display="block"
          >
            {serviceNames}
          </Typography>
        )}
        {employeeNames && (
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            display="block"
          >
            {employeeNames}
          </Typography>
        )}
      </Box>

      {/* total */}
      {appt.totalAmount && appt.totalAmount !== "0.00" && (
        <Typography
          variant="body2"
          fontWeight={500}
          sx={{ flexShrink: 0, color: "text.secondary" }}
        >
          {appt.totalAmount} с
        </Typography>
      )}

      {/* edit */}
      {canUpdate && (
        <Tooltip title="Редактировать">
          <IconButton
            size="small"
            onClick={() => onEdit(appt)}
            sx={{ flexShrink: 0 }}
          >
            <EditOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  );
};

export default AppointmentsPage;
