import React from "react";
import { Alert, Box, Chip, CircularProgress, Collapse, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import AddOutlined from "@mui/icons-material/AddOutlined";
import KeyboardArrowLeftOutlined from "@mui/icons-material/KeyboardArrowLeftOutlined";
import KeyboardArrowRightOutlined from "@mui/icons-material/KeyboardArrowRightOutlined";
import PersonSearchOutlined from "@mui/icons-material/PersonSearchOutlined";
import { useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";

import { getSpecializations, type DjangoSpecialization } from "../../api/staff";
import {
  getAvailability,
  getAvailabilitySummary,
  type EmployeeAvailability,
  type AvailabilityDay,
} from "../../api/scheduling";
import { buildTimeline } from "./freeSlotsTimeline";
import {
  getStatusAccent,
  getStatusChipSx,
  getStatusConfig,
  getStatusLabel,
} from "../../config/appointmentStatuses";
import {
  djangoQueryKeys,
  DJANGO_REFERENCE_STALE_TIME_MS,
  DJANGO_LIST_STALE_TIME_MS,
} from "../../api/queryKeys";
import { subtleBg } from "../../theme/uiHelpers";
import { useT } from "../../i18n/VerticalProvider";
import { tt } from "../../i18n/t";

// Календарные подписи — данные локали, а не терминология вертикали:
// в клинике и салоне они одинаковы, поэтому в глоссарий не выносятся.
// Полноценно это заменяется данными dayjs (ru) — отдельная задача, т.к.
// в родительном падеже («января») нужна standalone-форма.
const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
const MONTHS_NOMINATIVE = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
const MONTHS_SHORT = [
  "янв.", "фев.", "мар.", "апр.", "мая", "июн.",
  "июл.", "авг.", "сен.", "окт.", "ноя.", "дек.",
];

/** На сколько дней вперёд регистратор ищет окна (влезает в лимит бэка 62). */
const HORIZON_DAYS = 14;

/** Индекс дня недели с понедельника (Пн=0 … Вс=6), без плагина isoWeek. */
function mondayIndex(d: Dayjs): number {
  return (d.day() + 6) % 7;
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[1][0]).toUpperCase();
}

/** Стабильный цвет аватара по имени (аналог stringToColor из оригинала). */
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 52% 46%)`;
}

type DocStatus = "free" | "later" | "none";

interface DocSummary {
  todayFree: number;
  nearest: { date: string; start: string } | null;
  status: DocStatus;
  /** Подпись под именем врача. */
  label: string;
  /** true, если у врача нет ни одного рабочего дня в горизонте. */
  noSchedule: boolean;
}

function summarize(emp: EmployeeAvailability, todayIso: string): DocSummary {
  const today = emp.days.find((d) => d.date === todayIso);
  const todayFree = today?.freeCount ?? 0;
  const nearest = emp.nearestFree;
  // «График не задан» — только если в горизонте нет ни рабочего дня, ни
  // выходного/отпуска по исключению (иначе график есть, просто нет окон).
  const noSchedule = !emp.days.some((d) => d.scheduled || d.dayOff);

  if (nearest && nearest.date === todayIso) {
    return {
      todayFree,
      nearest,
      status: "free",
      label: tt("appointments:slots.todayNearest", { time: nearest.start }),
      noSchedule,
    };
  }
  if (nearest) {
    const d = dayjs(nearest.date);
    const isTomorrow = nearest.date === dayjs().add(1, "day").format("YYYY-MM-DD");
    const rel = isTomorrow
      ? tt("appointments:slots.tomorrow")
      : `${WEEKDAY_SHORT[mondayIndex(d)]} ${d.date()}`;
    return {
      todayFree,
      nearest,
      status: "later",
      label: tt("appointments:slots.nearest", { when: rel, time: nearest.start }),
      noSchedule,
    };
  }
  return {
    todayFree,
    nearest: null,
    status: "none",
    label: noSchedule
      ? tt("appointments:slots.noScheduleShort")
      : tt("appointments:slots.noFreeSlotsShort"),
    noSchedule,
  };
}

const STATUS_DOT: Record<DocStatus, "success.main" | "warning.main" | "text.disabled"> = {
  free: "success.main",
  later: "warning.main",
  none: "text.disabled",
};

// ── Список врачей под группой специальностей ─────────────────────────────────

interface DocRailListProps {
  docs: { emp: EmployeeAvailability; sum: DocSummary }[];
  selectedId: number | null;
  /** Окна специальности ещё грузятся — показываем спиннер, а не пустоту. */
  loading: boolean;
  onSelect: (employeeId: number | null) => void;
}

/**
 * Раскрывающийся список врачей группы в левом рельсе. Выбор врача — это фильтр
 * сетки, а не отдельный экран: клик по активному врачу снимает фильтр.
 */
const DocRailList: React.FC<DocRailListProps> = ({ docs, selectedId, loading, onSelect }) => {
  const { t } = useT("appointments");

  return (
    <Stack
      spacing={0.25}
      sx={(tokens) => ({ py: 0.5, px: 1, bgcolor: alpha(tokens.palette.primary.main, 0.03) })}
    >
      {loading && docs.length === 0 ? (
        <Stack alignItems="center" sx={{ py: 1 }}>
          <CircularProgress size={16} />
        </Stack>
      ) : docs.length === 0 ? (
        <Typography variant="caption" color="text.disabled" sx={{ px: 1.25, py: 0.5 }}>
          {t("slots.specialistsNotFound")}
        </Typography>
      ) : (
        docs.map(({ emp, sum }) => {
          const isDocActive = selectedId === emp.employeeId;
          return (
            <Stack
              key={emp.employeeId}
              direction="row"
              alignItems="center"
              spacing={1}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(isDocActive ? null : emp.employeeId);
              }}
              sx={(tokens) => ({
                py: 0.75,
                px: 1.25,
                borderRadius: "8px",
                cursor: "pointer",
                bgcolor: isDocActive ? "primary.main" : "transparent",
                color: isDocActive ? "primary.contrastText" : "text.primary",
                transition: "all .13s ease",
                "&:hover": {
                  bgcolor: isDocActive ? "primary.main" : alpha(tokens.palette.primary.main, 0.08),
                },
              })}
            >
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  bgcolor: isDocActive ? "primary.contrastText" : STATUS_DOT[sum.status],
                  flexShrink: 0,
                }}
              />
              <Typography
                variant="caption"
                fontWeight={isDocActive ? 700 : 500}
                noWrap
                sx={{ flex: 1, minWidth: 0, fontSize: "0.775rem" }}
              >
                {emp.fullName}
              </Typography>
            </Stack>
          );
        })
      )}
    </Stack>
  );
};

// ── Таймлайн дня ──────────────────────────────────────────────────────────────

interface DayTimelineProps {
  day: AvailabilityDay;
  employeeId: number;
  /** Компактный режим — колонка в сетке врачей (уже и мельче). */
  dense?: boolean;
  onBook: (employeeId: number, isoDateTime: string) => void;
  /** Клик по занятому времени — открыть карточку приёма поверх окон. */
  onOpenAppointment?: (appointmentId: number) => void;
  /** Клик не считается, если это было перетаскивание сетки (drag-to-scroll). */
  dragMovedRef?: { current: boolean };
}

/** Окна и приёмы одного дня одного врача — общий рендер сетки и панели врача. */
const DayTimeline: React.FC<DayTimelineProps> = ({
  day,
  employeeId,
  dense = false,
  onBook,
  onOpenAppointment,
  dragMovedRef,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();
  const rows = React.useMemo(() => buildTimeline(day), [day]);

  if (day.dayOff) {
    return <Alert severity="info" icon={false}>{t("slots.dayOff")}</Alert>;
  }
  if (!day.scheduled) {
    return <Alert severity="info" icon={false}>{t("slots.noSchedule")}</Alert>;
  }
  if (rows.length === 0) {
    return (
      <Alert severity="info" icon={false}>
        {dense ? t("slots.noSlotsShort") : t("slots.noFreeSlots")}
      </Alert>
    );
  }

  const timeFontSize = dense ? "0.775rem" : "0.8rem";

  return (
    <Stack spacing={0.5}>
      {rows.map((row) => {
        if (row.kind === "appt") {
          const { appt } = row;
          const accent = getStatusAccent(appt.status, theme);
          const statusLabel = getStatusLabel(appt.status);
          const patient = appt.patientName || t("slots.busy");
          return (
            <Tooltip
              key={row.key}
              title={`${appt.start}–${appt.end} · ${patient} · ${statusLabel}`}
              placement="top"
              disableInteractive
            >
              <Stack
                direction="row"
                alignItems="center"
                spacing={dense ? 0.75 : 1}
                onClick={
                  onOpenAppointment
                    ? () => {
                        if (dragMovedRef?.current) return;
                        onOpenAppointment(appt.id);
                      }
                    : undefined
                }
                sx={{
                  px: dense ? 1 : 1.25,
                  py: dense ? 0.5 : 0.75,
                  borderRadius: "8px",
                  border: "1px solid",
                  borderColor: "divider",
                  borderLeft: `3px solid ${accent.main}`,
                  bgcolor: subtleBg(theme),
                  cursor: onOpenAppointment ? "pointer" : "default",
                  transition: "background-color .13s ease",
                  "&:hover": onOpenAppointment
                    ? { bgcolor: alpha(accent.main, theme.palette.mode === "dark" ? 0.16 : 0.09) }
                    : undefined,
                }}
              >
                <Typography
                  sx={{
                    fontFamily: "monospace",
                    fontWeight: 600,
                    fontSize: timeFontSize,
                    flexShrink: 0,
                    color: "text.primary",
                  }}
                >
                  {dense ? appt.start : `${appt.start}–${appt.end}`}
                </Typography>
                <Typography
                  variant="caption"
                  noWrap
                  sx={{ flex: 1, minWidth: 0, fontSize: dense ? "0.7rem" : "0.75rem" }}
                >
                  {patient}
                </Typography>
                {dense ? (
                  <Box
                    sx={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      bgcolor: accent.main,
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <Chip
                    size="small"
                    icon={getStatusConfig(appt.status).icon}
                    label={statusLabel}
                    sx={getStatusChipSx(appt.status)}
                  />
                )}
              </Stack>
            </Tooltip>
          );
        }

        const { slot } = row;
        // Не свободен и не занят приёмом — окно, которое уже прошло.
        const past = !slot.free && slot.appointmentId == null;
        const busy = !slot.free && slot.appointmentId != null;
        return (
          <Stack
            key={row.key}
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={dense ? 0.75 : 1}
            onClick={
              slot.free
                ? () => {
                    if (dragMovedRef?.current) return;
                    onBook(employeeId, `${day.date}T${slot.start}`);
                  }
                : busy && onOpenAppointment
                  ? () => {
                      if (dragMovedRef?.current) return;
                      onOpenAppointment(slot.appointmentId!);
                    }
                  : undefined
            }
            sx={{
              width: "100%",
              px: dense ? 1 : 1.25,
              py: dense ? 0.5 : 0.75,
              borderRadius: dense ? "7px" : "8px",
              border: "1px solid",
              borderStyle: past ? "dashed" : "solid",
              borderColor: slot.free ? alpha(theme.palette.success.main, 0.32) : "divider",
              bgcolor: slot.free
                ? alpha(theme.palette.success.main, theme.palette.mode === "dark" ? 0.14 : 0.08)
                : busy
                  ? subtleBg(theme)
                  : "transparent",
              cursor: slot.free || busy ? "pointer" : "default",
              transition: "filter .13s ease",
              "&:hover": slot.free ? { filter: "brightness(1.04)" } : undefined,
            }}
          >
            <Typography
              sx={{
                fontFamily: "monospace",
                fontWeight: 600,
                fontSize: timeFontSize,
                ...(dense ? {} : { width: 44 }),
                flexShrink: 0,
                color: slot.free ? "success.main" : "text.disabled",
              }}
            >
              {slot.start}
            </Typography>
            {slot.free ? (
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="center"
                spacing={0.4}
                sx={(tokens) => ({
                  ml: "auto",
                  px: 0.85,
                  height: 22,
                  borderRadius: "5px",
                  border: "1px solid",
                  borderColor: alpha(tokens.palette.success.main, 0.32),
                  color: "success.dark",
                  fontWeight: 600,
                  fontSize: "0.6875rem",
                  lineHeight: 1,
                  flexShrink: 0,
                  ...(tokens.palette.mode === "dark" ? { color: tokens.palette.success.light } : {}),
                })}
              >
                <AddOutlined sx={{ fontSize: 13, flexShrink: 0 }} />
                <Typography
                  component="span"
                  sx={{
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    lineHeight: 1,
                    display: "inline-block",
                  }}
                >
                  {t("slots.book")}
                </Typography>
              </Stack>
            ) : busy ? (
              <Typography variant="caption" color="text.secondary" sx={{ flex: 1, textAlign: "right" }} noWrap>
                {slot.patientName ?? ""}
              </Typography>
            ) : null}
          </Stack>
        );
      })}
    </Stack>
  );
};

export interface FreeSlotsViewProps {
  branchId?: number;
  organizationId?: number;
  headerActions?: React.ReactNode;
  /** Открыть создание приёма с предзаполнением врача и времени (услуга — в форме). */
  onBook: (employeeId: number, isoDateTime: string) => void;
  /** Клик по занятому времени — открыть карточку этого приёма поверх окон. */
  onOpenAppointment?: (appointmentId: number) => void;
}

const FreeSlotsView: React.FC<FreeSlotsViewProps> = ({
  branchId,
  organizationId,
  headerActions,
  onBook,
  onOpenAppointment,
}) => {
  const { t } = useT("appointments");
  const theme = useTheme();

  const todayIso = React.useMemo(() => dayjs().format("YYYY-MM-DD"), []);
  const dateFrom = todayIso;
  const dateTo = React.useMemo(
    () => dayjs().add(HORIZON_DAYS - 1, "day").format("YYYY-MM-DD"),
    [],
  );

  const [specId, setSpecId] = React.useState<number | null>(null);
  const [search, setSearch] = React.useState("");
  const [selDocId, setSelDocId] = React.useState<number | null>(null);
  const [selDay, setSelDay] = React.useState<string | null>(null);
  // Позволяет свернуть раскрытый список врачей под активной специальностью.
  // Список открыт по умолчанию; повторный клик по активной группе его сворачивает.
  const [collapsedGroup, setCollapsedGroup] = React.useState<number | "all" | null>(null);
  const stripRef = React.useRef<HTMLDivElement>(null);

  // Перетаскивание мышкой для горизонтального скролла сетки врачей (drag-to-scroll)
  const matrixScrollRef = React.useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragStartX, setDragStartX] = React.useState(0);
  const [dragScrollLeft, setDragScrollLeft] = React.useState(0);
  const isDragMovedRef = React.useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const container = matrixScrollRef.current;
    if (!container) return;
    setIsDragging(true);
    isDragMovedRef.current = false;
    setDragStartX(e.pageX - container.offsetLeft);
    setDragScrollLeft(container.scrollLeft);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const container = matrixScrollRef.current;
    if (!container) return;
    const x = e.pageX - container.offsetLeft;
    const walk = (x - dragStartX) * 1.5;
    if (Math.abs(x - dragStartX) > 4) {
      isDragMovedRef.current = true;
    }
    container.scrollLeft = dragScrollLeft - walk;
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  // Справочник специализаций — левый рельс.
  const specsQuery = useQuery({
    queryKey: ["django", "scheduling", "specs", organizationId ?? null],
    queryFn: ({ signal }) => getSpecializations(signal),
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const specs: DjangoSpecialization[] = React.useMemo(
    () => (specsQuery.data ?? []).filter((s) => s.isActive),
    [specsQuery.data],
  );

  // По умолчанию открываем вид «Все специалисты» (specId === null), а не
  // какую-то конкретную специальность.

  // Бейджи всех специальностей приходят одной агрегированной сводкой, без N запросов.
  const summaryQuery = useQuery({
    queryKey: djangoQueryKeys.scheduling.availabilitySummary({
      date: todayIso,
      branchId: branchId ?? null,
      organizationId: organizationId ?? null,
    }),
    queryFn: ({ signal }) =>
      getAvailabilitySummary({ date: todayIso, branchId, organizationId }, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });
  const badgeBySpec = React.useMemo(() => {
    const map = new Map<number, { free: number; total: number }>();
    summaryQuery.data?.specializations.forEach((specialization) => {
      map.set(specialization.specializationId, {
        free: specialization.freeEmployeeCount,
        total: specialization.employeeCount,
      });
    });
    return map;
  }, [summaryQuery.data]);

  // Полный диапазон окон выбранной специализации, либо всех сотрудников
  // (specId === null — вид «Все специалисты»).
  const availQuery = useQuery({
    queryKey: djangoQueryKeys.scheduling.availability({
      specializationId: specId,
      dateFrom,
      dateTo,
      branchId: branchId ?? null,
      organizationId: organizationId ?? null,
    }),
    queryFn: ({ signal }) =>
      getAvailability(
        { specializationId: specId ?? undefined, dateFrom, dateTo, branchId, organizationId },
        signal,
      ),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
  });

  // Врачи специальности + сводка, отсортированные «лучшие сверху».
  const docs = React.useMemo(() => {
    const list = (availQuery.data?.employees ?? [])
      .map((emp) => ({
        emp,
        sum: summarize(emp, todayIso),
      }));
    const q = search.trim().toLowerCase();
    const filtered = q ? list.filter((x) => x.emp.fullName.toLowerCase().includes(q)) : list;
    return filtered.sort((a, b) => {
      const byToday = Number(b.sum.todayFree > 0) - Number(a.sum.todayFree > 0);
      if (byToday) return byToday;
      const an = a.sum.nearest ? dayjs(a.sum.nearest.date).valueOf() : Infinity;
      const bn = b.sum.nearest ? dayjs(b.sum.nearest.date).valueOf() : Infinity;
      if (an !== bn) return an - bn;
      return a.emp.fullName.localeCompare(b.emp.fullName);
    });
  }, [availQuery.data, search, todayIso]);

  // Сбрасываем выбор врача только если выбранного врача больше нет в отфильтрованном списке.
  React.useEffect(() => {
    if (selDocId !== null && !docs.some((x) => x.emp.employeeId === selDocId)) {
      setSelDocId(null);
    }
  }, [docs, selDocId]);

  const selectedDoc = docs.find((x) => x.emp.employeeId === selDocId) ?? null;
  // Выбор врача в рельсе — это фильтр сетки (отдельного экрана врача нет):
  // остаётся одна колонка, вид и поведение окон те же.
  const gridDocs = selectedDoc ? [selectedDoc] : docs;
  // В навбаре оставляем только реальные смены. Выходные, отпуск и дни без
  // расписания не должны выглядеть как даты, на которые можно записать пациента.
  const selectableDays = React.useMemo(() => {
    if (selectedDoc) {
      return selectedDoc.emp.days.filter((day) => day.scheduled);
    }
    const map = new Map<string, AvailabilityDay>();
    for (const { emp } of docs) {
      for (const d of emp.days) {
        if (d.scheduled) {
          const existing = map.get(d.date);
          if (!existing) {
            map.set(d.date, { ...d });
          } else {
            existing.freeCount += d.freeCount;
          }
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [selectedDoc, docs]);

  // День по умолчанию — ближайший с окнами.
  React.useEffect(() => {
    if (!selectableDays.length) return;
    if (selDay && selectableDays.some((day) => day.date === selDay)) return;
    const firstFree = selectableDays.find((day) => day.freeCount > 0);
    setSelDay(firstFree?.date ?? selectableDays[0].date ?? todayIso);
  }, [selectableDays, selDay, todayIso]);

  const selectedDay = selectableDays.find((day) => day.date === selDay) ?? null;
  const selectedMonth = dayjs(selectedDay?.date ?? selectableDays[0]?.date ?? todayIso);
  const selectedMonthLabel = `${MONTHS_NOMINATIVE[selectedMonth.month()]} ${selectedMonth.year()}`;

  const scrollStrip = (dir: -1 | 1) => {
    stripRef.current?.scrollBy({ left: dir * 200, behavior: "smooth" });
  };

  return (
    <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* ── Верхний навбар дат и кнопка переключения режимов ── */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={2}
        sx={{ mb: 1, flexShrink: 0 }}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ flexShrink: 0, mr: 1, whiteSpace: "nowrap" }}>
            {selectedMonthLabel}
          </Typography>
          {selectableDays.length === 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
              {t("slots.noShifts")}
            </Typography>
          ) : (
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
              <Box
                onClick={() => scrollStrip(-1)}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "8px",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "text.secondary",
                  "&:hover": { bgcolor: subtleBg(theme, true), color: "text.primary" },
                }}
              >
                <KeyboardArrowLeftOutlined sx={{ fontSize: 18 }} />
              </Box>
              <Stack
                ref={stripRef}
                direction="row"
                spacing={0.75}
                sx={{ overflowX: "auto", py: 0.25, px: 0.5, flex: 1, "&::-webkit-scrollbar": { height: 4 } }}
              >
                {selectableDays.map((d) => {
                  const dj = dayjs(d.date);
                  const active = d.date === selDay;
                  const isToday = d.date === todayIso;
                  return (
                    <Box
                      key={d.date}
                      onClick={() => setSelDay(d.date)}
                      sx={{
                        flex: "0 0 auto",
                        minWidth: 60,
                        textAlign: "center",
                        borderRadius: "9px",
                        border: "1px solid",
                        borderColor: active ? "primary.main" : "divider",
                        bgcolor: active
                          ? alpha(theme.palette.primary.main, 0.1)
                          : "background.paper",
                        px: 0.75,
                        py: 0.5,
                        cursor: "pointer",
                        transition: "border-color .13s ease, background-color .13s ease",
                        "&:hover": { borderColor: active ? "primary.main" : alpha(theme.palette.primary.main, 0.28) },
                      }}
                    >
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: "0.625rem" }}>
                        {WEEKDAY_SHORT[mondayIndex(dj)]}
                      </Typography>
                      <Typography
                        variant="subtitle2"
                        fontWeight={600}
                        sx={{ fontSize: "0.775rem", color: isToday ? "primary.onSurface" : "text.primary", whiteSpace: "nowrap" }}
                      >
                        {dj.date()} {MONTHS_SHORT[dj.month()]}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          display: "block",
                          fontSize: "0.625rem",
                          color: d.freeCount > 0 ? "success.main" : "text.disabled",
                          fontWeight: d.freeCount > 0 ? 600 : 400,
                        }}
                      >
                        {d.freeCount > 0 ? String(d.freeCount) : t("slots.none")}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
              <Box
                onClick={() => scrollStrip(1)}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "8px",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "text.secondary",
                  "&:hover": { bgcolor: subtleBg(theme, true), color: "text.primary" },
                }}
              >
                <KeyboardArrowRightOutlined sx={{ fontSize: 18 }} />
              </Box>
            </Stack>
          )}
        </Stack>
        {headerActions}
      </Stack>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: { xs: "1fr", md: "204px 1fr" },
          gridAutoRows: { xs: "minmax(0, auto)", md: "100%" },
        }}
      >
        {/* ── Рельс специальностей ── */}
        <Box
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "14px",
            bgcolor: "background.paper",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 600, px: 2, pt: 1.5, pb: 1 }}
          >
            {t("slots.specialities")}
          </Typography>
          {specsQuery.isLoading ? (
            <Stack alignItems="center" py={3}>
              <CircularProgress size={20} />
            </Stack>
          ) : (
            <>
              {(() => {
                const active = specId === null;
                const overall = summaryQuery.data
                  ? { free: summaryQuery.data.overallFreeEmployeeCount, total: summaryQuery.data.overallEmployeeCount }
                  : undefined;
                return (
                  <React.Fragment>
                    <Box
                      onClick={() => {
                        if (specId !== null) {
                          setSpecId(null);
                          setSelDocId(null);
                          setSelDay(null);
                          setCollapsedGroup(null);
                        } else if (collapsedGroup === "all") {
                          setCollapsedGroup(null);
                        } else {
                          setCollapsedGroup("all");
                          setSelDocId(null);
                        }
                      }}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.25,
                        px: 1.75,
                        py: 1.25,
                        cursor: "pointer",
                        borderLeft: "3px solid",
                        borderColor: active ? "primary.main" : "transparent",
                        bgcolor: active ? alpha(theme.palette.primary.main, 0.1) : "transparent",
                        transition: "background-color .13s ease",
                        "&:hover": { bgcolor: active ? undefined : subtleBg(theme) },
                      }}
                    >
                      <Typography
                        variant="body2"
                        fontWeight={active ? 600 : 500}
                        sx={{ flex: 1, minWidth: 0 }}
                        noWrap
                      >
                        {t("slots.allSpecialists")}
                      </Typography>
                      {overall && (
                        <Box
                          sx={(t) => ({
                            fontSize: "0.6875rem",
                            fontWeight: 600,
                            lineHeight: 1,
                            px: 0.75,
                            py: 0.5,
                            borderRadius: "7px",
                            color: overall.free ? "success.dark" : "text.disabled",
                            bgcolor: overall.free
                              ? alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.2 : 0.14)
                              : subtleBg(t, true),
                            ...(t.palette.mode === "dark" && overall.free ? { color: t.palette.success.light } : {}),
                          })}
                          title={t("slots.freeToday")}
                        >
                          {overall.free}/{overall.total}
                        </Box>
                      )}
                    </Box>

                    <Collapse
                      in={active && collapsedGroup !== "all"}
                      timeout={{ enter: 240, exit: 180 }}
                      easing={{ enter: "cubic-bezier(0.22, 1, 0.36, 1)", exit: "cubic-bezier(0.4, 0, 1, 1)" }}
                      unmountOnExit
                      // flexShrink: 0 обязателен: рельс — это flex-колонка со скроллом,
                      // а у Collapse overflow: hidden (min-height: auto → 0), поэтому
                      // иначе флексбокс ужимает раскрытый список до нулевой высоты.
                      sx={{ flexShrink: 0, overflow: "hidden" }}
                    >
                      <DocRailList
                        docs={docs}
                        selectedId={selDocId}
                        loading={availQuery.isLoading}
                        onSelect={setSelDocId}
                      />
                    </Collapse>
                  </React.Fragment>
                );
              })()}
              {specs.length === 0 ? (
                <Typography variant="body2" color="text.disabled" sx={{ px: 2, py: 2 }}>
                  {t("slots.noSpecialities")}
                </Typography>
              ) : (
                specs.map((s) => {
                  const active = s.id === specId;
                  const badge = badgeBySpec.get(s.id);
                  return (
                    <React.Fragment key={s.id}>
                      <Box
                        onClick={() => {
                          if (specId !== s.id) {
                            setSpecId(s.id);
                            setSelDocId(null);
                            setSelDay(null);
                            setCollapsedGroup(null);
                          } else if (collapsedGroup === s.id) {
                            setCollapsedGroup(null);
                          } else {
                            setCollapsedGroup(s.id);
                            setSelDocId(null);
                          }
                        }}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1.25,
                          px: 1.75,
                          py: 1.25,
                          cursor: "pointer",
                          borderLeft: "3px solid",
                          borderColor: active ? "primary.main" : "transparent",
                          bgcolor: active ? alpha(theme.palette.primary.main, 0.1) : "transparent",
                          transition: "background-color .13s ease",
                          "&:hover": { bgcolor: active ? undefined : subtleBg(theme) },
                        }}
                      >
                        <Typography
                          variant="body2"
                          fontWeight={active ? 600 : 500}
                          sx={{ flex: 1, minWidth: 0 }}
                          noWrap
                        >
                          {s.name}
                        </Typography>
                        {badge && (
                          <Box
                            sx={(t) => ({
                              fontSize: "0.6875rem",
                              fontWeight: 600,
                              lineHeight: 1,
                              px: 0.75,
                              py: 0.5,
                              borderRadius: "7px",
                              color: badge.free ? "success.dark" : "text.disabled",
                              bgcolor: badge.free
                                ? alpha(t.palette.success.main, t.palette.mode === "dark" ? 0.2 : 0.14)
                                : subtleBg(t, true),
                              ...(t.palette.mode === "dark" && badge.free ? { color: t.palette.success.light } : {}),
                            })}
                            title={t("slots.freeToday")}
                          >
                            {badge.free}/{badge.total}
                          </Box>
                        )}
                      </Box>

                      {/* Список сотрудников выбранной специальности */}
                      <Collapse
                        in={active && collapsedGroup !== s.id}
                        timeout={{ enter: 240, exit: 180 }}
                        easing={{ enter: "cubic-bezier(0.22, 1, 0.36, 1)", exit: "cubic-bezier(0.4, 0, 1, 1)" }}
                        unmountOnExit
                        sx={{ flexShrink: 0, overflow: "hidden" }}
                      >
                        <DocRailList
                          docs={docs}
                          selectedId={selDocId}
                          loading={availQuery.isLoading}
                          onSelect={setSelDocId}
                        />
                      </Collapse>
                    </React.Fragment>
                  );
                })
              )}
            </>
          )}
        </Box>

        {/* ── Правая колонка: сетка врачей ── */}
        <Box
          sx={{
            minWidth: 0,
            minHeight: 0,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "14px",
            bgcolor: "background.paper",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            p: 0,
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={2}
            sx={{
              px: 2,
              py: 1.25,
              borderBottom: "1px solid",
              borderColor: "divider",
              flexShrink: 0,
              bgcolor: "background.paper",
            }}
          >
            <TextField
              size="small"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("slots.searchSpecialist")}
              sx={{ width: { xs: 200, sm: 260 } }}
              InputProps={{
                startAdornment: (
                  <SearchOutlined sx={{ fontSize: 18, color: "text.disabled", mr: 0.75 }} />
                ),
              }}
            />
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                {t("slots.grid")}{" "}
                {specId
                  ? `(${specs.find((s) => s.id === specId)?.name})`
                  : t("slots.allSpecialistsOption")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("slots.foundSpecialists", { count: gridDocs.length })}
              </Typography>
            </Box>
          </Stack>

          {(() => {
            const isMatrixLoading = (availQuery.isLoading || summaryQuery.isLoading) && !availQuery.data;

            if (isMatrixLoading) {
              return (
                <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ py: 12, flex: 1 }}>
                  <CircularProgress size={36} />
                  <Typography variant="body2" color="text.secondary">
                    Загрузка расписания врачей…
                  </Typography>
                </Stack>
              );
            }

            const activeDayDate = selectedDay?.date ?? selDay ?? todayIso;
            const activeDocsOnDay = gridDocs.filter(({ emp }) => {
              const d = emp.days.find((x) => x.date === activeDayDate);
              return d && d.scheduled && !d.dayOff;
            });

            if (docs.length === 0) {
              return (
                <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ py: 8, flex: 1 }}>
                  <PersonSearchOutlined sx={{ fontSize: 36, color: "text.disabled" }} />
                  <Typography variant="body2" color="text.disabled">
                    {search
                      ? t("slots.specialistsNotFoundByQuery")
                      : t("slots.specialistsNotFound")}
                  </Typography>
                </Stack>
              );
            }

            if (activeDocsOnDay.length === 0) {
              return (
                <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ py: 8, flex: 1 }}>
                  <PersonSearchOutlined sx={{ fontSize: 36, color: "text.disabled" }} />
                  <Typography variant="body2" color="text.disabled">
                    {t("slots.noShiftsOnDate")}
                  </Typography>
                </Stack>
              );
            }

            return (
              <Box
                ref={matrixScrollRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUpOrLeave}
                onMouseLeave={handleMouseUpOrLeave}
                sx={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "row",
                  overflowX: "auto",
                  cursor: isDragging ? "grabbing" : "grab",
                  userSelect: isDragging ? "none" : "auto",
                  "&::-webkit-scrollbar": { height: 6 },
                }}
              >
                {activeDocsOnDay.map(({ emp, sum }) => {
                  const docDay = emp.days.find((d) => d.date === activeDayDate)!;
                  const specName = specId ? specs.find((s) => s.id === specId)?.name : null;

                  return (
                    <Box
                      key={emp.employeeId}
                      sx={{
                        // Сетка не растягивает карточки по числу врачей:
                        // одна, две или три карточки занимают по трети панели.
                        flex: "0 0 33.3333%",
                        minWidth: 175,
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        borderRight: "1px solid",
                        borderColor: "divider",
                        "&:last-of-type": {
                          borderRight: "none",
                        },
                      }}
                    >
                      {/* Шапка врача в колонке — подпись, а не кнопка:
                          отдельного экрана врача в режиме окон нет. */}
                      <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        spacing={1}
                        sx={(tokens) => ({
                          px: 1.25,
                          py: 1,
                          borderBottom: "1px solid",
                          borderColor: "divider",
                          bgcolor: subtleBg(tokens),
                        })}
                      >
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                          <Box sx={{ position: "relative", flexShrink: 0 }}>
                            <Box
                              sx={{
                                width: 32,
                                height: 32,
                                borderRadius: "9px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#fff",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                bgcolor: avatarColor(emp.fullName),
                              }}
                            >
                              {initials(emp.fullName)}
                            </Box>
                            <Box
                              sx={{
                                position: "absolute",
                                right: -2,
                                bottom: -2,
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                border: "2px solid",
                                borderColor: "background.paper",
                                bgcolor: STATUS_DOT[sum.status],
                              }}
                            />
                          </Box>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant="body2" fontWeight={600} noWrap sx={{ fontSize: "0.8125rem", lineHeight: 1.2 }}>
                              {emp.fullName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", fontSize: "0.6875rem" }}>
                              {specName ?? t("slots.specialist")}
                            </Typography>
                          </Box>
                        </Stack>
                      </Stack>

                      {/* Таймлайн окон и приёмов за день */}
                      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 1 }}>
                        {!docDay ? (
                          <Alert severity="info" icon={false}>{t("slots.noSchedule")}</Alert>
                        ) : (
                          <DayTimeline
                            day={docDay}
                            employeeId={emp.employeeId}
                            dense
                            onBook={onBook}
                            onOpenAppointment={onOpenAppointment}
                            dragMovedRef={isDragMovedRef}
                          />
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            );
          })()}
        </Box>
      </Box>
    </Box>
  );
};

export default FreeSlotsView;
