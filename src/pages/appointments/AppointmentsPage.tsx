import React from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItem,
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
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlined from "@mui/icons-material/ExpandLessOutlined";
import WbSunnyOutlined from "@mui/icons-material/WbSunnyOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import dayjs, { type Dayjs } from "dayjs";

import { useCanChecker } from "../../hooks/useCan";
import { useCan } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import {
  AppointmentFilters,
  type AppointmentStatusFilter,
} from "../../components/appointments/AppointmentFilters";
import { AppointmentsEmptyState } from "../../components/appointments/AppointmentsEmptyState";
import DjangoAddAppointmentDrawer from "./DjangoAddAppointmentDrawer";
import DjangoEditAppointmentDrawer from "./DjangoEditAppointmentDrawer";
import DjangoConclusionSlotsPanel from "./DjangoConclusionSlotsPanel";
import DjangoPaymentDrawer, {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLOR,
} from "./DjangoPaymentDrawer";
import type { PaymentSummary } from "../../api/payments";
import {
  getAppointments,
  getDayCounts,
  type DjangoAppointment,
  type DjangoAppointmentStatus,
} from "../../api/appointments";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_POLL_INTERVAL_MS,
} from "../../api/queryKeys";

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
  const queryClient = useQueryClient();
  const queryParams = React.useMemo(
    () => ({
      date: params.date?.format("YYYY-MM-DD") ?? undefined,
      status: params.status === "all" ? undefined : params.status,
      search: params.search || undefined,
      branchId: params.branchId,
    }),
    [params.date, params.status, params.search, params.branchId],
  );
  const queryKey = djangoQueryKeys.appointments.list(queryParams);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getAppointments(queryParams, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    refetchInterval: DJANGO_POLL_INTERVAL_MS,
  });

  const setItems = React.useCallback(
    (
      updater:
        | DjangoAppointment[]
        | ((prev: DjangoAppointment[]) => DjangoAppointment[]),
    ) => {
      queryClient.setQueryData<DjangoAppointment[]>(queryKey, (prev = []) =>
        typeof updater === "function" ? updater(prev) : updater,
      );
    },
    [queryClient, queryKey],
  );

  return {
    items: query.data ?? [],
    setItems,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refresh: query.refetch,
  };
}

// ── hook: day counts for current month ───────────────────────────────────────

function useDayCounts(date: Dayjs | null, branchId?: number) {
  const monthKey = (date ?? dayjs()).format("YYYY-MM");
  const params = React.useMemo(
    () => {
      const base = dayjs(`${monthKey}-01`);
      return {
        dateFrom: base.startOf("month").format("YYYY-MM-DD"),
        dateTo: base.endOf("month").format("YYYY-MM-DD"),
        branchId,
      };
    },
    [monthKey, branchId],
  );
  const query = useQuery({
    queryKey: djangoQueryKeys.appointments.dayCounts(params),
    queryFn: ({ signal }) => getDayCounts(params, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    retry: false,
  });

  return query.data ?? {};
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
  const [paymentTarget, setPaymentTarget] = React.useState<DjangoAppointment | null>(null);

  const canCreate = can("appointments.create");
  const canUpdate = can("appointments.update");
  const canViewFinance = can("finance.view");
  const canManageFinance = can("finance.manage");

  const branchId = activeBranch?.id ?? undefined;

  const { items, setItems, loading, error, refresh } = useAppointments({
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

  const handlePaymentSaved = React.useCallback(
    (summary: PaymentSummary) => {
      setItems((prev) =>
        prev.map((appt) =>
          appt.id === summary.appointmentId
            ? {
                ...appt,
                paymentStatus: summary.paymentStatus,
                paidTotal: summary.paidTotal,
                discountAmount: summary.discountAmount,
                payableAmount: summary.payableAmount,
                debt: summary.debt,
              }
            : appt,
        ),
      );
      setPaymentTarget(null);
    },
    [setItems],
  );

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
                  <Alert severity="error" onClose={() => { void refresh(); }}>
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
                <AppointmentTable
                  items={items}
                  canUpdate={canUpdate}
                  canViewFinance={canViewFinance}
                  canManageFinance={canManageFinance}
                  onEdit={setEditTarget}
                  onPay={setPaymentTarget}
                />
              ) : (
                <DayView
                  appointmentsByHour={appointmentsByHour}
                  canUpdate={canUpdate}
                  canViewConclusions={can([
                    "medical.conclusions.view",
                    "medical.conclusions.create",
                    "medical.conclusions.update",
                    "medical.conclusions.manage",
                  ])}
                  canViewFinance={canViewFinance}
                  canManageFinance={canManageFinance}
                  onEdit={setEditTarget}
                  onPay={setPaymentTarget}
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

      <DjangoPaymentDrawer
        open={!!paymentTarget}
        onClose={() => setPaymentTarget(null)}
        appointment={paymentTarget}
        onSaved={handlePaymentSaved}
      />
    </>
  );
};

// ── Dense appointment table ───────────────────────────────────────────────────

const AppointmentTable: React.FC<{
  items: DjangoAppointment[];
  canUpdate: boolean;
  canViewFinance: boolean;
  canManageFinance: boolean;
  onEdit: (a: DjangoAppointment) => void;
  onPay: (a: DjangoAppointment) => void;
}> = ({ items, canUpdate, canViewFinance, canManageFinance, onEdit, onPay }) => {
  const canViewConclusions = useCan([
    "medical.conclusions.view",
    "medical.conclusions.create",
    "medical.conclusions.update",
    "medical.conclusions.manage",
  ]);
  const showPaymentCol = canViewFinance || canManageFinance;
  return (
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
        {showPaymentCol && (
          <Typography variant="caption" fontWeight={600} sx={{ width: 110, flexShrink: 0, display: { xs: "none", md: "block" } }}>Оплата</Typography>
        )}
        <Typography variant="caption" fontWeight={600} sx={{ width: 110, flexShrink: 0 }}>Статус</Typography>
        {(canUpdate || canViewConclusions || canManageFinance) && (
          <Box sx={{ width: canUpdate ? (canManageFinance ? 108 : 72) : 36, flexShrink: 0 }} />
        )}
      </Stack>

      <Stack divider={<Divider />}>
        {items.map((appt) => (
          <AppointmentRow
            key={appt.id}
            appointment={appt}
            canUpdate={canUpdate}
            canViewConclusions={canViewConclusions}
            canViewFinance={canViewFinance}
            canManageFinance={canManageFinance}
            onEdit={onEdit}
            onPay={onPay}
          />
        ))}
      </Stack>
    </Box>
  );
};

// ── Day view ──────────────────────────────────────────────────────────────────

const DayView: React.FC<{
  appointmentsByHour: Map<number, DjangoAppointment[]>;
  canUpdate: boolean;
  canViewConclusions: boolean;
  canViewFinance: boolean;
  canManageFinance: boolean;
  onEdit: (a: DjangoAppointment) => void;
  onPay: (a: DjangoAppointment) => void;
}> = ({ appointmentsByHour, canUpdate, canViewConclusions, canViewFinance, canManageFinance, onEdit, onPay }) => {
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
              <AppointmentRow
                key={appt.id}
                appointment={appt}
                canUpdate={canUpdate}
                canViewConclusions={canViewConclusions}
                canViewFinance={canViewFinance}
                canManageFinance={canManageFinance}
                onEdit={onEdit}
                onPay={onPay}
              />
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
  canViewConclusions: boolean;
  canViewFinance: boolean;
  canManageFinance: boolean;
  onEdit: (a: DjangoAppointment) => void;
  onPay: (a: DjangoAppointment) => void;
}> = ({ appointment: appt, canUpdate, canViewConclusions, canViewFinance, canManageFinance, onEdit, onPay }) => {
  const [expanded, setExpanded] = React.useState(false);

  const time = dayjs(appt.scheduledAt).format("HH:mm");
  const patientName = appt.patient?.fullName ?? "Бронирование";
  const patientPhone = appt.patient?.phone ?? "";

  const serviceCount = appt.services.length;
  const firstService = appt.services[0];

  // Service cell: 1 service → name, N services → "N услуг" with tooltip list
  const serviceCell =
    serviceCount === 0 ? (
      <Typography variant="body2" color="text.disabled">—</Typography>
    ) : serviceCount === 1 ? (
      <Typography variant="body2" noWrap>{firstService.service.name}</Typography>
    ) : (
      <Tooltip
        title={
          <List dense disablePadding>
            {appt.services.map((sl) => (
              <ListItem key={sl.id} disablePadding sx={{ py: 0.25 }}>
                <Typography variant="caption">{sl.service.name}</Typography>
              </ListItem>
            ))}
          </List>
        }
        arrow
      >
        <Typography
          variant="body2"
          noWrap
          sx={{ cursor: "default", borderBottom: "1px dashed", borderColor: "text.secondary" }}
        >
          {serviceCount} услуг
        </Typography>
      </Tooltip>
    );

  // Employee cell: 1 unique employee → name, multiple → "N исполнителей" with tooltip
  const uniqueEmployees = Array.from(
    new Map(appt.services.map((sl) => [sl.employee.id, sl.employee.fullName])).entries(),
  );
  const employeeCell =
    uniqueEmployees.length === 0 ? (
      <Typography variant="caption" color="text.disabled">—</Typography>
    ) : uniqueEmployees.length === 1 ? (
      <Typography variant="caption" color="text.secondary" noWrap display="block">
        {uniqueEmployees[0][1]}
      </Typography>
    ) : (
      <Tooltip
        title={
          <List dense disablePadding>
            {uniqueEmployees.map(([id, name]) => (
              <ListItem key={id} disablePadding sx={{ py: 0.25 }}>
                <Typography variant="caption">{name}</Typography>
              </ListItem>
            ))}
          </List>
        }
        arrow
      >
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          display="block"
          sx={{ cursor: "default", borderBottom: "1px dashed", borderColor: "text.secondary" }}
        >
          {uniqueEmployees.length} исполнителей
        </Typography>
      </Tooltip>
    );

  // Price: prefer totalAmount, fall back to first service price
  const totalAmount = appt.totalAmount;
  const showTotal = totalAmount && totalAmount !== "0.00" && totalAmount !== "0";

  // Payment display
  const payStatus = appt.paymentStatus as import("../../api/payments").PaymentStatus | undefined;
  const showPayment = (canViewFinance || canManageFinance) && !!payStatus;

  return (
    <Box>
      {/* main row */}
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
          {serviceCell}
          {employeeCell}
        </Box>

        {/* totalAmount */}
        <Box sx={{ width: 90, flexShrink: 0, display: { xs: "none", md: "block" } }}>
          {showTotal && (
            <Typography variant="body2" fontWeight={500} color="text.secondary">
              {totalAmount} с
            </Typography>
          )}
          {showPayment && appt.debt && appt.debt !== "0.00" && appt.debt !== "0" && (
            <Typography variant="caption" color="warning.main" display="block">
              долг: {appt.debt} с
            </Typography>
          )}
        </Box>

        {/* payment status chip */}
        {(canViewFinance || canManageFinance) && (
          <Box sx={{ width: 110, flexShrink: 0, display: { xs: "none", md: "block" } }}>
            {showPayment && payStatus && (
              <Chip
                label={PAYMENT_STATUS_LABELS[payStatus] ?? payStatus}
                size="small"
                color={PAYMENT_STATUS_COLOR[payStatus] ?? "default"}
                variant="outlined"
                sx={{ fontSize: "0.68rem", height: 20 }}
              />
            )}
          </Box>
        )}

        {/* appointment status */}
        <Box sx={{ width: 110, flexShrink: 0 }}>
          <Chip
            label={STATUS_LABELS[appt.status] ?? appt.status}
            size="small"
            color={STATUS_COLOR[appt.status] ?? "default"}
            variant="outlined"
            sx={{ fontSize: "0.68rem", height: 20 }}
          />
        </Box>

        {/* actions: pay + edit + expand conclusions */}
        <Box sx={{ width: canUpdate ? (canManageFinance ? 108 : 72) : 36, flexShrink: 0, display: "flex", gap: 0.5 }}>
          {canManageFinance && (
            <Tooltip title="Оплата">
              <IconButton size="small" onClick={() => onPay(appt)}>
                <PaymentsOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {canUpdate && (
            <Tooltip title="Редактировать">
              <IconButton size="small" onClick={() => onEdit(appt)}>
                <EditOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {canViewConclusions && (
            <Tooltip title={expanded ? "Скрыть заключения" : "Заключения врачей"}>
              <IconButton size="small" onClick={() => setExpanded((v) => !v)}>
                {expanded
                  ? <ExpandLessOutlined fontSize="small" />
                  : <ExpandMoreOutlined fontSize="small" />
                }
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Stack>

      {/* expandable conclusions panel */}
      {canViewConclusions && (
        <Collapse in={expanded} unmountOnExit>
          <Box
            sx={{
              px: 3,
              py: 1.5,
              borderTop: "1px solid",
              borderColor: "divider",
              bgcolor: (t) => t.palette.mode === "dark" ? "rgba(255,255,255,0.03)" : "grey.50",
            }}
          >
            <DjangoConclusionSlotsPanel appointmentId={appt.id} />
          </Box>
        </Collapse>
      )}
    </Box>
  );
};

export default AppointmentsPage;
