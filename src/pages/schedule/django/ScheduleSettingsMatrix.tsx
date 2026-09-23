import React from "react";
import { Box, Button, ButtonBase, IconButton, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import { motion } from "framer-motion";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import dayjs, { type Dayjs } from "dayjs";

import {
  SCHEDULE_RULE_ONLINE_BOOKING_ENABLED,
  isRuleOnlineBookingEnabled,
  type ScheduleRule,
} from "../../../api/scheduling";
import {
  AppCard,
  ListEmptyState,
  ListLoadingSkeleton,
  UserAvatar,
  pillSx,
} from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";
import { isAbsenceKind } from "./occurrences";
import {
  RULE_EXPIRING_DAYS,
  WEEKDAY_SHORT,
  formatWeeklyHours,
  type EmployeeSchedule,
  type ExceptionItem,
} from "./scheduleSettingsModel";
import {
  cellsOf,
  exceptionDetails,
  exceptionKindTitle,
  exceptionWhen,
  issueRank,
  mondayOf,
  pluralDays,
  pluralVisits,
  shortName,
  type DayCell,
  type EmployeeIssue,
} from "./scheduleMatrixModel";
import { absenceBg, accentFg, issueDotColor, todayBg, warningFg } from "./scheduleTones";

const MotionBox = motion(Box);

/**
 * Каскад появления строк (гайд §6: y 12 → 0, 0.4s, шаг 0.06). Задержка растёт
 * только у первых десяти — иначе 30+ сотрудников проявлялись бы две секунды.
 */
const rowMotion = (i: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: Math.min(i, 10) * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
});

type MatrixFilter = "all" | "today" | "attention" | "none";

const GRID = "230px repeat(7, minmax(0, 1fr)) 80px 124px";
/** Ниже этой ширины колонки дней сжимаются в нечитаемое — таблица листается вбок внутри карточки. */
const TABLE_MIN_WIDTH = 940;
/** Сколько строк «Ближайших» показывать до «Показать все». */
const UPCOMING_LIMIT = 8;

export interface ScheduleSettingsMatrixProps {
  schedules: EmployeeSchedule[];
  issueOf: (employeeId: number) => EmployeeIssue | null;
  cells: Map<number, DayCell[]>;
  weekStart: Dayjs;
  onWeekChange: (monday: Dayjs) => void;
  today: string;
  loading: boolean;
  isMobile: boolean;
  canManage: boolean;
  /** Основной филиал сотрудника из справочника — для подстроки. */
  employeeBranch: Map<number, string>;
  absenceCount: (item: ExceptionItem) => number;
  /** Десктоп: сегмент-табы и кнопка «График» справа в тулбаре. */
  trailing?: React.ReactNode;
  onOpenEmployee: (employeeId: number) => void;
  onIssueAction: (employeeId: number, issue: EmployeeIssue) => void;
  onExtend: (rule: ScheduleRule) => void;
  onAddAbsence: () => void;
}

// ── Ячейка дня ────────────────────────────────────────────────────────────────

const cellTone = (t: Theme, variant: DayCell["variant"]) => {
  switch (variant) {
    case "shift":
      return { bgcolor: t.palette.primary.lighter, color: accentFg(t), border: `1px solid ${t.palette.divider}` };
    case "oneoff":
      return { bgcolor: "transparent", color: accentFg(t), border: `1px dashed ${t.palette.primary.main}` };
    case "absence":
      return { bgcolor: absenceBg(t), color: warningFg(t), border: "1px solid transparent" };
    default:
      return { bgcolor: "transparent", color: alpha(t.palette.text.primary, 0.25), border: "1px solid transparent" };
  }
};

const MatrixCell: React.FC<{ cell: DayCell; isToday: boolean }> = ({ cell, isToday }) => (
  <Box sx={(t) => ({ display: "flex", px: "3px", py: "6px", bgcolor: isToday ? todayBg(t) : undefined })}>
    <Box
      aria-label={cell.aria}
      sx={(t) => ({
        ...cellTone(t, cell.variant),
        flex: 1,
        minWidth: 0,
        minHeight: 40,
        borderRadius: "7px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1px",
        textAlign: "center",
        px: 0.25,
        fontSize: 13,
        fontWeight: cell.variant === "empty" ? 400 : 600,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.2,
      })}
    >
      <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
        {cell.label}
      </Box>
      {cell.sub && (
        <Box component="span" sx={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>
          {cell.sub}
        </Box>
      )}
    </Box>
  </Box>
);

/** Аватар с зелёной точкой «работает сегодня». */
const Avatar: React.FC<{ name: string; size: number; online: boolean }> = ({ name, size, online }) => (
  <Box sx={{ position: "relative", flexShrink: 0 }}>
    <UserAvatar name={name} size={size} />
    {online && (
      <Box
        sx={(t) => ({
          position: "absolute",
          right: -1,
          bottom: -1,
          width: 10,
          height: 10,
          borderRadius: "50%",
          bgcolor: "success.main",
          border: `2px solid ${t.palette.background.paper}`,
        })}
      />
    )}
  </Box>
);

const Dot: React.FC<{ tone: EmployeeIssue["tone"] }> = ({ tone }) => (
  <Box sx={(t) => ({ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, bgcolor: issueDotColor(t, tone) })} />
);

/** Нажатие Enter/Space по строке-кнопке. */
const onKeyActivate = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

// ── Матрица ───────────────────────────────────────────────────────────────────

const ScheduleSettingsMatrix: React.FC<ScheduleSettingsMatrixProps> = (props) => {
  const {
    schedules,
    issueOf,
    cells,
    weekStart,
    onWeekChange,
    today,
    loading,
    isMobile,
    canManage,
    employeeBranch,
    absenceCount,
    trailing,
    onOpenEmployee,
    onIssueAction,
    onExtend,
    onAddAbsence,
  } = props;
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<MatrixFilter>("all");
  const [showAllUpcoming, setShowAllUpcoming] = React.useState(false);

  const predicates: Record<MatrixFilter, (s: EmployeeSchedule) => boolean> = {
    all: () => true,
    today: (s) => s.worksToday,
    attention: (s) => issueOf(s.employeeId) !== null,
    none: (s) => s.noActiveRules,
  };
  const pills: { id: MatrixFilter; label: string }[] = [
    { id: "all", label: "Все" },
    { id: "today", label: "Работают сегодня" },
    { id: "attention", label: "Требуют внимания" },
    { id: "none", label: "Без графика" },
  ];

  const query = search.trim().toLocaleLowerCase("ru");
  const visible = schedules
    .filter((s) => predicates[filter](s) && (!query || s.employeeName.toLocaleLowerCase("ru").includes(query)))
    .sort(
      (a, b) =>
        issueRank(issueOf(a.employeeId)) - issueRank(issueOf(b.employeeId)) ||
        a.employeeName.localeCompare(b.employeeName, "ru"),
    );

  const days = Array.from({ length: 7 }, (_, i) => weekStart.add(i, "day"));
  const todayIdx = days.findIndex((d) => d.format("YYYY-MM-DD") === today);
  const isCurrentWeek = mondayOf(dayjs(today)).isSame(weekStart, "day");

  /** Подстрока строки: филиал + общие смены + «не на сайте». */
  const branchLine = (s: EmployeeSchedule) => {
    const live = s.liveRules;
    const own = employeeBranch.get(s.employeeId) ?? live.find((r) => r.branchName)?.branchName ?? null;
    return [
      own,
      live.some((r) => r.branchId == null) ? "часть смен — все филиалы" : null,
      SCHEDULE_RULE_ONLINE_BOOKING_ENABLED && live.some((r) => !isRuleOnlineBookingEnabled(r))
        ? "не на сайте записи"
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
  };

  const daysLeft = (s: EmployeeSchedule) => (s.until ? dayjs(s.until).diff(dayjs(today), "day") : null);

  // ── Тулбар ──
  const toolbar = (
    <Stack direction="row" alignItems="center" gap={1.25} flexWrap="wrap" useFlexGap>
      <TextField
        size="small"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Поиск сотрудника"
        sx={{ width: isMobile ? "100%" : 260, flexShrink: 0 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchOutlined fontSize="small" />
            </InputAdornment>
          ),
        }}
      />
      {/* На телефоне пилюли листаются вбок внутри своей строки. */}
      <Stack
        direction="row"
        gap={0.75}
        sx={{
          overflowX: "auto",
          maxWidth: "100%",
          mx: isMobile ? -2 : 0,
          px: isMobile ? 2 : 0,
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {pills.map((p) => {
          const count = schedules.filter(predicates[p.id]).length;
          return (
            <ButtonBase
              key={p.id}
              onClick={() => setFilter(p.id === filter ? "all" : p.id)}
              sx={(t) => ({ ...pillSx(t, filter === p.id), gap: 0.75, whiteSpace: "nowrap" })}
            >
              {p.label}
              <Box component="span" sx={{ opacity: 0.7, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {count}
              </Box>
            </ButtonBase>
          );
        })}
      </Stack>
      {trailing && (
        <>
          <Box sx={{ flex: 1 }} />
          {trailing}
        </>
      )}
    </Stack>
  );

  // ── Навигация по неделям ──
  const weekNav = (
    <Stack direction="row" alignItems="center" gap={1}>
      {(
        [
          ["Предыдущая неделя", ChevronLeftOutlined, -7],
          ["Следующая неделя", ChevronRightOutlined, 7],
        ] as const
      ).map(([label, Icon, shift]) => (
        <IconButton
          key={label}
          aria-label={label}
          onClick={() => onWeekChange(weekStart.add(shift, "day"))}
          sx={{
            width: 32,
            height: 32,
            borderRadius: "9px",
            border: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <Icon sx={{ fontSize: 20 }} />
        </IconButton>
      ))}
      <Typography sx={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums", ml: 0.5 }}>
        {weekStart.format("DD.MM")} – {weekStart.add(6, "day").format("DD.MM")}
      </Typography>
      {!isCurrentWeek && (
        <ButtonBase
          onClick={() => onWeekChange(mondayOf(dayjs(today)))}
          sx={{ fontSize: 13, fontWeight: 500, color: "primary.onSurface", borderRadius: "6px", px: 0.75, py: 0.25 }}
        >
          Эта неделя
        </ButtonBase>
      )}
    </Stack>
  );

  const issueLine = (s: EmployeeSchedule, withAction: boolean, pl: number | string) => {
    const issue = issueOf(s.employeeId);
    if (!issue) return null;
    const actionAllowed = withAction && (canManage || issue.action.kind === "review");
    return (
      <Stack direction="row" alignItems="center" gap={1.25} sx={{ pl, pr: 2, pb: 1.25, fontSize: 13 }}>
        <Dot tone={issue.tone} />
        <Typography sx={{ fontSize: 13, minWidth: 0 }}>{issue.text}</Typography>
        {actionAllowed && (
          <ButtonBase
            onClick={(e) => {
              // Действие не должно открывать панель строки.
              e.stopPropagation();
              onIssueAction(s.employeeId, issue);
            }}
            onKeyDown={(e) => e.stopPropagation()}
            sx={(t) => ({
              fontSize: 13,
              fontWeight: 500,
              color: "primary.onSurface",
              borderRadius: "6px",
              px: 0.75,
              py: 0.25,
              whiteSpace: "nowrap",
              transition: "background-color .15s ease",
              "&:hover": { bgcolor: alpha(t.palette.primary.main, 0.08) },
            })}
          >
            {issue.actionLabel}
          </ButtonBase>
        )}
      </Stack>
    );
  };

  // ── Таблица (десктоп) ──
  const table = (
    <AppCard variant="outlined" disableContentPadding sx={{ borderRadius: "14px", overflow: "hidden" }}>
      <Box sx={{ overflowX: "auto" }}>
        <Box sx={{ minWidth: TABLE_MIN_WIDTH }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: GRID,
              borderBottom: 1,
              borderColor: "divider",
              fontSize: 12,
              color: "text.secondary",
            }}
          >
            <Box sx={{ px: 2, display: "flex", alignItems: "center" }}>Сотрудник</Box>
            {days.map((d, i) => {
              const isToday = i === todayIdx;
              return (
                <Box
                  key={i}
                  sx={(t) => ({
                    py: 1,
                    px: 0.5,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "1px",
                    ...(isToday
                      ? { color: "primary.onSurface", fontWeight: 600, bgcolor: todayBg(t) }
                      : i >= 5
                        ? { color: alpha(t.palette.text.primary, 0.45) }
                        : {}),
                  })}
                >
                  <span>{isToday ? `${WEEKDAY_SHORT[i]} · сегодня` : WEEKDAY_SHORT[i]}</span>
                  <Box component="span" sx={{ fontWeight: 400, fontVariantNumeric: "tabular-nums" }}>
                    {d.format("DD.MM")}
                  </Box>
                </Box>
              );
            })}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", pr: 1 }}>Часов/нед</Box>
            <Box sx={{ display: "flex", alignItems: "center", px: 1.5 }}>Действует до</Box>
          </Box>

          {visible.length === 0 ? (
            <Typography sx={{ p: 5, textAlign: "center", fontSize: 14, color: "text.secondary" }}>
              Никого не нашлось — измените поиск или сбросьте фильтр
            </Typography>
          ) : (
            <Box>
              {visible.map((s, idx) => {
                const rowCells = cellsOf(cells, s.employeeId, weekStart);
                const left = daysLeft(s);
                return (
                  <MotionBox
                    key={s.employeeId}
                    {...rowMotion(idx)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${s.employeeName}: открыть графики`}
                    onClick={() => onOpenEmployee(s.employeeId)}
                    onKeyDown={onKeyActivate(() => onOpenEmployee(s.employeeId))}
                    sx={(t) => ({
                      borderBottom: 1,
                      borderColor: "divider",
                      cursor: "pointer",
                      transition: "background-color .15s ease",
                      "&:hover": { bgcolor: subtleBg(t) },
                      "&:focus-visible": { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: -2 },
                    })}
                  >
                    <Box sx={{ display: "grid", gridTemplateColumns: GRID, minHeight: 58, alignItems: "stretch" }}>
                      <Stack direction="row" alignItems="center" gap={1.25} sx={{ px: 2, py: 1.25, minWidth: 0 }}>
                        <Avatar name={s.employeeName} size={32} online={s.worksToday} />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>
                            {shortName(s.employeeName)}
                          </Typography>
                          <Typography sx={{ fontSize: 12, color: "text.secondary" }} noWrap>
                            {branchLine(s)}
                          </Typography>
                        </Box>
                      </Stack>
                      {rowCells.map((cell, i) => (
                        <MatrixCell key={i} cell={cell} isToday={i === todayIdx} />
                      ))}
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          pr: 1,
                          fontSize: 14,
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {s.weeklyMinutes > 0 ? formatWeeklyHours(s.weeklyMinutes) : "—"}
                      </Box>
                      <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", px: 1.5 }}>
                        <Typography sx={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
                          {s.until ? dayjs(s.until).format("DD.MM.YY") : "—"}
                        </Typography>
                        {left !== null && left <= RULE_EXPIRING_DAYS && (
                          <Typography sx={(t) => ({ fontSize: 12, fontWeight: 500, color: warningFg(t) })}>
                            {left === 0 ? "сегодня" : `через ${left} ${pluralDays(left)}`}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                    {issueLine(s, true, "58px")}
                  </MotionBox>
                );
              })}
            </Box>
          )}
        </Box>
      </Box>

      <Stack
        direction="row"
        alignItems="center"
        gap={2.25}
        flexWrap="wrap"
        useFlexGap
        sx={{ px: 2, py: 1.5, fontSize: 12, color: "text.secondary" }}
      >
        {(
          [
            ["shift", "смена по графику"],
            ["oneoff", "разовая смена или замена"],
            ["absence", "отсутствие"],
          ] as const
        ).map(([variant, label]) => (
          <Stack key={variant} direction="row" alignItems="center" gap={0.75}>
            <Box sx={(t) => ({ ...cellTone(t, variant), width: 12, height: 12, borderRadius: "4px" })} />
            {label}
          </Stack>
        ))}
        <Box sx={{ flex: 1 }} />
        <span>Нажмите на строку — откроются графики сотрудника</span>
      </Stack>
    </AppCard>
  );

  // ── Карточки (телефон) ──
  const mobileList =
    visible.length === 0 ? (
      <Typography sx={{ p: 5, textAlign: "center", fontSize: 14, color: "text.secondary" }}>
        Никого не нашлось — измените поиск или сбросьте фильтр
      </Typography>
    ) : (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
        {visible.map((s, idx) => {
          const rowCells = cellsOf(cells, s.employeeId, weekStart);
          const issue = issueOf(s.employeeId);
          return (
            <MotionBox key={s.employeeId} {...rowMotion(idx)}>
              <AppCard
                variant="outlined"
                disableContentPadding
                role="button"
                tabIndex={0}
                onClick={() => onOpenEmployee(s.employeeId)}
                onKeyDown={onKeyActivate(() => onOpenEmployee(s.employeeId))}
                sx={{ borderRadius: "14px", p: 1.5, display: "flex", flexDirection: "column", gap: 1.25, cursor: "pointer" }}
              >
                <Stack direction="row" alignItems="center" gap={1.25}>
                  <Avatar name={s.employeeName} size={36} online={s.worksToday} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>
                      {shortName(s.employeeName)}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }} noWrap>
                      {s.until
                        ? `${formatWeeklyHours(s.weeklyMinutes).replace(" ч", " ч/нед")} · до ${dayjs(s.until).format("DD.MM.YY")}`
                        : branchLine(s) || "Графика нет"}
                    </Typography>
                  </Box>
                  <ChevronRightOutlined sx={{ color: "text.disabled" }} />
                </Stack>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "3px" }}>
                  {rowCells.map((cell, i) => (
                    <Stack key={i} gap="3px" alignItems="stretch">
                      <Typography
                        sx={{
                          fontSize: 10,
                          textAlign: "center",
                          ...(i === todayIdx
                            ? { color: "primary.onSurface", fontWeight: 700 }
                            : { color: "text.secondary" }),
                        }}
                      >
                        {WEEKDAY_SHORT[i]}
                      </Typography>
                      <Box
                        aria-label={cell.aria}
                        sx={(t) => ({
                          ...cellTone(t, cell.variant),
                          ...(cell.variant === "empty" ? { bgcolor: subtleBg(t, true) } : {}),
                          minHeight: 34,
                          borderRadius: "6px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          textAlign: "center",
                          fontSize: 10.5,
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                          lineHeight: 1.15,
                          whiteSpace: "pre-line",
                          p: "2px",
                        })}
                      >
                        {cell.compact}
                      </Box>
                    </Stack>
                  ))}
                </Box>
                {issue && (
                  <Stack direction="row" alignItems="center" gap={1}>
                    <Dot tone={issue.tone} />
                    <Typography sx={{ fontSize: 12.5 }}>{issue.text}</Typography>
                  </Stack>
                )}
              </AppCard>
            </MotionBox>
          );
        })}
      </Box>
    );

  // ── Ближайшие отсутствия и разовые смены ──
  type Upcoming = {
    key: string;
    sort: string;
    when: string;
    who: string;
    what: string;
    employeeId: number;
    flag?: { text: string; tone: "error" | "action"; onClick?: () => void };
  };
  const upcoming: Upcoming[] = [];
  for (const s of schedules) {
    for (const item of s.exceptions) {
      if (item.dateTo < today) continue;
      const conflicts = isAbsenceKind(item.kind) ? absenceCount(item) : 0;
      upcoming.push({
        key: item.key,
        sort: item.dateFrom,
        when: exceptionWhen(item),
        who: shortName(s.employeeName),
        what: [exceptionKindTitle(item.kind), exceptionDetails(item)].filter(Boolean).join(" · "),
        employeeId: s.employeeId,
        ...(conflicts > 0
          ? { flag: { text: `${conflicts} ${pluralVisits(conflicts)} без разбора`, tone: "error" as const } }
          : {}),
      });
    }
    if (s.expiring && s.until && s.latestRule) {
      const rule = s.latestRule;
      upcoming.push({
        key: `end:${s.employeeId}`,
        sort: s.until,
        when: dayjs(s.until).format("DD.MM"),
        who: shortName(s.employeeName),
        what: "Конец графика",
        employeeId: s.employeeId,
        ...(canManage ? { flag: { text: "Продлить", tone: "action" as const, onClick: () => onExtend(rule) } } : {}),
      });
    }
  }
  upcoming.sort((a, b) => a.sort.localeCompare(b.sort) || a.who.localeCompare(b.who, "ru"));
  const upcomingShown = showAllUpcoming ? upcoming : upcoming.slice(0, UPCOMING_LIMIT);

  const upcomingCard = (
    <AppCard variant="outlined" disableContentPadding sx={{ borderRadius: "14px", p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Ближайшие отсутствия и разовые смены</Typography>
        {canManage && (
          <Button size="small" startIcon={<AddOutlined />} onClick={onAddAbsence} sx={{ minHeight: 0 }}>
            Отсутствие
          </Button>
        )}
      </Stack>
      {upcoming.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: "text.disabled", py: 1 }}>
          Ничего не запланировано
        </Typography>
      ) : (
        <>
          {upcomingShown.map((u) => (
            <Box
              key={u.key}
              role="button"
              tabIndex={0}
              onClick={() => onOpenEmployee(u.employeeId)}
              onKeyDown={onKeyActivate(() => onOpenEmployee(u.employeeId))}
              sx={(t) => ({
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr auto" : "150px 200px 1fr auto",
                gap: isMobile ? "2px 12px" : 2,
                alignItems: "center",
                py: isMobile ? 1.25 : 1.1,
                borderTop: 1,
                borderColor: "divider",
                fontSize: isMobile ? 13 : 14,
                cursor: "pointer",
                transition: "background-color .15s ease",
                "&:hover": { bgcolor: subtleBg(t) },
              })}
            >
              <Box sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{u.when}</Box>
              {isMobile ? (
                <Box sx={{ gridRow: "span 2", alignSelf: "center" }}>{flagNode(u.flag)}</Box>
              ) : (
                <Box sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.who}</Box>
              )}
              <Box sx={{ color: "text.secondary", minWidth: 0 }}>{isMobile ? `${u.who} · ${u.what}` : u.what}</Box>
              {!isMobile && <Box>{flagNode(u.flag)}</Box>}
            </Box>
          ))}
          {upcoming.length > UPCOMING_LIMIT && (
            <ButtonBase
              onClick={() => setShowAllUpcoming((v) => !v)}
              sx={{ mt: 1, fontSize: 13, fontWeight: 500, color: "primary.onSurface", borderRadius: "6px", px: 0.75, py: 0.5 }}
            >
              {showAllUpcoming ? "Свернуть" : `Показать все (${upcoming.length})`}
            </ButtonBase>
          )}
        </>
      )}
    </AppCard>
  );

  return (
    <Stack gap={1.5} sx={{ minWidth: 0 }}>
      {toolbar}
      {weekNav}
      {loading ? (
        <ListLoadingSkeleton />
      ) : schedules.length === 0 ? (
        <ListEmptyState
          icon={<CalendarMonthOutlined sx={{ fontSize: 30 }} />}
          title="Графиков пока нет"
          description="Добавьте недельный график — из него строятся смены и окна для записи"
        />
      ) : (
        <>
          {isMobile ? mobileList : table}
          {upcomingCard}
        </>
      )}
    </Stack>
  );
};

/** Флаг справа в строке «Ближайших»: записи без разбора или «Продлить». */
function flagNode(flag: { text: string; tone: "error" | "action"; onClick?: () => void } | undefined) {
  if (!flag) return null;
  if (flag.tone === "error") {
    return (
      <Typography sx={{ fontSize: 13, fontWeight: 500, color: "error.main", whiteSpace: "nowrap" }}>
        {flag.text}
      </Typography>
    );
  }
  return (
    <ButtonBase
      onClick={(e) => {
        e.stopPropagation();
        flag.onClick?.();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      sx={{ fontSize: 13, fontWeight: 500, color: "primary.onSurface", borderRadius: "6px", px: 0.75, py: 0.25 }}
    >
      {flag.text}
    </ButtonBase>
  );
}

export default ScheduleSettingsMatrix;
