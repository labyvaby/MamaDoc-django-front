/**
 * «Шахматка броней» — номера по строкам, даты по столбцам, бар = бронь; его
 * длина — число ночей. Это другая ось, чем у обычной шахматки смен
 * (ScheduleDayTimeline/ScheduleWeekResourceGrid остаются нетронутыми и
 * работают как прежде для всех остальных организаций — часы одного дня, не
 * ночи на несколько дат).
 *
 * Реальные данные (src/api/hotel.ts, GET /hotel/calendar/) — одним вызовом
 * категории (группировка строк + бейдж «люкс»), номера (со state уборки) и
 * плоские позиции броней; см. hotel-viva-frontend-api.md §4.3. Черновики
 * (reservationStatus: "draft") приходят, но номер не занимают — рисуются
 * пунктиром. Окно — 60 дней (≈ два месяца, лимит бэка 62), не 16: весь период
 * умещается в скролл самого грида, не только по неделе за раз.
 *
 * Клик по номеру открывает RoomDetailsDialog (тариф, вместимость,
 * доступность), клик по бару — ReservationDetailsDialog (реальные детали
 * брони). Клик по свободной ячейке — «быстрая бронь»: requestQuickBooking
 * (мок-стор, чисто UI-хендофф между независимыми компонентами тулбара —
 * данные в нём не хранятся) кладёт номер+дату, CreateBookingButton подписан
 * и открывает форму с уже подставленными Номер/Заезд.
 */
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Box, CircularProgress, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import WorkspacePremiumOutlined from "@mui/icons-material/WorkspacePremiumOutlined";
import dayjs, { type Dayjs } from "dayjs";

import { getCalendar, type HotelCalendarItem, type HotelCalendarRoom } from "../api/hotel";
import { useHotelProperty } from "./useHotelProperty";
import {
  mapStayDisplayStatus,
  hotelStayStatusColor,
  hotelRoomStateColor,
  HOTEL_ROOM_STATE_LABELS,
  HOTEL_STAY_STATUS_LABELS,
  HOTEL_STAY_STATUSES,
  HOTEL_STAY_STATUS_ICONS,
} from "./hotelDisplay";
import {
  getSelectedHotelDate,
  setSelectedHotelDate,
  subscribeSelectedHotelDate,
  requestQuickBooking,
  nightsBetween,
  MONTH_NOM_RU,
  WEEKDAY_SHORT_RU,
} from "./mockDemoData";
import { RoomDetailsDialog } from "./RoomDetailsDialog";
import { ReservationDetailsDialog } from "./ReservationDetailsDialog";

/** ≈ два месяца — весь период должен помещаться в шахматку, не только неделя за раз (лимит бэка — 62 дня). */
const NUM_DAYS = 60;
const ROOM_COL_WIDTH = 148;
/**
 * День — «резиновая» колонка (minmax, не фиксированный px): на широком
 * экране 1fr растягивает все 60 дней вровень с шириной грида, и оба месяца
 * видны без горизонтального скролла. На узком грид упирается в
 * MIN_DAY_COL_WIDTH и переходит на скролл (overflow: auto на обёртке ниже) —
 * не сжимается до нечитаемых полосок вместо номеров/статусов.
 */
const MIN_DAY_COL_WIDTH = 20;

type RowPlan = { kind: "category"; label: string } | { kind: "room"; room: HotelCalendarRoom };

export const RoomBookingGrid: React.FC = () => {
  const theme = useTheme();
  const { property, isLoading: propertyLoading } = useHotelProperty();
  const [windowStart, setWindowStart] = React.useState<Dayjs>(() =>
    dayjs().subtract(2, "day").startOf("day"),
  );
  const [selectedRoomId, setSelectedRoomId] = React.useState<number | null>(null);
  const [selectedReservationId, setSelectedReservationId] = React.useState<number | null>(null);
  // Общий с HotelOccupancyBanner стор — клик по числу ниже сразу двигает
  // карточки «Загрузка»/«Гости» сверху страницы.
  const selectedDate = React.useSyncExternalStore(subscribeSelectedHotelDate, getSelectedHotelDate);

  const dates = React.useMemo(
    () => Array.from({ length: NUM_DAYS }, (_, i) => windowStart.add(i, "day")),
    [windowStart],
  );
  const from = dates[0].format("YYYY-MM-DD");
  const to = dates[dates.length - 1].format("YYYY-MM-DD");

  const calendarQuery = useQuery({
    queryKey: ["hotel", "calendar", property?.id, from, to],
    queryFn: ({ signal }) => getCalendar({ propertyId: property!.id, from, to }, signal),
    enabled: property != null,
  });
  const calendar = calendarQuery.data;

  const roomTypes = calendar?.roomTypes ?? [];
  const ROWS: RowPlan[] = React.useMemo(() => {
    if (!calendar) return [];
    return calendar.roomTypes.flatMap((rt) => [
      { kind: "category" as const, label: rt.name },
      ...calendar.rooms.filter((r) => r.roomTypeId === rt.id).map((room) => ({ kind: "room" as const, room })),
    ]);
  }, [calendar]);

  const itemsByRoomId = React.useMemo(() => {
    const map = new Map<number, HotelCalendarItem[]>();
    for (const it of calendar?.items ?? []) {
      if (it.roomId == null) continue;
      const arr = map.get(it.roomId) ?? [];
      arr.push(it);
      map.set(it.roomId, arr);
    }
    return map;
  }, [calendar]);

  const today = dayjs().startOf("day");
  const todayIdx = dates.findIndex((d) => d.isSame(today, "day"));

  // Подписи месяцев над днями (row 1) — соседние даты одного месяца схлопываются в одну ячейку.
  const monthSpans: Array<{ label: string; startCol: number; span: number }> = [];
  dates.forEach((d, i) => {
    const label = `${MONTH_NOM_RU[d.month()]} ${d.year()}`;
    const last = monthSpans[monthSpans.length - 1];
    if (last && last.label === label) last.span += 1;
    else monthSpans.push({ label, startCol: i, span: 1 });
  });

  if (propertyLoading || calendarQuery.isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: 4 }}>
        <CircularProgress size={28} />
      </Stack>
    );
  }
  if (!property) {
    return <Alert severity="warning">Для этого филиала не найден объект размещения (property).</Alert>;
  }
  if (calendarQuery.isError) {
    return <Alert severity="error">Не удалось загрузить шахматку броней.</Alert>;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
      <Stack direction="row" alignItems="center" gap={0.5}>
        <IconButton size="small" onClick={() => setWindowStart((d) => d.subtract(7, "day"))}>
          <ChevronLeftOutlined fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={() => setWindowStart((d) => d.add(7, "day"))}>
          <ChevronRightOutlined fontSize="small" />
        </IconButton>
        <Box
          component="button"
          onClick={() => {
            setWindowStart(dayjs().subtract(2, "day").startOf("day"));
            setSelectedHotelDate(dayjs().format("YYYY-MM-DD"));
          }}
          sx={{
            font: "inherit",
            fontSize: "0.8rem",
            fontWeight: 600,
            color: "primary.main",
            border: 0,
            bgcolor: "transparent",
            cursor: "pointer",
            px: 1,
          }}
        >
          Сегодня
        </Box>
      </Stack>

      <Box
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: "14px",
          overflow: "auto",
          maxHeight: 440,
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: `${ROOM_COL_WIDTH}px repeat(${NUM_DAYS}, minmax(${MIN_DAY_COL_WIDTH}px, 1fr))`,
            minWidth: ROOM_COL_WIDTH + NUM_DAYS * MIN_DAY_COL_WIDTH,
          }}
        >
          {/* Угол над шапкой — sticky по обеим осям, перекрывает содержимое под собой при скролле */}
          <Box
            sx={{
              gridRow: "1 / 3",
              gridColumn: 1,
              position: "sticky",
              left: 0,
              top: 0,
              zIndex: 3,
              bgcolor: "background.paper",
              borderRight: 1,
              borderBottom: 1,
              borderColor: "divider",
            }}
          />

          {monthSpans.map((m) => (
            <Box
              key={`${m.label}-${m.startCol}`}
              sx={{
                gridRow: 1,
                gridColumn: `${m.startCol + 2} / ${m.startCol + 2 + m.span}`,
                position: "sticky",
                top: 0,
                zIndex: 2,
                bgcolor: "background.paper",
                borderBottom: 1,
                borderColor: "divider",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 26,
              }}
            >
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                {m.label}
              </Typography>
            </Box>
          ))}

          {dates.map((d, i) => {
            const dateStr = d.format("YYYY-MM-DD");
            const isToday = i === todayIdx;
            const isSelected = dateStr === selectedDate;
            const isWeekend = d.day() === 0 || d.day() === 6;
            return (
              <Box
                key={dateStr}
                component="button"
                type="button"
                onClick={() => setSelectedHotelDate(dateStr)}
                title="Показать загрузку и гостей на эту дату"
                sx={{
                  gridRow: 2,
                  gridColumn: i + 2,
                  position: "sticky",
                  top: 26,
                  zIndex: 2,
                  bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.14) : "background.paper",
                  borderRight: 1,
                  borderBottom: 1,
                  borderColor: "divider",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  py: 0.5,
                  font: "inherit",
                  border: 0,
                  cursor: "pointer",
                  "&:hover": { bgcolor: isSelected ? undefined : alpha(theme.palette.primary.main, 0.06) },
                }}
              >
                <Typography
                  variant="body2"
                  fontWeight={isSelected ? 700 : 500}
                  color={isSelected ? "primary.main" : isWeekend ? "text.secondary" : "text.primary"}
                >
                  {d.date()}
                </Typography>
                <Stack direction="row" alignItems="center" gap={0.375}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
                    {WEEKDAY_SHORT_RU[(d.day() + 6) % 7]}
                  </Typography>
                  {/* Отдельная от выбора отметка «сегодня» — не гасится кликом по другой дате. */}
                  {isToday && (
                    <Box
                      sx={{
                        width: 4,
                        height: 4,
                        borderRadius: "50%",
                        bgcolor: isSelected ? "primary.main" : "text.disabled",
                      }}
                    />
                  )}
                </Stack>
              </Box>
            );
          })}

          {/* Категории/номера + фоновые ячейки сетки под барами */}
          {ROWS.map((row, rowIdx) => {
            const gridRow = rowIdx + 3;
            if (row.kind === "category") {
              return (
                <Box
                  key={row.label}
                  sx={{
                    gridRow,
                    gridColumn: "1 / -1",
                    bgcolor: theme.palette.mode === "dark" ? alpha("#fff", 0.04) : alpha("#000", 0.03),
                    borderBottom: 1,
                    borderColor: "divider",
                    px: 1.5,
                    display: "flex",
                    alignItems: "center",
                    height: 28,
                    position: "sticky",
                    left: 0,
                  }}
                >
                  <Typography variant="caption" fontWeight={600} color="text.secondary">
                    {row.label}
                  </Typography>
                </Box>
              );
            }
            const room = row.room;
            const luxury = roomTypes.find((rt) => rt.id === room.roomTypeId)?.isLuxury;
            const stateColor = hotelRoomStateColor(room.state, theme);
            const roomItems = itemsByRoomId.get(room.id) ?? [];
            return (
              <React.Fragment key={room.id}>
                <Box
                  component="button"
                  type="button"
                  onClick={() => setSelectedRoomId(room.id)}
                  title="Показать детали номера"
                  sx={{
                    gridRow,
                    gridColumn: 1,
                    position: "sticky",
                    left: 0,
                    zIndex: 1,
                    bgcolor: luxury ? alpha("#d4af37", theme.palette.mode === "dark" ? 0.14 : 0.1) : "background.paper",
                    borderRight: 1,
                    borderBottom: 1,
                    borderColor: "divider",
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    px: 1.5,
                    height: 44,
                    font: "inherit",
                    color: "inherit",
                    border: 0,
                    textAlign: "left",
                    cursor: "pointer",
                    "&:hover": { bgcolor: (t) => alpha(t.palette.primary.main, 0.08) },
                  }}
                >
                  {luxury && (
                    <WorkspacePremiumOutlined
                      sx={{ fontSize: 16, color: theme.palette.mode === "dark" ? "#e9c766" : "#8a6d1a" }}
                    />
                  )}
                  <Typography variant="body2" fontWeight={600}>
                    {room.number}
                  </Typography>
                  <Tooltip title={`Статус номера: ${HOTEL_ROOM_STATE_LABELS[room.state as keyof typeof HOTEL_ROOM_STATE_LABELS] ?? room.state}`}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor: stateColor,
                        ml: "auto",
                        flexShrink: 0,
                      }}
                    />
                  </Tooltip>
                </Box>
                {(() => {
                  // Черновики (reservationStatus: "draft") номер не занимают — только подтверждённые/hold считаются на занятость.
                  const occupying = roomItems.filter((it) => it.reservationStatus !== "draft");
                  return dates.map((d, i) => {
                    const dateStr = d.format("YYYY-MM-DD");
                    const isFree = !occupying.some((it) => dateStr >= it.checkIn && dateStr < it.checkOut);
                    return (
                      <Box
                        key={`${room.id}-${i}`}
                        component={isFree ? "button" : "div"}
                        type={isFree ? "button" : undefined}
                        onClick={isFree ? () => requestQuickBooking(room.number, dateStr) : undefined}
                        title={isFree ? `Быстрая бронь — №${room.number}, ${d.format("D MMMM")}` : undefined}
                        sx={{
                          gridRow,
                          gridColumn: i + 2,
                          height: 44,
                          borderRight: 1,
                          borderBottom: 1,
                          borderColor: "divider",
                          border: 0,
                          font: "inherit",
                          p: 0,
                          textAlign: "left",
                          cursor: isFree ? "pointer" : "default",
                          bgcolor:
                            i === todayIdx
                              ? alpha(theme.palette.primary.main, 0.06)
                              : d.day() === 0 || d.day() === 6
                              ? theme.palette.action.hover
                              : "transparent",
                          "&:hover": isFree ? { bgcolor: alpha(theme.palette.primary.main, 0.12) } : undefined,
                        }}
                      />
                    );
                  });
                })()}
              </React.Fragment>
            );
          })}

          {/* Бары броней — та же сетка, поверх фоновых ячеек по порядку в DOM */}
          {ROWS.map((row, rowIdx) => {
            if (row.kind !== "room") return null;
            const gridRow = rowIdx + 3;
            const roomItems = itemsByRoomId.get(row.room.id) ?? [];
            return roomItems.map((it) => {
              const rawStart = dayjs(it.checkIn).diff(windowStart, "day");
              const rawEnd = dayjs(it.checkOut).diff(windowStart, "day");
              const startCol = Math.max(0, rawStart);
              const endCol = Math.min(NUM_DAYS, rawEnd);
              if (endCol <= startCol) return null;
              const status = mapStayDisplayStatus(it.stayStatus);
              const color = it.isOverbooking ? theme.palette.warning.main : hotelStayStatusColor(status, theme);
              const nights = nightsBetween(it.checkIn, it.checkOut);
              const isDraft = it.reservationStatus === "draft";
              const StatusIcon = HOTEL_STAY_STATUS_ICONS[status];
              const iconColor = theme.palette.mode === "dark" ? "#fff" : color;
              const label = it.customerName || `Бронь №${it.reservationNumber}`;
              return (
                <Box
                  key={it.itemId}
                  component="button"
                  type="button"
                  onClick={() => setSelectedReservationId(it.reservationId)}
                  title={`${label} · №${row.room.number} · ${nights} ноч. · ${HOTEL_STAY_STATUS_LABELS[status]}${it.isOverbooking ? " · Овербукинг" : ""} — показать бронь`}
                  sx={{
                    gridRow,
                    gridColumn: `${startCol + 2} / ${endCol + 2}`,
                    alignSelf: "center",
                    height: 28,
                    mx: "3px",
                    px: 1,
                    borderRadius: "8px",
                    bgcolor: alpha(color, theme.palette.mode === "dark" ? 0.3 : 0.16),
                    border: isDraft ? "1px dashed" : "1px solid",
                    borderColor: alpha(color, 0.6),
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    overflow: "hidden",
                    font: "inherit",
                    cursor: "pointer",
                    "&:hover": { borderColor: color },
                  }}
                >
                  <StatusIcon sx={{ fontSize: 14, color: iconColor, flexShrink: 0 }} />
                  <Typography variant="caption" noWrap sx={{ color: iconColor, fontWeight: 600 }}>
                    {label}
                  </Typography>
                </Box>
              );
            });
          })}
        </Box>
      </Box>

      <Stack direction="row" gap={2} flexWrap="wrap">
        {HOTEL_STAY_STATUSES.map((status) => {
          const StatusIcon = HOTEL_STAY_STATUS_ICONS[status];
          return (
            <Stack key={status} direction="row" alignItems="center" gap={0.5}>
              <StatusIcon sx={{ fontSize: 14, color: hotelStayStatusColor(status, theme) }} />
              <Typography variant="caption" color="text.secondary">
                {HOTEL_STAY_STATUS_LABELS[status]}
              </Typography>
            </Stack>
          );
        })}
        <Stack direction="row" alignItems="center" gap={0.5}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: theme.palette.warning.main }} />
          <Typography variant="caption" color="text.secondary">
            Овербукинг
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" gap={0.5}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: theme.palette.success.main }} />
          <Typography variant="caption" color="text.secondary">
            Точка у номера — статус уборки
          </Typography>
        </Stack>
      </Stack>

      <RoomDetailsDialog
        roomId={selectedRoomId}
        roomTypes={roomTypes}
        onClose={() => setSelectedRoomId(null)}
        onReservationClick={(id) => {
          setSelectedRoomId(null);
          setSelectedReservationId(id);
        }}
      />
      <ReservationDetailsDialog reservationId={selectedReservationId} onClose={() => setSelectedReservationId(null)} />
    </Box>
  );
};

export default RoomBookingGrid;
