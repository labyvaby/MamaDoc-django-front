import React from "react";
import {
  Box,
  ButtonBase,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import dayjs, { type Dayjs } from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import "dayjs/locale/ru";

import { UserAvatar } from "../../../components/ui";
import type { DjangoEmployeeListItem } from "../../../api/staff";
import type { ScheduleException, ScheduleRule } from "../../../api/scheduling";
import { computeDayOccurrences, type DayOccurrence } from "./occurrences";
import { employeeColorHex, useEmployeeColorMap } from "./employeeColors";
import ScheduleDayTimeline from "./ScheduleDayTimeline";
import ScheduleWeekResourceGrid from "./ScheduleWeekResourceGrid";
import ScheduleFilters from "./ScheduleFilters";
import { useScheduleFilters } from "./useScheduleFilters";

dayjs.extend(isoWeek);
dayjs.locale("ru");

// ── Геометрия ────────────────────────────────────────────────────────────────

const MONTH_CELL_HEIGHT = 138;
const MONTH_MAX_EVENTS = 4;

/** "09:00" → "9", "09:30" → "9:30", "13:00" → "13". */
const shortTime = (t: string): string => {
  const [hh, mm] = t.split(":");
  const h = String(parseInt(hh, 10));
  return mm === "00" ? h : `${h}:${mm}`;
};

const timeRange = (occ: DayOccurrence): string => `${shortTime(occ.startTime)}–${shortTime(occ.endTime)}`;

/** Фамилия — первое слово ФИО. */
const surname = (fullName: string): string => fullName.trim().split(/\s+/)[0] || fullName;

const generateWeeksGrid = (monthDate: Dayjs): Dayjs[][] => {
  const startDate = monthDate.startOf("month").startOf("isoWeek");
  const weeks: Dayjs[][] = [];
  let cur = startDate;
  while (weeks.length < 6) {
    const week: Dayjs[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push(cur);
      cur = cur.add(1, "day");
    }
    weeks.push(week);
  }
  return weeks;
};

// ── Props ────────────────────────────────────────────────────────────────────

export interface ScheduleCalendarProps {
  employees: DjangoEmployeeListItem[];
  rules: ScheduleRule[];
  exceptions: ScheduleException[];
  month: Dayjs;
  onMonthChange: (month: Dayjs) => void;
  onDayClick: (day: Dayjs) => void;
  currentEmployeeId?: number | null;
}

const WEEKDAY_FULL = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

/** День — resource timeline, Неделя — врач × день, Месяц — обзорные плашки. */
type ScheduleView = "day" | "week" | "month";

const ScheduleCalendar: React.FC<ScheduleCalendarProps> = ({
  employees,
  rules,
  exceptions,
  month,
  onMonthChange,
  onDayClick,
  currentEmployeeId,
}) => {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const today = dayjs();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  // «День» по умолчанию: при 16+ сотрудниках это основной рабочий экран.
  const [view, setView] = React.useState<ScheduleView>("day");

  const employeesById = React.useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const employeeColorMap = useEmployeeColorMap(employees);
  const { filters, set: setFilter, reset: resetFilters, apply: filterOccurrences } = useScheduleFilters(
    employeesById,
    currentEmployeeId,
  );

  const colorOf = React.useCallback(
    (employeeId: number) => employeeColorHex(employeeColorMap.get(employeeId) ?? 0, mode),
    [employeeColorMap, mode],
  );

  const weeks = React.useMemo(() => generateWeeksGrid(month), [month]);
  const currentWeek = React.useMemo(
    () => weeks.find((week) => week.some((d) => d.isSame(month, "day"))) ?? weeks[0],
    [weeks, month],
  );

  const headerTitle = React.useMemo(() => {
    if (view === "month") {
      const s = month.format("MMMM YYYY");
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    if (view === "day") {
      const s = month.format("D MMMM YYYY, dddd");
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    const start = currentWeek[0];
    const end = currentWeek[6];
    const sameMonth = start.isSame(end, "month");
    return `${start.format(sameMonth ? "D" : "D MMM")} – ${end.format("D MMM YYYY")}`;
  }, [view, month, currentWeek]);

  const isSameAsToday =
    view === "month"
      ? month.isSame(today, "month")
      : view === "day"
      ? month.isSame(today, "day")
      : month.isSame(today, "isoWeek");
  const stepUnit: "month" | "week" | "day" =
    view === "month" ? "month" : view === "day" ? "day" : "week";

  /**
   * Дни, которые реально нужно посчитать: месяц — вся сетка (42), неделя — 7,
   * день — 1. Раньше всегда считали 42 дня × N правил, даже в дневном виде.
   */
  const visibleDays = React.useMemo(() => {
    // На мобилке всегда дневной список + лента текущей недели.
    if (isMobile) return currentWeek;
    if (view === "month") return weeks.flat();
    if (view === "week") return currentWeek;
    return [month];
  }, [isMobile, view, weeks, currentWeek, month]);

  const occurrencesByDate = React.useMemo(() => {
    const map = new Map<string, DayOccurrence[]>();
    visibleDays.forEach((day) => {
      map.set(day.format("YYYY-MM-DD"), computeDayOccurrences(day, rules, exceptions));
    });
    return map;
  }, [visibleDays, rules, exceptions]);

  /**
   * Чипы специализаций берём из состава сотрудников, а не из видимых смен:
   * иначе набор фильтров «прыгал» бы при смене дня/вида.
   */
  const availableSpecs = React.useMemo(() => {
    const specs = new Set<string>();
    employees.forEach((e) => e.specializations.forEach((s) => specs.add(s.name)));
    return Array.from(specs).sort();
  }, [employees]);

  const occsFor = React.useCallback(
    (day: Dayjs) => filterOccurrences(occurrencesByDate.get(day.format("YYYY-MM-DD")) ?? []),
    [filterOccurrences, occurrencesByDate],
  );

  /** Те же смены, но уже пропущенные через фильтры — для видов «День»/«Неделя». */
  const filteredOccurrencesByDate = React.useMemo(() => {
    const map = new Map<string, DayOccurrence[]>();
    occurrencesByDate.forEach((occs, date) => map.set(date, filterOccurrences(occs)));
    return map;
  }, [occurrencesByDate, filterOccurrences]);

  // Число уникальных сотрудников со сменами в день (реальные данные,
  // без выдумки про «кабинеты» — их в API расписания нет).
  const staffCount = React.useCallback(
    (occs: DayOccurrence[]): number => new Set(occs.map((o) => o.employeeId)).size,
    [],
  );

  // Число дня + нейтральный счётчик работающих сотрудников
  const DayCounter: React.FC<{ day: Dayjs; occs: DayOccurrence[]; show: boolean }> = ({ day, occs, show }) => {
    const isToday = day.isSame(today, "day");
    const isCurrentMonth = day.isSame(month, "month");
    const isWeekend = day.isoWeekday() >= 6;
    const count = staffCount(occs);
    return (
      <Stack direction="row" alignItems="center" spacing={0.5}>
        {show && count > 0 && (
          <Tooltip title={`Сотрудников в смене: ${count}`} arrow placement="left">
            <Stack direction="row" alignItems="center" spacing={0.25} sx={{ color: "text.secondary" }}>
              <PersonOutlined sx={{ fontSize: 13 }} />
              <Typography sx={{ fontSize: "0.7rem", fontWeight: 600, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {count}
              </Typography>
            </Stack>
          </Tooltip>
        )}
        <Box
          sx={{
            width: 26,
            height: 26,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            bgcolor: isToday ? "primary.main" : "transparent",
          }}
        >
          <Typography
            sx={{
              fontSize: "0.8rem",
              fontWeight: isToday ? 700 : isCurrentMonth ? 600 : 400,
              color: isToday
                ? "primary.contrastText"
                : isWeekend && isCurrentMonth
                ? "error.main"
                : isCurrentMonth
                ? "text.primary"
                : "text.disabled",
              lineHeight: 1,
            }}
          >
            {day.format("D")}
          </Typography>
        </Box>
      </Stack>
    );
  };

  // ── Плашка-событие (месяц / список) ─────────────────────────────────────────
  const EventPill: React.FC<{ occ: DayOccurrence }> = ({ occ }) => {
    const color = colorOf(occ.employeeId);
    const isExtra = occ.kind === "extra";
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 0.75,
          py: "2px",
          borderRadius: "4px",
          borderLeft: `3px solid ${color}`,
          border: isExtra ? `1.5px dashed ${alpha(theme.palette.success.main, 0.9)}` : undefined,
          borderLeftColor: color,
          bgcolor: alpha(color, mode === "dark" ? 0.24 : 0.14),
          minWidth: 0,
        }}
      >
        <Typography
          noWrap
          sx={{ fontSize: "0.72rem", fontWeight: 600, color: "text.primary", flex: 1, minWidth: 0 }}
        >
          {surname(occ.employeeName)}
        </Typography>
        <Typography sx={{ fontSize: "0.68rem", color: "text.secondary", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
          {timeRange(occ)}
        </Typography>
      </Box>
    );
  };

  // ── Ячейка месяца ────────────────────────────────────────────────────────────
  const renderMonthCell = (day: Dayjs) => {
    const isToday = day.isSame(today, "day");
    const isCurrentMonth = day.isSame(month, "month");
    const isWeekend = day.isoWeekday() >= 6;
    const occs = occsFor(day).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const visible = occs.length <= MONTH_MAX_EVENTS ? occs : occs.slice(0, MONTH_MAX_EVENTS - 1);
    const overflow = occs.length - visible.length;

    return (
      <TableCell
        key={day.format("YYYY-MM-DD")}
        onClick={() => onDayClick(day)}
        sx={{
          verticalAlign: "top",
          height: MONTH_CELL_HEIGHT,
          border: "1px solid",
          borderColor: "divider",
          outline: isToday ? `2px solid ${theme.palette.primary.main}` : "none",
          outlineOffset: -2,
          cursor: "pointer",
          bgcolor: isWeekend && isCurrentMonth
            ? alpha(theme.palette.error.main, 0.02)
            : isCurrentMonth
            ? "background.paper"
            : "action.hover",
          opacity: isCurrentMonth ? 1 : 0.55,
          p: 0.5,
          "&:hover": { bgcolor: isToday ? alpha(theme.palette.primary.main, 0.05) : "action.selected" },
        }}
      >
        <Stack sx={{ height: "100%" }}>
          <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 0.25 }}>
            <DayCounter day={day} occs={occs} show={isCurrentMonth} />
          </Box>
          <Stack spacing={0.375} sx={{ minWidth: 0 }}>
            {visible.map((occ) => (
              <EventPill key={`${occ.kind}_${occ.sourceId}_${occ.startTime}`} occ={occ} />
            ))}
            {overflow > 0 && (
              <Typography sx={{ fontSize: "0.68rem", color: "text.secondary", fontWeight: 600, pl: 0.5 }}>
                +{overflow} ещё
              </Typography>
            )}
          </Stack>
        </Stack>
      </TableCell>
    );
  };



  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "14px",
        bgcolor: "background.paper",
        overflow: "hidden",
        // Занимаем остаток высоты страницы: шапка календаря фиксирована,
        // скроллится только сетка внутри.
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Заголовок и навигация */}
      <Box sx={{ px: 2, pt: 2, pb: 1, flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <IconButton size="small" onClick={() => onMonthChange(month.subtract(1, stepUnit))}>
            <ChevronLeftOutlined fontSize="small" />
          </IconButton>
          <Typography variant="h6" sx={{ fontWeight: 700, minWidth: 150, textAlign: "center", fontSize: "1.05rem" }}>
            {headerTitle}
          </Typography>
          <IconButton size="small" onClick={() => onMonthChange(month.add(1, stepUnit))}>
            <ChevronRightOutlined fontSize="small" />
          </IconButton>
          {!isSameAsToday && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => onMonthChange(today)}
              sx={{ ml: 1, fontSize: "0.75rem", py: 0.25, px: 1.25, borderRadius: "8px" }}
            >
              Сегодня
            </Button>
          )}

          {/* Тумблер вида — только на десктопе */}
          <ToggleButtonGroup
            size="small"
            exclusive
            value={view}
            onChange={(_, v) => v && setView(v)}
            sx={{ ml: 1, display: { xs: "none", md: "flex" } }}
          >
            <ToggleButton value="day" sx={{ textTransform: "none", px: 1.5, fontSize: "0.75rem" }}>
              День
            </ToggleButton>
            <ToggleButton value="week" sx={{ textTransform: "none", px: 1.5, fontSize: "0.75rem" }}>
              Неделя
            </ToggleButton>
            <ToggleButton value="month" sx={{ textTransform: "none", px: 1.5, fontSize: "0.75rem" }}>
              Месяц
            </ToggleButton>
          </ToggleButtonGroup>

          <TextField
            size="small"
            placeholder="Поиск по ФИО..."
            value={filters.name}
            onChange={(e) => setFilter("name", e.target.value)}
            sx={{ ml: { md: "auto !important" }, flex: { xs: "1 1 100%", md: "0 0 auto" }, minWidth: 160, maxWidth: { md: 240 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined sx={{ fontSize: 16, color: "text.disabled" }} />
                </InputAdornment>
              ),
            }}
          />
        </Stack>

        <ScheduleFilters
          filters={filters}
          onChange={setFilter}
          onReset={resetFilters}
          availableSpecs={availableSpecs}
          showMine={currentEmployeeId != null}
        />
      </Box>

      {/* ── Десктоп (md+) ── */}
      <Box sx={{ display: { xs: "none", md: "flex" }, flex: 1, minHeight: 0, flexDirection: "column" }}>
        {view === "month" ? (
          <TableContainer sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            <Table stickyHeader sx={{ tableLayout: "fixed", minWidth: 760 }}>
              <TableHead>
                <TableRow>
                  {WEEKDAY_FULL.map((d, di) => (
                    <TableCell
                      key={d}
                      align="center"
                      sx={{
                        fontWeight: 600,
                        fontSize: "0.75rem",
                        py: 1,
                        color: di >= 5 ? "error.main" : "text.secondary",
                        // Непрозрачный фон — шапка sticky, контент не должен просвечивать
                        bgcolor: "background.paper",
                        borderBottom: `2px solid ${theme.palette.divider}`,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                      }}
                    >
                      {d}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {weeks.map((week, wi) => (
                  <TableRow key={String(wi)}>{week.map((day) => renderMonthCell(day))}</TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : view === "week" ? (
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <ScheduleWeekResourceGrid
              week={currentWeek}
              employees={employees}
              occurrencesByDate={filteredOccurrencesByDate}
              employeeColorMap={employeeColorMap}
              onDayClick={onDayClick}
            />
          </Box>
        ) : (
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <ScheduleDayTimeline
              day={month}
              employees={employees}
              occurrences={occsFor(month)}
              employeeColorMap={employeeColorMap}
              onEmployeeClick={() => onDayClick(month)}
            />
          </Box>
        )}
      </Box>

      {/* ── Мобилка (xs/sm) — лента дней недели + смены выбранного дня ── */}
      <Box sx={{ display: { xs: "flex", md: "none" }, flexDirection: "column", flex: 1, minHeight: 0 }}>
        {/* Лента дней текущей недели */}
        <Stack
          direction="row"
          sx={{
            gap: 0.5,
            px: 1,
            py: 1,
            borderBottom: "1px solid",
            borderColor: "divider",
            flexShrink: 0,
          }}
        >
          {currentWeek.map((day) => {
            const selected = day.isSame(month, "day");
            const isToday = day.isSame(today, "day");
            const count = staffCount(occsFor(day));
            return (
              <ButtonBase
                key={day.format("YYYY-MM-DD")}
                onClick={() => onMonthChange(day)}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  flexDirection: "column",
                  gap: 0.25,
                  py: 0.75,
                  borderRadius: "8px",
                  bgcolor: selected ? "primary.main" : "transparent",
                  color: selected ? "primary.contrastText" : "text.primary",
                  border: !selected && isToday ? `1px solid ${theme.palette.primary.main}` : "1px solid transparent",
                }}
              >
                <Typography sx={{ fontSize: "0.6rem", textTransform: "uppercase", opacity: 0.8 }}>
                  {day.format("dd")}
                </Typography>
                <Typography sx={{ fontSize: "0.9rem", fontWeight: 700, lineHeight: 1 }}>
                  {day.format("D")}
                </Typography>
                <Box
                  sx={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    bgcolor: count > 0 ? (selected ? "primary.contrastText" : "success.main") : "transparent",
                  }}
                />
              </ButtonBase>
            );
          })}
        </Stack>

        {/* Смены выбранного дня */}
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 1.5 }}>
          {(() => {
            const occs = occsFor(month).sort(
              (a, b) => a.startTime.localeCompare(b.startTime) || a.employeeName.localeCompare(b.employeeName),
            );
            if (occs.length === 0) {
              return (
                <Typography color="text.disabled" align="center" sx={{ py: 6 }}>
                  На этот день смен нет
                </Typography>
              );
            }
            return (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                  Сотрудников в смене: {staffCount(occs)}
                </Typography>
                <Stack spacing={0.75}>
                  {occs.map((occ) => (
                    <Stack
                      key={`${occ.kind}_${occ.sourceId}_${occ.startTime}`}
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      onClick={() => onDayClick(month)}
                      sx={{
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: "10px",
                        p: 1,
                        cursor: "pointer",
                      }}
                    >
                      <Box sx={{ width: 3, alignSelf: "stretch", borderRadius: 1, bgcolor: colorOf(occ.employeeId), flexShrink: 0 }} />
                      <UserAvatar name={occ.employeeName} src={employeesById.get(occ.employeeId)?.photoUrl} size={30} />
                      <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                        {occ.employeeName}
                      </Typography>
                      {occ.kind === "extra" && (
                        <Chip label="доп." size="small" color="success" variant="outlined" sx={{ height: 18, fontSize: "0.6rem", flexShrink: 0 }} />
                      )}
                      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                        {timeRange(occ)}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </>
            );
          })()}
        </Box>
      </Box>
    </Box>
  );
};

export default ScheduleCalendar;
