import React from "react";
import { Box, Chip, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import dayjs, { type Dayjs } from "dayjs";

import { UserAvatar } from "../../../components/ui";
import type { DjangoEmployeeListItem } from "../../../api/staff";
import type { DayOccurrence } from "./occurrences";
import { employeeColorHex } from "./employeeColors";
import { namesFromOccurrences, occurrencesOf, useCollapsedGroups, useResourceGroups } from "./resourceRows";

// ── Геометрия ────────────────────────────────────────────────────────────────

const DAY_START_MIN = 7 * 60;
const DAY_END_MIN = 22 * 60;
const DAY_DURATION = DAY_END_MIN - DAY_START_MIN;
const HOURS = Array.from({ length: 16 }, (_, i) => 7 + i); // 7..22

const NAME_COL_W = 210;
const ROW_H = 40;
const HEADER_H = 32;
/** Ширина часа: при 16 часах даёт ~1150px — влезает без скролла на десктопе. */
const HOUR_W = 72;
const BODY_W = (HOURS.length - 1) * HOUR_W;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const parseTimeToMinutes = (t: string): number => {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)/.exec(t);
  if (!m) return DAY_START_MIN;
  return clamp(parseInt(m[1], 10) * 60 + parseInt(m[2], 10), 0, 1439);
};

const leftPx = (min: number) =>
  ((clamp(min, DAY_START_MIN, DAY_END_MIN) - DAY_START_MIN) / DAY_DURATION) * BODY_W;

const shortTime = (t: string) => {
  const [hh, mm] = t.split(":");
  const h = String(parseInt(hh, 10));
  return mm === "00" ? h : `${h}:${mm}`;
};

// ── Props ────────────────────────────────────────────────────────────────────

export interface ScheduleDayTimelineProps {
  day: Dayjs;
  employees: DjangoEmployeeListItem[];
  occurrences: DayOccurrence[];
  employeeColorMap: Map<number, number>;
  onEmployeeClick?: (employeeId: number) => void;
}

const ScheduleDayTimeline: React.FC<ScheduleDayTimelineProps> = ({
  day,
  employees,
  occurrences,
  employeeColorMap,
  onEmployeeClick,
}) => {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const { collapsed, toggle } = useCollapsedGroups();

  const employeeIdsWithShifts = React.useMemo(
    () => new Set(occurrences.map((o) => o.employeeId)),
    [occurrences],
  );
  const namesById = React.useMemo(() => namesFromOccurrences(occurrences), [occurrences]);
  const groups = useResourceGroups(employees, employeeIdsWithShifts, namesById);

  const colorOf = React.useCallback(
    // ?? employeeId — сотрудника может не быть в справочнике (см. resourceRows).
    (employeeId: number) => employeeColorHex(employeeColorMap.get(employeeId) ?? employeeId, mode),
    [employeeColorMap, mode],
  );

  // Линия «сейчас» — только для сегодняшнего дня и внутри рабочего окна.
  const now = dayjs();
  const nowMin = now.hour() * 60 + now.minute();
  const showNow = day.isSame(now, "day") && nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN;
  const nowLeft = showNow ? leftPx(nowMin) : 0;

  // Вертикальные направляющие: часовые (сплошные, идут через шапку и строки —
  // связывают полосу смены с меткой часа наверху) и получасовые (пунктир, слабее)
  // для точной привязки смен, оканчивающихся на :30.
  const { hourLines, halfLines } = React.useMemo(() => {
    const hour: number[] = [];
    const half: number[] = [];
    for (let m = DAY_START_MIN + 30; m < DAY_END_MIN; m += 30) {
      (m % 60 === 0 ? hour : half).push(leftPx(m));
    }
    return { hourLines: hour, halfLines: half };
  }, []);

  // Общая сетка направляющих (используется в шапке и в дорожке каждой строки).
  const gridLines = (
    <>
      {halfLines.map((x) => (
        <Box
          key={`half-${x}`}
          sx={{
            position: "absolute",
            left: x,
            top: 0,
            bottom: 0,
            borderLeft: "1px dashed",
            borderColor: "divider",
            opacity: 0.3,
            pointerEvents: "none",
          }}
        />
      ))}
      {hourLines.map((x) => (
        <Box
          key={`hour-${x}`}
          sx={{
            position: "absolute",
            left: x,
            top: 0,
            bottom: 0,
            width: "1px",
            bgcolor: "divider",
            opacity: 0.7,
            pointerEvents: "none",
          }}
        />
      ))}
    </>
  );

  if (groups.length === 0) {
    return (
      <Typography color="text.disabled" align="center" sx={{ py: 6 }}>
        В этот день смен нет
      </Typography>
    );
  }

  return (
    <Box sx={{ overflow: "auto", height: "100%" }}>
      <Box sx={{ display: "grid", gridTemplateColumns: `${NAME_COL_W}px ${BODY_W}px`, minWidth: "fit-content" }}>
        {/* ── Шапка: угол + шкала часов (липкая по вертикали) ── */}
        <Box
          sx={{
            position: "sticky",
            top: 0,
            left: 0,
            zIndex: 4,
            height: HEADER_H,
            bgcolor: "background.paper",
            borderBottom: "1px solid",
            borderRight: "1px solid",
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            px: 1.5,
          }}
        >
          <Typography variant="caption" fontWeight={700} color="text.secondary" noWrap>
            Сотрудник
          </Typography>
        </Box>
        <Box
          sx={{
            position: "sticky",
            top: 0,
            zIndex: 3,
            height: HEADER_H,
            bgcolor: "background.paper",
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box sx={{ position: "relative", height: "100%" }}>
            {/* Часовые направляющие в шапке — визуально продолжаются в строках */}
            {hourLines.map((x) => (
              <Box
                key={`head-${x}`}
                sx={{
                  position: "absolute",
                  left: x,
                  top: "55%",
                  bottom: 0,
                  width: "1px",
                  bgcolor: "divider",
                  opacity: 0.7,
                  pointerEvents: "none",
                }}
              />
            ))}
            {showNow && (
              <Box
                sx={{
                  position: "absolute",
                  left: nowLeft,
                  top: 4,
                  bottom: 0,
                  width: "2px",
                  bgcolor: "error.main",
                  zIndex: 1,
                }}
              />
            )}
            {HOURS.slice(0, -1).map((h, i) => (
              <Typography
                key={h}
                sx={{
                  position: "absolute",
                  left: i * HOUR_W,
                  top: "50%",
                  transform: "translateY(-50%)",
                  pl: 0.75,
                  fontSize: "0.68rem",
                  color: "text.disabled",
                  fontVariantNumeric: "tabular-nums",
                  userSelect: "none",
                }}
              >
                {h}:00
              </Typography>
            ))}
          </Box>
        </Box>

        {/* ── Строки: группы и врачи ── */}
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.key);
          return (
            <React.Fragment key={group.key}>
              {/* Заголовок группы — на всю ширину */}
              <Box
                onClick={() => toggle(group.key)}
                sx={{
                  position: "sticky",
                  left: 0,
                  zIndex: 2,
                  gridColumn: "1 / -1",
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  px: 1,
                  py: 0.5,
                  cursor: "pointer",
                  bgcolor: "action.hover",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  width: NAME_COL_W + BODY_W,
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
                <Chip
                  label={group.rows.length}
                  size="small"
                  sx={{ height: 16, fontSize: "0.62rem", fontWeight: 700 }}
                />
              </Box>

              {!isCollapsed &&
                group.rows.map(({ employee }) => {
                  const rowOccs = occurrencesOf(occurrences, employee.id);
                  const c = colorOf(employee.id);
                  return (
                    <React.Fragment key={employee.id}>
                      {/* Липкая колонка имени */}
                      <Box
                        onClick={() => onEmployeeClick?.(employee.id)}
                        sx={{
                          position: "sticky",
                          left: 0,
                          zIndex: 2,
                          height: ROW_H,
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          px: 1.5,
                          bgcolor: "background.paper",
                          borderBottom: "1px solid",
                          borderRight: "1px solid",
                          borderColor: "divider",
                          cursor: onEmployeeClick ? "pointer" : "default",
                          "&:hover": { bgcolor: "action.hover" },
                        }}
                      >
                        <UserAvatar name={employee.fullName} src={employee.photoUrl} size={24} />
                        <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
                          {employee.fullName}
                        </Typography>
                      </Box>

                      {/* Дорожка времени */}
                      <Box
                        sx={{
                          position: "relative",
                          height: ROW_H,
                          borderBottom: "1px solid",
                          borderColor: "divider",
                        }}
                      >
                        {/* Часовые + получасовые направляющие */}
                        {gridLines}
                        {showNow && (
                          <Box
                            sx={{
                              position: "absolute",
                              left: nowLeft,
                              top: 0,
                              bottom: 0,
                              width: "2px",
                              bgcolor: "error.main",
                              opacity: 0.7,
                              zIndex: 1,
                            }}
                          />
                        )}
                        {rowOccs.map((occ) => {
                          const start = parseTimeToMinutes(occ.startTime);
                          const end = parseTimeToMinutes(occ.endTime);
                          const l = leftPx(start);
                          const w = Math.max(leftPx(end) - l, 6);
                          return (
                            <Tooltip
                              key={`${occ.kind}_${occ.sourceId}_${occ.startTime}`}
                              title={`${occ.employeeName}: ${occ.startTime}–${occ.endTime}${occ.kind === "extra" ? " (доп.)" : ""}`}
                              arrow
                            >
                              <Box
                                sx={{
                                  position: "absolute",
                                  left: l,
                                  width: w,
                                  top: 5,
                                  bottom: 5,
                                  zIndex: 2,
                                  borderRadius: "5px",
                                  // Сплошная заливка вместо полупрозрачной —
                                  // см. комментарий в ScheduleWeekResourceGrid.
                                  bgcolor: c,
                                  border:
                                    occ.kind === "extra"
                                      ? `1.5px dashed ${theme.palette.background.paper}`
                                      : undefined,
                                  display: "flex",
                                  alignItems: "center",
                                  px: 0.75,
                                  overflow: "hidden",
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
                          );
                        })}
                      </Box>
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

export default ScheduleDayTimeline;
