import React from "react";
import { Box, Chip, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import RestaurantOutlined from "@mui/icons-material/RestaurantOutlined";
import { type Dayjs } from "dayjs";

import { UserAvatar } from "../../../components/ui";
import type { DjangoEmployeeListItem } from "../../../api/staff";
import type { ScheduleException } from "../../../api/scheduling";
import { absenceCountLabel, buildAbsenceIndex } from "./absenceRows";
import { lunchNote, shiftTimeLabel, type DayOccurrence } from "./occurrences";
import { segmentLunch, segmentWorkSpans } from "./monthTimeline";
import { employeeColorHex, lunchFill } from "./employeeColors";
import { namesFromOccurrences, occurrencesOf, useCollapsedGroups, useResourceGroups } from "./resourceRows";
import { useNowMinute } from "./useNowMinute";

// ── Геометрия ────────────────────────────────────────────────────────────────

// Окно до полуночи: вечерние смены (17:00–23:59) раньше обрезались на 22:00,
// и шкала заканчивалась подписью 21:00 (просьба заказчика 20.09.2026).
const DAY_START_MIN = 7 * 60;
const DAY_END_MIN = 24 * 60;
const DAY_DURATION = DAY_END_MIN - DAY_START_MIN;
const HOURS = Array.from({ length: 18 }, (_, i) => 7 + i); // 7..24

const NAME_COL_W = 210;
const ROW_H = 40;
/** Шапка в два ряда: метка «сейчас» со стрелкой сверху, шкала часов снизу. */
const HEADER_H = 42;
/** Отступ шкалы часов от верха шапки — под ним ряд метки текущего времени. */
const HOUR_LABEL_TOP = 20;
/**
 * Дорожка резиновая: занимает всю ширину контейнера за вычетом колонки имён
 * (после расширения окна до 00:00 фиксированные 72px/час перестали влезать).
 * Ниже минимума подпись часа уже не влезает — тогда включается горизонтальный
 * скролл. 36px/час × 17 = 612px: укладывается и на 1920 при масштабе 150%.
 */
const MIN_HOUR_W = 36; // подпись «10:00» при 0.68rem ≈ 30px + отступ
const MIN_BODY_W = (HOURS.length - 1) * MIN_HOUR_W;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const parseTimeToMinutes = (t: string): number => {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)/.exec(t);
  if (!m) return DAY_START_MIN;
  return clamp(parseInt(m[1], 10) * 60 + parseInt(m[2], 10), 0, 1439);
};

const minutesToPx = (min: number, bodyW: number) =>
  ((clamp(min, DAY_START_MIN, DAY_END_MIN) - DAY_START_MIN) / DAY_DURATION) * bodyW;

// Единый формат «Ч:ММ» без ведущего нуля у часа (9:00, 10:30, 18:00) —
// минуты показываем всегда, чтобы подписи смен читались одинаково.
const minutesToShort = (min: number) =>
  `${Math.floor(min / 60) % 24}:${String(min % 60).padStart(2, "0")}`; // 1440 → «0:00»

// ── Props ────────────────────────────────────────────────────────────────────

export interface ScheduleDayTimelineProps {
  day: Dayjs;
  employees: DjangoEmployeeListItem[];
  occurrences: DayOccurrence[];
  employeeColorMap: Map<number, number>;
  onEmployeeClick?: (employeeId: number) => void;
  /** Исключения периода — вид отсутствия и имя для строки без смен. */
  exceptions?: ScheduleException[];
  /** Дата → отсутствующие с неразобранными записями (см. absenceRows). */
  absenceDayEmployees?: Map<string, { employeeId: number; count: number }[]>;
  /** Клик по маркеру записей — открыть разбор. */
  onAbsenceClick?: (employeeId: number, date: string) => void;
  /** Клик по полосе смены (и по вырезу обеда) — открыть карточку смены. */
  onOccurrenceClick?: (occurrence: DayOccurrence) => void;
}

const ScheduleDayTimeline: React.FC<ScheduleDayTimelineProps> = ({
  day,
  employees,
  occurrences,
  employeeColorMap,
  onEmployeeClick,
  exceptions,
  absenceDayEmployees,
  onAbsenceClick,
  onOccurrenceClick,
}) => {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const { collapsed, toggle } = useCollapsedGroups();

  const dateStr = day.format("YYYY-MM-DD");
  const absence = React.useMemo(
    () => buildAbsenceIndex(exceptions, absenceDayEmployees, [dateStr]),
    [exceptions, absenceDayEmployees, dateStr],
  );

  // Строку получает и тот, у кого смен нет, но остались записанные пациенты:
  // иначе выходной прячет врача вместе с его приёмами.
  const rowEmployeeIds = React.useMemo(
    () => new Set([...occurrences.map((o) => o.employeeId), ...absence.employeeIds]),
    [occurrences, absence],
  );
  const namesById = React.useMemo(() => {
    const map = namesFromOccurrences(occurrences);
    for (const [id, name] of absence.names) if (!map.has(id)) map.set(id, name);
    return map;
  }, [occurrences, absence]);
  const groups = useResourceGroups(employees, rowEmployeeIds, namesById);

  const colorOf = React.useCallback(
    // ?? employeeId — сотрудника может не быть в справочнике (см. resourceRows).
    (employeeId: number) => employeeColorHex(employeeColorMap.get(employeeId) ?? employeeId, mode),
    [employeeColorMap, mode],
  );

  // Ширина дорожки — по контейнеру (см. MIN_BODY_W). Меряем внешний скролл-бокс:
  // его clientWidth уже без вертикального скроллбара.
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [bodyW, setBodyW] = React.useState(MIN_BODY_W);
  // Пустой день рендерит заглушку без контейнера — эффект перезапускаем,
  // когда строки появятся, иначе наблюдатель так и не подцепится.
  const hasRows = groups.length > 0;
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => setBodyW(Math.max(MIN_BODY_W, Math.floor(el.clientWidth) - NAME_COL_W));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasRows]);
  const leftPx = React.useCallback((min: number) => minutesToPx(min, bodyW), [bodyW]);

  // Линия «сейчас» — только для сегодняшнего дня и внутри рабочего окна.
  const now = useNowMinute();
  const nowMin = now.hour() * 60 + now.minute();
  const showNow = day.isSame(now, "day") && nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN;
  const nowLeft = showNow ? leftPx(nowMin) : 0;
  // Метку у краёв поджимаем внутрь, иначе она обрезается контейнером.
  const nowLabelShift = nowLeft < 22 ? "0%" : nowLeft > bodyW - 22 ? "-100%" : "-50%";

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
  }, [leftPx]);

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
    <Box ref={scrollRef} sx={{ overflow: "auto", height: "100%" }}>
      <Box sx={{ display: "grid", gridTemplateColumns: `${NAME_COL_W}px ${bodyW}px`, minWidth: "fit-content" }}>
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
                  top: HOUR_LABEL_TOP,
                  bottom: 0,
                  width: "1px",
                  bgcolor: "divider",
                  opacity: 0.7,
                  pointerEvents: "none",
                }}
              />
            ))}
            {HOURS.slice(0, -1).map((h) => (
              <Typography
                key={h}
                sx={{
                  position: "absolute",
                  left: leftPx(h * 60),
                  top: HOUR_LABEL_TOP,
                  pl: 0.75,
                  fontSize: "0.68rem",
                  color: "text.disabled",
                  fontVariantNumeric: "tabular-nums",
                  userSelect: "none",
                  lineHeight: 1.5,
                }}
              >
                {h}:00
              </Typography>
            ))}
            {/* Метка «сейчас»: подпись времени + стрелка-указатель на линию */}
            {showNow && (
              <>
                <Box
                  sx={{
                    position: "absolute",
                    left: nowLeft,
                    top: HOUR_LABEL_TOP + 2,
                    bottom: 0,
                    width: "2px",
                    bgcolor: "error.main",
                    zIndex: 3,
                    pointerEvents: "none",
                  }}
                />
                <Box
                  sx={{
                    position: "absolute",
                    left: nowLeft,
                    top: 1,
                    transform: `translateX(${nowLabelShift})`,
                    zIndex: 4,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: nowLabelShift === "0%" ? "flex-start" : nowLabelShift === "-100%" ? "flex-end" : "center",
                    pointerEvents: "none",
                  }}
                >
                  <Typography
                    sx={{
                      px: 0.5,
                      borderRadius: "4px",
                      bgcolor: "error.main",
                      color: "error.contrastText",
                      fontSize: "0.62rem",
                      fontWeight: 700,
                      lineHeight: 1.35,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {now.format("HH:mm")}
                  </Typography>
                  <Box
                    sx={{
                      width: 0,
                      height: 0,
                      borderLeft: "5px solid transparent",
                      borderRight: "5px solid transparent",
                      borderTop: `6px solid ${theme.palette.error.main}`,
                    }}
                  />
                </Box>
              </>
            )}
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
                  width: NAME_COL_W + bodyW,
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
                {/* Продолжение линии «сейчас» — иначе она рвётся на полосах групп */}
                {showNow && (
                  <Box
                    sx={{
                      position: "absolute",
                      left: NAME_COL_W + nowLeft,
                      top: 0,
                      bottom: 0,
                      width: "2px",
                      bgcolor: "error.main",
                      opacity: 0.85,
                      pointerEvents: "none",
                    }}
                  />
                )}
              </Box>

              {!isCollapsed &&
                group.rows.map(({ employee }) => {
                  const rowOccs = occurrencesOf(occurrences, employee.id);
                  const c = colorOf(employee.id);
                  const absent = absence.cells.get(`${dateStr}_${employee.id}`);
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
                        <UserAvatar
                          name={employee.fullName}
                          src={employee.photoUrl}
                          size={24}
                          // Отсутствующий приглушён: строка есть только ради
                          // записей, работать в этот день он не будет.
                          sx={absent ? { opacity: 0.55 } : undefined}
                        />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            variant="body2"
                            noWrap
                            color={absent ? "text.secondary" : "text.primary"}
                          >
                            {employee.fullName}
                          </Typography>
                          {absent && (
                            <Typography
                              noWrap
                              sx={{ fontSize: "0.62rem", lineHeight: 1.1, color: "text.disabled" }}
                            >
                              {absent.label}
                            </Typography>
                          )}
                        </Box>
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
                        {/* Отсутствие: штриховка на всю дорожку (плотная заливка
                            читалась бы как ещё одна смена) и маркер записей,
                            которые никто не разобрал. */}
                        {absent && rowOccs.length === 0 && (
                          <Box
                            sx={{
                              position: "absolute",
                              left: 0,
                              right: 0,
                              top: 5,
                              bottom: 5,
                              borderRadius: "4px",
                              backgroundImage: `repeating-linear-gradient(45deg, transparent 0 3px, ${alpha(
                                theme.palette.text.primary,
                                0.12,
                              )} 3px 6px)`,
                              pointerEvents: "none",
                            }}
                          />
                        )}
                        {absent && (
                          <Tooltip
                            title={`${absent.label}: пациенты остались записанными. Открыть разбор`}
                            arrow
                          >
                            <Chip
                              size="small"
                              color="error"
                              label={absenceCountLabel(absent.count)}
                              onClick={
                                onAbsenceClick
                                  ? () => onAbsenceClick(employee.id, dateStr)
                                  : undefined
                              }
                              sx={{
                                position: "absolute",
                                // Смены нет — маркер в начале дорожки, на пустом
                                // месте; есть (частичное отсутствие) — в конце,
                                // чтобы не перекрывать полосы.
                                ...(rowOccs.length === 0 ? { left: 8 } : { right: 8 }),
                                top: "50%",
                                transform: "translateY(-50%)",
                                zIndex: 4,
                                height: 20,
                                "& .MuiChip-label": { px: 0.75, fontSize: "0.65rem", fontWeight: 700 },
                              }}
                            />
                          </Tooltip>
                        )}
                        {showNow && (
                          <Box
                            sx={{
                              position: "absolute",
                              left: nowLeft,
                              top: 0,
                              bottom: 0,
                              width: "2px",
                              bgcolor: "error.main",
                              // Линия проходит поверх полос смен (zIndex 2),
                              // иначе на плотном дне её не видно совсем.
                              opacity: 0.85,
                              zIndex: 3,
                              pointerEvents: "none",
                            }}
                          />
                        )}
                        {rowOccs.map((occ) => {
                          const startMin = parseTimeToMinutes(occ.startTime);
                          const rawEnd = parseTimeToMinutes(occ.endTime);
                          const seg = {
                            occ,
                            startMin,
                            // Конец «00:00» (и вообще конец ≤ начала) — это
                            // полночь, а не 0:00 текущего дня; иначе полоса
                            // схлопывалась бы в минимальную ширину.
                            endMin: rawEnd <= startMin ? DAY_END_MIN : rawEnd,
                          };
                          const tip = `${occ.employeeName}: ${shiftTimeLabel(occ)}${occ.lunch ? ` · ${lunchNote(occ)}` : ""}${occ.kind !== "rule" ? " (точечная смена)" : ""}`;
                          // Один обработчик на все отрезки и вырез обеда: для
                          // пользователя это одна смена, куда бы он ни кликнул.
                          const openOcc = onOccurrenceClick
                            ? () => onOccurrenceClick(occ)
                            : undefined;
                          const lunch = segmentLunch(seg);
                          const spans = segmentWorkSpans(seg);
                          const lunchLeft = lunch ? leftPx(lunch.startMin) : 0;
                          const lunchWidth = lunch
                            ? Math.max(leftPx(lunch.endMin) - lunchLeft, 4)
                            : 0;
                          return (
                            <React.Fragment key={`${occ.kind}_${occ.sourceId}_${occ.startTime}`}>
                              {spans.map((span, si) => {
                                const l = leftPx(span.startMin);
                                const w = Math.max(leftPx(span.endMin) - l, 6);
                                // Отрезок до обеда скруглён слева, после — справа:
                                // вместе с вырезом это читается как одна смена.
                                const first = si === 0;
                                const last = si === spans.length - 1;
                                return (
                                  <Tooltip key={span.startMin} title={tip} arrow>
                                    <Box
                                      onClick={openOcc}
                                      sx={{
                                        position: "absolute",
                                        left: l,
                                        width: w,
                                        top: 5,
                                        bottom: 5,
                                        zIndex: 2,
                                        cursor: openOcc ? "pointer" : "default",
                                        borderRadius: `${first ? "5px" : "0"} ${last ? "5px" : "0"} ${last ? "5px" : "0"} ${first ? "5px" : "0"}`,
                                        // Сплошная заливка вместо полупрозрачной —
                                        // см. комментарий в ScheduleWeekResourceGrid.
                                        bgcolor: c,
                                        border:
                                          occ.kind !== "rule"
                                            ? `1.5px dashed ${theme.palette.background.paper}`
                                            : undefined,
                                        display: "flex",
                                        alignItems: "center",
                                        // Время каждого отрезка жмётся к обеду: до
                                        // перерыва — к правому краю, после — к левому,
                                        // так обе подписи стоят по бокам от выреза.
                                        justifyContent: first && !last ? "flex-end" : "flex-start",
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
                                        {minutesToShort(span.startMin)}–
                                        {minutesToShort(span.endMin)}
                                      </Typography>
                                    </Box>
                                  </Tooltip>
                                );
                              })}
                              {/* Обед — красный вырез между отрезками смены
                                  (просьба заказчика 02.09.2026). */}
                              {lunch && (
                                <Tooltip title={lunchNote(occ)} arrow>
                                  <Box
                                    onClick={openOcc}
                                    sx={{
                                      position: "absolute",
                                      left: lunchLeft,
                                      width: lunchWidth,
                                      top: 5,
                                      bottom: 5,
                                      zIndex: 2,
                                      cursor: openOcc ? "pointer" : "default",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      bgcolor: lunchFill(theme),
                                      // Тонкие боковые грани отделяют вырез от смены,
                                      // если сама смена оказалась красноватой.
                                      borderLeft: `1px solid ${theme.palette.background.paper}`,
                                      borderRight: `1px solid ${theme.palette.background.paper}`,
                                    }}
                                  >
                                    <RestaurantOutlined
                                      sx={{ fontSize: 12, color: "error.contrastText" }}
                                    />
                                  </Box>
                                </Tooltip>
                              )}
                            </React.Fragment>
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
