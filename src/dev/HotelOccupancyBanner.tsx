/**
 * «Шахматка броней» — верхние карточки-сводка для демо-организации Viva.
 *
 * Референс — экран реального PMS отеля (шахматка броней Bnovo/Exely
 * WebPMS): «Загрузка на сегодня», «Гости сегодня», «Заметки и указания»,
 * «Состояние номеров». Цифры — моковые (см. getHotelOccupancySnapshot в
 * mockDemoData.ts): в нашем API нет сущности «номер», это витрина того, что
 * такой экран мог бы показывать, а не подключённый расчёт.
 *
 * Самостоятельно решает, рендериться ли (isVivaActive) — точка подключения
 * (src/pages/schedule/django/index.tsx) остаётся однострочной.
 *
 * «Загрузка»/«Гости» — за число, выбранное кликом в RoomBookingGrid (общий
 * стор selectedHotelDate, см. mockDemoData.ts): один клик — обе карточки
 * сразу за другой день. «Заметки»/«Состояние номеров» от выбора не зависят —
 * это про сейчас, не про пролистанную дату (см. getHotelOccupancySnapshot).
 */
import React from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import dayjs from "dayjs";

import {
  getHotelOccupancySnapshot,
  getSelectedHotelDate,
  subscribeSelectedHotelDate,
  isVivaActive,
  formatHotelDate,
} from "./mockDemoData";

const CardShell: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Paper
    elevation={0}
    variant="outlined"
    sx={{ p: 1.75, display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}
  >
    <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
      {title}
    </Typography>
    {children}
  </Paper>
);

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />
);

const StatRow: React.FC<{ color: string; label: string; value: React.ReactNode }> = ({
  color,
  label,
  value,
}) => (
  <Stack direction="row" alignItems="center" gap={1} sx={{ py: 0.375 }}>
    <Dot color={color} />
    <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 0 }} noWrap>
      {label}
    </Typography>
    <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: "tabular-nums" }}>
      {value}
    </Typography>
  </Stack>
);

export const HotelOccupancyBanner: React.FC = () => {
  const theme = useTheme();
  // Хуки вызываются безусловно (Rules of Hooks) — если Viva не активна, их
  // результат просто не идёт в дело; обе функции дешёвые, лишний вызов не жалко.
  const selectedDate = React.useSyncExternalStore(subscribeSelectedHotelDate, getSelectedHotelDate);
  const snap = React.useMemo(() => getHotelOccupancySnapshot(selectedDate), [selectedDate]);

  if (!isVivaActive()) return null;

  const p = theme.palette;
  const isToday = selectedDate === dayjs().format("YYYY-MM-DD");
  const dateSuffix = isToday ? "сегодня" : formatHotelDate(selectedDate);
  const stayingColor = theme.palette.mode === "dark" ? "#a78bfa" : "#7c3aed";

  const occupancyColor =
    snap.occupancyPercent >= 90 ? p.success.main : snap.occupancyPercent >= 70 ? p.warning.main : p.error.main;

  const roomStatusRows: Array<[label: string, color: string, value: number]> = [
    ["Грязно", p.error.main, snap.roomStatus.dirty],
    ["Убрано", p.success.main, snap.roomStatus.cleaned],
    ["Проверено", p.info.main, snap.roomStatus.inspected],
    ["Ремонт", p.warning.main, snap.roomStatus.repair],
  ];
  const maxRoomStatus = Math.max(1, ...roomStatusRows.map(([, , v]) => v));

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" },
        gap: 1.5,
        flexShrink: 0,
      }}
    >
      <CardShell title={`Загрузка на ${dateSuffix}`}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: "12px",
              bgcolor: occupancyColor,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: "1.05rem",
              flexShrink: 0,
            }}
          >
            {snap.occupancyPercent}%
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600}>
              {snap.occupiedRooms} занято
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {snap.totalRooms} всего номеров
            </Typography>
          </Box>
        </Stack>
      </CardShell>

      <CardShell title={isToday ? "Гости сегодня" : `Гости на ${dateSuffix}`}>
        <Box>
          <StatRow
            color={p.success.main}
            label="Заезды / Горящая бронь"
            value={`${snap.guests.arrivals} / ${snap.guests.hotBookings}`}
          />
          <StatRow color={p.error.main} label="Выезды" value={snap.guests.departures} />
          <StatRow color={stayingColor} label="Проживания" value={snap.guests.staying} />
          <StatRow color={p.text.disabled} label="Незаезды" value={snap.guests.dueOut} />
          <StatRow color={p.text.disabled} label="Свободные номера" value={snap.guests.freeRooms} />
        </Box>
      </CardShell>

      <CardShell title="Заметки и указания">
        <Box>
          <StatRow color={p.warning.main} label="Запланировано на сегодня" value={snap.notes.scheduledToday} />
          <StatRow color={p.error.main} label="Просрочено" value={snap.notes.overdue} />
          <StatRow color={p.info.main} label="Запланировано на завтра" value={snap.notes.scheduledTomorrow} />
          <StatRow color={p.text.disabled} label="Не запланировано" value={snap.notes.unscheduled} />
        </Box>
      </CardShell>

      <CardShell title="Состояние номеров">
        <Stack gap={0.875}>
          {roomStatusRows.map(([label, color, value]) => (
            <Box key={label}>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.375 }}>
                <Typography variant="caption" color="text.secondary">
                  {label}
                </Typography>
                <Typography variant="caption" fontWeight={600}>
                  {value}
                </Typography>
              </Stack>
              <Box sx={{ height: 6, borderRadius: 3, bgcolor: theme.palette.action.hover, overflow: "hidden" }}>
                <Box
                  sx={{
                    height: "100%",
                    width: `${(value / maxRoomStatus) * 100}%`,
                    bgcolor: color,
                    borderRadius: 3,
                  }}
                />
              </Box>
            </Box>
          ))}
        </Stack>
      </CardShell>
    </Box>
  );
};

export default HotelOccupancyBanner;
