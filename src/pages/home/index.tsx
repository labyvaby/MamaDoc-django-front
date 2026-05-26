import React, { useEffect } from "react";
import { useNotification } from "@refinedev/core";
import {
  Box,
  Divider,
  Stack,
  Typography,
  Checkbox,
  FormControlLabel,
  Button,
  Drawer,
  IconButton,
  TextField,
  Grid,
  Tabs,
  Tab,
} from "@mui/material";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { useTheme } from "@mui/material/styles";
import { usePageTitle } from "../../hooks/usePageTitle";
import { supabase } from "../../utility/supabaseClient";
// import { formatKGS } from '../../utility/format';
import { formatDateRu } from "../../utility/format";
import dayjs from "dayjs";
import AppointmentsList from "./components/AppointmentsList";
import { fetchDoctors, fetchMedicalStaff } from "../../services/employees";
import type { Appointment, AggregatedAppointmentRow } from "./types";
import { mapAggregatedRowToAppointment, compareAppointmentsByStatus } from "./types";
import type { EmployeesRow } from "../expenses/types";
import { fetchShiftsForDate, Shift } from "../../services/shifts";
import { AppBottomSheet, PageHeader, DateNavigation } from "../../components/ui";
import { useRefresh } from "../../contexts/refresh-context";
import AppointmentDetailsCard from "./components/AppointmentDetailsCard";
import useMediaQuery from "@mui/material/useMediaQuery";
import HomeAddAppointmentDrawer from "./components/HomeAddAppointmentDrawer";
import { DoctorConclusionPanel } from "../doctor/components/DoctorConclusionPanel";
import { usePermissions } from "../../hooks/usePermissions";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";


/* Simple cache (оставляем только для услуг)
   Примечание: кэш приёмов отключён, т.к. теперь грузим серверно отфильтрованные по дате данные */
// let CACHED_ALL: Appointment[] | null = null;
// let CACHED_INIT_DATE: string | null = null;

// Helper to format today like 15.11.2025 (delegates to shared util)
const formatRuDate = (d: Date) => formatDateRu(d);

// Debounce helper (как на странице поиска пациентов)
function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}



import { useSearchParams } from "react-router";


export const HomePage: React.FC = () => {
  usePageTitle("Регистратура");
  useNotification();
  const queryClient = useQueryClient();
  const { setOnRefresh } = useRefresh();
  const theme = useTheme();
  const { isAdmin, isRegistrator, employeeId } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();

  // Handling deep link for creating appointment or selecting existing one
  React.useEffect(() => {
    const create = searchParams.get("create_appointment") === "true";
    const pId = searchParams.get("patient_id");
    const apptId = searchParams.get("appointment_id");

    if (create && pId) {
      setInitialPatientId(pId);
      setVisitOpen(true);
      // Clear params partially
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("create_appointment");
      newParams.delete("patient_id");
      setSearchParams(newParams);
    } else if (apptId) {
      setSelectedAppointmentId(apptId);
      // Optional: Clear param? User didn't say, but usually good for URL cleanliness
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("appointment_id");
      setSearchParams(newParams);
    }
  }, [searchParams, setSearchParams]);

  // Считаем "мобильным" всё, что уже планшета (<= md),
  // т.к. breakpoints.sm у нас сдвинут до 360px и на реальных телефонах isMobile всегда false.
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  // Appointments state
  const [selectedAppointmentId, setSelectedAppointmentId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState(0);

  React.useEffect(() => {
    // console.log("selectedAppointmentId changed:", selectedAppointmentId, "isMobile:", isMobile);
  }, [selectedAppointmentId, isMobile]);

  // UI state
  const [filtersOpen, setFiltersOpen] = React.useState(false);


  // Filters
  // Дата по умолчанию — сегодня (yyyy-MM-dd), чтобы сразу грузить серверно отфильтрованные данные
  const [date, setDate] = React.useState<string>(() => {
    const t = new Date();
    const yyyy = t.getFullYear();
    const mm = String(t.getMonth() + 1).padStart(2, "0");
    const dd = String(t.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [status, setStatus] = React.useState<Record<string, boolean>>({
    Оплачено: true,
    Ожидаем: true,
    "Пациент здесь": true,
    "Со скидкой": true,
    "Пациент не пришел": false,
    "Отменено": true,
  });
  const [onlyNight, setOnlyNight] = React.useState(false);
  const [doctorId, setDoctorId] = React.useState("");
  // const [revenueMode, setRevenueMode] = React.useState<
  //   'total' | 'cash' | 'cashless'
  // >('total');

  // Add appointment drawer state
  const [visitOpen, setVisitOpen] = React.useState(false);
  const [initialPatientId, setInitialPatientId] = React.useState<string | null>(null);
  const [conclusionOpen, setConclusionOpen] = React.useState(false);
  const [initialSlotDate, setInitialSlotDate] = React.useState<string | null>(null);
  const [initialSlotDoctorId, setInitialSlotDoctorId] = React.useState<string | null>(null);



  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    setDoctorId("");
  };

  // Fetch shifts for the selected date (and previous day for night shifts) — с кэшем
  const prevDate = React.useMemo(() => dayjs(date).subtract(1, 'day').format('YYYY-MM-DD'), [date]);
  const { data: shiftsData } = useQuery({
    queryKey: ["shifts", date],
    queryFn: () => Promise.all([fetchShiftsForDate(date), fetchShiftsForDate(prevDate)]),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const dayShifts = React.useMemo(() => {
    if (!shiftsData) return [];
    return [...shiftsData[1], ...shiftsData[0]];
  }, [shiftsData]);

  // --- OPTIMIZATION: React Query for Doctors ---
  const { data: doctors = [], isLoading: doctorsLoading } = useQuery<EmployeesRow[]>({
    queryKey: ["employees", "medical-staff"],
    queryFn: fetchMedicalStaff,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  const [dayCounts, setDayCounts] = React.useState<Record<string, number>>({});

  // Функция центрирования выбранной даты в горизонтальной ленте


  // --- OPTIMIZATION: React Query for Daily Appointments ---
  const dailyRange = React.useMemo(() => {
    // Конвертируем границы дня в UTC с учётом Bishkek (UTC+6)
    const start = dayjs.tz(`${date}T00:00:00`, "Asia/Bishkek").toISOString();
    const end = dayjs.tz(`${date}T23:59:59.999`, "Asia/Bishkek").toISOString();
    return { start, end, key: date };
  }, [date]);

  const { data: dailyAppointments = [], isLoading: dailyLoading, isFetching: dailyFetching, refetch: refetchAppointments } = useQuery<Appointment[]>({
    queryKey: ["appointments", "daily", dailyRange.key],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_home_appointments", { p_date: dailyRange.key, p_employee_id: null });
      if (error) throw error;
      return (data || []).map((row: AggregatedAppointmentRow) => mapAggregatedRowToAppointment(row));
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  // Мгновенная инвалидация после сохранения/оплаты приёма — чтобы инициатор
  // не ждал 5-секундный realtime debounce. refetchAppointments() покрывает
  // ["appointments","daily", date], а здесь добиваем смежные ключи.
  const invalidateAppointmentAfterSave = React.useCallback((id?: string | null) => {
    queryClient.invalidateQueries({ queryKey: ["appointment-notifications", "daily", dailyRange.key] });
    if (id) {
      queryClient.invalidateQueries({ queryKey: ["appointment-details", id] });
    }
  }, [queryClient, dailyRange.key]);

  // Fetch SMS notifications for the day via RPC (avoids 502 from long URL with 90+ IDs)
  const { data: dailyNotifications = [] } = useQuery<{ appointment_id: string; notification_type: string; sent_at: string }[]>({
    queryKey: ["appointment-notifications", "daily", dailyRange.key],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_notifications_for_date", { p_date: dailyRange.key });
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Map: appointmentId → Map<notificationType, sent_at>
  const notificationsMap = React.useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    dailyNotifications.forEach(n => {
      if (!map.has(n.appointment_id)) map.set(n.appointment_id, new Map());
      map.get(n.appointment_id)!.set(n.notification_type, n.sent_at);
    });
    return map;
  }, [dailyNotifications]);



  // --- OPTIMIZATION: React Query for Range Counts ---
  // Стабилизируем диапазон: берем 2 недели от понедельника текущей недели выбранной даты
  const { data: rangeData = [] } = useQuery({
    queryKey: ["appointments", "counts", date, isAdmin(), isRegistrator(), employeeId],
    queryFn: async () => {
      const startDay = dayjs(date).subtract(15, 'day').format('YYYY-MM-DD');
      const endDay   = dayjs(date).add(15, 'day').format('YYYY-MM-DD');
      const isPrivileged = isAdmin() || isRegistrator();

      const { data, error } = await supabase.rpc('get_appointment_day_counts', {
        p_start: startDay,
        p_end: endDay,
        p_employee_id: isPrivileged ? null : (employeeId ?? null),
      });
      if (error) throw error;
      return (data || []) as { day: string; cnt: number }[];
    },
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Маппинг данных диапазона в dayCounts
  React.useEffect(() => {
    const counts: Record<string, number> = {};
    rangeData.forEach((item) => {
      counts[item.day] = Number(item.cnt);
    });
    setDayCounts(counts);
  }, [rangeData]);

  // Старые функции и useEffect-ы удалены/заменены на useQuery выше (строки 193-285 удаляются)

  // Load all doctors - REPLACED BY useQuery above
  // React.useEffect(() => { ... }, []);

  useEffect(() => {
    const handleRefresh = () => {
      refetchAppointments();
    };

    setOnRefresh(() => handleRefresh);

    // --- REALTIME SUBSCRIPTION ---
    let invalidationTimeout: NodeJS.Timeout;
    const debounceInvalidate = () => {
      clearTimeout(invalidationTimeout);
      invalidationTimeout = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["appointments", "daily", dailyRange.key] });
      }, 5000);
    };

    // Subscribe to all changes in the Appointments table
    const channel = supabase
      .channel("appointments-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "Appointments" },
        debounceInvalidate
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "AppointmentServices" },
        debounceInvalidate
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "MedicalConclusions" },
        debounceInvalidate
      )
      .subscribe();

    return () => {
      setOnRefresh(null);
      clearTimeout(invalidationTimeout);
      supabase.removeChannel(channel);
    };
  }, [setOnRefresh, refetchAppointments, dailyRange.key, queryClient]);

  // Load doctors when filters drawer opens - REPLACED BY useQuery above
  // React.useEffect(() => { ... }, [filtersOpen]);

  // Derived
  const ruDateFromInput = React.useMemo(() => {
    if (!date) return "";
    const [yyyy, mm, dd] = date.split("-");
    return `${dd}.${mm}.${yyyy}`;
  }, [date]);


  const filtered = React.useMemo(() => {
    return dailyAppointments.filter((a) => {
      // The appointments are strictly fetched for the selected day from the server, 
      // so no need to filter by date locally anymore.

      const statusKey = a.status || "";
      if (status[statusKey] === false) return false;

      if (onlyNight && !a.is_night) return false;

      // Filter by doctor ID (checks both primary doctor_id and performer_ids array)
      if (doctorId && a.doctor_id !== doctorId && !a.performer_ids?.includes(doctorId)) return false;

      return true;
    }).sort(compareAppointmentsByStatus);
  }, [dailyAppointments, date, status, onlyNight, doctorId]);

  const selectedAppointment = React.useMemo(() =>
    dailyAppointments.find(a => a.id === selectedAppointmentId) || null,
    [dailyAppointments, selectedAppointmentId]);

  // Check if selected appointment has conclusion
  const hasConclusion = React.useMemo(() => {
    if (!selectedAppointment) return false;
    return !!(selectedAppointment.has_conclusion || selectedAppointment.conclusion || selectedAppointment.diagnosis_code || selectedAppointment.diagnosis_data);
  }, [selectedAppointment]);

  React.useEffect(() => {
    if (!hasConclusion && activeTab === 1) setActiveTab(0);
  }, [hasConclusion, activeTab]);

  // React.useEffect(() => {
  //   (async () => {
  //     const { data } = await fetchPagedAll(APPTS_TABLE, 10, ruDateFromInput);
  //     console.log(data);
  //   })();
  // }, [ruDateFromInput]);

  // const appointmentsCount = React.useMemo(() => filtered.length, [filtered]);
  // const paidCount = React.useMemo(
  //   () => filtered.filter((a) => a.Статус === 'Оплачено').length,
  //   [filtered]
  // );
  // const waitingCount = React.useMemo(
  //   () => filtered.filter((a) => a.Статус === 'Ожидаем').length,
  //   [filtered]
  // );
  // const revenueSum = React.useMemo(
  //   () =>
  //     revenueMode === 'cash'
  //       ? filtered.reduce((acc, a) => acc + Number(a['Наличные'] ?? 0), 0)
  //       : revenueMode === 'cashless'
  //       ? filtered.reduce((acc, a) => acc + Number(a['Безналичные'] ?? 0), 0)
  //       : filtered.reduce(
  //           (acc, a) => acc + Number(a['Итого, сом'] ?? a['Стоимость'] ?? 0),
  //           0
  //         ),
  //   [filtered, revenueMode]
  // );


  const resetFilters = () => {
    const today = new Date();
    const [dd, mm, yyyy] = formatRuDate(today).split(".");
    setDate(`${yyyy}-${mm}-${dd}`);
    setStatus({
      Оплачено: true,
      Ожидаем: true,
      "Пациент здесь": true,
      "Cо скидкой": true,
      "Пациент не пришел": false, // Default hidden to reduce clutter? Or true? User didn't specify, false is safer for main view.
      "Отменено": true
    });
    setOnlyNight(false);
    setDoctorId("");
  };

  return (
    <Box
      sx={(theme) => ({
        // Высота страницы рассчитывается только через layout-токены темы,
        // чтобы на всех платформах (desktop, laptop, Android, iOS) поведение
        // было идентичным и управляемым из единого места.
        height: {
          xs: `calc(100dvh - ${theme.appLayout.viewportOffset.home.mobileOffset}px)`,
          md: `calc(100dvh - ${theme.appLayout.viewportOffset.home.desktopOffset}px)`,
        },
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      })}
    >
      <PageHeader
        title="Приемы"
        showTitle={false}
        addButtonText="Добавить прием"
        onAdd={() => {
          setVisitOpen(true);
        }}
        dateNavigation={
          <DateNavigation
            date={date}
            setDate={handleDateChange}
            dayCounts={dayCounts}
          />
        }
      />


      {/* Columns */}
      <Box sx={(theme) => ({
        flex: 1,
        overflow: "hidden",
        px: theme.appLayout.page.paddingX,
      })}>
        <Grid container spacing={2} sx={{
          alignItems: "flex-start",
          height: "100%", // Fit to parent flex
          boxSizing: "border-box"
        }}>
          {/* Column 1: Appointments List */}
          <Grid item xs={12} md={conclusionOpen ? 4 : 6} sx={{
            height: '100%',
            overflow: 'hidden',
            pr: { md: 1 },
            transition: 'all 0.3s ease'
          }}>
            <AppointmentsList
              titleDate={ruDateFromInput}
              loading={dailyFetching}
              errorMsg={null}
              items={filtered}
              onOpenFilters={() => setFiltersOpen(true)}
              onItemClick={(id) => {
                setSelectedAppointmentId(id);
                if (id !== selectedAppointmentId) {
                  setConclusionOpen(false);
                  setActiveTab(0); // Reset to details tab on new selection
                }
              }}
              onAddSlot={(dateIso, docId) => {
                setInitialSlotDate(dateIso);
                setInitialSlotDoctorId(docId || null);
                setVisitOpen(true);
              }}
              doctors={doctors}
              shifts={dayShifts}
              notificationsMap={notificationsMap}
            />
          </Grid>

          {/* Column 2: Appointment Details (Desktop) */}
          {!isMobile && (
            <Grid item xs={12} md={conclusionOpen ? 4 : 6} sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              pl: { md: 1 },
              pr: { md: 1 },
              transition: 'all 0.3s ease'
            }}>
              <AppointmentDetailsCard
                appointmentId={selectedAppointmentId}
                onClose={() => setSelectedAppointmentId(null)}
                onUpdate={() => {
                  invalidateAppointmentAfterSave(selectedAppointmentId);
                  refetchAppointments();
                }}
                onStartAppointment={(patientId) => {
                  setInitialPatientId(patientId);
                  setVisitOpen(true);
                }}
                showPaymentAction={true} // Только на странице администратора разрешена оплата
                isConclusionVisible={conclusionOpen}
                onToggleConclusion={() => setConclusionOpen(!conclusionOpen)}
                hideCloseButton={true}
              />
            </Grid>
          )}

          {/* Column 3: Conclusion Panel (Desktop) */}
          {!isMobile && conclusionOpen && (
            <Grid item xs={12} md={4} sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              pl: { md: 1 }
            }}>
              {selectedAppointmentId ? (
                <DoctorConclusionPanel
                  appointmentId={selectedAppointmentId}
                  onClose={() => setConclusionOpen(false)}
                  onSaveSuccess={() => { }}
                  hideCloseButton={false}
                // Разрешаем закрытие через крестик в самой панели тоже
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
                    bgcolor: "background.paper"
                  }}
                >
                  Выберите прием для просмотра заключения
                </Box>
              )}
            </Grid>
          )}
        </Grid>
      </Box>

      {/* Mobile Bottom Sheet for Details */}
      {isMobile && (
        <AppBottomSheet
          open={Boolean(selectedAppointmentId)}
          onClose={() => {
            console.log("Mobile drawer closing");
            setSelectedAppointmentId(null);
          }}
          header={
            <Tabs
              value={activeTab}
              onChange={(_, v) => setActiveTab(v)}
              variant="fullWidth"
              sx={{ flexShrink: 0 }}
            >
              <Tab label="Прием" />
              {hasConclusion && <Tab label="Заключение" />}
            </Tabs>
          }
        >
          <Box sx={{ p: 0 }}>
            {activeTab === 0 && (
              <AppointmentDetailsCard
                appointmentId={selectedAppointmentId}
                onClose={() => setSelectedAppointmentId(null)}
                onUpdate={() => {
                  invalidateAppointmentAfterSave(selectedAppointmentId);
                  refetchAppointments();
                }}
                onStartAppointment={(patientId) => {
                  setInitialPatientId(patientId);
                  setVisitOpen(true);
                }}
                showPaymentAction={true}
                isConclusionVisible={false}
                onToggleConclusion={() => setActiveTab(1)}
                hideCloseButton={true}
              />
            )}
            {activeTab === 1 && selectedAppointmentId && (
              <DoctorConclusionPanel
                appointmentId={selectedAppointmentId}
                onClose={() => setActiveTab(0)}
                onSaveSuccess={() => { }}
                hideCloseButton={true}
              />
            )}
          </Box>
        </AppBottomSheet>
      )}

      {/* Add Appointment Drawer (right) */}
      <HomeAddAppointmentDrawer
        open={visitOpen}
        onClose={() => {
          setVisitOpen(false);
          setInitialPatientId(null);
          setInitialSlotDate(null);
          setInitialSlotDoctorId(null);
        }}
        onCreated={() => {
          refetchAppointments();
        }}
        initialPatientId={initialPatientId}
        initialDate={initialSlotDate}
        initialDoctorId={initialSlotDoctorId}
        selectedDate={date}
      />

      {/* Filters Drawer (right) */}
      <Drawer
        anchor="right"
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: 320, sm: 380 },
            zIndex: (theme) => theme.zIndex.drawer + 10,
          },
        }}
        ModalProps={{
          slotProps: {
            backdrop: {
              sx: {
                // Keep header visible (not dimmed) while backdrop is shown
                zIndex: (theme) => theme.zIndex.appBar - 1,
              },
            },
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 2,
            py: 1,
          }}
        >
          <Typography variant="h6">Фильтры приемов</Typography>
          <IconButton onClick={() => setFiltersOpen(false)}>
            <CloseOutlined />
          </IconButton>
        </Box>
        <Divider />
        <Stack spacing={2} sx={{ p: 2 }}>
          <TextField
            label="Дата"
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />

          <Typography variant="subtitle2">Статус</Typography>
          {Object.keys(status).map((s) => (
            <FormControlLabel
              key={s}
              control={
                <Checkbox
                  checked={status[s]}
                  onChange={(e) =>
                    setStatus((pr) => ({ ...pr, [s]: e.target.checked }))
                  }
                />
              }
              label={s}
            />
          ))}

          <FormControlLabel
            control={
              <Checkbox
                checked={onlyNight}
                onChange={(e) => setOnlyNight(e.target.checked)}
              />
            }
            label="Только ночные"
          />

          <Typography variant="subtitle2">Доктор</Typography>
          <Autocomplete
            options={doctors}
            loading={doctorsLoading}
            value={doctors.find((d) => d.id === doctorId) || null}
            onChange={(_, v) => setDoctorId(v?.id || "")}
            getOptionLabel={(o: EmployeesRow) =>
              `${o.full_name || o.id}${o.specialization ? ` — ${o.specialization}` : ""}`
            }
            filterOptions={createFilterOptions<EmployeesRow>({
              matchFrom: "start",
              stringify: (o) =>
                `${o.full_name ?? ""} ${o.specialization ?? ""}`.trim(),
            })}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Выберите доктора"
                fullWidth
              />
            )}
          />

          <Stack direction="row" gap={1}>
            <Button variant="contained" onClick={() => setFiltersOpen(false)}>
              Применить
            </Button>
            <Button variant="text" onClick={resetFilters}>
              Сбросить
            </Button>
          </Stack>
        </Stack>
      </Drawer>
    </Box>
  );
};

export default HomePage;
