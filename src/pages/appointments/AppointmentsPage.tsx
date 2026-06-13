import React from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Drawer,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import TuneOutlined from "@mui/icons-material/TuneOutlined";
import dayjs, { type Dayjs } from "dayjs";
import "dayjs/locale/ru";

dayjs.locale("ru");

import { useCanChecker, useCan } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import DjangoAddAppointmentDrawer from "./DjangoAddAppointmentDrawer";
import DjangoEditAppointmentDrawer from "./DjangoEditAppointmentDrawer";
import DjangoPaymentDrawer from "./DjangoPaymentDrawer";
import type { PaymentSummary } from "../../api/payments";
import {
  getAppointments,
  getDayCounts,
  updateAppointment,
  deleteAppointment,
  parseBackendError,
  type DjangoAppointment,
} from "../../api/appointments";
import { useNotification } from "@refinedev/core";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_POLL_INTERVAL_MS,
} from "../../api/queryKeys";

import AppointmentListPanel from "./components/AppointmentListPanel";
import AppointmentDetailsPanel from "./components/AppointmentDetailsPanel";
import { PageHeader, DateNavigation } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";

// ── data hooks ────────────────────────────────────────────────────────────────

function useAppointments(params: {
  date: Dayjs | null;
  search: string;
  branchId?: number;
  employeeId?: number | "me";
}) {
  const queryClient = useQueryClient();
  const queryParams = React.useMemo(
    () => ({
      date: params.date?.format("YYYY-MM-DD") ?? undefined,
      search: params.search || undefined,
      branchId: params.branchId,
      employeeId: params.employeeId,
    }),
    [params.date, params.search, params.branchId, params.employeeId],
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
    (updater: DjangoAppointment[] | ((prev: DjangoAppointment[]) => DjangoAppointment[])) => {
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

function useDayCounts(date: Dayjs | null, branchId?: number, employeeId?: number | "me") {
  const monthKey = (date ?? dayjs()).format("YYYY-MM");
  const params = React.useMemo(() => {
    const base = dayjs(`${monthKey}-01`);
    return {
      dateFrom: base.startOf("month").format("YYYY-MM-DD"),
      dateTo: base.endOf("month").format("YYYY-MM-DD"),
      branchId,
      employeeId,
    };
  }, [monthKey, branchId, employeeId]);

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

type AppointmentsPageProps = {
  /** "me" → кабинет врача: только свои приёмы, без создания. */
  scope?: "me";
};

const AppointmentsPage: React.FC<AppointmentsPageProps> = ({ scope }) => {
  const isDoctorCabinet = scope === "me";
  usePageTitle(isDoctorCabinet ? "Кабинет врача" : "Регистратура");
  const { can } = useCanChecker();
  const { activeBranch, isSuperAdmin } = usePermissions();
  const { open: notify } = useNotification();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [date, setDate] = React.useState<Dayjs>(dayjs());
  const [search, setSearch] = React.useState("");

  // DateNavigation (shared with the original Регистратура) works in string dates
  const dateStr = date.format("YYYY-MM-DD");
  const handleSetDate = React.useCallback((s: string) => setDate(dayjs(s)), []);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<DjangoAppointment | null>(null);
  const [paymentTarget, setPaymentTarget] = React.useState<DjangoAppointment | null>(null);
  const [selectedAppt, setSelectedAppt] = React.useState<DjangoAppointment | null>(null);

  // В кабинете врача создание приёмов скрыто — это рабочий список своих приёмов.
  const canCreate = !isDoctorCabinet && can("appointments.create");
  const canUpdate = can("appointments.update");
  const canDelete = isSuperAdmin() || can("appointments.delete");
  const canViewFinance = can("finance.view");
  const canManageFinance = can("finance.manage");

  // confirm dialog for cancel / delete
  const [confirm, setConfirm] = React.useState<
    { mode: "cancel" | "delete"; appt: DjangoAppointment } | null
  >(null);
  const [confirmBusy, setConfirmBusy] = React.useState(false);
  const canViewConclusions = useCan([
    "medical.conclusions.view",
    "medical.conclusions.create",
    "medical.conclusions.update",
    "medical.conclusions.manage",
  ]);

  const branchId = activeBranch?.id ?? undefined;

  const { items, setItems, loading, error, refresh } = useAppointments({
    date,
    search,
    branchId,
    employeeId: isDoctorCabinet ? "me" : undefined,
  });

  const dayCounts = useDayCounts(date, branchId, isDoctorCabinet ? "me" : undefined);

  // Keep selectedAppt in sync with fresh list data
  React.useEffect(() => {
    if (!selectedAppt) return;
    const fresh = items.find((a) => a.id === selectedAppt.id);
    if (fresh) setSelectedAppt(fresh);
  }, [items, selectedAppt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deselect when switching dates (if nothing found)
  React.useEffect(() => {
    setSelectedAppt(null);
  }, [date.format("YYYY-MM-DD")]);

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
    },
    [setItems],
  );

  const handleSelect = React.useCallback((appt: DjangoAppointment) => {
    setSelectedAppt((prev) => (prev?.id === appt.id ? null : appt));
  }, []);

  const handleEdit = React.useCallback((appt: DjangoAppointment) => {
    setEditTarget(appt);
  }, []);

  const handlePay = React.useCallback((appt: DjangoAppointment) => {
    setPaymentTarget(appt);
  }, []);

  // "Пациент здесь": scheduled → waiting
  const handleArrived = React.useCallback(
    async (appt: DjangoAppointment) => {
      try {
        await updateAppointment(appt.id, { status: "waiting" });
        void refresh();
      } catch (e) {
        notify?.({ type: "error", message: parseBackendError(e) });
      }
    },
    [refresh, notify],
  );

  const handleConfirm = React.useCallback(async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      if (confirm.mode === "cancel") {
        await updateAppointment(confirm.appt.id, { status: "cancelled" });
      } else {
        await deleteAppointment(confirm.appt.id);
        setSelectedAppt((prev) => (prev?.id === confirm.appt.id ? null : prev));
      }
      setConfirm(null);
      void refresh();
    } catch (e) {
      notify?.({ type: "error", message: parseBackendError(e) });
    } finally {
      setConfirmBusy(false);
    }
  }, [confirm, refresh, notify]);

  const handleCreated = React.useCallback(() => {
    setCreateOpen(false);
    void refresh();
  }, [refresh]);

  const handleSaved = React.useCallback(() => {
    setEditTarget(null);
    void refresh();
  }, [refresh]);

  const showDetails = selectedAppt !== null;

  // Details panel: drawer on mobile, inline panel on desktop
  const detailsPanel = showDetails ? (
    <AppointmentDetailsPanel
      appointment={selectedAppt}
      canUpdate={canUpdate}
      canManageFinance={canManageFinance}
      canViewFinance={canViewFinance}
      canViewConclusions={canViewConclusions}
      canDelete={canDelete}
      onEdit={handleEdit}
      onPay={handlePay}
      onArrived={handleArrived}
      onCancelAppt={(a) => setConfirm({ mode: "cancel", appt: a })}
      onDelete={(a) => setConfirm({ mode: "delete", appt: a })}
      onClose={() => setSelectedAppt(null)}
    />
  ) : null;

  return (
    <>
      <Box
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          pt: { xs: 1, md: 1.5 },
        }}
      >
        {/* ── Top controls: like the original Регистратура ──
            «Добавить прием» (large, left) + horizontal date pills. */}
        <PageHeader
          title={isDoctorCabinet ? "Кабинет врача" : "Регистратура"}
          showTitle={false}
          addButtonText="Добавить прием"
          onAdd={canCreate ? () => setCreateOpen(true) : undefined}
          dateNavigation={
            <DateNavigation date={dateStr} setDate={handleSetDate} dayCounts={dayCounts} />
          }
          loading={loading}
          actions={
            <Tooltip title="Обновить">
              <span>
                <IconButton size="small" onClick={() => { void refresh(); }}>
                  <RefreshOutlined fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          }
        />

        {/* ── Error ── */}
        {error && (
          <Alert
            severity="error"
            sx={(t) => ({ mx: t.appLayout.page.paddingX, mb: 1, flexShrink: 0 })}
            onClose={() => { void refresh(); }}
          >
            {error}
          </Alert>
        )}

        {/* ── Two columns: list (left) + details/placeholder (right) ── */}
        <Box
          sx={(t) => ({
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            px: t.appLayout.page.paddingX,
            pb: 1,
            display: "flex",
            flexDirection: "row",
            gap: 2,
          })}
        >
          {/* List panel — ~50% */}
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              height: "100%",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <AppointmentListPanel
              items={items}
              loading={loading}
              error={null}
              date={date}
              selectedId={selectedAppt?.id ?? null}
              canUpdate={canUpdate}
              canManageFinance={canManageFinance}
              canViewFinance={canViewFinance}
              onSelect={handleSelect}
              onEdit={handleEdit}
              onPay={handlePay}
              onAddSlot={canCreate ? (_dateIso) => {
                setCreateOpen(true);
              } : undefined}
            />
          </Box>

          {/* Details panel — ~50%, always visible on desktop */}
          {!isMobile && (
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                height: "100%",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {showDetails ? (
                detailsPanel
              ) : (
                <Box
                  sx={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px dashed",
                    borderColor: "divider",
                    borderRadius: 1,
                    color: "text.secondary",
                    bgcolor: "background.paper",
                    p: 2,
                  }}
                >
                  <Typography align="center">
                    Выберите приём для просмотра подробной информации
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>

      {/* Mobile details drawer */}
      {isMobile && (
        <Drawer
          anchor="bottom"
          open={showDetails}
          onClose={() => setSelectedAppt(null)}
          PaperProps={{
            sx: {
              height: "85vh",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              overflow: "hidden",
            },
          }}
        >
          {detailsPanel}
        </Drawer>
      )}

      {/* ── Drawers ── */}
      <DjangoAddAppointmentDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
        initialDate={
          date ? date.format("YYYY-MM-DD") + "T" + dayjs().format("HH:mm") : undefined
        }
      />

      <DjangoEditAppointmentDrawer
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        appointment={editTarget}
        onSaved={handleSaved}
      />

      <DjangoPaymentDrawer
        open={!!paymentTarget}
        onClose={() => setPaymentTarget(null)}
        appointment={paymentTarget}
        onSaved={handlePaymentSaved}
      />

      {/* Confirm cancel / delete */}
      <Dialog open={!!confirm} onClose={() => (confirmBusy ? undefined : setConfirm(null))}>
        <DialogTitle>
          {confirm?.mode === "delete" ? "Удалить приём?" : "Отменить запись?"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirm?.mode === "delete"
              ? "Приём будет удалён без возможности восстановления."
              : "Запись будет помечена как отменённая."}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)} disabled={confirmBusy} color="inherit">
            Отмена
          </Button>
          <Button onClick={handleConfirm} disabled={confirmBusy} color="error" variant="contained">
            {confirm?.mode === "delete" ? "Удалить" : "Подтвердить отмену"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AppointmentsPage;
