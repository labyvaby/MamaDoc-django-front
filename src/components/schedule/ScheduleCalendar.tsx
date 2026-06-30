import React, { useMemo, useState, useEffect } from "react";
import {
  Avatar,
  Box,
  Button,
  Drawer,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  Chip,
  LinearProgress
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import ChevronLeft from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRight from "@mui/icons-material/ChevronRightOutlined";
import Delete from "@mui/icons-material/DeleteOutlined";
import Edit from "@mui/icons-material/EditOutlined";
import Close from "@mui/icons-material/CloseOutlined";
import { useNotification } from "@refinedev/core";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import isoWeek from "dayjs/plugin/isoWeek";
import "dayjs/locale/ru";
import ShiftForm from "./ShiftForm";
import {
  getShifts,
  createShift,
  updateShift,
  deleteShift,
  type WorkShiftRow,
  type ShiftWriteData,
} from "../../api/attendance";
import { getDjangoEmployees } from "../../api/staff";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { subtleBg } from "../../theme";
import type { ScheduleEmployee, ScheduleShift } from "./types";

dayjs.extend(isBetween);
dayjs.extend(isoWeek);
dayjs.locale("ru");

// ==========================
// Типы данных
// ==========================

// Публичные имена сохранены для обратной совместимости; источник — ./types.
export type Employee = ScheduleEmployee;
export type Shift = ScheduleShift;

// Сегмент смены внутри конкретного дня
export interface DaySegment {
  shiftId: number;
  startMin: number; // 0..1439
  endMin: number;   // 0..1439
  employeeName: string;
  employeePhoto?: string;
  employeeId?: number; // для цвета
  label: string;
  shift: Shift;
}

export interface PositionedSegment extends DaySegment {
  topPct: number;
  heightPct: number;
  leftPct: number;
  widthPct: number;
  columnIndex: number;
  columnCount: number;
}

// ==========================
// Утилиты
// ==========================

// Генерация цвета по строке (ID или имя) — гибридный подход через HSL.
// Хэш строки определяет только тон (hue 0..359), а насыщенность и светлота
// фиксированы. За счёт этого: цвет уникален для каждого сотрудника (повторы
// крайне редки), при этом все цвета одинаково сочные и достаточно тёмные,
// чтобы белый текст поверх заливки всегда читался.
const stringToColor = (string: string): string => {
  let hash = 0;
  for (let i = 0; i < string.length; i++) {
    hash = string.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0; // удерживаем в пределах 32-бит
  }
  const hue = Math.abs(hash) % 360;
  // Жёлто-зелёные тона (≈50–200°) воспринимаются ярче при той же светлоте,
  // поэтому для них светлоту снижаем — так белый текст поверх заливки сохраняет
  // достаточный контраст на любом оттенке.
  const lightness = hue >= 50 && hue <= 200 ? 34 : 44;
  return `hsl(${hue}, 62%, ${lightness}%)`;
};

// Утилиты времени
const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

const parseTimeToMinutes = (t?: string): number | null => {
  if (!t) return null;
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  return clamp(hh * 60 + mm, 0, 1439);
};

const minutesToTime = (min: number): string => {
  const m = clamp(Math.round(min), 0, 1439);
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
};

const minutesToTopPercent = (min: number): number => 100 - (clamp(min, 0, 1439) / 1440) * 100;

const generateWeeksGrid = (monthDate: dayjs.Dayjs): dayjs.Dayjs[][] => {
  const startOfMonth = monthDate.startOf("month");
  // Понедельник (всегда, благодаря isoWeek)
  const startDate = startOfMonth.startOf("isoWeek");
  const weeks: dayjs.Dayjs[][] = [];
  let currentDate = startDate;
  while (weeks.length < 6) {
    const week: dayjs.Dayjs[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push(currentDate);
      currentDate = currentDate.add(1, "day");
    }
    weeks.push(week);
  }
  return weeks;
};

// ==========================
// Логика сегментов
// ==========================
const getSegmentsForDay = (shift: Shift, day: dayjs.Dayjs): DaySegment[] => {
  const segments: DaySegment[] = [];
  const fullDayStart = 0;
  const fullDayEnd = 1439;

  if (!day.isBetween(shift.startDate, shift.endDate, "day", "[]")) {
    return segments;
  }

  const employeeName = shift.employee?.full_name ?? "Неизвестно";
  const employeePhoto = shift.employee?.photo;
  const employeeId = shift.employes_id;

  const sMin = parseTimeToMinutes(shift.start_time ?? undefined);
  const eMin = parseTimeToMinutes(shift.end_time ?? undefined);

  const isStart = day.isSame(shift.startDate, "day");
  const isEnd = day.isSame(shift.endDate, "day");
  const isMiddle = day.isAfter(shift.startDate, "day") && day.isBefore(shift.endDate, "day");

  const addSeg = (a: number, b: number): void => {
    const startMin = clamp(Math.min(a, b), 0, 1439);
    const endMin = clamp(Math.max(a, b), 0, 1439);
    const label = `${minutesToTime(startMin)} - ${minutesToTime(endMin)} / ${employeeName}`;
    segments.push({
      shiftId: shift.id,
      startMin,
      endMin,
      employeeName,
      employeePhoto,
      employeeId,
      label,
      shift,
    });
  };

  if (isStart && isEnd) {
    if (sMin == null && eMin == null) {
      addSeg(fullDayStart, fullDayEnd);
    } else if (sMin != null && eMin != null) {
      if (sMin <= eMin) {
        addSeg(sMin, eMin);
      } else {
        // Переход через полночь
        addSeg(sMin, fullDayEnd);
        addSeg(fullDayStart, eMin);
      }
    } else if (sMin != null) {
      addSeg(sMin, fullDayEnd);
    } else if (eMin != null) {
      addSeg(fullDayStart, eMin);
    }
    return segments;
  }

  if (isStart) {
    const start = sMin ?? fullDayStart;
    addSeg(start, fullDayEnd);
    return segments;
  }

  if (isEnd) {
    const end = eMin ?? fullDayEnd;
    addSeg(fullDayStart, end);
    return segments;
  }

  if (isMiddle) {
    addSeg(fullDayStart, fullDayEnd);
    return segments;
  }

  return segments;
};

// Алгоритм раскладки - каждая смена независимо проверяет пересечения
const layoutDaySegments = (segments: DaySegment[]): PositionedSegment[] => {
  if (segments.length === 0) return [];

  const sorted = [...segments].sort((a, b) => (a.startMin - b.startMin) || (a.endMin - b.endMin));
  const positioned: PositionedSegment[] = [];

  // Функция проверки пересечения двух смен по времени
  const overlaps = (seg1: DaySegment, seg2: DaySegment): boolean => {
    return seg1.startMin < seg2.endMin && seg2.startMin < seg1.endMin;
  };

  for (let i = 0; i < sorted.length; i += 1) {
    const seg = sorted[i];

    // Найдем все уже размещенные смены, которые пересекаются с текущей
    const overlappingSegments = positioned.filter(p => overlaps(seg, p));

    // Определим, какие колонки заняты пересекающимися сменами
    const occupiedColumns = new Set(overlappingSegments.map(p => p.columnIndex));

    // Найдем первую свободную колонку
    let columnIndex = 0;
    while (occupiedColumns.has(columnIndex)) {
      columnIndex += 1;
    }

    // Количество колонок для этой смены = максимальная колонка среди пересекающихся + 1
    const columnCount = overlappingSegments.length > 0
      ? Math.max(columnIndex + 1, ...overlappingSegments.map(p => p.columnCount))
      : 1;

    const topPct = minutesToTopPercent(seg.endMin);
    const bottomPct = minutesToTopPercent(seg.startMin);
    const rawHeight = clamp(bottomPct - topPct, 0, 100);
    const heightPct = Math.max(rawHeight, 0);

    const widthPct = 100 / columnCount;
    const leftPct = columnIndex * widthPct;

    positioned.push({
      ...seg,
      topPct,
      heightPct,
      leftPct,
      widthPct,
      columnIndex,
      columnCount,
    });

    // Обновляем columnCount для всех пересекающихся смен
    for (const overlapping of overlappingSegments) {
      const idx = positioned.indexOf(overlapping);
      if (idx !== -1 && positioned[idx].columnCount < columnCount) {
        const newWidthPct = 100 / columnCount;
        positioned[idx] = {
          ...positioned[idx],
          columnCount,
          widthPct: newWidthPct,
          leftPct: positioned[idx].columnIndex * newWidthPct,
        };
      }
    }
  }

  return positioned;
};

// ==========================
// Компонент одного блока
// ==========================
interface ShiftBlockProps {
  segment: PositionedSegment;
  onEdit: (shift: Shift) => void;
}

const ShiftBlock: React.FC<ShiftBlockProps> = ({ segment, onEdit }) => {
  // Вычисляем цвет на основе ID сотрудника для стабильности
  const empColor = stringToColor(
    segment.employeeId != null ? String(segment.employeeId) : segment.employeeName || "default",
  );

  const startTime = minutesToTime(segment.startMin);
  const endTime = minutesToTime(segment.endMin);

  const sxProps: SxProps<Theme> = {
    position: "absolute",
    top: `${segment.topPct}%`,
    height: `${segment.heightPct}%`,
    left: `${segment.leftPct}%`,
    width: `${segment.widthPct}%`,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 0.25,
    px: 0.5,
    py: 0.25,
    borderRadius: 1,
    overflow: "hidden",
    minHeight: 32, // Fix for short shifts (1 hour) looking too small
    // Динамический цвет (data-viz цвет по сотруднику — заливка)
    bgcolor: alpha(empColor, 0.75),
    color: "#fff", // контраст-текст поверх цветной заливки сотрудника
    border: `1px solid ${alpha(empColor, 1)}`,
    transition: "background-color 0.2s ease-in-out",
    cursor: "pointer",
    zIndex: 1,
    "&:hover": {
      zIndex: 100,
      bgcolor: empColor,
      minHeight: "fit-content", // Allow expansion on hover if content is clipped
    },
  };

  const tooltipTitle = (
    <Box>
      <Typography variant="subtitle2">{segment.employeeName}</Typography>
      <Typography variant="body2">
        {startTime} - {endTime}
      </Typography>
    </Box>
  );

  return (
    <Tooltip title={tooltipTitle} arrow placement="top">
      <Box
        sx={sxProps}
        role="button"
        tabIndex={0}
        aria-label={`Смена: ${segment.employeeName}, ${startTime} – ${endTime}`}
        onClick={(e) => {
          e.stopPropagation();
          onEdit(segment.shift);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            onEdit(segment.shift);
          }
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, width: "100%" }}>
          <Avatar
            src={segment.employeePhoto}
            sx={(t) => ({ width: 16, height: 16, fontSize: "0.6rem", border: `1px solid ${alpha(t.palette.common.white, 0.5)}` })}
          >
            {segment.employeeName?.[0] ?? "?"}
          </Avatar>
          <Typography
            variant="caption"
            sx={{
              fontSize: "0.65rem",
              fontWeight: 600,
              lineHeight: 1.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {segment.employeeName}
          </Typography>
        </Box>
        <Typography
          variant="caption"
          sx={{
            fontSize: "0.7rem",
            lineHeight: 1,
            opacity: 0.9,
          }}
        >
          {startTime} - {endTime}
        </Typography>
      </Box>
    </Tooltip>
  );
};

// ==========================
// Основной Компонент
// ==========================

interface ScheduleCalendarHandle {
  openAddShift: () => void;
}

interface ScheduleCalendarProps {
  isNurse?: boolean;
  isAdmin?: boolean;
  isRegistrator?: boolean;
  isDoctor?: boolean;
  employeeId?: string | null;
  canSeeAll?: boolean;
}

const ScheduleCalendar = React.forwardRef<ScheduleCalendarHandle, ScheduleCalendarProps>((props, ref) => {
  const { isNurse, isAdmin, isRegistrator, isDoctor, employeeId, canSeeAll = false } = props;
  const canManage = isAdmin || isRegistrator || isDoctor;
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const today = dayjs();
  const { open: notify } = useNotification();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Filter state
  const [selectedSpec, setSelectedSpec] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<'all' | 'doctor' | 'nurse' | 'other'>('all');

  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs | null>(null);
  const [drawerMode, setDrawerMode] = useState<"view" | "form">("view");
  const [editingShift, setEditingShift] = useState<Shift | null>(null);

  const monthTitle = useMemo(() => {
    const s = currentMonth.format("MMMM YYYY");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, [currentMonth]);

  const weeks = useMemo(() => generateWeeksGrid(currentMonth), [currentMonth]);
  const daysOfWeek = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

  // --- Загрузка данных (Django attendance API) ---
  const [loading, setLoading] = useState(true);

  // Видимый диапазон календаря: сетка из 6 недель от понедельника.
  const gridStart = useMemo(
    () => currentMonth.startOf("month").startOf("isoWeek"),
    [currentMonth],
  );

  // Сотрудники меняются редко — грузим один раз при монтировании.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const empPage = await getDjangoEmployees({ pageSize: 200 });
        if (cancelled) return;
        const loadedEmps: Employee[] = (empPage.results || []).map((e) => ({
          id: e.id,
          full_name: e.fullName,
          photo: e.photoUrl ?? undefined,
          clinicalRole: e.clinicalRole,
          specialization:
            (e.specializations || []).map((s) => s.name).join(", ") || undefined,
          specializations: e.specializations || [],
        }));
        setEmployees(loadedEmps);
      } catch (e) {
        if (!cancelled) {
          notify?.({
            type: "error",
            message: "Не удалось загрузить сотрудников",
            description: e instanceof Error ? e.message : undefined,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notify]);

  // Смены — по видимому диапазону месяца. Бэкенд сам ограничивает выдачу:
  // обычный сотрудник видит только свои, управляющий — все.
  const fetchShifts = React.useCallback(async () => {
    const dateFrom = gridStart.format("YYYY-MM-DD");
    const dateTo = gridStart.add(6 * 7, "day").format("YYYY-MM-DD");
    setLoading(true);
    try {
      const rows = await getShifts({ dateFrom, dateTo });
      const mapped: Shift[] = rows.map((r: WorkShiftRow) => {
        const clockIn = dayjs(r.clockIn);
        const clockOut = r.clockOut ? dayjs(r.clockOut) : clockIn;
        return {
          id: r.id,
          employes_id: r.employeeId,
          startDate: clockIn.format("YYYY-MM-DD"),
          endDate: clockOut.format("YYYY-MM-DD"),
          start_time: clockIn.format("HH:mm"),
          end_time: r.clockOut ? clockOut.format("HH:mm") : undefined,
          is_night_shift: r.isNightShift,
          lunch_start: r.lunchStart ?? undefined,
        };
      });
      setShifts(mapped);
    } catch (e) {
      notify?.({
        type: "error",
        message: "Не удалось загрузить смены",
        description: e instanceof Error ? e.message : undefined,
      });
      setShifts([]);
    } finally {
      setLoading(false);
    }
  }, [gridStart, notify]);

  useEffect(() => {
    void fetchShifts();
  }, [fetchShifts]);

  // Индекс сотрудников по id — для подстановки сотрудника в смену.
  const employeesById = useMemo(() => {
    const m = new Map<number, Employee>();
    employees.forEach((e) => m.set(e.id, e));
    return m;
  }, [employees]);

  // Смены с подставленным сотрудником (устойчиво к порядку загрузки
  // сотрудников и смен — связка пересчитывается, когда приходит любая часть).
  const resolvedShifts = useMemo(
    () =>
      shifts.map((s) => ({
        ...s,
        employee: employeesById.get(s.employes_id) ?? null,
      })),
    [shifts, employeesById],
  );

  // --- Фильтрация ---
  // Специализации, встречающиеся в сменах видимой сетки (тот же диапазон, что и грид).
  const availableSpecs = useMemo(() => {
    const specs = new Set<string>();
    const gridEnd = gridStart.add(6 * 7 - 1, "day");
    resolvedShifts.forEach((shift) => {
      if (dayjs(shift.startDate).isBetween(gridStart, gridEnd, "day", "[]")) {
        shift.employee?.specializations?.forEach((s) => {
          if (s?.name) specs.add(s.name);
        });
      }
    });
    return Array.from(specs).sort();
  }, [resolvedShifts, gridStart]);

  // Фильтруем смены
  const filteredShifts = useMemo(() => {
    let result = resolvedShifts;

    // 1. Врачи и медсёстры видят только свои смены
    if (!canSeeAll && employeeId) {
      result = result.filter(s => String(s.employes_id) === employeeId);
    }

    // 2. Фильтр по выбранной роли (Admin/Registrator Only)
    if (canSeeAll && selectedRole !== 'all') {
      result = result.filter(s => s.employee?.clinicalRole === selectedRole);
    }

    // 3. Фильтр по специализации
    if (selectedSpec) {
      result = result.filter(shift => {
        return shift.employee?.specializations?.some((s) => s.name === selectedSpec);
      });
    }

    return result;
  }, [resolvedShifts, selectedSpec, canSeeAll, employeeId, selectedRole]);

  // Раскладка сегментов по дням — считается один раз на смену сетки/фильтров,
  // а не на каждый ре-рендер (наведение, открытие drawer и т.п.).
  const segmentsByDay = useMemo(() => {
    const map = new Map<string, PositionedSegment[]>();
    weeks.forEach((week) => {
      week.forEach((day) => {
        const daySegments = filteredShifts.flatMap((shift) =>
          getSegmentsForDay(shift, day),
        );
        map.set(day.format("YYYY-MM-DD"), layoutDaySegments(daySegments));
      });
    });
    return map;
  }, [weeks, filteredShifts]);

  // Смены выбранного дня для drawer: те же фильтры + попадание в диапазон смены
  // (а не только дата начала — иначе средние дни многодневной смены «пустые»).
  const selectedDayShifts = useMemo(() => {
    if (!selectedDate) return [];
    return filteredShifts.filter((s) =>
      selectedDate.isBetween(s.startDate, s.endDate, "day", "[]"),
    );
  }, [filteredShifts, selectedDate]);


  // Экспортируем метод для открытия формы добавления смены
  React.useImperativeHandle(ref, () => ({
    openAddShift: () => {
      // Если не админ/регистратор и не может редактировать график - блокируем
      if (!canManage) return;
      setSelectedDate(dayjs());
      handleAddClick();
      setIsDrawerOpen(true);
    }
  }));

  // Обработчики
  const handleDayClick = (day: dayjs.Dayjs) => {
    setSelectedDate(day);
    setDrawerMode("view");
    setEditingShift(null);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedDate(null);
    setEditingShift(null);
  };

  const handleEditClick = (shift: Shift) => {
    // Не-менеджеру редактирование недоступно, но клик по блоку не должен быть
    // «немым» — открываем просмотр смен этого дня.
    if (!canManage) {
      setSelectedDate(dayjs(shift.startDate));
      setEditingShift(null);
      setDrawerMode("view");
      setIsDrawerOpen(true);
      return;
    }

    setEditingShift(shift);
    setDrawerMode("form");
    setIsDrawerOpen(true); // ensure drawer is open if editing/clicking block directly
  };

  const handleAddClick = () => {
    setEditingShift(null);
    setDrawerMode("form");
  };

  const handleDelete = async (shiftId: number) => {
    const confirmed = await confirm({
      title: "Удалить смену?",
      message: "Вы уверены, что хотите удалить эту смену? Это действие нельзя отменить.",
      confirmText: "Удалить",
      cancelText: "Отмена",
      variant: "error",
    });

    if (!confirmed) return;

    try {
      await deleteShift(shiftId);
      setShifts(prev => prev.filter(s => s.id !== shiftId));
      notify?.({
        type: "success",
        message: "Смена успешно удалена",
      });
      if (drawerMode === "form") {
        setDrawerMode("view");
        setEditingShift(null);
      }
    } catch (e) {
      notify?.({
        type: "error",
        message: "Ошибка при удалении смены",
        description: e instanceof Error ? e.message : "Неизвестная ошибка",
      });
    }
  };

  // Преобразование данных формы в payload Django attendance API.
  const toShiftWriteData = (f: Omit<Shift, "id" | "employee">): ShiftWriteData => ({
    employeeId: f.employes_id,
    clockIn: dayjs(`${f.startDate}T${f.start_time ?? "00:00"}`).toISOString(),
    clockOut: dayjs(`${f.endDate}T${f.end_time ?? "00:00"}`).toISOString(),
    isNightShift: f.is_night_shift ?? false,
    hasLunch: !!f.lunch_start,
    lunchStart: f.lunch_start ?? null,
  });

  const handleFormSuccess = async (formData: Omit<Shift, "id" | "employee"> | Omit<Shift, "id" | "employee">[]) => {
    try {
      if (Array.isArray(formData)) {
        // Пакетное создание (при выборе дней недели) — один POST на смену.
        for (const f of formData) {
          await createShift(toShiftWriteData(f));
        }
      } else if (editingShift) {
        // Редактирование одной записи.
        await updateShift(editingShift.id, toShiftWriteData(formData));
      } else {
        // Создание одной смены (один диапазон дат).
        await createShift(toShiftWriteData(formData));
      }

      // Обновляем UI
      await fetchShifts();
      setDrawerMode("view");
      setEditingShift(null);

      notify?.({
        type: "success",
        message: editingShift ? "Смена успешно обновлена" : "Смены успешно созданы",
      });

    } catch (e) {
      console.error("Error saving shift:", e);
      notify?.({
        type: "error",
        message: "Ошибка при сохранении смены",
        description: e instanceof Error ? e.message : "Неизвестная ошибка",
      });
    }
  };

  return (
    <Paper variant="outlined" elevation={0} sx={{ p: 2, mt: 2 }}>
      {/* Заголовок */}
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1.5, overflow: 'hidden' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
          <IconButton size="small" aria-label="Предыдущий месяц" onClick={() => setCurrentMonth(currentMonth.subtract(1, "month"))}>
            <ChevronLeft />
          </IconButton>
          <Typography variant="h6" component="h2" sx={{ fontSize: "1.2rem", fontWeight: 600, minWidth: 160, textAlign: 'center' }}>
            {monthTitle}
          </Typography>
          <IconButton size="small" aria-label="Следующий месяц" onClick={() => setCurrentMonth(currentMonth.add(1, "month"))}>
            <ChevronRight />
          </IconButton>
        </Stack>

        {/* Filters */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            overflowX: "auto",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
            gap: 1,
            maskImage: "linear-gradient(to right, black 90%, transparent 100%)",
            alignItems: 'center'
          }}
        >
          {/* Role Filters (Admin/Registrator Only) */}
          {canSeeAll && (
            <>
              <Chip
                label="Все"
                size="small"
                variant={selectedRole === 'all' && !selectedSpec ? "filled" : "outlined"}
                color={selectedRole === 'all' && !selectedSpec ? "primary" : "default"}
                onClick={() => { setSelectedRole('all'); setSelectedSpec(null); }}
                clickable
                sx={{ flexShrink: 0, fontWeight: 'bold' }}
              />
              <Chip
                label="Врачи"
                size="small"
                variant={selectedRole === 'doctor' ? "filled" : "outlined"}
                color={selectedRole === 'doctor' ? "primary" : "default"}
                onClick={() => setSelectedRole(selectedRole === 'doctor' ? 'all' : 'doctor')}
                clickable
                sx={{ flexShrink: 0 }}
              />
              <Chip
                label="Медсестры"
                size="small"
                variant={selectedRole === 'nurse' ? "filled" : "outlined"}
                color={selectedRole === 'nurse' ? "primary" : "default"}
                onClick={() => setSelectedRole(selectedRole === 'nurse' ? 'all' : 'nurse')}
                clickable
                sx={{ flexShrink: 0 }}
              />
              <Chip
                label="Другие"
                size="small"
                variant={selectedRole === 'other' ? "filled" : "outlined"}
                color={selectedRole === 'other' ? "primary" : "default"}
                onClick={() => setSelectedRole(selectedRole === 'other' ? 'all' : 'other')}
                clickable
                sx={{ flexShrink: 0 }}
              />
            </>
          )}

          {/* Divider if both exist */}
          {canSeeAll && availableSpecs.length > 0 && (
            <Box sx={{ width: "1px", height: 24, bgcolor: 'divider', mx: 0.5 }} />
          )}

          {/* Specialization Filters */}
          {canSeeAll && availableSpecs.map((spec) => (
            <Chip
              key={spec}
              label={spec}
              size="small"
              variant={selectedSpec === spec ? "filled" : "outlined"}
              color={selectedSpec === spec ? "primary" : "default"}
              onClick={() => setSelectedSpec(selectedSpec === spec ? null : spec)}
              clickable
              sx={{ flexShrink: 0 }}
            />
          ))}
        </Box>
      </Stack>

      {loading && <LinearProgress sx={{ mb: 1 }} />}

      <TableContainer sx={{ overflowX: "auto" }}>
        {/* Увеличили minWidth для более широких колонок */}
        <Table sx={{ tableLayout: "fixed", minWidth: 1600 }}>
          <TableHead>
            <TableRow>
              {daysOfWeek.map((d) => (
                <TableCell key={d} align="center" sx={{ fontWeight: "bold", fontSize: "0.85rem", py: 1, bgcolor: (t) => subtleBg(t) }}>
                  {d}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {weeks.map((week, i) => (
              <TableRow key={String(i)}>
                {week.map((day) => {
                  const positioned = segmentsByDay.get(day.format("YYYY-MM-DD")) ?? [];
                  const isToday = day.isSame(today, "day");
                  const isCurrentMonth = day.isSame(currentMonth, "month");

                  // Вычисляем максимальное количество одновременных смен для динамической высоты
                  const maxConcurrent = positioned.length > 0
                    ? Math.max(...positioned.map(p => p.columnCount))
                    : 1;

                  // Базовая высота 180px (компактнее) + динамика
                  const baseHeight = 180;
                  const growthPerCol = 60;
                  const maxHeight = 600;

                  const cellHeight = Math.min(
                    baseHeight + Math.max(0, maxConcurrent - 1) * growthPerCol,
                    maxHeight
                  );

                  return (
                    <TableCell
                      key={day.format("YYYY-MM-DD")}
                      onClick={() => handleDayClick(day)}
                      role="button"
                      tabIndex={0}
                      aria-label={`${day.format("D MMMM YYYY")} — смен: ${positioned.length}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleDayClick(day);
                        }
                      }}
                      sx={{
                        position: "relative",
                        height: cellHeight,
                        verticalAlign: "top",
                        border: "1px solid",
                        borderColor: isToday ? "primary.main" : "divider",
                        cursor: "pointer",
                        bgcolor: isToday
                          ? (theme) => alpha(theme.palette.primary.main, 0.04)
                          : isCurrentMonth ? "background.paper" : "action.hover",
                        opacity: isCurrentMonth ? 1 : 0.6,
                        "&:hover": { bgcolor: "action.selected" },
                        p: 0,
                      }}
                    >
                      {/* Номер дня (справа сверху) */}
                      <Typography
                        variant="caption"
                        fontWeight="bold"
                        sx={{
                          position: "absolute",
                          top: 6,
                          right: 6, // СПРАВА
                          zIndex: 3,
                          fontSize: "0.9rem",
                          color: isToday ? "primary.onSurface" : "text.secondary",
                          bgcolor: isToday ? (theme) => alpha(theme.palette.primary.main, 0.1) : "transparent",
                          px: 0.8,
                          borderRadius: 1,
                        }}
                      >
                        {day.format("D")}
                      </Typography>

                      {/* Область контента */}
                      <Box sx={{ position: "absolute", inset: 0, top: 24, bottom: 4, px: 0.5 }}>
                        {/* Фоновую сетку можно убрать или оставить тусклой */}

                        {/* События */}
                        <Box sx={{ position: "absolute", inset: 0 }}>
                          {positioned.map((seg) => (
                            <ShiftBlock
                              key={`${seg.shiftId}_${seg.startMin}_${seg.endMin}`}
                              segment={seg}
                              onEdit={handleEditClick}
                            />
                          ))}
                        </Box>
                      </Box>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Drawer */}
      <Drawer
        anchor="right"
        open={isDrawerOpen}
        onClose={handleCloseDrawer}
        PaperProps={{
          sx: { width: { xs: 320, sm: 480, md: 570 }, maxWidth: "100vw" },
        }}
      >
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflowX: "hidden" }}>
          {drawerMode === "view" ? (
            <Stack sx={{ p: 3, height: "100%", overflowY: 'auto' }} justifyContent="space-between">
              <Box>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                  <Typography variant="h6">
                    Смены: {selectedDate?.format("D MMMM")}
                  </Typography>
                  <IconButton onClick={handleCloseDrawer} aria-label="Закрыть"><Close /></IconButton>
                </Stack>
                {selectedDayShifts.map((shift) => (
                    <Paper key={shift.id} variant="outlined" sx={{ p: 2, mb: 1, display: "flex", gap: 2, alignItems: "center" }}>
                      <Avatar src={shift.employee?.photo} />
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2">{shift.employee?.full_name}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {shift.start_time} - {shift.end_time}
                        </Typography>
                      </Box>
                      {canManage && (
                        <>
                          {(isAdmin || isRegistrator || (isDoctor && String(shift.employes_id) === employeeId)) && (
                            <IconButton size="small" onClick={() => handleEditClick(shift)}><Edit /></IconButton>
                          )}
                          {(isAdmin || isRegistrator || (isDoctor && String(shift.employes_id) === employeeId)) && (
                            <IconButton size="small" color="error" onClick={() => handleDelete(shift.id)}><Delete /></IconButton>
                          )}
                        </>
                      )}
                    </Paper>
                  ))
                }
                {selectedDayShifts.length === 0 &&
                  <Typography color="text.secondary" align="center" sx={{ mt: 4 }}>Нет смен на этот день</Typography>
                }
              </Box>
              {canManage && (
                <Button size="large" variant="contained" onClick={handleAddClick}>
                  Добавить смену
                </Button>
              )}
            </Stack>
          ) : (
            <ShiftForm
              initialDate={selectedDate}
              shiftToEdit={editingShift}
              allEmployees={employees} // Передаем реальных сотрудников!
              onSuccess={handleFormSuccess}
              onCancel={() => setDrawerMode("view")}
              onDelete={(isAdmin || isRegistrator || (isDoctor && String(editingShift?.employes_id) === employeeId)) ? handleDelete : undefined}
              isDoctor={isDoctor}
              currentEmployeeId={employeeId}
            />
          )}
        </Box>
      </Drawer>

      {/* Диалог подтверждения */}
      <ConfirmDialog />
    </Paper>
  );
});

ScheduleCalendar.displayName = 'ScheduleCalendar';

export default ScheduleCalendar;
