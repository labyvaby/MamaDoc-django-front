import React from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
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
  getHomeDashboard,
  updateAppointment,
  startAppointment,
  deleteAppointment,
  parseBackendError,
  type DjangoAppointment,
  type HomeDashboard,
} from "../../api/appointments";
import { getDjangoEmployees } from "../../api/staff";
import { useNotification } from "@refinedev/core";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
} from "../../api/queryKeys";

import AppointmentListPanel from "./components/AppointmentListPanel";
import AppointmentDetailsPanel from "./components/AppointmentDetailsPanel";
import DjangoConclusionSlotsPanel from "./DjangoConclusionSlotsPanel";
import { PageHeader, DateNavigation } from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useAppointmentsAutoSync } from "../../hooks/useAppointmentsAutoSync";

// ── data hooks ────────────────────────────────────────────────────────────────

// Единый агрегат главной: список приёмов за дату + счётчики дней для навбара
// + lastUpdate приходят одним запросом GET /api/appointments/home/ вместо трёх
// отдельных (список + day-counts + last-update).
function useHomeDashboard(params: {
  date: Dayjs;
  search: string;
  branchId?: number;
  employeeId?: number | "me";
  /** Навбар-счётчики отдельно от списка: "me" для врача/медсестры. */
  countsEmployeeId?: number | "me";
  nightOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const dateKey = params.date.format("YYYY-MM-DD");
  const monthKey = params.date.format("YYYY-MM");
  const queryParams = React.useMemo(() => {
    const base = dayjs(`${monthKey}-01`);
    // Навбар показывает окно ±7 дней вокруг выбранной даты, поэтому счётчики
    // запрашиваем на 7 дней шире краёв месяца — иначе на краю месяца соседние
    // дни остаются без счётчиков.
    return {
      date: dateKey,
      dateFrom: base.startOf("month").subtract(7, "day").format("YYYY-MM-DD"),
      dateTo: base.endOf("month").add(7, "day").format("YYYY-MM-DD"),
      search: params.search || undefined,
      branchId: params.branchId,
      employeeId: params.employeeId,
      countsEmployeeId: params.countsEmployeeId,
      nightOnly: params.nightOnly || undefined,
    };
  }, [dateKey, monthKey, params.search, params.branchId, params.employeeId, params.countsEmployeeId, params.nightOnly]);

  const queryKey = djangoQueryKeys.appointments.home(queryParams);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getHomeDashboard(queryParams, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    // Интервальный поллинг убран — обновление через useAppointmentsAutoSync
    // (лёгкий last-update heartbeat → refetch только при изменении).
  });

  const setItems = React.useCallback(
    (updater: DjangoAppointment[] | ((prev: DjangoAppointment[]) => DjangoAppointment[])) => {
      queryClient.setQueryData<HomeDashboard>(queryKey, (prev) => {
        const prevData: HomeDashboard =
          prev ?? { appointments: [], dayCounts: {}, lastUpdate: null };
        const nextAppointments =
          typeof updater === "function" ? updater(prevData.appointments) : updater;
        return { ...prevData, appointments: nextAppointments };
      });
    },
    [queryClient, queryKey],
  );

  return {
    items: query.data?.appointments ?? [],
    setItems,
    dayCounts: query.data?.dayCounts ?? {},
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refresh: query.refetch,
  };
}

/**
 * Set of active nurse employee ids (clinicalRole === "nurse").
 *
 * Used by the Процедурный кабинет: when an admin / manager / receptionist opens it,
 * they see every appointment but must be filtered down to the ones a nurse performs.
 * Only fetched when `enabled` — a nurse looking at her own list doesn't need it.
 */
function useNurseIds(enabled: boolean): Set<number> {
  const query = useQuery({
    queryKey: ["staff", "employees", "nurseIds"],
    queryFn: async ({ signal }) => {
      const res = await getDjangoEmployees({ status: "active", pageSize: 500 }, signal);
      return res.results.filter((e) => e.clinicalRole === "nurse").map((e) => e.id);
    },
    enabled,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  return React.useMemo(() => new Set(query.data ?? []), [query.data]);
}

// ── page ──────────────────────────────────────────────────────────────────────

type AppointmentsPageProps = {
  /**
   * "me"    → кабинет врача: только свои приёмы, без создания.
   * "nurse" → процедурный кабинет: медсестра видит только свои процедуры;
   *           админ/управляющий/регистратура видят все приёмы, в которых
   *           участвует медсестра.
   */
  scope?: "me" | "nurse";
};

const AppointmentsPage: React.FC<AppointmentsPageProps> = ({ scope }) => {
  const isDoctorCabinet = scope === "me";
  const isNurseCabinet = scope === "nurse";
  const pageTitle = isDoctorCabinet
    ? "Кабинет врача"
    : isNurseCabinet
    ? "Процедурный кабинет"
    : "Регистратура";
  const addButtonText = isNurseCabinet ? "Добавить процедуру" : "Добавить прием";
  usePageTitle(pageTitle);
  const { can } = useCanChecker();
  const {
    activeBranch,
    isSuperAdmin,
    isDoctor,
    isNurse,
    isAdmin,
    isRegistrator,
    hasRole,
    employeeId,
  } = usePermissions();

  // Процедурный кабинет: сама медсестра видит только свои процедуры ("me");
  // привилегированные роли (админ / управляющий / регистратура) видят все приёмы,
  // которые затем клиентски фильтруются до тех, где есть исполнитель-медсестра.
  const nurseSeesOwnOnly = isNurseCabinet && isNurse();
  const nurseSeesAll =
    isNurseCabinet && (isAdmin() || isRegistrator() || hasRole("manager"));
  const { open: notify } = useNotification();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [date, setDate] = React.useState<Dayjs>(dayjs());
  const search = "";
  const [nightOnly, setNightOnly] = React.useState(false);

  // DateNavigation (shared with the original Регистратура) works in string dates
  const dateStr = date.format("YYYY-MM-DD");
  const handleSetDate = React.useCallback((s: string) => setDate(dayjs(s)), []);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<DjangoAppointment | null>(null);
  const [paymentTarget, setPaymentTarget] = React.useState<DjangoAppointment | null>(null);
  const [selectedAppt, setSelectedAppt] = React.useState<DjangoAppointment | null>(null);
  // Заключение открывается отдельной (третьей) колонкой — как в оригинале.
  const [conclusionOpen, setConclusionOpen] = React.useState(false);

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

  // Навбар-счётчики: как в оригинале — привилегированные роли (админ/регистратор)
  // видят число за ВСЕ приёмы, а врач/медсестра — только за СВОИ. Список при этом
  // остаётся полным (кроме кабинета врача и собственного списка медсестры).
  const countsScopeToMe = isDoctorCabinet || isDoctor() || isNurse();

  // Врач и сама медсестра грузят только свои приёмы серверно ("me");
  // привилегированные роли грузят все и фильтруют клиентски (см. visibleItems).
  const scopedEmployeeId: number | "me" | undefined =
    isDoctorCabinet || nurseSeesOwnOnly ? "me" : undefined;

  const { items, setItems, dayCounts, loading, error, refresh } = useHomeDashboard({
    date,
    search,
    branchId,
    employeeId: scopedEmployeeId,
    countsEmployeeId: countsScopeToMe ? "me" : undefined,
    nightOnly,
  });

  // Лёгкая timestamp-синхронизация вместо интервального поллинга: раз в 15с
  // проверяем last-update и перезапрашиваем тяжёлый список только при изменении.
  // Пауза, пока открыт любой дровер/диалог — чтобы не мешать вводу.
  useAppointmentsAutoSync({
    branchId,
    paused: createOpen || editTarget !== null || paymentTarget !== null || confirm !== null,
    onChange: () => { void refresh(); },
  });

  // Список медсестёр нужен только для привилегированного просмотра процедурного кабинета.
  const nurseIds = useNurseIds(nurseSeesAll);
  const visibleItems = React.useMemo(() => {
    // Фильтрация только в привилегированном процедурном кабинете. Если медсестёр
    // в системе нет — кабинет пуст (а не показывает все приёмы врачей).
    if (!nurseSeesAll) return items;
    if (nurseIds.size === 0) return [];
    return items.filter((a) =>
      a.services.some((s) => s.employee != null && nurseIds.has(s.employee.id)),
    );
  }, [items, nurseSeesAll, nurseIds]);

  // Группировка списка в процедурном кабинете — только по медсёстрам:
  // привилегированные роли — по всем медсёстрам, сама медсестра — по себе.
  // Это убирает группы врачей из совместных приёмов (как в оригинале).
  const ownEmployeeId = Number(employeeId);
  const groupEmployeeIds = React.useMemo<Set<number> | null>(() => {
    if (!isNurseCabinet) return null;
    // Привилегированный процедурный кабинет группирует строго по медсёстрам.
    // Нет медсестёр → пустой набор (кабинет пуст), а не null (= все врачи).
    if (nurseSeesAll) return nurseIds;
    if (nurseSeesOwnOnly && Number.isFinite(ownEmployeeId)) return new Set([ownEmployeeId]);
    return null;
  }, [isNurseCabinet, nurseSeesAll, nurseSeesOwnOnly, nurseIds, ownEmployeeId]);

  // Keep selectedAppt in sync with fresh list data
  React.useEffect(() => {
    if (!selectedAppt) return;
    const fresh = items.find((a) => a.id === selectedAppt.id);
    if (fresh) setSelectedAppt(fresh);
  }, [items, selectedAppt?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deselect when switching dates (if nothing found)
  React.useEffect(() => {
    setSelectedAppt(null);
    setConclusionOpen(false);
  }, [dateStr]);

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
    setConclusionOpen(false); // при смене приёма закрываем колонку заключения
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
        await updateAppointment(appt.id, { status: "arrived" });
        void refresh();
      } catch (e) {
        notify?.({ type: "error", message: parseBackendError(e) });
      }
    },
    [refresh, notify],
  );

  // Врач начинает приём → статус in_progress («На приёме»). Используем
  // отдельный узкий эндпоинт start: он не требует appointments.update
  // (которого у врача нет), а только переводит статус. Форма заключения
  // открывается внутри панели.
  const handleStartAppointment = React.useCallback(
    async (appt: DjangoAppointment) => {
      try {
        await startAppointment(appt.id);
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
        await updateAppointment(confirm.appt.id, { status: "canceled" });
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
      isConclusionVisible={conclusionOpen}
      onToggleConclusion={() => setConclusionOpen((v) => !v)}
      onEdit={handleEdit}
      onPay={handlePay}
      onArrived={handleArrived}
      onStartAppointment={handleStartAppointment}
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
          title={pageTitle}
          showTitle={false}
          addButtonText={addButtonText}
          onAdd={canCreate ? () => setCreateOpen(true) : undefined}
          dateNavigation={
            <DateNavigation date={dateStr} setDate={handleSetDate} dayCounts={dayCounts} />
          }
          loading={loading}
          actions={
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip
                label="Только ночные"
                size="small"
                color={nightOnly ? "primary" : "default"}
                variant={nightOnly ? "filled" : "outlined"}
                onClick={() => setNightOnly((v) => !v)}
              />
              <Tooltip title="Обновить">
                <span>
                  <IconButton size="small" onClick={() => { void refresh(); }}>
                    <RefreshOutlined fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
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
              items={visibleItems}
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
              onAddSlot={canCreate ? () => {
                setCreateOpen(true);
              } : undefined}
              hideDoctorStrip={isNurseCabinet}
              groupEmployeeIds={groupEmployeeIds}
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

          {/* Conclusion panel — третья колонка (как в оригинале), только при
              открытом заключении и выбранном приёме на десктопе. Панель сама
              рисует шапку (одно заключение → сразу полное; несколько → список). */}
          {!isMobile && showDetails && conclusionOpen && selectedAppt && (
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
              <Card
                variant="outlined"
                sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}
              >
                <DjangoConclusionSlotsPanel
                  appointmentId={selectedAppt.id}
                  onClose={() => setConclusionOpen(false)}
                />
              </Card>
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
              display: "flex",
              flexDirection: "column",
            },
          }}
        >
          <Box sx={{ flex: conclusionOpen ? "0 0 50%" : 1, minHeight: 0, overflow: "hidden" }}>
            {detailsPanel}
          </Box>
          {/* На мобиле заключение показывается снизу под деталями. */}
          {conclusionOpen && selectedAppt && (
            <>
              <Divider />
              <Box sx={{ flex: "1 1 50%", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <DjangoConclusionSlotsPanel
                  appointmentId={selectedAppt.id}
                  onClose={() => setConclusionOpen(false)}
                />
              </Box>
            </>
          )}
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
