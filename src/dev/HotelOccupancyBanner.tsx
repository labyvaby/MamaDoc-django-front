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
import { Box, ButtonBase, CircularProgress, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import ArrowForwardOutlined from "@mui/icons-material/ArrowForwardOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import ExpandLessOutlined from "@mui/icons-material/ExpandLessOutlined";
import { getSelectedHotelDate, subscribeSelectedHotelDate, useIsVivaActive, formatHotelDate } from "./mockDemoData";
import { formatSellableSummary, hotelRoomStateColor } from "./hotelDisplay";
import { useHotelProperty } from "./useHotelProperty";
import { useInHouse } from "./useInHouse";
import { plural } from "./hotelUi";
import { getDashboard, listHousekeepingTasks } from "../api/hotel";

/**
 * `tint` — мягкая цветная подложка карточки (по образцу пастельных KPI-карточек
 * референс-дизайна), необязательна: не задана — карточка нейтральная, как раньше.
 * Принимает либо готовый цвет (для «Загрузки», где цвет зависит от процента),
 * либо ничего — тогда просто обычная белая карточка. `onClick` — карточка
 * ведёт на страницу с деталями (сейчас только «Задачи уборки» → /housekeeping).
 */
const CardShell: React.FC<{ title: string; onClick?: () => void; children: React.ReactNode }> = ({ title, onClick, children }) => (
  // Нейтральная карточка: цвет несут точки и цифры, а не заливка — тонированные
  // подложки в тёмной теме давали грязно-бурые плашки.
  <Paper
    elevation={0}
    variant="outlined"
    onClick={onClick}
    sx={{
      p: 2,
      borderRadius: "14px",
      display: "flex",
      flexDirection: "column",
      gap: 1.25,
      minWidth: 0,
      ...(onClick
        ? { cursor: "pointer", transition: "border-color .15s", "&:hover": { borderColor: "text.secondary" }, "&:hover .card-go": { opacity: 1 } }
        : {}),
    }}
  >
    <Stack direction="row" alignItems="center" justifyContent="space-between">
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}>
        {title}
      </Typography>
      {onClick && <ArrowForwardOutlined className="card-go" sx={{ fontSize: 16, color: "text.secondary", opacity: 0.4, transition: "opacity .15s" }} />}
    </Stack>
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
    <Typography
      variant="body2"
      fontWeight={600}
      sx={{ fontVariantNumeric: "tabular-nums", color: value === 0 || value === "0 / 0" ? "text.disabled" : "text.primary" }}
    >
      {value}
    </Typography>
  </Stack>
);

/**
 * Сводку можно свернуть в одну строку — тогда шахматке достаётся вся высота
 * экрана (заказчик: «как можно больше информации до скролла»). По умолчанию
 * свёрнута; выбор запоминается на устройстве.
 */
const COLLAPSED_KEY = "mamadoc:hotel-banner:collapsed";
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) !== "0";
  } catch {
    return true;
  }
}

/** Пункт свёрнутой сводки: точка цвета, подпись, число. */
const StripStat: React.FC<{ color: string; label: string; value: React.ReactNode; onClick?: () => void; title?: string }> = ({ color, label, value, onClick, title }) => {
  const content = (
    <Stack direction="row" alignItems="center" gap={0.75} sx={{ px: 1, py: 0.5, borderRadius: "8px", whiteSpace: "nowrap" }}>
      <Dot color={color} />
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Typography>
    </Stack>
  );
  return onClick ? (
    <Tooltip title={title ?? ""}>
      <ButtonBase onClick={onClick} sx={{ borderRadius: "8px", "&:hover": { bgcolor: "action.hover" } }}>
        {content}
      </ButtonBase>
    </Tooltip>
  ) : (
    content
  );
};

export const HotelOccupancyBanner: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  // Хуки вызываются безусловно (Rules of Hooks) — если Viva не активна, их
  // результат просто не идёт в дело (useQuery остаётся выключенным через enabled).
  const selectedDate = React.useSyncExternalStore(subscribeSelectedHotelDate, getSelectedHotelDate);
  const vivaActive = useIsVivaActive();
  const { property, isLoading: propertyLoading } = useHotelProperty();
  const [collapsed, setCollapsedState] = React.useState<boolean>(readCollapsed);
  const setCollapsed = (v: boolean) => {
    setCollapsedState(v);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
    } catch {
      // не запомнится — не страшно
    }
  };

  const dashboardQuery = useQuery({
    queryKey: ["hotel", "dashboard", property?.id, selectedDate],
    queryFn: ({ signal }) => getDashboard(property!.id, selectedDate, signal),
    enabled: vivaActive && property != null,
  });
  const dashboard = dashboardQuery.data;
  // «Проживают» и «Не заехали» — по общему правилу (hotelInHouse), не по сводке сервера:
  // та считала проживающим гостя, который не приехал.
  const inHouse = useInHouse(property?.id, selectedDate, vivaActive).data;

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
  // Без объекта (не выбран филиал) грузить нечего: шахматка ниже сама покажет
  // выбор филиала, а вечный спиннер над ним только сбивал с толку.
  if (!property && !propertyLoading) return null;
  if (dashboardQuery.isError) return null;

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
  // Снятые с продажи на дату. Бэк строит дашборд из дневного отчёта
  // (free = total − occupied − blocked), поле blocked пока не отдаёт — берём
  // его из тех же итогов, а не пересчитываем по статусам номеров.
  const blockedRooms =
    dashboard.blockedRooms ?? Math.max(0, dashboard.totalRooms - dashboard.occupiedRooms - dashboard.freeRooms);
  const occupancyColor = occupancyPercent >= 90 ? p.success.main : occupancyPercent >= 70 ? p.warning.main : p.error.main;

  // Цвета — те же, что точки в шахматке и на «Номерах» (hotelRoomStateColor), иначе
  // «Ремонт» здесь был оранжевым, а там серым.
  const roomStatusRows: Array<[label: string, color: string, value: number]> = [
    ["Грязно", hotelRoomStateColor("dirty", theme), dashboard.roomState.dirty],
    ["Убрано", hotelRoomStateColor("clean", theme), dashboard.roomState.clean],
    ["Проверено", hotelRoomStateColor("inspected", theme), dashboard.roomState.inspected],
    ["Ремонт", hotelRoomStateColor("repair", theme), dashboard.roomState.repair],
  ];
  const roomStatusTotal = roomStatusRows.reduce((sum, [, , v]) => sum + v, 0);
  // Донат рисуем только по ненулевым срезам — нулевой value рисует Recharts как
  // невидимую дугу нулевой длины, но легенду справа показываем по всем строкам.
  const roomStatusPie = roomStatusRows.filter(([, , v]) => v > 0).map(([label, color, value]) => ({ label, color, value }));

  if (collapsed) {
    return (
      <Paper
        elevation={0}
        variant="outlined"
        sx={{ borderRadius: "12px", px: 1, py: 0.5, display: "flex", alignItems: "center", gap: 0.25, flexWrap: "wrap", flexShrink: 0 }}
      >
        <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary", px: 1 }}>
          {isToday ? "Сегодня" : dateSuffix}
        </Typography>
        <StripStat color={occupancyColor} label="Загрузка" value={`${Math.round(occupancyPercent)}%`} />
        <StripStat color={p.success.main} label="Заезды" value={`${dashboard.arrivals} / ${dashboard.arrived}`} />
        <StripStat color={p.error.main} label="Выезды" value={`${dashboard.departures} / ${dashboard.departed}`} />
        <StripStat
          color={stayingColor}
          label="Проживают"
          value={inHouse ? `${inHouse.guests} · ${inHouse.rooms} ном.` : "…"}
          title={inHouse ? `${inHouse.guests} ${plural(inHouse.guests, "гость", "гостя", "гостей")} в ${inHouse.rooms} ${plural(inHouse.rooms, "номере", "номерах", "номерах")}` : undefined}
        />
        <StripStat color={p.text.disabled} label="Свободно" value={dashboard.freeRooms} />
        {(inHouse?.missedRooms ?? 0) > 0 && (
          <StripStat color={p.warning.main} label="Не заехали" value={inHouse!.missedRooms} onClick={() => navigate("/reception")} title="Отметить незаезды на ресепшене" />
        )}
        <StripStat
          color={hotelRoomStateColor("dirty", theme)}
          label="Грязно"
          value={dashboard.roomState.dirty}
          onClick={() => navigate("/housekeeping")}
          title="Задачи уборки"
        />
        <StripStat
          color={p.warning.main}
          label="Уборка сегодня"
          value={taskBuckets.overdue > 0 ? `${taskBuckets.scheduledToday} · ${taskBuckets.overdue} просроч.` : taskBuckets.scheduledToday}
          onClick={() => navigate("/housekeeping")}
          title="Задачи уборки"
        />
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Развернуть сводку">
          <IconButton size="small" onClick={() => setCollapsed(false)} aria-label="Развернуть сводку">
            <ExpandMoreOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      </Paper>
    );
  }

  return (
    <Box sx={{ position: "relative", flexShrink: 0 }}>
      <Tooltip title="Свернуть сводку в строку — больше места шахматке">
        <IconButton
          size="small"
          onClick={() => setCollapsed(true)}
          aria-label="Свернуть сводку"
          sx={{ position: "absolute", top: -14, right: -6, zIndex: 1, bgcolor: "background.paper", border: 1, borderColor: "divider", "&:hover": { bgcolor: "background.paper" } }}
        >
          <ExpandLessOutlined sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" },
        gap: 2,
        flexShrink: 0,
      }}
    >
      <CardShell title={`Загрузка на ${dateSuffix}`}>
        <Stack direction="row" alignItems="baseline" gap={1}>
          <Typography sx={{ fontSize: 34, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
            {Math.round(occupancyPercent)}%
          </Typography>
          <Typography variant="body2" color="text.secondary">
            занято {formatSellableSummary(dashboard.occupiedRooms, dashboard.totalRooms, blockedRooms)}
          </Typography>
        </Stack>
        <Box sx={{ height: 6, borderRadius: 3, bgcolor: alpha(theme.palette.text.primary, 0.08), overflow: "hidden" }}>
          <Box sx={{ width: `${Math.min(100, occupancyPercent)}%`, height: "100%", borderRadius: 3, bgcolor: occupancyColor, transition: "width .4s" }} />
        </Box>
        <Typography variant="caption" color="text.secondary">
          {dashboard.freeRooms} {dashboard.freeRooms === 1 ? "номер свободен" : "номеров свободно"}
          {dashboard.activeHolds > 0 ? ` · ${dashboard.activeHolds} в удержании` : ""}
        </Typography>
      </CardShell>

      <CardShell title={isToday ? "Гости сегодня" : `Гости на ${dateSuffix}`}>
        <Box>
          <StatRow color={p.success.main} label="Заезды / уже заехало" value={`${dashboard.arrivals} / ${dashboard.arrived}`} />
          <StatRow color={p.error.main} label="Выезды / уже выехало" value={`${dashboard.departures} / ${dashboard.departed}`} />
          <StatRow
            color={stayingColor}
            label="Проживают"
            value={inHouse ? `${inHouse.guests} ${plural(inHouse.guests, "гость", "гостя", "гостей")} · ${inHouse.rooms} ном.` : "…"}
          />
          <StatRow color={p.warning.main} label="Не заехали (держат номер)" value={inHouse?.missedRooms ?? "…"} />
          <StatRow color={p.text.disabled} label="Свободные номера" value={dashboard.freeRooms} />
        </Box>
      </CardShell>

      <CardShell title="Задачи уборки" onClick={() => navigate("/housekeeping")}>
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
    </Box>
  );
};

export default HotelOccupancyBanner;
