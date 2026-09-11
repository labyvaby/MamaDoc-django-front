/**
 * «Шахматка броней» — номера по строкам, даты по столбцам, бар = бронь; его
 * длина — число ночей. Это другая ось, чем у обычной шахматки смен
 * (ScheduleDayTimeline/ScheduleWeekResourceGrid остаются нетронутыми и
 * работают как прежде для всех остальных организаций — часы одного дня, не
 * ночи на несколько дат).
 *
 * Полностью самодостаточный демо-виджет: заменяет <ScheduleCalendar /> на
 * Viva (см. точку подключения в schedule/django/index.tsx). Данные — две
 * независимые части: getHotelBookings() (процедурно сгенерированные, по
 * дате) и общий стор ручных броней из CreateBookingButton (см.
 * addCustomBooking/subscribeCustomBookings в mockDemoData.ts) — подписка
 * через useSyncExternalStore, новая бронь появляется без reload. Клик по
 * номеру открывает RoomDetailsDialog (тариф, вместимость, доступность).
 * Люкс-номера (HOTEL_ROOM_CATEGORIES[].luxury) отмечены значком и акцентным
 * фоном ярлыка. Клик по числу в шапке выбирает дату (общий стор
 * selectedHotelDate) — HotelOccupancyBanner сразу показывает загрузку и
 * гостей за этот день, а не всегда за сегодня. Клик по бару брони открывает
 * GuestDetailsDialog (телефон, история проживаний) — так же и из списка
 * «Ближайшие брони» в RoomDetailsDialog (onGuestClick). Ничего не пишет и не
 * читает с бэкенда.
 */
import React from "react";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import WorkspacePremiumOutlined from "@mui/icons-material/WorkspacePremiumOutlined";
import dayjs, { type Dayjs } from "dayjs";

import {
  HOTEL_ROOM_CATEGORIES,
  getHotelBookings,
  getCustomBookingsSnapshot,
  subscribeCustomBookings,
  getRoomCategory,
  getSelectedHotelDate,
  setSelectedHotelDate,
  subscribeSelectedHotelDate,
  getHotelBookingStatusColor,
  nightsBetween,
  MONTH_NOM_RU,
  WEEKDAY_SHORT_RU,
  HOTEL_BOOKING_STATUSES,
  HOTEL_BOOKING_STATUS_LABELS,
  type HotelBooking,
} from "./mockDemoData";
import { RoomDetailsDialog } from "./RoomDetailsDialog";
import { GuestDetailsDialog } from "./GuestDetailsDialog";

const NUM_DAYS = 16;
const ROOM_COL_WIDTH = 148;
const DAY_COL_WIDTH = 64;

type RowPlan = { kind: "category"; label: string } | { kind: "room"; room: string };

const ROWS: RowPlan[] = HOTEL_ROOM_CATEGORIES.flatMap((cat) => [
  { kind: "category" as const, label: cat.name },
  ...cat.rooms.map((room) => ({ kind: "room" as const, room })),
]);

export const RoomBookingGrid: React.FC = () => {
  const theme = useTheme();
  const [windowStart, setWindowStart] = React.useState<Dayjs>(() =>
    dayjs().subtract(2, "day").startOf("day"),
  );
  const [selectedRoom, setSelectedRoom] = React.useState<string | null>(null);
  const [selectedGuest, setSelectedGuest] = React.useState<string | null>(null);
  // Общий с HotelOccupancyBanner стор — клик по числу ниже сразу двигает
  // карточки «Загрузка»/«Гости» сверху страницы.
  const selectedDate = React.useSyncExternalStore(subscribeSelectedHotelDate, getSelectedHotelDate);

  const dates = React.useMemo(
    () => Array.from({ length: NUM_DAYS }, (_, i) => windowStart.add(i, "day")),
    [windowStart],
  );

  const generatedBookings = React.useMemo(
    () => getHotelBookings(dates[0].format("YYYY-MM-DD"), dates[dates.length - 1].format("YYYY-MM-DD")),
    [dates],
  );

  // Брони, созданные вручную через CreateBookingButton — общий стор,
  // перерисовываемся сразу по подписке, без reload страницы.
  const customBookings = React.useSyncExternalStore(subscribeCustomBookings, getCustomBookingsSnapshot);

  const bookings = React.useMemo(
    () => [...generatedBookings, ...customBookings],
    [generatedBookings, customBookings],
  );

  const bookingsByRoom = React.useMemo(() => {
    const map = new Map<string, HotelBooking[]>();
    for (const b of bookings) {
      const arr = map.get(b.roomNumber) ?? [];
      arr.push(b);
      map.set(b.roomNumber, arr);
    }
    return map;
  }, [bookings]);

  const today = dayjs().startOf("day");
  const todayIdx = dates.findIndex((d) => d.isSame(today, "day"));

  const statusColor = (status: HotelBooking["status"]) => getHotelBookingStatusColor(status, theme);

  // Подписи месяцев над днями (row 1) — соседние даты одного месяца схлопываются в одну ячейку.
  const monthSpans: Array<{ label: string; startCol: number; span: number }> = [];
  dates.forEach((d, i) => {
    const label = `${MONTH_NOM_RU[d.month()]} ${d.year()}`;
    const last = monthSpans[monthSpans.length - 1];
    if (last && last.label === label) last.span += 1;
    else monthSpans.push({ label, startCol: i, span: 1 });
  });

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
            gridTemplateColumns: `${ROOM_COL_WIDTH}px repeat(${NUM_DAYS}, ${DAY_COL_WIDTH}px)`,
            minWidth: ROOM_COL_WIDTH + NUM_DAYS * DAY_COL_WIDTH,
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
            const luxury = getRoomCategory(row.room)?.luxury;
            return (
              <React.Fragment key={row.room}>
                <Box
                  component="button"
                  type="button"
                  onClick={() => setSelectedRoom(row.room)}
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
                    {row.room}
                  </Typography>
                </Box>
                {dates.map((d, i) => (
                  <Box
                    key={`${row.room}-${i}`}
                    sx={{
                      gridRow,
                      gridColumn: i + 2,
                      height: 44,
                      borderRight: 1,
                      borderBottom: 1,
                      borderColor: "divider",
                      bgcolor:
                        i === todayIdx
                          ? alpha(theme.palette.primary.main, 0.06)
                          : d.day() === 0 || d.day() === 6
                          ? theme.palette.action.hover
                          : "transparent",
                    }}
                  />
                ))}
              </React.Fragment>
            );
          })}

          {/* Бары броней — та же сетка, поверх фоновых ячеек по порядку в DOM */}
          {ROWS.map((row, rowIdx) => {
            if (row.kind !== "room") return null;
            const gridRow = rowIdx + 3;
            const roomBookings = bookingsByRoom.get(row.room) ?? [];
            return roomBookings.map((b) => {
              const rawStart = dayjs(b.checkIn).diff(windowStart, "day");
              const rawEnd = dayjs(b.checkOut).diff(windowStart, "day");
              const startCol = Math.max(0, rawStart);
              const endCol = Math.min(NUM_DAYS, rawEnd);
              if (endCol <= startCol) return null;
              const color = statusColor(b.status);
              const nights = nightsBetween(b.checkIn, b.checkOut);
              return (
                <Box
                  key={b.id}
                  component="button"
                  type="button"
                  onClick={() => setSelectedGuest(b.guestName)}
                  title={`${b.guestName} · №${row.room} · ${nights} ноч. — показать гостя`}
                  sx={{
                    gridRow,
                    gridColumn: `${startCol + 2} / ${endCol + 2}`,
                    alignSelf: "center",
                    height: 28,
                    mx: "3px",
                    px: 1,
                    borderRadius: "8px",
                    bgcolor: alpha(color, theme.palette.mode === "dark" ? 0.3 : 0.16),
                    border: "1px solid",
                    borderColor: alpha(color, 0.6),
                    display: "flex",
                    alignItems: "center",
                    overflow: "hidden",
                    font: "inherit",
                    cursor: "pointer",
                    "&:hover": { borderColor: color },
                  }}
                >
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{ color: theme.palette.mode === "dark" ? "#fff" : color, fontWeight: 600 }}
                  >
                    {b.guestName}
                  </Typography>
                </Box>
              );
            });
          })}
        </Box>
      </Box>

      <Stack direction="row" gap={2} flexWrap="wrap">
        {HOTEL_BOOKING_STATUSES.map((status) => (
          <Stack key={status} direction="row" alignItems="center" gap={0.75}>
            <Box sx={{ width: 10, height: 10, borderRadius: "3px", bgcolor: statusColor(status) }} />
            <Typography variant="caption" color="text.secondary">
              {HOTEL_BOOKING_STATUS_LABELS[status]}
            </Typography>
          </Stack>
        ))}
      </Stack>

      <RoomDetailsDialog
        room={selectedRoom}
        onClose={() => setSelectedRoom(null)}
        onGuestClick={(name) => {
          setSelectedRoom(null);
          setSelectedGuest(name);
        }}
      />
      <GuestDetailsDialog guestName={selectedGuest} onClose={() => setSelectedGuest(null)} />
    </Box>
  );
};

export default RoomBookingGrid;
