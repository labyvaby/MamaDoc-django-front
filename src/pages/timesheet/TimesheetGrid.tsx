import React from "react";
import { Box, Popper, Stack, Typography } from "@mui/material";
import { alpha, keyframes, lighten, useTheme } from "@mui/material/styles";
import LockOutlined from "@mui/icons-material/LockOutlined";
import NightlightOutlined from "@mui/icons-material/NightlightOutlined";

import type {
  TimesheetCell,
  TimesheetCode,
  TimesheetDay,
  TimesheetDayStat,
  TimesheetRow,
} from "../../api/timesheet";
import { UserAvatar } from "../../components/ui";
import { subtleBg, subtleBorder } from "../../theme/uiHelpers";
import { codeFill, codeInk } from "./codeColors";
import {
  cellKey,
  compactHours,
  formatHours,
  formatMinutes,
  heatLevel,
  toNumber,
  WEEKDAY_SHORT,
  type CellKey,
  type GridPoint,
} from "./model";

export type TimesheetViewMode = "codes" | "heat";

const flash = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(var(--ts-flash), .65); transform: scale(1.08); }
  60% { box-shadow: 0 0 0 7px rgba(var(--ts-flash), 0); transform: scale(1); }
  100% { box-shadow: 0 0 0 0 rgba(var(--ts-flash), 0); transform: scale(1); }
`;

const livePulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, .55); }
  50% { box-shadow: 0 0 0 4px rgba(16, 185, 129, 0); }
`;

const shimmer = keyframes`
  0% { opacity: .45; }
  50% { opacity: .85; }
  100% { opacity: .45; }
`;

function hexToRgbTriplet(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

// ── Cell ────────────────────────────────────────────────────────────────────

interface CellViewProps {
  cell: TimesheetCell;
  code?: TimesheetCode;
  row: number;
  selected: boolean;
  active: boolean;
  flashing: boolean;
  pending: boolean;
  heat: boolean;
  compact: boolean;
  column: "weekend" | "holiday" | "today" | "plain";
}

const CellView = React.memo(function CellView({
  cell,
  code,
  row,
  selected,
  active,
  flashing,
  pending,
  heat,
  compact,
  column,
}: CellViewProps) {
  const theme = useTheme();
  const size = compact ? 30 : 34;
  const flags = cell.flags ?? [];
  const isOpen = flags.includes("open");
  const hours = compactHours(cell.hours);
  const planned = compactHours(cell.plannedHours);
  const manual = cell.source === "manual";

  let fill = "transparent";
  let border = "transparent";
  let ink: string = theme.palette.text.disabled;
  let letter = "";
  let sub = "";
  let pattern: string | undefined;
  let dashed = false;

  if (heat) {
    const level = heatLevel(cell.hours);
    if (level > 0) {
      fill = alpha(theme.palette.primary.main, level * (theme.palette.mode === "dark" ? 0.75 : 0.62));
      ink = level > 0.55 ? theme.palette.primary.contrastText : theme.palette.text.primary;
      letter = hours;
    } else if (code) {
      letter = code.letter;
      ink = alpha(codeInk(theme, code.color), 0.55);
    } else if (cell.state === "missing") {
      pattern = `repeating-linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.22)} 0 3px, transparent 3px 7px)`;
    }
  } else if (code) {
    fill = codeFill(theme, code.color);
    border = alpha(code.color, theme.palette.mode === "dark" ? 0.45 : 0.32);
    ink = codeInk(theme, code.color);
    letter = code.letter;
    sub = hours;
  } else if (cell.state === "missing") {
    pattern = `repeating-linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.24)} 0 3px, transparent 3px 7px)`;
    border = alpha(theme.palette.error.main, 0.45);
    dashed = true;
  } else if (cell.state === "pending") {
    border = alpha(theme.palette.primary.main, 0.6);
    dashed = true;
    ink = theme.palette.primary.main;
    letter = "•";
  } else if (cell.state === "planned") {
    border = subtleBorder(theme);
    dashed = true;
    sub = planned;
  }

  const columnTint =
    column === "today"
      ? alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.1 : 0.06)
      : column === "holiday"
        ? alpha("#ec4899", theme.palette.mode === "dark" ? 0.08 : 0.05)
        : column === "weekend"
          ? subtleBg(theme)
          : "transparent";

  const flashRgb = hexToRgbTriplet(theme.palette.primary.main);

  return (
    <Box
      data-cell=""
      data-row={row}
      data-day={cell.day}
      sx={{
        height: compact ? 38 : 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: selected ? alpha(theme.palette.primary.main, 0.1) : columnTint,
        borderBottom: `1px solid ${subtleBorder(theme)}`,
        cursor: "cell",
        position: "relative",
        userSelect: "none",
      }}
    >
      <Box
        sx={{
          "--ts-flash": flashRgb,
          width: size,
          height: size,
          borderRadius: "9px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
          position: "relative",
          bgcolor: fill,
          backgroundImage: pattern,
          border: `1px ${dashed ? "dashed" : "solid"} ${border}`,
          color: ink,
          outline: active
            ? `2px solid ${theme.palette.primary.main}`
            : selected
              ? `2px solid ${alpha(theme.palette.primary.main, 0.7)}`
              : "none",
          outlineOffset: 1,
          transition: "background-color .18s ease, transform .12s ease, outline-color .12s ease",
          animation: flashing
            ? `${flash} 1.2s ease-out`
            : pending
              ? `${shimmer} 1s ease-in-out infinite`
              : isOpen
                ? `${livePulse} 1.8s ease-in-out infinite`
                : undefined,
          "[data-cell]:hover > &": { transform: "translateY(-1px)" },
        }}
      >
        {letter && (
          <Typography
            component="span"
            sx={{
              fontSize: heat ? (compact ? 11 : 12) : compact ? 12 : 13,
              fontWeight: 800,
              letterSpacing: -0.2,
              color: "inherit",
              lineHeight: 1,
            }}
          >
            {letter}
          </Typography>
        )}
        {sub && (
          <Typography
            component="span"
            sx={{
              fontSize: compact ? 9 : 9.5,
              fontWeight: 600,
              color: cell.state === "planned" ? "text.disabled" : "inherit",
              opacity: cell.state === "planned" ? 1 : 0.85,
              mt: letter ? "2px" : 0,
              lineHeight: 1,
            }}
          >
            {sub}
          </Typography>
        )}
        {manual && (
          <Box
            sx={{
              position: "absolute",
              top: 2,
              right: 2,
              width: 5,
              height: 5,
              borderRadius: "50%",
              bgcolor: theme.palette.primary.main,
              boxShadow: `0 0 0 1.5px ${theme.palette.background.paper}`,
            }}
          />
        )}
        {flags.includes("request") && (
          <Box
            sx={{
              position: "absolute",
              bottom: 2,
              right: 2,
              width: 5,
              height: 5,
              borderRadius: "50%",
              bgcolor: theme.palette.warning.main,
              boxShadow: `0 0 0 1.5px ${theme.palette.background.paper}`,
            }}
          />
        )}
        {(cell.overtimeMinutes ?? 0) > 0 && (
          <Box
            sx={{
              position: "absolute",
              top: -1,
              left: 5,
              right: 5,
              height: 2,
              borderRadius: 2,
              bgcolor: theme.palette.warning.main,
            }}
          />
        )}
        {(cell.earlyMinutes ?? 0) > 0 && (
          <Box
            sx={{
              position: "absolute",
              bottom: -1,
              left: 5,
              right: 5,
              height: 2,
              borderRadius: 2,
              bgcolor: theme.palette.error.main,
            }}
          />
        )}
        {toNumber(cell.nightHours) > 0 && !compact && (
          <NightlightOutlined
            sx={{ position: "absolute", top: 1, left: 1, fontSize: 9, opacity: 0.7 }}
          />
        )}
      </Box>
    </Box>
  );
});

// ── Tooltip ─────────────────────────────────────────────────────────────────

function CellTooltip({
  anchor,
  cell,
  code,
  employeeName,
  dateLabel,
}: {
  anchor: HTMLElement | null;
  cell?: TimesheetCell;
  code?: TimesheetCode;
  employeeName?: string;
  dateLabel?: string;
}) {
  const theme = useTheme();
  if (!anchor || !cell) return null;
  const lines: string[] = [];
  const stateLabel: Record<string, string> = {
    missing: "Пропуск: по графику рабочий день, отметок нет",
    pending: "Сегодня: ещё может отметиться",
    planned: "По графику рабочий день",
  };
  if (cell.state) lines.push(stateLabel[cell.state] ?? cell.state);
  if (cell.hours) {
    const night = toNumber(cell.nightHours);
    lines.push(`Отработано ${formatHours(cell.hours)} ч${night ? `, из них ночью ${formatHours(cell.nightHours)} ч` : ""}`);
  }
  if (cell.plannedHours) lines.push(`По графику ${formatHours(cell.plannedHours)} ч`);
  if (cell.source === "manual") {
    lines.push(
      cell.skudHours
        ? `Ручная отметка (СКУД: ${formatHours(cell.skudHours)} ч)`
        : "Ручная отметка",
    );
  } else if (cell.source === "skud") lines.push("Из СКУД");
  else if (cell.source === "schedule") lines.push("Из расписания");
  if ((cell.overtimeMinutes ?? 0) > 0) lines.push(`Переработка ${formatMinutes(cell.overtimeMinutes ?? 0)}`);
  if ((cell.earlyMinutes ?? 0) > 0) lines.push(`Ушёл раньше на ${formatMinutes(cell.earlyMinutes ?? 0)}`);
  const flags = cell.flags ?? [];
  if (flags.includes("open")) lines.push("Сейчас на смене");
  if (flags.includes("holiday") && code?.key !== "holiday") lines.push("Праздничный день");
  if (flags.includes("request")) lines.push("Есть заявка на исправление");
  if (flags.includes("comment")) lines.push("Есть комментарий");
  if (flags.includes("anomalous")) lines.push("Смена длиннее 36 часов");

  return (
    <Popper
      open
      anchorEl={anchor}
      placement="top"
      modifiers={[{ name: "offset", options: { offset: [0, 6] } }]}
      sx={{ zIndex: theme.zIndex.tooltip, pointerEvents: "none" }}
    >
      <Box
        sx={{
          px: 1.25,
          py: 1,
          borderRadius: "10px",
          bgcolor: theme.palette.mode === "dark" ? "#1c2026" : "#0f1720",
          color: "#f8fafc",
          boxShadow: "0 12px 32px rgba(0,0,0,.28)",
          maxWidth: 260,
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: lines.length ? 0.5 : 0 }}>
          {code && (
            <Box
              sx={{
                minWidth: 22,
                height: 22,
                px: 0.5,
                borderRadius: "6px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 800,
                bgcolor: alpha(code.color, 0.3),
                color: lighten(code.color, 0.35),
              }}
            >
              {code.letter}
            </Box>
          )}
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.2 }} noWrap>
              {code ? code.name : employeeName}
            </Typography>
            <Typography sx={{ fontSize: 11, opacity: 0.7, lineHeight: 1.2 }} noWrap>
              {code ? `${employeeName} · ${dateLabel}` : dateLabel}
            </Typography>
          </Box>
        </Stack>
        {lines.map((line) => (
          <Typography key={line} sx={{ fontSize: 11.5, opacity: 0.9, lineHeight: 1.45 }}>
            {line}
          </Typography>
        ))}
      </Box>
    </Popper>
  );
}

// ── Grid ────────────────────────────────────────────────────────────────────

export interface TotalsColumn {
  key: string;
  label: string;
  hint: string;
  value: (row: TimesheetRow) => string | number;
  tone?: (row: TimesheetRow) => "error" | "warning" | "success" | null;
}

export interface TimesheetGridProps {
  rows: TimesheetRow[];
  days: TimesheetDay[];
  codes: Map<string, TimesheetCode>;
  daily: TimesheetDayStat[];
  viewMode: TimesheetViewMode;
  selection: Set<CellKey>;
  active: GridPoint | null;
  flashing: Set<CellKey>;
  pending: Set<CellKey>;
  compact: boolean;
  totals: TotalsColumn[];
  monthGenitive: string;
  highlightEmployeeId?: number | null;
  onCellPointerDown: (point: GridPoint, event: React.MouseEvent) => void;
  onCellPointerEnter: (point: GridPoint) => void;
  onCellOpen: (point: GridPoint) => void;
  onRowSelect: (rowIndex: number, event: React.MouseEvent) => void;
  onDaySelect: (day: number, event: React.MouseEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  gridRef?: React.Ref<HTMLDivElement>;
  footer?: React.ReactNode;
}

const NAME_WIDTH = 248;
const NAME_WIDTH_COMPACT = 136;
const DAY_WIDTH = 42;
const DAY_WIDTH_COMPACT = 36;
const TOTAL_WIDTH = 54;

function pointFromEvent(event: React.MouseEvent): GridPoint | null {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
  if (!target) return null;
  const row = Number(target.dataset.row);
  const day = Number(target.dataset.day);
  if (!Number.isFinite(row) || !Number.isFinite(day)) return null;
  return { row, day };
}

export const TimesheetGrid: React.FC<TimesheetGridProps> = ({
  rows,
  days,
  codes,
  daily,
  viewMode,
  selection,
  active,
  flashing,
  pending,
  compact,
  totals,
  monthGenitive,
  highlightEmployeeId,
  onCellPointerDown,
  onCellPointerEnter,
  onCellOpen,
  onRowSelect,
  onDaySelect,
  onKeyDown,
  gridRef,
  footer,
}) => {
  const theme = useTheme();
  const [hover, setHover] = React.useState<{ el: HTMLElement; row: number; day: number } | null>(null);
  const hoverTimer = React.useRef<number | undefined>(undefined);
  const nameWidth = compact ? NAME_WIDTH_COMPACT : NAME_WIDTH;
  const dayWidth = compact ? DAY_WIDTH_COMPACT : DAY_WIDTH;
  const stickyTotals = !compact;

  const dayColumns = React.useMemo(
    () =>
      days.map((day) => ({
        ...day,
        column: (day.isToday
          ? "today"
          : day.holiday
            ? "holiday"
            : day.isWeekend
              ? "weekend"
              : "plain") as CellViewProps["column"],
      })),
    [days],
  );
  const dailyByDay = React.useMemo(() => new Map(daily.map((d) => [d.day, d])), [daily]);

  const templateColumns = `${nameWidth}px repeat(${days.length}, ${dayWidth}px) repeat(${totals.length}, ${TOTAL_WIDTH}px)`;

  const stickyRight = (index: number) =>
    stickyTotals ? { position: "sticky" as const, right: (totals.length - 1 - index) * TOTAL_WIDTH, zIndex: 1 } : {};

  const headerCellSx = {
    position: "sticky" as const,
    top: 0,
    zIndex: 2,
    bgcolor: "background.paper",
    borderBottom: `1px solid ${subtleBorder(theme)}`,
  };

  const handleMouseOver = (event: React.MouseEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    window.clearTimeout(hoverTimer.current);
    if (!target) {
      hoverTimer.current = window.setTimeout(() => setHover(null), 80);
      return;
    }
    const point = pointFromEvent(event);
    if (point) {
      onCellPointerEnter(point);
      hoverTimer.current = window.setTimeout(
        () => setHover({ el: target, row: point.row, day: point.day }),
        260,
      );
    }
  };

  const hoverRow = hover ? rows[hover.row] : undefined;
  const hoverCell = hoverRow?.cells.find((c) => c.day === hover?.day);

  return (
    <Box
      ref={gridRef}
      tabIndex={0}
      role="grid"
      aria-label="Табель"
      onKeyDown={onKeyDown}
      onMouseDown={(event) => {
        const point = pointFromEvent(event);
        if (point && event.button === 0) {
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus({ preventScroll: true });
          onCellPointerDown(point, event);
        }
      }}
      onMouseOver={handleMouseOver}
      onMouseLeave={() => {
        window.clearTimeout(hoverTimer.current);
        setHover(null);
      }}
      onDoubleClick={(event) => {
        const point = pointFromEvent(event);
        if (point) onCellOpen(point);
      }}
      sx={{
        position: "relative",
        overflow: "auto",
        maxHeight: compact ? "calc(100dvh - 220px)" : "calc(100vh - 300px)",
        minHeight: 280,
        borderRadius: "14px",
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        outline: "none",
        "&:focus-visible": { boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.25)}` },
        overscrollBehavior: "contain",
      }}
    >
      <Box sx={{ display: "grid", gridTemplateColumns: templateColumns, width: "max-content", minWidth: "100%" }}>
        {/* Header row */}
        <Box
          sx={{
            ...headerCellSx,
            left: 0,
            zIndex: 4,
            px: compact ? 1 : 2,
            display: "flex",
            alignItems: "center",
            borderRight: `1px solid ${subtleBorder(theme)}`,
          }}
        >
          <Typography variant="caption" color="text.secondary" fontWeight={700}>
            Сотрудник
          </Typography>
        </Box>
        {dayColumns.map((day) => (
          <Box
            key={day.day}
            onClick={(event) => onDaySelect(day.day, event)}
            sx={{
              ...headerCellSx,
              height: compact ? 44 : 52,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "2px",
              cursor: "pointer",
              bgcolor: day.column === "today" ? alpha(theme.palette.primary.main, 0.08) : "background.paper",
              "&:hover .ts-day-num": { bgcolor: alpha(theme.palette.primary.main, 0.12) },
            }}
            title={day.holiday ? `${day.day} ${monthGenitive} — ${day.holiday}` : undefined}
          >
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.3,
                color: day.holiday ? "#ec4899" : day.isWeekend ? "error.main" : "text.secondary",
                opacity: day.isWeekend || day.holiday ? 0.9 : 0.75,
              }}
            >
              {WEEKDAY_SHORT[day.weekday]}
            </Typography>
            <Box
              className="ts-day-num"
              sx={{
                minWidth: 24,
                height: 22,
                px: 0.5,
                borderRadius: "7px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12.5,
                fontWeight: 800,
                transition: "background-color .15s ease",
                color: day.column === "today" ? "primary.contrastText" : "text.primary",
                bgcolor: day.column === "today" ? "primary.main" : "transparent",
                boxShadow:
                  day.column === "today" ? `0 4px 12px ${alpha(theme.palette.primary.main, 0.45)}` : "none",
              }}
            >
              {day.day}
            </Box>
            {day.holiday && (
              <Box sx={{ width: 4, height: 4, borderRadius: "50%", bgcolor: "#ec4899", mt: "1px" }} />
            )}
          </Box>
        ))}
        {totals.map((column, index) => (
          <Box
            key={column.key}
            title={column.hint}
            sx={{
              ...headerCellSx,
              ...stickyRight(index),
              zIndex: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderLeft: index === 0 ? `1px solid ${subtleBorder(theme)}` : undefined,
              bgcolor: subtleBg(theme, true),
              backdropFilter: "blur(8px)",
            }}
          >
            <Typography sx={{ fontSize: 10.5, fontWeight: 800, color: "text.secondary", letterSpacing: 0.2 }}>
              {column.label}
            </Typography>
          </Box>
        ))}

        {/* Body */}
        {rows.map((row, rowIndex) => {
          const employee = row.employee;
          const planned = toNumber(row.totals.plannedHours);
          const worked = toNumber(row.totals.hours);
          const progress = planned > 0 ? Math.min(1, worked / planned) : worked > 0 ? 1 : 0;
          const highlight = highlightEmployeeId === employee.id;
          return (
            <React.Fragment key={employee.id}>
              <Box
                onClick={(event) => onRowSelect(rowIndex, event)}
                sx={{
                  position: "sticky",
                  left: 0,
                  zIndex: 1,
                  px: compact ? 1 : 1.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  minWidth: 0,
                  cursor: "pointer",
                  bgcolor: highlight ? alpha(theme.palette.primary.main, 0.06) : "background.paper",
                  borderRight: `1px solid ${subtleBorder(theme)}`,
                  borderBottom: `1px solid ${subtleBorder(theme)}`,
                  "&:hover": { bgcolor: subtleBg(theme, true) },
                }}
              >
                {!compact && <UserAvatar src={employee.photoUrl} name={employee.fullName} size={30} />}
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Typography
                      noWrap
                      sx={{ fontSize: compact ? 12 : 13, fontWeight: 700, letterSpacing: -0.1, minWidth: 0 }}
                      title={employee.fullName}
                    >
                      {employee.fullName}
                    </Typography>
                    {employee.locked && <LockOutlined sx={{ fontSize: 12, color: "text.disabled" }} />}
                  </Stack>
                  {!compact && (
                    <Typography noWrap sx={{ fontSize: 11, color: "text.secondary", lineHeight: 1.3 }}>
                      {employee.roleName || employee.specializations[0] || employee.branchName || "—"}
                    </Typography>
                  )}
                  <Box
                    sx={{
                      mt: 0.5,
                      height: 3,
                      borderRadius: 3,
                      bgcolor: subtleBg(theme, true),
                      overflow: "hidden",
                    }}
                    title={planned ? `${formatHours(worked)} из ${formatHours(planned)} ч по графику` : undefined}
                  >
                    <Box
                      sx={{
                        width: `${Math.round(progress * 100)}%`,
                        height: "100%",
                        borderRadius: 3,
                        background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${alpha(theme.palette.success.main, 0.9)})`,
                        transition: "width .6s cubic-bezier(.22,1,.36,1)",
                      }}
                    />
                  </Box>
                </Box>
              </Box>
              {row.cells.map((cell) => {
                const key = cellKey(employee.id, cell.day);
                const column = dayColumns[cell.day - 1]?.column ?? "plain";
                return (
                  <CellView
                    key={cell.day}
                    cell={cell}
                    code={cell.code ? codes.get(cell.code) : undefined}
                    row={rowIndex}
                    selected={selection.has(key)}
                    active={active?.row === rowIndex && active.day === cell.day}
                    flashing={flashing.has(key)}
                    pending={pending.has(key)}
                    heat={viewMode === "heat"}
                    compact={compact}
                    column={column}
                  />
                );
              })}
              {totals.map((column, index) => {
                const tone = column.tone?.(row) ?? null;
                return (
                  <Box
                    key={column.key}
                    sx={{
                      ...stickyRight(index),
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderBottom: `1px solid ${subtleBorder(theme)}`,
                      borderLeft: index === 0 ? `1px solid ${subtleBorder(theme)}` : undefined,
                      bgcolor: theme.palette.background.paper,
                      backgroundImage: `linear-gradient(${subtleBg(theme)}, ${subtleBg(theme)})`,
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        color: tone ? `${tone}.main` : "text.primary",
                      }}
                    >
                      {column.value(row)}
                    </Typography>
                  </Box>
                );
              })}
            </React.Fragment>
          );
        })}

        {/* Footer: who is present each day */}
        {rows.length > 0 && (
          <>
            <Box
              sx={{
                position: "sticky",
                left: 0,
                bottom: 0,
                zIndex: 3,
                px: compact ? 1 : 2,
                py: 1,
                display: "flex",
                alignItems: "center",
                bgcolor: "background.paper",
                borderTop: `1px solid ${subtleBorder(theme)}`,
                borderRight: `1px solid ${subtleBorder(theme)}`,
              }}
            >
              <Typography variant="caption" fontWeight={700} color="text.secondary">
                Явка по дням
              </Typography>
            </Box>
            {dayColumns.map((day) => {
              const stat = dailyByDay.get(day.day);
              const ratio = stat && stat.planned ? Math.min(1, stat.present / stat.planned) : 0;
              return (
                <Box
                  key={day.day}
                  sx={{
                    position: "sticky",
                    bottom: 0,
                    zIndex: 2,
                    height: 40,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    pb: 0.75,
                    gap: "3px",
                    bgcolor: "background.paper",
                    borderTop: `1px solid ${subtleBorder(theme)}`,
                  }}
                  title={stat ? `Явка ${stat.present} из ${stat.planned} по графику, пропусков ${stat.missing}` : undefined}
                >
                  <Box
                    sx={{
                      width: 6,
                      height: 16,
                      borderRadius: 4,
                      bgcolor: subtleBg(theme, true),
                      display: "flex",
                      alignItems: "flex-end",
                      overflow: "hidden",
                    }}
                  >
                    <Box
                      sx={{
                        width: "100%",
                        height: `${Math.round(ratio * 100)}%`,
                        bgcolor: stat?.missing ? "warning.main" : "success.main",
                        borderRadius: 4,
                        transition: "height .5s ease",
                      }}
                    />
                  </Box>
                  <Typography sx={{ fontSize: 10, fontWeight: 700, color: "text.secondary", lineHeight: 1 }}>
                    {stat?.present ?? 0}
                  </Typography>
                </Box>
              );
            })}
            {totals.map((column, index) => (
              <Box
                key={column.key}
                sx={{
                  ...stickyRight(index),
                  position: "sticky",
                  bottom: 0,
                  zIndex: 3,
                  bgcolor: "background.paper",
                  borderTop: `1px solid ${subtleBorder(theme)}`,
                  borderLeft: index === 0 ? `1px solid ${subtleBorder(theme)}` : undefined,
                }}
              />
            ))}
          </>
        )}
      </Box>
      {footer}
      <CellTooltip
        anchor={hover?.el ?? null}
        cell={hoverCell}
        code={hoverCell?.code ? codes.get(hoverCell.code) : undefined}
        employeeName={hoverRow?.employee.fullName}
        dateLabel={hover ? `${hover.day} ${monthGenitive}` : undefined}
      />
    </Box>
  );
};

export default TimesheetGrid;
