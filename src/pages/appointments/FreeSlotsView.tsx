import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Chip,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import HealthAndSafetyOutlined from "@mui/icons-material/HealthAndSafetyOutlined";
import CoffeeOutlined from "@mui/icons-material/LocalCafeOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import { useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { getSpecializations, getDjangoEmployees, type DjangoEmployeeListItem } from "../../api/staff";
import { getServices, type Service } from "../../api/catalog";
import { getAvailability, type EmployeeAvailability } from "../../api/scheduling";
import { parseBackendError } from "../../api/appointments";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS, DJANGO_LIST_STALE_TIME_MS } from "../../api/queryKeys";
import { DateRangeField, type DateRange, type DateRangePreset } from "../../components/ui";

const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Бэкенд считает окна максимум на 62 дня. */
const MAX_RANGE_DAYS = 62;

/** Индекс дня недели с понедельника (Пн=0 … Вс=6), без плагина isoWeek. */
function mondayIndex(d: Dayjs): number {
  return (d.day() + 6) % 7;
}

/** Понедельник недели, содержащей *d* (начало дня). */
function weekMonday(d: Dayjs): Dayjs {
  return d.subtract(mondayIndex(d), "day").startOf("day");
}

/** Пресеты под запись наперёд (вместо «последних N дней» из отчётов). */
const SLOT_RANGE_PRESETS: DateRangePreset[] = [
  {
    key: "thisWeek",
    label: "Эта неделя",
    range: () => [weekMonday(dayjs()), weekMonday(dayjs()).add(6, "day").endOf("day")],
  },
  {
    key: "nextWeek",
    label: "Следующая неделя",
    range: () => [
      weekMonday(dayjs()).add(7, "day"),
      weekMonday(dayjs()).add(13, "day").endOf("day"),
    ],
  },
  {
    key: "twoWeeks",
    label: "Ближайшие 2 недели",
    range: () => [dayjs().startOf("day"), dayjs().add(13, "day").endOf("day")],
  },
  {
    key: "month",
    label: "Этот месяц",
    range: () => [dayjs().startOf("month"), dayjs().endOf("month")],
  },
];

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[1][0]).toUpperCase();
}

export interface FreeSlotsViewProps {
  branchId?: number;
  organizationId?: number;
  /** Открыть создание приёма с предзаполнением врача, услуги и времени. */
  onBook: (employeeId: number, isoDateTime: string, serviceId: number) => void;
}

const FreeSlotsView: React.FC<FreeSlotsViewProps> = ({ branchId, organizationId, onBook }) => {
  const theme = useTheme();

  const [specializationId, setSpecializationId] = React.useState<number | "">("");
  const [employee, setEmployee] = React.useState<DjangoEmployeeListItem | null>(null);
  const [serviceId, setServiceId] = React.useState<number | "">("");
  const [empInput, setEmpInput] = React.useState("");
  const [range, setRange] = React.useState<DateRange>(() => ({
    from: weekMonday(dayjs()),
    to: weekMonday(dayjs()).add(6, "day").endOf("day"),
  }));
  const [selectedEmpId, setSelectedEmpId] = React.useState<number | null>(null);
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);

  // Справочники
  const specsQuery = useQuery({
    queryKey: ["django", "scheduling", "specs"],
    queryFn: ({ signal }) => getSpecializations(signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const servicesQuery = useQuery({
    queryKey: ["django", "scheduling", "services", branchId ?? null],
    queryFn: ({ signal }) => getServices(branchId, signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const empsQuery = useQuery({
    queryKey: ["django", "scheduling", "slot-employees", empInput],
    queryFn: ({ signal }) =>
      getDjangoEmployees({ search: empInput || undefined, status: "active", pageSize: 20 }, signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });

  const dateFrom = range.from.format("YYYY-MM-DD");
  const dateTo = range.to.format("YYYY-MM-DD");
  const hasTarget = employee != null || specializationId !== "";
  const canQuery = hasTarget && serviceId !== "";

  const availQuery = useQuery({
    queryKey: djangoQueryKeys.scheduling.availability({
      employeeId: employee?.id ?? null,
      specializationId: employee ? null : (specializationId || null),
      serviceId,
      dateFrom,
      dateTo,
      branchId: branchId ?? null,
      organizationId: organizationId ?? null,
    }),
    queryFn: ({ signal }) =>
      getAvailability(
        {
          employeeId: employee?.id,
          specializationId: employee ? undefined : (specializationId || undefined),
          serviceId: serviceId as number,
          dateFrom,
          dateTo,
          branchId,
          organizationId,
        },
        signal,
      ),
    enabled: canQuery,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  const employees = React.useMemo(
    () => availQuery.data?.employees ?? [],
    [availQuery.data],
  );

  // Выбор врача/дня по умолчанию после загрузки.
  const selectedEmp: EmployeeAvailability | null =
    employees.find((e) => e.employeeId === selectedEmpId) ?? employees[0] ?? null;

  React.useEffect(() => {
    if (employees.length > 0 && !employees.some((e) => e.employeeId === selectedEmpId)) {
      setSelectedEmpId(employees[0].employeeId);
    }
  }, [employees, selectedEmpId]);

  React.useEffect(() => {
    if (!selectedEmp) return;
    if (selectedDate && selectedEmp.days.some((d) => d.date === selectedDate)) return;
    const firstFree = selectedEmp.days.find((d) => d.freeCount > 0);
    setSelectedDate(firstFree?.date ?? selectedEmp.days[0]?.date ?? null);
  }, [selectedEmp, selectedDate]);

  const selectedDay = selectedEmp?.days.find((d) => d.date === selectedDate) ?? null;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", gap: 1.5 }}>
      {/* Фильтры — карточка, как на «Нагрузке»/«Кассе» */}
      <Box
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: "14px",
          bgcolor: "background.paper",
          p: { xs: 1.5, sm: 2 },
          flexShrink: 0,
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          alignItems={{ xs: "stretch", md: "center" }}
          useFlexGap
          flexWrap="wrap"
        >
          <TextField
            select
            size="small"
            label="Специализация"
            value={specializationId}
            onChange={(e) => {
              setSpecializationId(e.target.value === "" ? "" : Number(e.target.value));
              setEmployee(null);
              setSelectedEmpId(null);
            }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">Любая</MenuItem>
            {(specsQuery.data ?? []).map((s) => (
              <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
            ))}
          </TextField>

          <Autocomplete
            size="small"
            sx={{ minWidth: 220 }}
            options={
              employee && !(empsQuery.data?.results ?? []).some((o) => o.id === employee.id)
                ? [employee, ...(empsQuery.data?.results ?? [])]
                : empsQuery.data?.results ?? []
            }
            loading={empsQuery.isLoading}
            value={employee}
            getOptionLabel={(o) => o.fullName}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, v) => {
              setEmployee(v);
              setSelectedEmpId(v?.id ?? null);
            }}
            onInputChange={(_, v) => setEmpInput(v)}
            renderInput={(params) => (
              <TextField {...params} label="Врач" placeholder="Любой по специализации" />
            )}
          />

          {/* Длительность услуги задаёт длину окна */}
          <TextField
            select
            size="small"
            label="Услуга"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value === "" ? "" : Number(e.target.value))}
            sx={{ minWidth: 200 }}
          >
            {(servicesQuery.data ?? []).filter((s: Service) => s.isActive).map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name} · {s.durationMinutes} мин
              </MenuItem>
            ))}
          </TextField>

          <Box sx={{ flex: 1, display: { xs: "none", md: "block" } }} />

          <DateRangeField
            value={range}
            onChange={(r) => {
              const clampedTo =
                r.to.diff(r.from, "day") >= MAX_RANGE_DAYS
                  ? r.from.add(MAX_RANGE_DAYS - 1, "day").endOf("day")
                  : r.to;
              setRange({ from: r.from, to: clampedTo });
              setSelectedDate(null);
            }}
            presets={SLOT_RANGE_PRESETS}
            minWidth={210}
          />
        </Stack>
      </Box>

      {!canQuery ? (
        <Alert severity="info">
          Выберите специализацию или врача и услугу (её длительность задаёт длину окна),
          чтобы увидеть свободные окна.
        </Alert>
      ) : availQuery.isError ? (
        <Alert severity="error">{parseBackendError(availQuery.error)}</Alert>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", gap: 2 }}>
          {/* Левая колонка — врачи */}
          <Box
            sx={{
              width: 240,
              flexShrink: 0,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "14px",
              bgcolor: "background.paper",
              overflowY: "auto",
            }}
          >
            {availQuery.isLoading ? (
              <Stack alignItems="center" py={4}>
                <CircularProgress size={22} />
              </Stack>
            ) : employees.length === 0 ? (
              <Typography variant="body2" color="text.disabled" sx={{ p: 2, textAlign: "center" }}>
                Нет врачей
              </Typography>
            ) : (
              employees.map((emp) => {
                const active = emp.employeeId === selectedEmp?.employeeId;
                return (
                  <Box
                    key={emp.employeeId}
                    onClick={() => setSelectedEmpId(emp.employeeId)}
                    sx={{
                      display: "flex",
                      gap: 1.25,
                      p: 1.25,
                      cursor: "pointer",
                      borderLeft: "3px solid",
                      borderColor: active ? "primary.main" : "transparent",
                      bgcolor: active ? alpha(theme.palette.primary.main, 0.08) : "transparent",
                      "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.05) },
                    }}
                  >
                    <Box
                      sx={{
                        width: 34,
                        height: 34,
                        borderRadius: "10px",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "primary.onSurface",
                        bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.18 : 0.1),
                      }}
                    >
                      {initials(emp.fullName)}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={active ? 600 : 500} noWrap>
                        {emp.fullName}
                      </Typography>
                      {emp.nearestFree ? (
                        <Typography variant="caption" color="success.main" noWrap>
                          {dayjs(emp.nearestFree.date).format("DD.MM")} · {emp.nearestFree.start}
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="text.disabled">
                          нет окон
                        </Typography>
                      )}
                    </Box>
                  </Box>
                );
              })
            )}
          </Box>

          {/* Правая колонка — неделя + таймлайн дня */}
          <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1.5, overflowY: "auto" }}>
            {selectedEmp && (
              <>
                {/* Недельная полоса */}
                <Stack direction="row" spacing={0.75} sx={{ overflowX: "auto", flexShrink: 0 }}>
                  {selectedEmp.days.map((d) => {
                    const dj = dayjs(d.date);
                    const active = d.date === selectedDate;
                    const off = d.dayOff || !d.scheduled;
                    return (
                      <Box
                        key={d.date}
                        onClick={() => setSelectedDate(d.date)}
                        sx={{
                          flex: 1,
                          minWidth: 62,
                          textAlign: "center",
                          borderRadius: "10px",
                          border: "1px solid",
                          borderColor: active ? "primary.main" : "divider",
                          bgcolor: active ? alpha(theme.palette.primary.main, 0.08) : "transparent",
                          p: 0.75,
                          cursor: "pointer",
                          opacity: off && d.freeCount === 0 ? 0.55 : 1,
                        }}
                      >
                        <Typography variant="caption" color="text.secondary" display="block">
                          {WEEKDAY_SHORT[mondayIndex(dj)]}
                        </Typography>
                        <Typography variant="subtitle2" fontWeight={600}>
                          {dj.format("D")}
                        </Typography>
                        <Typography
                          variant="caption"
                          display="block"
                          color={
                            d.dayOff || !d.scheduled
                              ? "text.disabled"
                              : d.freeCount > 0
                                ? "success.main"
                                : "text.disabled"
                          }
                        >
                          {d.dayOff ? "выходной" : !d.scheduled ? "нет графика" : d.freeCount > 0 ? `${d.freeCount} окон` : "нет окон"}
                        </Typography>
                      </Box>
                    );
                  })}
                </Stack>

                {/* Таймлайн выбранного дня */}
                {selectedDay && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                      {dayjs(selectedDay.date).format("dddd, D MMMM")}
                    </Typography>
                    {selectedDay.dayOff ? (
                      <Alert severity="info" icon={false}>Выходной день</Alert>
                    ) : !selectedDay.scheduled ? (
                      <Alert severity="info" icon={false}>Нет рабочего графика на этот день</Alert>
                    ) : selectedDay.slots.length === 0 ? (
                      <Alert severity="info" icon={false}>Нет окон</Alert>
                    ) : (
                      <Stack spacing={0.5}>
                        {selectedDay.slots.map((slot) => (
                          <Stack
                            key={slot.start}
                            direction="row"
                            alignItems="center"
                            spacing={1.25}
                            onClick={
                              slot.free
                                ? () =>
                                    onBook(
                                      selectedEmp.employeeId,
                                      `${selectedDay.date}T${slot.start}`,
                                      serviceId,
                                    )
                                : undefined
                            }
                            sx={{
                              px: 1.25,
                              py: 0.75,
                              borderRadius: "10px",
                              border: "1px solid",
                              borderColor: slot.free ? alpha(theme.palette.success.main, 0.3) : "divider",
                              bgcolor: slot.free
                                ? alpha(theme.palette.success.main, theme.palette.mode === "dark" ? 0.14 : 0.06)
                                : "action.hover",
                              cursor: slot.free ? "pointer" : "default",
                              "&:hover": slot.free
                                ? { borderColor: theme.palette.success.main }
                                : undefined,
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{ fontFamily: "monospace", width: 48, color: slot.free ? "success.main" : "text.disabled" }}
                            >
                              {slot.start}
                            </Typography>
                            {slot.free ? (
                              <>
                                <Typography variant="caption" color="success.main" sx={{ flex: 1 }}>
                                  Свободно
                                </Typography>
                                <Chip
                                  size="small"
                                  icon={<AddOutlined sx={{ fontSize: 15 }} />}
                                  label="Записать"
                                  color="success"
                                  variant="outlined"
                                  sx={{ height: 24 }}
                                />
                              </>
                            ) : (
                              <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }} noWrap>
                                Занято{slot.patientName ? ` · ${slot.patientName}` : ""}
                              </Typography>
                            )}
                          </Stack>
                        ))}
                      </Stack>
                    )}
                    {/* Легенда */}
                    <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <HealthAndSafetyOutlined sx={{ fontSize: 14, color: "success.main" }} />
                        <Typography variant="caption" color="text.disabled">свободно</Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <CoffeeOutlined sx={{ fontSize: 14, color: "text.disabled" }} />
                        <Typography variant="caption" color="text.disabled">обед вырезан из сетки</Typography>
                      </Stack>
                    </Stack>
                  </Box>
                )}
              </>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default FreeSlotsView;
