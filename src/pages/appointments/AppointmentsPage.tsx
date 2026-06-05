import React from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
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
  type DjangoAppointment,
} from "../../api/appointments";
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
}) {
  const queryClient = useQueryClient();
  const queryParams = React.useMemo(
    () => ({
      date: params.date?.format("YYYY-MM-DD") ?? undefined,
      search: params.search || undefined,
      branchId: params.branchId,
    }),
    [params.date, params.search, params.branchId],
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

function useDayCounts(date: Dayjs | null, branchId?: number) {
  const monthKey = (date ?? dayjs()).format("YYYY-MM");
  const params = React.useMemo(() => {
    const base = dayjs(`${monthKey}-01`);
    return {
      dateFrom: base.startOf("month").format("YYYY-MM-DD"),
      dateTo: base.endOf("month").format("YYYY-MM-DD"),
      branchId,
    };
  }, [monthKey, branchId]);

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
  usePageTitle("Регистратура");
  const { can } = useCanChecker();
  const { activeBranch } = usePermissions();
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

  const canCreate = can("appointments.create");
  const canUpdate = can("appointments.update");
  const canViewFinance = can("finance.view");
  const canManageFinance = can("finance.manage");
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
  });

  const dayCounts = useDayCounts(date, branchId);

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
      onEdit={handleEdit}
      onPay={handlePay}
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
            «Добавить прием» (large, left) + horizontal date pills + search. */}
        <PageHeader
          title="Регистратура"
          showTitle={false}
          addButtonText="Добавить прием"
          onAdd={canCreate ? () => setCreateOpen(true) : undefined}
          dateNavigation={
            <DateNavigation date={dateStr} setDate={handleSetDate} dayCounts={dayCounts} />
          }
          showSearch
          searchVal={search}
          onSearchChange={setSearch}
          searchPlaceholder="Поиск по пациенту или телефону"
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
    </>
  );
};

export default AppointmentsPage;
