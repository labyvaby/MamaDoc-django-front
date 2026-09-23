/**
 * «Бронирования» — верхние карточки-сводка. Реальный бэкенд:
 * GET /hotel/dashboard/ (см. src/api/hotel.ts) — загрузка, заезды/выезды,
 * состояние номеров; «Задачи уборки» — открытые GET /hotel/housekeeping-tasks/
 * (status=open), разложенные по dueAt на клиенте (бэкенд отдаёт только
 * список, не готовые корзины).
 *
 * Самостоятельно решает, рендериться ли (isVivaActive) — точка подключения
 * (src/pages/schedule/django/index.tsx) остаётся однострочной.
 *
 * «Загрузка»/«Гости» — за число, выбранное кликом в RoomBookingGrid (общий
 * стор selectedHotelDate, см. mockDemoData.ts — то же локальное UI-состояние
 * сессии, что quickBookingRequest у CreateBookingButton, не бизнес-данные):
 * один клик — обе карточки сразу за другой день. «Задачи уборки»/«Состояние
 * номеров» от выбора не зависят — dashboard.roomState всегда на сейчас,
 * независимо от переданной date (см. HotelDashboard в hotel.ts).
 */
import React from "react";
import { Box, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { getSelectedHotelDate, subscribeSelectedHotelDate, useIsVivaActive, formatHotelDate } from "./mockDemoData";
import { useHotelProperty } from "./useHotelProperty";
import { getDashboard, listHousekeepingTasks } from "../api/hotel";

/**
 * `tint` — мягкая цветная подложка карточки (по образцу пастельных KPI-карточек
 * референс-дизайна), необязательна: не задана — карточка нейтральная, как раньше.
 * Принимает либо готовый цвет (для «Загрузки», где цвет зависит от процента),
 * либо ничего — тогда просто обычная белая карточка.
 */
const CardShell: React.FC<{ title: string; tint?: string; children: React.ReactNode }> = ({ title, tint, children }) => {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  return (
    <Paper
      elevation={0}
      variant="outlined"
      sx={{
        p: 1.75,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        minWidth: 0,
        ...(tint
          ? { bgcolor: alpha(tint, dark ? 0.16 : 0.1), borderColor: alpha(tint, dark ? 0.32 : 0.18) }
          : {}),
      }}
    >
      <Typography variant="subtitle2" fontWeight={600} color="text.secondary">
        {title}
      </Typography>
      {children}
    </Paper>
  );
};

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
  // результат просто не идёт в дело (useQuery остаётся выключенным через enabled).
  const selectedDate = React.useSyncExternalStore(subscribeSelectedHotelDate, getSelectedHotelDate);
  const vivaActive = useIsVivaActive();
  const { property } = useHotelProperty();

  const dashboardQuery = useQuery({
    queryKey: ["hotel", "dashboard", property?.id, selectedDate],
    queryFn: ({ signal }) => getDashboard(property!.id, selectedDate, signal),
    enabled: vivaActive && property != null,
  });
  const dashboard = dashboardQuery.data;

  const tasksQuery = useQuery({
    queryKey: ["hotel", "housekeepingTasks", property?.id, "open"],
    queryFn: ({ signal }) => listHousekeepingTasks({ propertyId: property!.id, status: "open" }, signal),
    enabled: vivaActive && property != null,
  });

  const todayStr = dayjs().format("YYYY-MM-DD");
  const tomorrowStr = dayjs().add(1, "day").format("YYYY-MM-DD");
  const taskBuckets = React.useMemo(() => {
    let scheduledToday = 0;
    let overdue = 0;
    let scheduledTomorrow = 0;
    let unscheduled = 0;
    for (const t of tasksQuery.data ?? []) {
      if (!t.dueAt) {
        unscheduled++;
        continue;
      }
      const due = dayjs(t.dueAt).format("YYYY-MM-DD");
      if (due < todayStr) overdue++;
      else if (due === todayStr) scheduledToday++;
      else if (due === tomorrowStr) scheduledTomorrow++;
    }
    return { scheduledToday, overdue, scheduledTomorrow, unscheduled };
  }, [tasksQuery.data, todayStr, tomorrowStr]);

  if (!vivaActive) return null;

  if (!dashboard) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  const p = theme.palette;
  const isToday = selectedDate === todayStr;
  const dateSuffix = isToday ? "сегодня" : formatHotelDate(selectedDate);
  const stayingColor = theme.palette.mode === "dark" ? "#a78bfa" : "#7c3aed";

  const occupancyPercent = Number(dashboard.occupancyPercent);
  const occupancyColor = occupancyPercent >= 90 ? p.success.main : occupancyPercent >= 70 ? p.warning.main : p.error.main;

  const roomStatusRows: Array<[label: string, color: string, value: number]> = [
    ["Грязно", p.error.main, dashboard.roomState.dirty],
    ["Убрано", p.success.main, dashboard.roomState.clean],
    ["Проверено", p.info.main, dashboard.roomState.inspected],
    ["Ремонт", p.warning.main, dashboard.roomState.repair],
  ];
  const roomStatusTotal = roomStatusRows.reduce((sum, [, , v]) => sum + v, 0);
  // Донат рисуем только по ненулевым срезам — нулевой value рисует Recharts как
  // невидимую дугу нулевой длины, но легенду справа показываем по всем строкам.
  const roomStatusPie = roomStatusRows.filter(([, , v]) => v > 0).map(([label, color, value]) => ({ label, color, value }));

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" },
        gap: 1.5,
        flexShrink: 0,
      }}
    >
      <CardShell title={`Загрузка на ${dateSuffix}`} tint={occupancyColor}>
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
            {occupancyPercent}%
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600}>
              {dashboard.occupiedRooms} занято
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {dashboard.totalRooms} всего номеров
            </Typography>
          </Box>
        </Stack>
      </CardShell>

      <CardShell title={isToday ? "Гости сегодня" : `Гости на ${dateSuffix}`} tint={p.info.main}>
        <Box>
          <StatRow color={p.success.main} label="Заезды / уже заехало" value={`${dashboard.arrivals} / ${dashboard.arrived}`} />
          <StatRow color={p.error.main} label="Выезды / уже выехало" value={`${dashboard.departures} / ${dashboard.departed}`} />
          <StatRow color={stayingColor} label="Проживают" value={dashboard.staying} />
          <StatRow color={p.warning.main} label="Просрочено (не заехали)" value={dashboard.overdueArrivals} />
          <StatRow color={p.text.disabled} label="Свободные номера" value={dashboard.freeRooms} />
        </Box>
      </CardShell>

      <CardShell title="Задачи уборки" tint={p.warning.main}>
        <Box>
          <StatRow color={p.warning.main} label="Запланировано на сегодня" value={taskBuckets.scheduledToday} />
          <StatRow color={p.error.main} label="Просрочено" value={taskBuckets.overdue} />
          <StatRow color={p.info.main} label="Запланировано на завтра" value={taskBuckets.scheduledTomorrow} />
          <StatRow color={p.text.disabled} label="Без срока" value={taskBuckets.unscheduled} />
        </Box>
      </CardShell>

      <CardShell title="Состояние номеров">
        <Stack direction="row" alignItems="center" gap={1.5}>
          {/* Донат вместо плоских полосок — по образцу карточки «Reservations» в референсе. */}
          <Box sx={{ position: "relative", width: 84, height: 84, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={roomStatusPie}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={26}
                  outerRadius={40}
                  paddingAngle={roomStatusPie.length > 1 ? 2 : 0}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {roomStatusPie.map((slice) => (
                    <Cell key={slice.label} fill={slice.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1 }}>
                {roomStatusTotal}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem" }}>
                номеров
              </Typography>
            </Box>
          </Box>
          <Stack gap={0.5} sx={{ flex: 1, minWidth: 0 }}>
            {roomStatusRows.map(([label, color, value]) => (
              <Stack key={label} direction="row" alignItems="center" gap={0.75}>
                <Dot color={color} />
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0 }} noWrap>
                  {label}
                </Typography>
                <Typography variant="caption" fontWeight={600} sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {value}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Stack>
      </CardShell>
    </Box>
  );
};

export default HotelOccupancyBanner;
