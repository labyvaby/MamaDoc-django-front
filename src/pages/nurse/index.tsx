import React from "react";
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
import { DB_TABLES } from "../../utility/constants";
import AppointmentsList from "../home/components/AppointmentsList";
import { fetchDoctors, fetchMedicalStaff, fetchNurses } from "../../services/employees";
import type { Appointment, AggregatedAppointmentRow } from "../home/types";
import { mapAggregatedRowToAppointment, compareAppointmentsByStatus } from "../home/types";
import type { EmployeesRow } from "../expenses/types";
import { AppBottomSheet, PageHeader, DateNavigation } from "../../components/ui";
import { useRefresh } from "../../contexts/refresh-context";
import AppointmentDetailsCard from "../home/components/AppointmentDetailsCard";
import useMediaQuery from "@mui/material/useMediaQuery";
import HomeAddAppointmentDrawer from "../home/components/HomeAddAppointmentDrawer";
import { usePermissions } from "../../hooks/usePermissions";
import { DoctorConclusionPanel } from "../doctor/components/DoctorConclusionPanel";



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

function isAbortError(e: unknown): boolean {
  if (!e) return false;
  if (typeof e === "object" && e !== null) {
    const errLike = e as { name?: string; code?: unknown; message?: unknown };
    const name = String(errLike.name ?? "");
    const code = String(errLike.code ?? "");
    const msg = String(errLike.message ?? "");
    if (name === "AbortError") return true;
    if (code === "ABORT_ERR" || code === "20") return true;
    if (
      msg.toLowerCase().includes("aborted") ||
      msg.toLowerCase().includes("abort")
    )
      return true;
  } else if (typeof e === "string") {
    const s = e.toLowerCase();
    if (s.includes("abort")) return true;
  }
  return false;
}



export const NursePage: React.FC = () => {
  usePageTitle("Процедурный кабинет");
  useNotification();
  const { setOnRefresh } = useRefresh();
  const theme = useTheme();
  const { isNurse, isAdmin, isRegistrator, employeeId } = usePermissions();
  const isWorkplaceNurse = isNurse(); // Call the function to get boolean value
  // Считаем "мобильным" всё, что уже планшета (<= md),
  // т.к. breakpoints.sm у нас сдвинут до 360px и на реальных телефонах isMobile всегда false.
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  // Appointments state
  const [loading, setLoading] = React.useState(true);
  const [all, setAll] = React.useState<Appointment[]>([]);
  const [selectedAppointmentId, setSelectedAppointmentId] = React.useState<string | null>(null);

  // Debug: log when selectedAppointmentId changes
  React.useEffect(() => {
    // debug: track selection changes on mobile/desktop
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
  // const [revenueMode, setRevenueMode] = React.useState<
  //   'total' | 'cash' | 'cashless'
  // >('total');

  // Add appointment drawer state
  const [visitOpen, setVisitOpen] = React.useState(false);
  const [initialPatientId, setInitialPatientId] = React.useState<string | null>(null);
  const [conclusionOpen, setConclusionOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState(0);
  const [dayCounts, setDayCounts] = React.useState<Record<string, number>>({});

  const [nurses, setNurses] = React.useState<EmployeesRow[]>([]);

  // Doctors for filters drawer - REMOVED
  // const [doctorsOpts, setDoctorsOpts] = React.useState<EmployeesRow[]>([]); 
  // const [doctorsLoading, setDoctorsLoading] = React.useState(false);

  // Контроллеры и запомненная рабочая таблица для сокращения числа запросов
  const apptsCtrlRef = React.useRef<AbortController | null>(null);
  const countsCtrlRef = React.useRef<AbortController | null>(null);

  // Кэш для приемов и счетчиков
  const appointmentsCache = React.useRef<Record<string, Appointment[]>>({});
  const countsCache = React.useRef<Record<string, Record<string, number>>>({});
  const loadedRanges = React.useRef<Set<string>>(new Set());

  // Debounce по дате — чтобы ограничить частоту запросов при изменении
  const debouncedDate = useDebouncedValue(date, 300);


  // Функция для загрузки приемов (Optimized View Strategy)
  const fetchAppointments = React.useCallback(async (selectedDate: string, forceRefetch = false) => {
    // 1. Проверяем кэш, если не принудительное обновление
    if (!forceRefetch && appointmentsCache.current[selectedDate]) {
      setAll(appointmentsCache.current[selectedDate]);
      setLoading(false);
      return;
    }

    const prev = apptsCtrlRef.current;
    if (prev) prev.abort();
    const ctrl = new AbortController();
    apptsCtrlRef.current = ctrl;

    try {
      setLoading(true);

      if (!selectedDate) return;

      const nurseId = employeeId;

      if (!nurseId) {
        console.warn("Nurse ID not found in permissions hook");
        setAll([]);
        setLoading(false);
        return;
      }

      // Используем get_home_appointments — ранняя фильтрация по дате Bishkek на уровне БД.
      // Для медсестры передаём p_employee_id — БД вернёт только её приёмы.
      // Для admin/registrator передаём null — возвращаются все приёмы.
      const isPrivileged = isAdmin() || isRegistrator();
      const { data: viewData, error: viewError } = await supabase
        .rpc("get_home_appointments", {
          p_date: selectedDate,
          p_employee_id: isPrivileged ? null : nurseId,
        });

      if (viewError) throw viewError;

      if (!ctrl.signal.aborted) {
        const data = (viewData || []).map((row: AggregatedAppointmentRow) => mapAggregatedRowToAppointment(row));
        appointmentsCache.current[selectedDate] = data;
        setAll(data);
      }

    } catch (e: unknown) {
      if (isAbortError(e)) return;
      console.error(e);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [employeeId, isAdmin, isRegistrator]);

  // Fetch appointments (серверная фильтрация по дате, один запрос, отмена предыдущего)
  React.useEffect(() => {
    const sel = debouncedDate || date;
    if (sel) {
      fetchAppointments(sel);
    }

    return () => {
      const ctrl = apptsCtrlRef.current;
      if (ctrl) ctrl.abort();
    };
  }, [date, debouncedDate, fetchAppointments]);

  // Загрузка количества приемов для диапазона дней (с оптимизацией кэширования)
  const fetchRangeCounts = React.useCallback(async (forceRefetch = false) => {
    const currentMonth = dayjs(date).format('YYYY-M');

    if (!forceRefetch && countsCache.current[currentMonth]) {
      setDayCounts(countsCache.current[currentMonth]);
      return;
    }

    const prev = countsCtrlRef.current;
    if (prev) prev.abort();
    const ctrl = new AbortController();
    countsCtrlRef.current = ctrl;

    try {
      if (!employeeId) return;

      const startDay = dayjs(date).subtract(15, 'day').format('YYYY-MM-DD');
      const endDay = dayjs(date).add(15, 'day').format('YYYY-MM-DD');
      const isPrivileged = isAdmin() || isRegistrator();

      const { data, error } = await supabase.rpc('get_appointment_day_counts', {
        p_start: startDay,
        p_end: endDay,
        p_employee_id: isPrivileged ? null : employeeId,
      });

      if (error) throw error;

      if (!ctrl.signal.aborted) {
        const counts: Record<string, number> = {};
        (data || []).forEach((item: { day: string; cnt: number }) => {
          counts[item.day] = Number(item.cnt);
        });
        countsCache.current[currentMonth] = counts;
        setDayCounts((prev) => ({ ...prev, ...counts }));
      }
    } catch (e) {
      if (isAbortError(e)) return;
      console.error("Error fetching day counts:", e);
    }
  }, [date, employeeId, isAdmin, isRegistrator]);

  React.useEffect(() => {
    fetchRangeCounts();

    return () => {
      if (countsCtrlRef.current) countsCtrlRef.current.abort();
    };
  }, [fetchRangeCounts]);

  // Регистрация функции обновления для кнопки в Header и Realtime подписка
  React.useEffect(() => {
    const handleRefresh = () => {
      const sel = debouncedDate || date;
      if (sel) {
        // Очищаем кэш для текущей даты при ручном обновлении
        delete appointmentsCache.current[sel];
        delete countsCache.current[`${new Date(sel).getFullYear()}-${new Date(sel).getMonth() + 1}`];
        fetchAppointments(sel, true);
        fetchRangeCounts(true);
      }
    };

    setOnRefresh(() => handleRefresh);

    // --- REALTIME SUBSCRIPTION ---
    let realtimeTimeout: ReturnType<typeof setTimeout> | null = null;
    const debouncedRealtime = () => {
      if (realtimeTimeout) return;
      realtimeTimeout = setTimeout(() => {
        realtimeTimeout = null;
        delete appointmentsCache.current[date];
        countsCache.current = {};
        fetchAppointments(date, true);
        fetchRangeCounts(true);
      }, 5000);
    };

    const channel = supabase
      .channel(`nurse-appointments-realtime-${employeeId || 'all'}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "Appointments" }, debouncedRealtime)
      .on("postgres_changes", { event: "*", schema: "public", table: "AppointmentServices" }, debouncedRealtime)
      .on("postgres_changes", { event: "*", schema: "public", table: "MedicalConclusions" }, debouncedRealtime)
      .subscribe();

    return () => {
      setOnRefresh(null);
      if (realtimeTimeout) clearTimeout(realtimeTimeout);
      supabase.removeChannel(channel);
    };
  }, [setOnRefresh, fetchAppointments, fetchRangeCounts, debouncedDate, date, employeeId]);

  // Load nurses for Super Administrators to filter their view
  React.useEffect(() => {
    if (isAdmin() || isRegistrator()) {
      fetchNurses().then(setNurses);
    }
  }, [isAdmin, isRegistrator]);

  // Derived
  const ruDateFromInput = React.useMemo(() => {
    if (!date) return "";
    const [yyyy, mm, dd] = date.split("-");
    return `${dd}.${mm}.${yyyy}`;
  }, [date]);


  const filtered = React.useMemo(() => {
    return all.filter((a) => {
      // Filter by date using dayjs to handle timezones correctly
      if (date && !dayjs(a.appointment_at).isSame(dayjs(date), 'day')) return false;

      const statusKey = a.status || "";
      if (status[statusKey] === false) return false;

      if (onlyNight && !a.is_night) return false;

      // Filter by nurse if admin/superadmin (since regular nurses only see theirs by default query)
      if ((isAdmin() || isRegistrator()) && nurses.length > 0) {
        const pIds: string[] = Array.isArray(a.performer_ids) ? a.performer_ids : [];
        const isNurseInvolved = pIds.some(id => nurses.some(n => n.id === id));
        if (!isNurseInvolved) return false;
      }

      return true;
    }).sort(compareAppointmentsByStatus);
  }, [all, date, status, onlyNight, nurses, isAdmin, isRegistrator]);

  const selectedAppointment = React.useMemo(() =>
    all.find(a => a.id === selectedAppointmentId) || null,
    [all, selectedAppointmentId]);

  // Check if selected appointment has conclusion
  const hasConclusion = React.useMemo(() => {
    if (!selectedAppointment) return false;
    return !!(selectedAppointment.has_conclusion || selectedAppointment.conclusion || selectedAppointment.diagnosis_code || selectedAppointment.diagnosis_data);
  }, [selectedAppointment]);

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
      "Со скидкой": true,
      "Пациент не пришел": false, // Default hidden to reduce clutter? Or true? User didn't specify, false is safer for main view.
      "Отменено": true
    });
    setOnlyNight(false);
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
        addButtonText="Добавить процедуру"
        onAdd={() => {
          setVisitOpen(true);
        }}
        dateNavigation={
          <DateNavigation
            date={date}
            setDate={setDate}
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
              loading={loading}
              errorMsg={null}
              items={filtered}
              doctors={nurses}
              onOpenFilters={() => setFiltersOpen(true)}
              onItemClick={(id) => {
                setSelectedAppointmentId(id);
                // Reset conclusion view when selecting new appt
                if (id !== selectedAppointmentId) {
                  setConclusionOpen(false);
                  setActiveTab(0);
                }
              }}
              hideDoctorFilter={true}
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
                  const sel = debouncedDate || date;
                  if (sel) fetchAppointments(sel);
                }}
                onStartAppointment={(patientId) => {
                  setInitialPatientId(patientId);
                  setVisitOpen(true);
                }}
                isConclusionVisible={conclusionOpen}
                onToggleConclusion={() => setConclusionOpen(!conclusionOpen)}
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
                  hideEditButton={true}
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
                  const sel = debouncedDate || date;
                  if (sel) fetchAppointments(sel);
                }}
                onStartAppointment={(patientId) => {
                  setInitialPatientId(patientId);
                  setVisitOpen(true);
                }}
                isConclusionVisible={false}
                onToggleConclusion={() => setActiveTab(1)}
              />
            )}
            {activeTab === 1 && selectedAppointmentId && (
              <DoctorConclusionPanel
                appointmentId={selectedAppointmentId}
                onClose={() => setActiveTab(0)}
                onSaveSuccess={() => { }}
                hideCloseButton={true}
                hideEditButton={true}
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
        }}
        onCreated={() => {
          const sel = debouncedDate || date;
          if (sel) fetchAppointments(sel);
        }}
        initialPatientId={initialPatientId}
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
            onChange={(e) => setDate(e.target.value)}
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
    </Box >
  );
};

export default NursePage;
