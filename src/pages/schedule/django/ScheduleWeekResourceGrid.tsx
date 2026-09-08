import React from "react";
import { Box, Chip, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import { type Dayjs } from "dayjs";

import { UserAvatar } from "../../../components/ui";
import type { DjangoEmployeeListItem } from "../../../api/staff";
import type { ScheduleException } from "../../../api/scheduling";
import { subtleBg } from "../../../theme";
import {
  formatDuration,
  netShiftMinutes,
  occurrenceNote,
  type DayOccurrence,
} from "./occurrences";
import { occMinutes, packIntoLanes, segmentLunch, segmentWorkSpans } from "./monthTimeline";
import { computeWeekWindow, hourTicks, windowPct } from "./weekWindow";
import { employeeColorHex, lunchFill } from "./employeeColors";
import { namesFromOccurrences, occurrencesOf, useCollapsedGroups, useResourceGroups } from "./resourceRows";
import { useNowMinute } from "./useNowMinute";

/**
 * Базовые размеры сетки при обычном размере интерфейса. Ниже они домножаются
 * на theme.appLayout.uiScaleFactor: высоты заданы в пикселях и сами по себе о
 * «Крупном» размере не знают, из-за чего текст рос, а строки — нет.
 */
const BASE_NAME_COL_W = 180;
const BASE_DAY_COL_MIN_W = 96;
const BASE_ROW_H = 44;
/** Шапка: день недели, метка «сейчас» у сегодняшней даты и подпись часов. */
const BASE_HEADER_H = 56;
/** Зазор между дорожками смен внутри ячейки (px). */
const LANE_GAP = 2;

/**
 * Высота полоски подбирается под число смен в дне: у большинства сотрудников
 * смена одна, и полоса занимает почти всю строку — так подпись времени крупнее
 * и попасть по ней мышью легче. Две смены ужимаются, три и больше — минимум,
 * при котором подпись ещё читается (строка при этом растёт по minHeight).
 */
const laneHeight = (laneCount: number): number =>
  laneCount <= 1 ? 22 : laneCount === 2 ? 16 : 13;

/** Кегль подписи времени внутри полоски (rem) — крупнее на высокой полосе. */
const labelRem = (laneH: number): number => (laneH >= 20 ? 0.68 : 0.62);
/**
 * Грубая ширина символа подписи (px) — по ней решаем, влезет ли она. Кегль
 * задан в rem, поэтому база зависит от размера интерфейса.
 */
const labelCharPx = (laneH: number, uiScale: number): number =>
  labelRem(laneH) * 16 * uiScale * 0.58;
/** Поля вокруг подписи внутри полоски (px). */
const BAR_LABEL_PADDING = 8;

/**
 * Компактное время: «9», «9:30», «17». Минуты показываем только ненулевые —
 * в колонке шириной ~130px каждый лишний символ стоит места, а «9:00» и «9»
 * несут одно и то же.
 */
const compactTime = (t: string): string => {
  const [hh, mm] = t.split(":");
  const h = parseInt(hh, 10);
  return mm === "00" ? String(h) : `${h}:${mm}`;
};

/** Минуты шкалы → "HH:MM": отрезки смены считаются в минутах, а подпись — по времени. */
const minutesToTime = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
/** Виды отсутствия, которые показываем в сетке отдельной плиткой. */
const ABSENCE_LABELS: Partial<Record<ScheduleException["kind"], string>> = {
  vacation: "Отпуск",
  day_off: "Выходной",
};

export interface ScheduleWeekResourceGridProps {
  /** 7 дней недели (Пн…Вс). */
  week: Dayjs[];
  employees: DjangoEmployeeListItem[];
  /** Смены по дате: "YYYY-MM-DD" → occurrences. */
  occurrencesByDate: Map<string, DayOccurrence[]>;
  /**
   * Исключения расписания периода. Отпуск и выходной отменяют смену ещё в
   * computeDayOccurrences, поэтому без них пустой день в сетке выглядел так же,
   * как день вне графика — отличить отпуск было нельзя.
   */
  exceptions?: ScheduleException[];
  employeeColorMap: Map<number, number>;
  onDayClick?: (day: Dayjs) => void;
}

const ScheduleWeekResourceGrid: React.FC<ScheduleWeekResourceGridProps> = ({
  week,
  employees,
  occurrencesByDate,
  exceptions,
  employeeColorMap,
  onDayClick,
}) => {
  const theme = useTheme();
  const mode = theme.palette.mode;
  const today = useNowMinute();
  const { collapsed, toggle } = useCollapsedGroups();

  // Размеры сетки под выбранный размер интерфейса.
  const uiScale = theme.appLayout.uiScaleFactor;
  const NAME_COL_W = Math.round(BASE_NAME_COL_W * uiScale);
  const DAY_COL_MIN_W = Math.round(BASE_DAY_COL_MIN_W * uiScale);
  const ROW_H = Math.round(BASE_ROW_H * uiScale);
  const HEADER_H = Math.round(BASE_HEADER_H * uiScale);

  const weekOccurrences = React.useMemo(
    () => week.flatMap((d) => occurrencesByDate.get(d.format("YYYY-MM-DD")) ?? []),
    [week, occurrencesByDate],
  );
  const employeeIdsWithShifts = React.useMemo(
    () => new Set(weekOccurrences.map((o) => o.employeeId)),
    [weekOccurrences],
  );
  const namesById = React.useMemo(() => namesFromOccurrences(weekOccurrences), [weekOccurrences]);

  /**
   * Окно таймлайна по фактическому графику недели. Жёсткие 07:00–22:00 отдавали
   * смене 9–17 половину колонки, остальное — пустые поля по краям.
   */
  const timeWindow = React.useMemo(() => computeWeekWindow(weekOccurrences), [weekOccurrences]);
  const ticks = React.useMemo(() => hourTicks(timeWindow), [timeWindow]);
  const pct = React.useCallback((min: number) => windowPct(min, timeWindow), [timeWindow]);

  /** Отсутствия по ключу "дата_сотрудник" — ищем их на каждый пустой день. */
  const absenceByKey = React.useMemo(() => {
    const map = new Map<string, ScheduleException>();
    for (const exc of exceptions ?? []) {
      if (!ABSENCE_LABELS[exc.kind]) continue;
      map.set(`${exc.date}_${exc.employeeId}`, exc);
    }
    return map;
  }, [exceptions]);

  /** Часы за неделю по сотруднику — сумма смен за вычетом обедов. */
  const weekMinutesByEmployee = React.useMemo(() => {
    const map = new Map<number, number>();
    for (const occ of weekOccurrences) {
      map.set(occ.employeeId, (map.get(occ.employeeId) ?? 0) + netShiftMinutes(occ));
    }
    return map;
  }, [weekOccurrences]);

  /**
   * Фактическая ширина колонки дня. Нужна, чтобы решать в пикселях, помещается
   * ли подпись времени внутри полоски и не наедет ли она на вырез обеда:
   * в процентах этот вопрос не решается — колонка резиновая.
   */
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [dayColWidth, setDayColWidth] = React.useState(DAY_COL_MIN_W);
  React.useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const free = entry.contentRect.width - NAME_COL_W;
      setDayColWidth(Math.max(DAY_COL_MIN_W, free / 7));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [NAME_COL_W, DAY_COL_MIN_W]);

  /** Текущая минута — для линии «сейчас» в колонке сегодня. */
  const nowMin = today.hour() * 60 + today.minute();
  const nowInWindow = nowMin >= timeWindow.startMin && nowMin <= timeWindow.endMin;
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
    <Box ref={rootRef} sx={{ overflow: "auto", height: "100%" }}>
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
                gap: 0.25,
                cursor: onDayClick ? "pointer" : "default",
                bgcolor: isToday ? alpha(theme.palette.primary.main, 0.1) : "background.paper",
                borderBottom: "2px solid",
                borderLeft: "1px solid",
                borderColor: "divider",
                // Колонку сегодня отмечаем акцентом, а не красным: красный в этом
                // экране закреплён за обедом, и два смысла одним цветом путали.
                borderBottomColor: isToday ? theme.palette.primary.main : theme.palette.divider,
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Typography
                sx={{
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  // Выходные отличаем приглушённым тоном и подложкой ячеек, а
                  // не красным — он занят обедом.
                  color: di >= 5 ? "text.disabled" : "text.secondary",
                  lineHeight: 1.1,
                }}
              >
                {d.format("dd")} {d.format("D")}
              </Typography>
              {/* «Сейчас»: текущее время + стрелка вниз — указывает на колонку сегодня */}
              {isToday && (
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" }}>
                  <Typography
                    sx={{
                      px: 0.5,
                      borderRadius: "4px",
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                      fontSize: "0.6rem",
                      fontWeight: 700,
                      lineHeight: 1.35,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {today.format("HH:mm")}
                  </Typography>
                  <Box
                    sx={{
                      width: 0,
                      height: 0,
                      borderLeft: "5px solid transparent",
                      borderRight: "5px solid transparent",
                      borderTop: `6px solid ${theme.palette.primary.main}`,
                    }}
                  />
                </Box>
              )}
              {/* Шкала часов: ячейки ниже — мини-таймлайн дня, и без подписи
                  часов отрезок смены не с чем соотнести. Цифры даём один раз на
                  колонку, в самих ячейках остаются только направляющие. */}
              <Box
                sx={{
                  position: "relative",
                  width: "100%",
                  height: 10,
                  mt: "auto",
                  px: 0.5,
                  pointerEvents: "none",
                }}
              >
                {ticks.map((h) => (
                  <Typography
                    key={h}
                    sx={{
                      position: "absolute",
                      left: `${pct(h * 60)}%`,
                      transform: "translateX(-50%)",
                      fontSize: "0.55rem",
                      lineHeight: 1,
                      color: "text.disabled",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {h}
                  </Typography>
                ))}
              </Box>
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
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" noWrap>
                            {employee.fullName}
                          </Typography>
                          {/* Часы за неделю — уже за вычетом обедов: именно их
                              спрашивают, глядя на недельную сетку. */}
                          {weekMinutesByEmployee.has(employee.id) && (
                            <Typography
                              noWrap
                              sx={{
                                fontSize: "0.62rem",
                                lineHeight: 1.2,
                                color: "text.disabled",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {formatDuration(weekMinutesByEmployee.get(employee.id) ?? 0)} за неделю
                            </Typography>
                          )}
                        </Box>
                      </Box>

                      {week.map((d, di) => {
                        const dateStr = d.format("YYYY-MM-DD");
                        const dayOccs = occurrencesOf(
                          occurrencesByDate.get(dateStr) ?? [],
                          employee.id,
                        );
                        const isToday = d.isSame(today, "day");
                        // Отпуск/выходной отменяют смену ещё при материализации,
                        // поэтому ищем их отдельно — иначе день выглядит как
                        // обычный невыход по графику.
                        const absence = absenceByKey.get(`${dateStr}_${employee.id}`);
                        return (
                          <Box
                            key={d.format("YYYY-MM-DD")}
                            onClick={() => onDayClick?.(d)}
                            sx={{
                              position: "relative",
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
                              // Колонку сегодня держим на фоне, а не на красных
                              // границах: 1px-линия сливалась с границей соседнего дня.
                              bgcolor: isToday
                                ? alpha(theme.palette.primary.main, 0.08)
                                : di >= 5
                                ? subtleBg(theme)
                                : "transparent",
                              "&:hover": { bgcolor: "action.hover" },
                            }}
                          >
                            {/* Направляющие опорных часов на всю высоту ячейки —
                                привязка отрезка ко времени; цифры подписаны в шапке. */}
                            {ticks.map((h) => (
                              <Box
                                key={h}
                                sx={{
                                  position: "absolute",
                                  top: 0,
                                  bottom: 0,
                                  left: `${pct(h * 60)}%`,
                                  width: "1px",
                                  bgcolor: "divider",
                                  opacity: 0.5,
                                  pointerEvents: "none",
                                }}
                              />
                            ))}
                            {/* (2) Линия текущего времени в колонке сегодня: по ней
                                видно, кто сейчас на смене, а кто на обеде. */}
                            {isToday && nowInWindow && (
                              <Box
                                sx={{
                                  position: "absolute",
                                  top: 0,
                                  bottom: 0,
                                  left: `${pct(nowMin)}%`,
                                  width: "2px",
                                  bgcolor: "primary.main",
                                  opacity: 0.75,
                                  zIndex: 2,
                                  pointerEvents: "none",
                                }}
                              />
                            )}
                            {dayOccs.length === 0 ? (
                              absence ? (
                                <Tooltip
                                  title={`${ABSENCE_LABELS[absence.kind]}${absence.comment ? `: ${absence.comment}` : ""}`}
                                  arrow
                                >
                                  <Box
                                    sx={{
                                      position: "relative",
                                      zIndex: 1,
                                      width: "100%",
                                      height: Math.round(laneHeight(1) * uiScale),
                                      borderRadius: "4px",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      // Штриховка, а не заливка: отсутствие — это
                                      // «нет смены», и плотный прямоугольник читался
                                      // бы как ещё одна смена.
                                      backgroundImage: `repeating-linear-gradient(45deg, transparent 0 3px, ${alpha(
                                        theme.palette.text.primary,
                                        0.14,
                                      )} 3px 6px)`,
                                    }}
                                  >
                                    <Typography
                                      noWrap
                                      sx={{
                                        fontSize: "0.58rem",
                                        lineHeight: 1,
                                        fontWeight: 600,
                                        color: "text.secondary",
                                        px: 0.5,
                                        borderRadius: "2px",
                                        bgcolor: "background.paper",
                                      }}
                                    >
                                      {ABSENCE_LABELS[absence.kind]}
                                    </Typography>
                                  </Box>
                                </Tooltip>
                              ) : null
                            ) : (
                              (() => {
                                // Мини-таймлайн дня — тот же язык, что в месячной
                                // ячейке: смена стоит на своём месте в окне 07:00–22:00,
                                // поэтому «кто рано, кто поздно» видно без чтения цифр.
                                // Пересекающиеся смены раскладываются по дорожкам.
                                const lanes = packIntoLanes(dayOccs, {
                                  startMin: timeWindow.startMin,
                                  endMin: timeWindow.endMin,
                                  // Окно недели уже месячного, поэтому и минимум
                                  // видимой ширины меньше — иначе короткая смена
                                  // выглядела бы длиннее, чем она есть.
                                  minSegMin: 15,
                                });
                                const laneH = Math.round(laneHeight(lanes.length) * uiScale);
                                return (
                                  <Box
                                    sx={{
                                      position: "relative",
                                      zIndex: 1,
                                      width: "100%",
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: `${LANE_GAP}px`,
                                    }}
                                  >
                                    {lanes.map((lane, li) => (
                                      <Box
                                        key={li}
                                        sx={{ position: "relative", height: laneH, width: "100%" }}
                                      >
                                        {lane.segments.map((seg) => {
                                          const { occ } = seg;
                                          // Смена вне окна 07:00–22:00 прижата к краю
                                          // (packIntoLanes), и без пометки 06:00–08:00
                                          // выглядела бы как обычная короткая смена.
                                          // Ночная (конец ≤ начала) идёт за полночь.
                                          const rawStart = occMinutes(occ.startTime);
                                          const rawEnd =
                                            occMinutes(occ.endTime) <= rawStart
                                              ? 24 * 60
                                              : occMinutes(occ.endTime);
                                          const cutStart = rawStart < timeWindow.startMin;
                                          const cutEnd = rawEnd > timeWindow.endMin;
                                          // Обед разрывает полосу: рисуем отрезки работы,
                                          // а на месте перерыва оставляем пустоту.
                                          const lunch = segmentLunch(seg);
                                          const spans = segmentWorkSpans(seg);
                                          return (
                                            <React.Fragment
                                              key={`${occ.kind}_${occ.sourceId}_${occ.startTime}`}
                                            >
                                              {spans.map((span, si) => {
                                                const left = pct(span.startMin);
                                                const width = Math.max(pct(span.endMin) - left, 1.5);
                                                const first = si === 0;
                                                const last = si === spans.length - 1;
                                                // Скошенный край рисуем только на внешних
                                                // концах смены, а не на срезах обеда.
                                                const clipStart = cutStart && first;
                                                const clipEnd = cutEnd && last;
                                                // Часы прямо в полоске — самое частое,
                                                // ради чего наводили мышь. У каждого
                                                // отрезка своё время: «9–13», «14–17».
                                                const label = `${compactTime(minutesToTime(span.startMin))}–${compactTime(minutesToTime(span.endMin))}`;
                                                const barPx = (dayColWidth * width) / 100;
                                                const showLabel =
                                                  barPx >=
                                                  label.length * labelCharPx(laneH, uiScale) +
                                                    BAR_LABEL_PADDING;
                                                return (
                                                  <Tooltip
                                                    key={span.startMin}
                                                    title={occurrenceNote(occ)}
                                                    arrow
                                                  >
                                                    <Box
                                                      sx={{
                                                        position: "absolute",
                                                        top: 0,
                                                        bottom: 0,
                                                        left: `${left}%`,
                                                        width: `${width}%`,
                                                        overflow: "hidden",
                                                        // Внутренние края у выреза обеда
                                                        // прямые — вместе с ним отрезки
                                                        // читаются как одна смена.
                                                        borderRadius: `${first ? "4px" : "0"} ${last ? "4px" : "0"} ${last ? "4px" : "0"} ${first ? "4px" : "0"}`,
                                                        // Обводка цветом фона отделяет полоску
                                                        // от соседней смены впритык и от
                                                        // направляющих часов под ней.
                                                        outline: `1px solid ${theme.palette.background.paper}`,
                                                        outlineOffset: "-1px",
                                                        // Отклик на курсор: по полоске кликают,
                                                        // чтобы открыть день, и без реакции она
                                                        // выглядела нарисованной. Меняем яркость,
                                                        // а не размер — сдвиг ломал бы привязку
                                                        // отрезка ко времени.
                                                        transition: "filter .12s ease",
                                                        "&:hover": {
                                                          filter:
                                                            mode === "dark"
                                                              ? "brightness(1.18)"
                                                              : "brightness(0.92)",
                                                        },
                                                        // Сплошная заливка вместо полупрозрачной:
                                                        // на тёмном фоне тинты жёлтого/оранжевого
                                                        // выглядели грязно-бурыми и одинаковыми
                                                        // (жалоба заказчика 14.07.2026).
                                                        bgcolor: c,
                                                        // (5) Точечная смена — диагональная
                                                        // штриховка: пунктирная рамка в 1px на
                                                        // дорожке высотой 13px была не видна.
                                                        backgroundImage:
                                                          occ.kind !== "rule"
                                                            ? `repeating-linear-gradient(45deg, transparent 0 3px, ${alpha(
                                                                theme.palette.background.paper,
                                                                0.5,
                                                              )} 3px 6px)`
                                                            : undefined,
                                                        // Скошенный край = «смена продолжается
                                                        // за пределами окна».
                                                        clipPath:
                                                          clipStart && clipEnd
                                                            ? "polygon(4px 0, calc(100% - 4px) 0, 100% 50%, calc(100% - 4px) 100%, 4px 100%, 0 50%)"
                                                            : clipStart
                                                              ? "polygon(4px 0, 100% 0, 100% 100%, 4px 100%, 0 50%)"
                                                              : clipEnd
                                                                ? "polygon(0 0, calc(100% - 4px) 0, 100% 50%, calc(100% - 4px) 100%, 0 100%)"
                                                                : undefined,
                                                      }}
                                                    >
                                                      {/* Время отрезка жмётся к обеду: до
                                                          перерыва — к правому краю полоски,
                                                          после — к левому. */}
                                                      {showLabel && (
                                                        <Typography
                                                          noWrap
                                                          sx={{
                                                            position: "absolute",
                                                            ...(first && !last
                                                              ? { right: "4px" }
                                                              : { left: "4px" }),
                                                            top: 0,
                                                            bottom: 0,
                                                            display: "flex",
                                                            alignItems: "center",
                                                            fontSize: `${labelRem(laneH)}rem`,
                                                            fontWeight: 600,
                                                            lineHeight: 1,
                                                            color: theme.palette.getContrastText(c),
                                                            fontVariantNumeric: "tabular-nums",
                                                            pointerEvents: "none",
                                                          }}
                                                        >
                                                          {label}
                                                        </Typography>
                                                      )}
                                                    </Box>
                                                  </Tooltip>
                                                );
                                              })}
                                              {/* Обед — красный вырез между отрезками
                                                  смены (просьба заказчика 02.09.2026). */}
                                              {lunch && (
                                                <Box
                                                  sx={{
                                                    position: "absolute",
                                                    top: 0,
                                                    bottom: 0,
                                                    left: `${pct(lunch.startMin)}%`,
                                                    width: `${Math.max(
                                                      pct(lunch.endMin) - pct(lunch.startMin),
                                                      1,
                                                    )}%`,
                                                    bgcolor: lunchFill(theme),
                                                    // Грани отделяют вырез от смены, если
                                                    // сама смена оказалась красноватой.
                                                    borderLeft: `1px solid ${theme.palette.background.paper}`,
                                                    borderRight: `1px solid ${theme.palette.background.paper}`,
                                                    pointerEvents: "none",
                                                  }}
                                                />
                                              )}
                                            </React.Fragment>
                                          );
                                        })}
                                      </Box>
                                    ))}
                                  </Box>
                                );
                              })()
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
