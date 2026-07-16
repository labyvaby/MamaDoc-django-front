import React from "react";
import { Box, Chip, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import dayjs, { type Dayjs } from "dayjs";

import { UserAvatar } from "../../../components/ui";
import type { DjangoEmployeeListItem } from "../../../api/staff";
import type { DayOccurrence } from "./occurrences";
import { employeeColorHex } from "./employeeColors";
import { namesFromOccurrences, occurrencesOf, useCollapsedGroups, useResourceGroups } from "./resourceRows";

const NAME_COL_W = 210;
const DAY_COL_MIN_W = 96;
const ROW_H = 44;
const HEADER_H = 36;

const shortTime = (t: string) => {
  const [hh, mm] = t.split(":");
  const h = String(parseInt(hh, 10));
  return mm === "00" ? h : `${h}:${mm}`;
};

export interface ScheduleWeekResourceGridProps {
  /** 7 дней недели (Пн…Вс). */
  week: Dayjs[];
  employees: DjangoEmployeeListItem[];
  /** Смены по дате: "YYYY-MM-DD" → occurrences. */
  occurrencesByDate: Map<string, DayOccurrence[]>;
  employeeColorMap: Map<number, number>;
  onDayClick?: (day: Dayjs) => void;
}

const ScheduleWeekResourceGrid: React.FC<ScheduleWeekResourceGridProps> = ({
  week,
  employees,
  occurrencesByDate,
  employeeColorMap,
  onDayClick,
}) => {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const today = dayjs();
  const { collapsed, toggle } = useCollapsedGroups();

  const weekOccurrences = React.useMemo(
    () => week.flatMap((d) => occurrencesByDate.get(d.format("YYYY-MM-DD")) ?? []),
    [week, occurrencesByDate],
  );
  const employeeIdsWithShifts = React.useMemo(
    () => new Set(weekOccurrences.map((o) => o.employeeId)),
    [weekOccurrences],
  );
  const namesById = React.useMemo(() => namesFromOccurrences(weekOccurrences), [weekOccurrences]);
  const groups = useResourceGroups(employees, employeeIdsWithShifts, namesById);

  const colorOf = React.useCallback(
    // ?? employeeId — сотрудника может не быть в справочнике (см. resourceRows).
    (employeeId: number) => employeeColorHex(employeeColorMap.get(employeeId) ?? employeeId, mode),
    [employeeColorMap, mode],
  );

  if (groups.length === 0) {
    return (
      <Typography color="text.disabled" align="center" sx={{ py: 6 }}>
        На этой неделе смен нет
      </Typography>
    );
  }

  const gridCols = `${NAME_COL_W}px repeat(7, minmax(${DAY_COL_MIN_W}px, 1fr))`;

  return (
    <Box sx={{ overflow: "auto", height: "100%" }}>
      <Box sx={{ display: "grid", gridTemplateColumns: gridCols, minWidth: NAME_COL_W + 7 * DAY_COL_MIN_W }}>
        {/* ── Шапка ── */}
        <Box
          sx={{
            position: "sticky",
            top: 0,
            left: 0,
            zIndex: 4,
            height: HEADER_H,
            display: "flex",
            alignItems: "center",
            px: 1.5,
            bgcolor: "background.paper",
            borderBottom: "2px solid",
            borderRight: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="caption" fontWeight={700} color="text.secondary">
            Сотрудник
          </Typography>
        </Box>
        {week.map((d, di) => {
          const isToday = d.isSame(today, "day");
          return (
            <Box
              key={d.format("YYYY-MM-DD")}
              onClick={() => onDayClick?.(d)}
              sx={{
                position: "sticky",
                top: 0,
                zIndex: 3,
                height: HEADER_H,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: onDayClick ? "pointer" : "default",
                bgcolor: isToday ? alpha(theme.palette.primary.main, 0.1) : "background.paper",
                borderBottom: "2px solid",
                borderLeft: "1px solid",
                borderColor: "divider",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Typography
                sx={{
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: di >= 5 ? "error.main" : "text.secondary",
                  lineHeight: 1.1,
                }}
              >
                {d.format("dd")} {d.format("D")}
              </Typography>
            </Box>
          );
        })}

        {/* ── Группы и строки ── */}
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.key);
          return (
            <React.Fragment key={group.key}>
              <Box
                onClick={() => toggle(group.key)}
                sx={{
                  gridColumn: "1 / -1",
                  position: "sticky",
                  left: 0,
                  zIndex: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  px: 1,
                  py: 0.5,
                  cursor: "pointer",
                  bgcolor: "action.hover",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  "&:hover": { bgcolor: "action.selected" },
                }}
              >
                {isCollapsed ? (
                  <ChevronRightOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
                ) : (
                  <ExpandMoreOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
                )}
                <Typography variant="caption" fontWeight={700} color="text.secondary">
                  {group.label}
                </Typography>
                <Chip label={group.rows.length} size="small" sx={{ height: 16, fontSize: "0.62rem", fontWeight: 700 }} />
              </Box>

              {!isCollapsed &&
                group.rows.map(({ employee }) => {
                  const c = colorOf(employee.id);
                  return (
                    <React.Fragment key={employee.id}>
                      <Box
                        sx={{
                          position: "sticky",
                          left: 0,
                          zIndex: 2,
                          minHeight: ROW_H,
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          px: 1.5,
                          bgcolor: "background.paper",
                          borderBottom: "1px solid",
                          borderRight: "1px solid",
                          borderColor: "divider",
                        }}
                      >
                        <UserAvatar name={employee.fullName} src={employee.photoUrl} size={24} />
                        <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
                          {employee.fullName}
                        </Typography>
                      </Box>

                      {week.map((d, di) => {
                        const dayOccs = occurrencesOf(
                          occurrencesByDate.get(d.format("YYYY-MM-DD")) ?? [],
                          employee.id,
                        );
                        const isToday = d.isSame(today, "day");
                        return (
                          <Box
                            key={d.format("YYYY-MM-DD")}
                            onClick={() => onDayClick?.(d)}
                            sx={{
                              minHeight: ROW_H,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 0.25,
                              px: 0.5,
                              py: 0.5,
                              cursor: onDayClick ? "pointer" : "default",
                              borderBottom: "1px solid",
                              borderLeft: "1px solid",
                              borderColor: "divider",
                              bgcolor: isToday
                                ? alpha(theme.palette.primary.main, 0.04)
                                : di >= 5
                                ? alpha(theme.palette.error.main, 0.02)
                                : "transparent",
                              "&:hover": { bgcolor: "action.hover" },
                            }}
                          >
                            {dayOccs.length === 0 ? (
                              <Typography sx={{ fontSize: "0.75rem", color: "text.disabled" }}>—</Typography>
                            ) : (
                              dayOccs.map((occ) => (
                                <Tooltip
                                  key={`${occ.kind}_${occ.sourceId}_${occ.startTime}`}
                                  title={`${occ.startTime}–${occ.endTime}${occ.kind === "extra" ? " (доп. смена)" : ""}`}
                                  arrow
                                >
                                  <Box
                                    sx={{
                                      width: "100%",
                                      textAlign: "center",
                                      borderRadius: "4px",
                                      px: 0.5,
                                      py: "1px",
                                      // Сплошная заливка вместо полупрозрачной:
                                      // на тёмном фоне тинты жёлтого/оранжевого
                                      // выглядели грязно-бурыми и одинаковыми
                                      // (жалоба заказчика 14.07.2026).
                                      bgcolor: c,
                                      border:
                                        occ.kind === "extra"
                                          ? `1.5px dashed ${theme.palette.background.paper}`
                                          : undefined,
                                    }}
                                  >
                                    <Typography
                                      noWrap
                                      sx={{
                                        fontSize: "0.7rem",
                                        fontWeight: 600,
                                        color: theme.palette.getContrastText(c),
                                        fontVariantNumeric: "tabular-nums",
                                      }}
                                    >
                                      {shortTime(occ.startTime)}–{shortTime(occ.endTime)}
                                    </Typography>
                                  </Box>
                                </Tooltip>
                              ))
                            )}
                          </Box>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
            </React.Fragment>
          );
        })}
      </Box>
    </Box>
  );
};

export default ScheduleWeekResourceGrid;
