/**
 * AppointmentsRegistryView — общий вид исторических реестров приёмов
 * («Все приёмы» и «Все процедуры»). Оформление — как страница товаров
 * (src/pages/products/django/index.tsx):
 *   - 2 колонки: список (md=5) + детали (md=7, AppointmentDetailsPanel);
 *   - кликабельные чипы-сводки по статусу оплаты над списком;
 *   - фильтр по сотруднику — лента аватарок внутри AppointmentListPanel
 *     (как в «Регистратуре»), отдельной ленты чипов нет;
 *   - период и услуга — в Drawer «Фильтры» с бейджем активных фильтров.
 * Data layer: Django REST API (getAppointments), без Supabase.
 */
import React from "react";
import {
  Box,
  Paper,
  Typography,
  Grid2,
  Stack,
  Chip,
  Badge,
  Button,
  useTheme,
  useMediaQuery,
  alpha,
} from "@mui/material";
import FilterListIcon from "@mui/icons-material/FilterListOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";

dayjs.locale("ru");

import { useNotification } from "@refinedev/core";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { PageHeader, AppBottomSheet } from "../../../components/ui";
import { useCanChecker } from "../../../hooks/useCan";
import { subtleBg } from "../../../theme";
import {
  getAppointments,
  updateAppointment,
  parseBackendError,
  type DjangoAppointment,
  type AppointmentServiceLine,
} from "../../../api/appointments";
import type { PaymentStatus } from "../../../api/payments";
import AppointmentListPanel from "./AppointmentListPanel";
import AppointmentDetailsPanel from "./AppointmentDetailsPanel";
import DjangoEditAppointmentDrawer from "../DjangoEditAppointmentDrawer";
import DjangoPaymentDrawer from "../DjangoPaymentDrawer";
import RegistryFilterDrawer, {
  MONTH_NAMES,
  type RegistryFilters,
  defaultRegistryFilters,
} from "./RegistryFilterDrawer";

type PaymentFilter = "all" | PaymentStatus;

/**
 * Чипы-сводки по оплате. «Оплачено» = paid, «Со скидкой» = discounted —
 * конвенция как в PaymentInfoBlock (старые статусы «Оплачено»/«Со скидкой»);
 * partial показываем как «Долг». Тона — как в DjangoPaymentDrawer.
 */
const PAYMENT_CHIPS: {
  value: PaymentFilter;
  label: string;
  tone: "success" | "info" | "warning" | "error" | null;
  /** Показывать чип, только когда есть такие записи (редкие статусы). */
  onlyIfPresent?: boolean;
}[] = [
  { value: "all", label: "Все", tone: null },
  { value: "paid", label: "Оплачено", tone: "success" },
  { value: "discounted", label: "Со скидкой", tone: "info" },
  { value: "partial", label: "Долг", tone: "warning" },
  { value: "unpaid", label: "Не оплачено", tone: "error" },
  { value: "refunded", label: "Возврат", tone: null, onlyIfPresent: true },
];

type Props = {
  pageTitle: string;
  /** Заголовок списка: «Приёмы» / «Процедуры». */
  listLabel: string;
  searchPlaceholder: string;
  /**
   * Строки услуг, относящиеся к реестру (только строки с исполнителем).
   * Для «Все процедуры» — только строки медсестёр.
   */
  getLines?: (h: DjangoAppointment) => AppointmentServiceLine[];
  /** Показывать ли приём в реестре (для процедур — есть ли строка медсестры). */
  isVisible?: (h: DjangoAppointment) => boolean;
  /**
   * Группировать записи в AppointmentListPanel только по этим employee id
   * (для процедур — медсёстры, чтобы не появлялись группы врачей).
   */
  groupEmployeeIds?: Set<number> | null;
  /** Дополнительный признак загрузки (например, справочник медсестёр). */
  extraLoading?: boolean;
};

const defaultGetLines = (h: DjangoAppointment) => h.services.filter((sl) => sl.employee);

export const AppointmentsRegistryView: React.FC<Props> = ({
  pageTitle,
  listLabel,
  searchPlaceholder,
  getLines = defaultGetLines,
  isVisible,
  groupEmployeeIds = null,
  extraLoading = false,
}) => {
  usePageTitle(pageTitle);
  const { can } = useCanChecker();
  const { open: notify } = useNotification();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const canUpdate = can("appointments.update");
  const canViewFinance = can("finance.view");
  const canManageFinance = can("finance.manage");
  const canViewConclusions = can("medical.conclusions.view");

  // ── Filters ────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filters, setFilters] = React.useState<RegistryFilters>(defaultRegistryFilters);
  const [filterDrawerOpen, setFilterDrawerOpen] = React.useState(false);
  const [paymentFilter, setPaymentFilter] = React.useState<PaymentFilter>("all");
  // Выбор исполнителя в ленте аватарок панели (управляемый режим) — нужен
  // здесь, чтобы счётчик в тулбаре учитывал выбранного сотрудника.
  const [doctorFilter, setDoctorFilter] = React.useState<string | null>(null);

  // При смене периода лента строится заново — сбрасываем выбор (панель в
  // неуправляемом режиме делает то же самое при смене даты).
  React.useEffect(() => {
    setDoctorFilter(null);
  }, [filters.year, filters.month]);

  // ── Data ───────────────────────────────────────────────────────────────────
  const [history, setHistory] = React.useState<DjangoAppointment[]>([]);
  const [loading, setLoading] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const dateFrom = filters.month
        ? dayjs(filters.month).startOf("month").format("YYYY-MM-DD")
        : `${filters.year}-01-01`;
      const dateTo = filters.month
        ? dayjs(filters.month).endOf("month").format("YYYY-MM-DD")
        : `${filters.year}-12-31`;

      const data = await getAppointments({ dateFrom, dateTo });
      const sorted = [...data].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
      setHistory(sorted);
    } catch (e) {
      console.error(`${pageTitle} fetch error:`, e);
    } finally {
      setLoading(false);
    }
  }, [filters.year, filters.month, pageTitle]);

  React.useEffect(() => { fetchData(); }, [fetchData]);

  // ── Selection / details ────────────────────────────────────────────────────
  const [selectedAppt, setSelectedAppt] = React.useState<DjangoAppointment | null>(null);
  const [editTarget, setEditTarget] = React.useState<DjangoAppointment | null>(null);
  const [paymentTarget, setPaymentTarget] = React.useState<DjangoAppointment | null>(null);

  // Sync selected with fresh data
  React.useEffect(() => {
    if (!selectedAppt) return;
    const fresh = history.find((h) => h.id === selectedAppt.id);
    if (fresh) setSelectedAppt(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const availableYears = React.useMemo(() => {
    const years: string[] = [];
    for (let y = dayjs().year(); y >= 2023; y--) years.push(String(y));
    return years;
  }, []);

  const visibleHistory = React.useMemo(
    () => (isVisible ? history.filter(isVisible) : history),
    [history, isVisible],
  );

  // Услуги за период — опции автокомплита в Drawer фильтров.
  const availableServices = React.useMemo(() => {
    const names = new Set<string>();
    for (const h of visibleHistory) {
      for (const sl of getLines(h)) {
        if (sl.service?.name) names.add(sl.service.name);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "ru"));
  }, [visibleHistory, getLines]);

  // База для сводок и списка: период + поиск.
  const baseHistory = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return visibleHistory;
    return visibleHistory.filter(
      (h) =>
        (h.patient?.fullName ?? "").toLowerCase().includes(q) ||
        h.services.some(
          (sl) =>
            (sl.service?.name ?? "").toLowerCase().includes(q) ||
            (sl.employee?.fullName ?? "").toLowerCase().includes(q),
        ),
    );
  }, [visibleHistory, searchQuery]);

  // Сводка по оплате — счётчики для чипов-фильтров.
  const paymentCounts = React.useMemo(() => {
    const counts = new Map<PaymentFilter, number>([["all", baseHistory.length]]);
    for (const h of baseHistory) {
      const s = h.paymentStatus;
      if (!s) continue;
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return counts;
  }, [baseHistory]);

  const displayList = React.useMemo(() => {
    let list = baseHistory;
    if (paymentFilter !== "all") {
      list = list.filter((h) => h.paymentStatus === paymentFilter);
    }
    if (filters.serviceName) {
      list = list.filter((h) =>
        getLines(h).some((sl) => sl.service?.name === filters.serviceName),
      );
    }
    return list;
  }, [baseHistory, paymentFilter, filters.serviceName, getLines]);

  // Для счётчика в тулбаре: тот же фильтр по исполнителю, что панель
  // применяет внутри к items (сам список фильтрует панель).
  const doctorFilteredCount = React.useMemo(() => {
    if (!doctorFilter) return displayList.length;
    return displayList.filter((h) =>
      h.services.some((sl) => sl.employee?.fullName === doctorFilter),
    ).length;
  }, [displayList, doctorFilter]);

  // ── Drawer-фильтры: бейдж и чипы применённых значений ─────────────────────
  const defaults = defaultRegistryFilters();
  const isPeriodDefault = filters.year === defaults.year && filters.month === defaults.month;
  const activeFilterCount = (isPeriodDefault ? 0 : 1) + (filters.serviceName ? 1 : 0);

  const periodLabel = filters.month
    ? `${MONTH_NAMES[dayjs(filters.month).month()]} ${filters.year}`
    : `${filters.year} · весь год`;

  const appliedFilterChips: { key: string; label: string; clear: () => void }[] = [
    ...(!isPeriodDefault
      ? [{
          key: "period",
          label: periodLabel,
          clear: () => setFilters((f) => ({ ...f, year: defaults.year, month: defaults.month })),
        }]
      : []),
    ...(filters.serviceName
      ? [{
          key: "service",
          label: filters.serviceName,
          clear: () => setFilters((f) => ({ ...f, serviceName: null })),
        }]
      : []),
  ];

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleConfirmVisit = React.useCallback(
    async (appt: DjangoAppointment) => {
      try {
        await updateAppointment(appt.id, { status: "confirmed" });
        void fetchData();
      } catch (e) {
        notify?.({ type: "error", message: parseBackendError(e) });
      }
    },
    [fetchData, notify],
  );

  const handleArrived = React.useCallback(
    async (appt: DjangoAppointment) => {
      try {
        await updateAppointment(appt.id, { status: "arrived" });
        void fetchData();
      } catch (e) {
        notify?.({ type: "error", message: parseBackendError(e) });
      }
    },
    [fetchData, notify],
  );

  const isLoading = loading || extraLoading;
  const isFiltered = doctorFilteredCount !== baseHistory.length;

  const detailsPanel = selectedAppt ? (
    <AppointmentDetailsPanel
      appointment={selectedAppt}
      canUpdate={canUpdate}
      canManageFinance={canManageFinance}
      canViewFinance={canViewFinance}
      canViewConclusions={canViewConclusions}
      onEdit={setEditTarget}
      onPay={setPaymentTarget}
      onConfirmVisit={handleConfirmVisit}
      onArrived={handleArrived}
      onClose={() => setSelectedAppt(null)}
    />
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
      <Typography align="center">Выберите запись для просмотра деталей</Typography>
    </Box>
  );

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <PageHeader
        title={pageTitle}
        showTitle={false}
        showSearch
        searchVal={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={searchPlaceholder}
        loading={isLoading}
      />

      <Box
        sx={(t) => ({
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          overflowX: "hidden",
          pb: 1,
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          "&::-webkit-scrollbar": { display: "none" },
          px: t.appLayout.page.paddingX,
        })}
      >
        <Grid2 container spacing={2} sx={{ flex: 1, minHeight: 0 }}>
          {/* LEFT: list */}
          <Grid2
            size={{ xs: 12, md: 5 }}
            sx={(t) => ({
              position: { md: "sticky" },
              top: { md: t.spacing(2) },
              alignSelf: "flex-start",
              height: {
                xs: "auto",
                md: `calc(100dvh - ${t.appLayout.viewportOffset.employees.desktopOffset}px)`,
              },
              display: "flex",
              flexDirection: "column",
            })}
          >
            <Paper
              elevation={0}
              variant="outlined"
              sx={{ height: { xs: "auto", md: "100%" }, overflow: "hidden", display: "flex", flexDirection: "column" }}
            >
              {/* Тулбар: счётчик + кнопка «Фильтры» */}
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                useFlexGap
                flexWrap="wrap"
                sx={{ p: 1.5, borderBottom: 1, borderColor: "divider", gap: 1 }}
              >
                <Typography variant="subtitle2" fontWeight={600}>
                  {listLabel} ({isFiltered ? `${doctorFilteredCount} из ${baseHistory.length}` : baseHistory.length})
                </Typography>
                <Badge badgeContent={activeFilterCount} color="primary">
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<FilterListIcon fontSize="small" />}
                    onClick={() => setFilterDrawerOpen(true)}
                    sx={{ textTransform: "none" }}
                  >
                    Фильтры
                  </Button>
                </Badge>
              </Stack>

              {/* Сводка по оплате — кликабельные чипы-фильтры */}
              <Stack
                direction="row"
                gap={0.75}
                flexWrap="wrap"
                sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: "divider" }}
              >
                {PAYMENT_CHIPS.map((o) => {
                  const count = paymentCounts.get(o.value) ?? 0;
                  if (o.onlyIfPresent && count === 0) return null;
                  const active = paymentFilter === o.value;
                  const accent = o.tone ? theme.palette[o.tone].main : theme.palette.primary.main;
                  const accentText = o.tone
                    ? theme.palette.mode === "dark"
                      ? theme.palette[o.tone].light
                      : theme.palette[o.tone].dark
                    : "primary.onSurface";
                  return (
                    <Chip
                      key={o.value}
                      size="small"
                      clickable
                      onClick={() => setPaymentFilter(o.value)}
                      label={`${o.label} · ${count}`}
                      sx={(t) => ({
                        height: 26,
                        borderRadius: "8px",
                        fontWeight: 500,
                        border: 1,
                        borderColor: active ? alpha(accent, 0.4) : "divider",
                        color: active ? accentText : "text.secondary",
                        bgcolor: active
                          ? alpha(accent, t.palette.mode === "dark" ? 0.16 : 0.08)
                          : "transparent",
                        "&:hover": {
                          bgcolor: active
                            ? alpha(accent, t.palette.mode === "dark" ? 0.22 : 0.12)
                            : subtleBg(t, true),
                        },
                      })}
                    />
                  );
                })}
              </Stack>

              {/* Чипы применённых фильтров из Drawer */}
              {appliedFilterChips.length > 0 && (
                <Stack
                  direction="row"
                  gap={0.75}
                  flexWrap="wrap"
                  sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: "divider" }}
                >
                  {appliedFilterChips.map((c) => (
                    <Chip
                      key={c.key}
                      size="small"
                      label={c.label}
                      onDelete={c.clear}
                      sx={{ height: 26, borderRadius: "8px", fontWeight: 500 }}
                    />
                  ))}
                </Stack>
              )}

              <Box sx={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <AppointmentListPanel
                  items={displayList}
                  loading={isLoading}
                  error={null}
                  date={filters.month ? dayjs(filters.month) : dayjs(`${filters.year}-01-01`)}
                  selectedId={selectedAppt?.id ?? null}
                  canUpdate={canUpdate}
                  canManageFinance={canManageFinance}
                  canViewFinance={canViewFinance}
                  // Фильтр по сотруднику — внутренняя лента аватарок панели
                  // (как в «Регистратуре»); управляемый режим, чтобы счётчик
                  // в тулбаре учитывал выбор.
                  doctorFilter={doctorFilter}
                  onDoctorFilterChange={setDoctorFilter}
                  groupEmployeeIds={groupEmployeeIds}
                  onSelect={(appt) => setSelectedAppt((prev) => (prev?.id === appt.id ? null : appt))}
                  onEdit={setEditTarget}
                  onPay={setPaymentTarget}
                />
              </Box>
            </Paper>
          </Grid2>

          {/* RIGHT: details */}
          {!isMobile && (
            <Grid2
              size={{ xs: 12, md: 7 }}
              sx={(t) => ({
                position: { md: "sticky" },
                top: { md: t.spacing(2) },
                alignSelf: "flex-start",
                height: {
                  md: `calc(100dvh - ${t.appLayout.viewportOffset.employees.desktopOffset}px)`,
                },
              })}
            >
              {detailsPanel}
            </Grid2>
          )}
        </Grid2>
      </Box>

      {/* Mobile bottom sheet */}
      {isMobile && (
        <AppBottomSheet open={!!selectedAppt} onClose={() => setSelectedAppt(null)}>
          <Box sx={{ height: "80vh" }}>
            {selectedAppt && (
              <AppointmentDetailsPanel
                appointment={selectedAppt}
                canUpdate={canUpdate}
                canManageFinance={canManageFinance}
                canViewFinance={canViewFinance}
                canViewConclusions={canViewConclusions}
                onEdit={setEditTarget}
                onPay={setPaymentTarget}
                onArrived={handleArrived}
                onClose={() => setSelectedAppt(null)}
              />
            )}
          </Box>
        </AppBottomSheet>
      )}

      {/* Drawer фильтров */}
      <RegistryFilterDrawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        filters={filters}
        onApply={setFilters}
        onReset={() => setFilters(defaultRegistryFilters())}
        availableYears={availableYears}
        availableServices={availableServices}
      />

      {/* Edit drawer */}
      <DjangoEditAppointmentDrawer
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        appointment={editTarget}
        onSaved={() => {
          setEditTarget(null);
          void fetchData();
        }}
      />

      {/* Payment drawer */}
      <DjangoPaymentDrawer
        open={!!paymentTarget}
        onClose={() => setPaymentTarget(null)}
        appointment={paymentTarget}
        onSaved={() => {
          setPaymentTarget(null);
          void fetchData();
        }}
      />
    </Box>
  );
};

export default AppointmentsRegistryView;
