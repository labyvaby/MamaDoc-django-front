/**
 * AllAppointmentsList — Все приёмы (Django backend).
 * Layout 1-в-1 с оригинальным all-appointments:
 *   - Левая панель: фильтр по периоду / сотрудникам / услугам (раскрывающийся список)
 *   - Средняя панель: список приёмов (AppointmentListPanel + AppointmentRow)
 *   - Правая панель: AppointmentDetailsPanel
 * Data layer: Django REST API (getAppointments), без Supabase.
 */
import React from "react";
import {
  Box,
  Paper,
  Typography,
  Grid2,
  TextField,
  MenuItem,
  Button,
  Stack,
  List,
  ListItemButton,
  ListItemText,
  Collapse,
  useTheme,
  useMediaQuery,
  ToggleButtonGroup,
  ToggleButton,
  Chip,
  Drawer,
} from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import MedicalServicesIcon from "@mui/icons-material/MedicalServices";
import { ExpandLess, ExpandMore } from "@mui/icons-material";
import dayjs from "dayjs";
import "dayjs/locale/ru";

dayjs.locale("ru");

import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { PageHeader, AppBottomSheet } from "../../components/ui";
import { useCanChecker } from "../../hooks/useCan";
import {
  getAppointments,
  type DjangoAppointment,
} from "../../api/appointments";
import AppointmentListPanel from "../appointments/components/AppointmentListPanel";
import AppointmentDetailsPanel from "../appointments/components/AppointmentDetailsPanel";
import DjangoEditAppointmentDrawer from "../appointments/DjangoEditAppointmentDrawer";
import DjangoPaymentDrawer from "../appointments/DjangoPaymentDrawer";
import { updateAppointment, parseBackendError } from "../../api/appointments";
import { useNotification } from "@refinedev/core";

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export const AllAppointmentsList: React.FC = () => {
  usePageTitle("Все приемы");
  const { can } = useCanChecker();
  const { isSuperAdmin } = usePermissions();
  const { open: notify } = useNotification();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const canUpdate = can("appointments.update");
  const canDelete = isSuperAdmin() || can("appointments.delete");
  const canViewFinance = can("finance.view");
  const canManageFinance = can("finance.manage");
  const canViewConclusions = can("medical.conclusions.view");

  // ── Filters ────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedYear, setSelectedYear] = React.useState<string>(dayjs().year().toString());
  const [selectedMonth, setSelectedMonth] = React.useState<string>(dayjs().format("YYYY-MM"));
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = React.useState<string | null>(null);
  const [expandedEmployee, setExpandedEmployee] = React.useState<string | null>(null);
  const [filterMode, setFilterMode] = React.useState<"date" | "services">("date");
  const [selectedServiceEmployee, setSelectedServiceEmployee] = React.useState<string | null>(null);
  const [selectedServiceName, setSelectedServiceName] = React.useState<string | null>(null);

  // ── Data ───────────────────────────────────────────────────────────────────
  const [history, setHistory] = React.useState<DjangoAppointment[]>([]);
  const [loading, setLoading] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const dateFrom = selectedMonth
        ? dayjs(selectedMonth).startOf("month").format("YYYY-MM-DD")
        : selectedYear
        ? `${selectedYear}-01-01`
        : undefined;
      const dateTo = selectedMonth
        ? dayjs(selectedMonth).endOf("month").format("YYYY-MM-DD")
        : selectedYear
        ? `${selectedYear}-12-31`
        : undefined;

      const data = await getAppointments({ dateFrom, dateTo });
      const sorted = [...data].sort((a, b) =>
        b.scheduledAt.localeCompare(a.scheduledAt),
      );
      setHistory(sorted);
    } catch (e) {
      console.error("AllAppointments fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth]);

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

  const availableMonths = React.useMemo(() => {
    if (!selectedYear) return [];
    return Array.from({ length: 12 }, (_, i) => ({
      value: `${selectedYear}-${String(i + 1).padStart(2, "0")}`,
      monthIndex: i,
    })).reverse();
  }, [selectedYear]);

  const filteredHistory = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return history;
    return history.filter(
      (h) =>
        (h.patient?.fullName ?? "").toLowerCase().includes(q) ||
        h.services.some(
          (sl) =>
            (sl.service?.name ?? "").toLowerCase().includes(q) ||
            (sl.employee?.fullName ?? "").toLowerCase().includes(q),
        ),
    );
  }, [history, searchQuery]);

  // Group by doctor (employee) for left panel
  const groupedByEmployee = React.useMemo(() => {
    const empMap = new Map<string, { name: string; total: number; days: Map<string, number> }>();
    for (const h of filteredHistory) {
      const isPaid = h.paymentStatus === "paid" || h.paymentStatus === "partial";
      if (!isPaid) continue;
      const dayKey = dayjs(h.scheduledAt).format("YYYY-MM-DD");
      const names = Array.from(
        new Set(h.services.filter((sl) => sl.employee).map((sl) => sl.employee!.fullName)),
      );
      const empNames = names.length > 0 ? names : ["Без врача"];
      for (const name of empNames) {
        if (!empMap.has(name)) empMap.set(name, { name, total: 0, days: new Map() });
        const e = empMap.get(name)!;
        e.total++;
        e.days.set(dayKey, (e.days.get(dayKey) ?? 0) + 1);
      }
    }
    return Array.from(empMap.values())
      .map((e) => ({
        employeeName: e.name,
        total: e.total,
        days: Array.from(e.days.entries())
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([date, count]) => ({ date, count })),
      }))
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName, "ru"));
  }, [filteredHistory]);

  const groupedByService = React.useMemo(() => {
    const empMap = new Map<string, Map<string, number>>();
    for (const h of filteredHistory) {
      const isPaid = h.paymentStatus === "paid" || h.paymentStatus === "partial";
      if (!isPaid) continue;
      for (const sl of h.services) {
        const empName = sl.employee?.fullName;
        const svcName = sl.service?.name ?? "Без названия";
        if (!empName) continue;
        if (!empMap.has(empName)) empMap.set(empName, new Map());
        empMap.get(empName)!.set(svcName, (empMap.get(empName)!.get(svcName) ?? 0) + 1);
      }
    }
    return Array.from(empMap.entries())
      .map(([empName, svcMap]) => ({
        empName,
        total: Array.from(svcMap.values()).reduce((a, b) => a + b, 0),
        services: Array.from(svcMap.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([svcName, count]) => ({ svcName, count })),
      }))
      .sort((a, b) => a.empName.localeCompare(b.empName, "ru"));
  }, [filteredHistory]);

  const displayList = React.useMemo(() => {
    let list = filteredHistory;

    if (selectedDate) {
      list = list.filter((h) => dayjs(h.scheduledAt).format("YYYY-MM-DD") === selectedDate);
    }

    const empFilter = filterMode === "services" ? selectedServiceEmployee : selectedEmployeeFilter;
    if (empFilter) {
      list = list.filter((h) =>
        h.services.some((sl) => sl.employee?.fullName === empFilter),
      );
    }

    if (filterMode === "services" && selectedServiceName) {
      list = list.filter((h) =>
        h.services.some((sl) => sl.service?.name === selectedServiceName),
      );
    }

    return list;
  }, [filteredHistory, selectedDate, selectedEmployeeFilter, filterMode, selectedServiceEmployee, selectedServiceName]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleArrived = React.useCallback(
    async (appt: DjangoAppointment) => {
      try {
        await updateAppointment(appt.id, { status: "waiting" });
        void fetchData();
      } catch (e) {
        notify?.({ type: "error", message: parseBackendError(e) });
      }
    },
    [fetchData, notify],
  );

  const detailsPanel = selectedAppt ? (
    <AppointmentDetailsPanel
      appointment={selectedAppt}
      canUpdate={canUpdate}
      canManageFinance={canManageFinance}
      canViewFinance={canViewFinance}
      canViewConclusions={canViewConclusions}
      canDelete={canDelete}
      onEdit={setEditTarget}
      onPay={setPaymentTarget}
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
      <Typography align="center">Выберите приём для просмотра деталей</Typography>
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
        title="Все приемы"
        showTitle={false}
        showSearch
        searchVal={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Поиск пациента, услуги..."
        loading={loading}
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
          {/* LEFT: period / employee filter */}
          <Grid2
            size={{ xs: 12, md: 3 }}
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
              <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="subtitle2" fontWeight={600}>Фильтр</Typography>
                <Button
                  size="small"
                  onClick={() => {
                    setSelectedYear(dayjs().year().toString());
                    setSelectedMonth(dayjs().format("YYYY-MM"));
                    setSelectedDate(null);
                    setSelectedEmployeeFilter(null);
                    setExpandedEmployee(null);
                    setSelectedServiceEmployee(null);
                    setSelectedServiceName(null);
                  }}
                  sx={{ textTransform: "none" }}
                >
                  Сброс
                </Button>
              </Box>

              {/* Mode switcher */}
              <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
                <ToggleButtonGroup
                  value={filterMode}
                  exclusive
                  onChange={(_, v) => {
                    if (v) {
                      setFilterMode(v);
                      setSelectedServiceEmployee(null);
                      setSelectedServiceName(null);
                      setSelectedEmployeeFilter(null);
                      setSelectedDate(null);
                      setExpandedEmployee(null);
                    }
                  }}
                  size="small"
                  fullWidth
                >
                  <ToggleButton value="date" sx={{ textTransform: "none", gap: 0.5, fontSize: "0.75rem" }}>
                    <CalendarMonthIcon fontSize="inherit" />
                    По дате
                  </ToggleButton>
                  <ToggleButton value="services" sx={{ textTransform: "none", gap: 0.5, fontSize: "0.75rem" }}>
                    <MedicalServicesIcon fontSize="inherit" />
                    По услугам
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>

              <Box sx={{ overflowY: "auto", flex: 1, p: 1.5, pt: 0.5 }}>
                {/* Period selectors */}
                <Stack spacing={1.5} sx={{ mb: 1.5 }}>
                  <Stack spacing={0.5}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Год</Typography>
                    <TextField
                      select size="small" fullWidth
                      value={selectedYear}
                      onChange={(e) => {
                        setSelectedYear(e.target.value);
                        setSelectedMonth(dayjs().format("YYYY-MM"));
                        setSelectedDate(null);
                        setSelectedServiceEmployee(null);
                        setSelectedServiceName(null);
                      }}
                    >
                      {availableYears.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                    </TextField>
                  </Stack>
                  <Stack spacing={0.5}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Месяц</Typography>
                    <TextField
                      select size="small" fullWidth
                      value={selectedMonth}
                      onChange={(e) => {
                        setSelectedMonth(e.target.value);
                        setSelectedDate(null);
                        setSelectedServiceEmployee(null);
                        setSelectedServiceName(null);
                      }}
                      SelectProps={{ displayEmpty: true }}
                    >
                      <MenuItem value=""><Typography variant="body2" color="text.secondary">Все месяцы</Typography></MenuItem>
                      {availableMonths.map((m) => (
                        <MenuItem key={m.value} value={m.value}>{MONTH_NAMES[m.monthIndex]}</MenuItem>
                      ))}
                    </TextField>
                  </Stack>
                </Stack>

                {/* DATE MODE — employee hierarchy */}
                {filterMode === "date" && (
                  <Stack spacing={0.5}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Сотрудники</Typography>
                    <List dense sx={{ py: 0 }}>
                      {groupedByEmployee.map((emp) => {
                        const isExpanded = expandedEmployee === emp.employeeName;
                        const isSelected = selectedEmployeeFilter === emp.employeeName;
                        return (
                          <React.Fragment key={emp.employeeName}>
                            <ListItemButton
                              selected={isSelected}
                              onClick={() => {
                                if (isExpanded) {
                                  setExpandedEmployee(null);
                                  setSelectedEmployeeFilter(null);
                                  setSelectedDate(null);
                                } else {
                                  setExpandedEmployee(emp.employeeName);
                                  setSelectedEmployeeFilter(emp.employeeName);
                                  setSelectedDate(null);
                                }
                              }}
                              sx={{ borderRadius: 1, mb: 0.5, pr: 1 }}
                            >
                              <ListItemText
                                primary={emp.employeeName}
                                primaryTypographyProps={{ variant: "body2", sx: { fontWeight: isSelected ? 600 : 400 } }}
                              />
                              <Box sx={{ bgcolor: "primary.main", color: "primary.contrastText", borderRadius: 10, px: 0.8, py: 0.2, fontSize: "0.75rem", fontWeight: 600, mr: 1, minWidth: 20, textAlign: "center" }}>
                                {emp.total}
                              </Box>
                              {isExpanded ? <ExpandLess fontSize="small" color="action" /> : <ExpandMore fontSize="small" color="action" />}
                            </ListItemButton>
                            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                              <List dense disablePadding>
                                {emp.days.map((day) => (
                                  <ListItemButton
                                    key={day.date}
                                    selected={selectedDate === day.date}
                                    onClick={() => {
                                      if (selectedDate === day.date) {
                                        setSelectedDate(null);
                                      } else {
                                        setSelectedEmployeeFilter(emp.employeeName);
                                        setSelectedDate(day.date);
                                      }
                                    }}
                                    sx={{ borderRadius: 1, mb: 0.5, pl: 3 }}
                                  >
                                    <Typography variant="body2" sx={{ flex: 1, color: "text.secondary" }}>
                                      {dayjs(day.date).format("D MMMM YYYY")}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">{day.count}</Typography>
                                  </ListItemButton>
                                ))}
                              </List>
                            </Collapse>
                          </React.Fragment>
                        );
                      })}
                      {groupedByEmployee.length === 0 && !loading && (
                        <Typography variant="body2" color="text.secondary" sx={{ py: 1, pl: 1 }}>
                          Нет оплаченных приёмов
                        </Typography>
                      )}
                    </List>
                  </Stack>
                )}

                {/* SERVICES MODE */}
                {filterMode === "services" && (
                  <Stack spacing={0.5}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                      Сотрудники и услуги
                    </Typography>
                    {groupedByService.length === 0 && (
                      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                        Нет данных за выбранный период
                      </Typography>
                    )}
                    <List dense sx={{ py: 0 }}>
                      {groupedByService.map((emp) => {
                        const isSelected = selectedServiceEmployee === emp.empName;
                        return (
                          <React.Fragment key={emp.empName}>
                            <ListItemButton
                              selected={isSelected}
                              onClick={() => {
                                setSelectedServiceEmployee(isSelected ? null : emp.empName);
                                setSelectedServiceName(null);
                              }}
                              sx={{ borderRadius: 1, mb: 0.5, pr: 1 }}
                            >
                              <ListItemText
                                primary={emp.empName}
                                primaryTypographyProps={{ variant: "body2", sx: { fontWeight: isSelected ? 600 : 400 } }}
                              />
                              <Box sx={{ bgcolor: "primary.main", color: "primary.contrastText", borderRadius: 10, px: 0.8, py: 0.2, fontSize: "0.75rem", fontWeight: 600, mr: 1, minWidth: 20, textAlign: "center" }}>
                                {emp.total}
                              </Box>
                              {isSelected ? <ExpandLess fontSize="small" color="action" /> : <ExpandMore fontSize="small" color="action" />}
                            </ListItemButton>
                            <Collapse in={isSelected} timeout="auto" unmountOnExit>
                              <Box sx={{ pl: 2, pb: 1 }}>
                                <Stack spacing={0.5}>
                                  {emp.services.map((svc) => {
                                    const isSvcSelected = selectedServiceName === svc.svcName;
                                    return (
                                      <Box
                                        key={svc.svcName}
                                        onClick={() => setSelectedServiceName(isSvcSelected ? null : svc.svcName)}
                                        sx={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          px: 1,
                                          py: 0.4,
                                          borderRadius: 1,
                                          cursor: "pointer",
                                          bgcolor: isSvcSelected ? "primary.main" : "action.hover",
                                          "&:hover": { bgcolor: isSvcSelected ? "primary.dark" : "action.selected" },
                                        }}
                                      >
                                        <Typography variant="body2" sx={{ color: isSvcSelected ? "primary.contrastText" : "text.secondary", flex: 1, mr: 1, fontSize: "0.78rem", fontWeight: isSvcSelected ? 600 : 400 }}>
                                          {svc.svcName}
                                        </Typography>
                                        <Chip label={svc.count} size="small" sx={{ height: 20, fontSize: "0.72rem", fontWeight: 700, minWidth: 28 }} />
                                      </Box>
                                    );
                                  })}
                                </Stack>
                              </Box>
                            </Collapse>
                          </React.Fragment>
                        );
                      })}
                    </List>
                  </Stack>
                )}
              </Box>
            </Paper>
          </Grid2>

          {/* MIDDLE: list */}
          <Grid2
            size={{ xs: 12, md: 4 }}
            sx={(t) => ({
              position: { md: "sticky" },
              top: { md: t.spacing(2) },
              alignSelf: "flex-start",
              height: {
                xs: "auto",
                md: `calc(100dvh - ${t.appLayout.viewportOffset.employees.desktopOffset}px)`,
              },
            })}
          >
            <Paper
              elevation={0}
              variant="outlined"
              sx={{ height: { xs: "auto", md: "100%" }, overflow: "hidden", display: "flex", flexDirection: "column" }}
            >
              <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
                <Typography variant="subtitle2" fontWeight={600}>
                  Список приёмов ({displayList.length})
                </Typography>
              </Box>
              <Box sx={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <AppointmentListPanel
                  items={displayList}
                  loading={loading}
                  error={null}
                  date={selectedMonth ? dayjs(selectedMonth) : dayjs()}
                  selectedId={selectedAppt?.id ?? null}
                  canUpdate={canUpdate}
                  canManageFinance={canManageFinance}
                  canViewFinance={canViewFinance}
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
              size={{ xs: 12, md: 5 }}
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
        <AppBottomSheet
          open={!!selectedAppt}
          onClose={() => setSelectedAppt(null)}
        >
          <Box sx={{ height: "80vh" }}>
            {selectedAppt && (
              <AppointmentDetailsPanel
                appointment={selectedAppt}
                canUpdate={canUpdate}
                canManageFinance={canManageFinance}
                canViewFinance={canViewFinance}
                canViewConclusions={canViewConclusions}
                canDelete={canDelete}
                onEdit={setEditTarget}
                onPay={setPaymentTarget}
                onArrived={handleArrived}
                onClose={() => setSelectedAppt(null)}
              />
            )}
          </Box>
        </AppBottomSheet>
      )}

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

export default AllAppointmentsList;
