/**
 * «Ресепшен» — ежедневный экран администратора.
 *
 *   • «Сегодня» — кто заезжает, кто выезжает, кто живёт (на выбранную дату),
 *     с «Заселить» / «Выселить» прямо в строке. Раньше это были только цифры
 *     в карточке над шахматкой. Отдельно — «Требуют внимания»: гость не
 *     выехал в срок или не заехал (фильтр «живут на дату» их не покажет —
 *     срок уже прошёл, а номер занят/держится).
 *   • «Все брони» — таблица с поиском по имени, телефону и номеру брони и фильтром
 *     по статусу: гость звонит «я бронировал на ноябрь» — искать по сетке
 *     шахматки больше не нужно.
 *
 * Всё — GET /v2/hotel/reservations/ (arrivingOn / departingOn / inHouseOn /
 * q / status / limit / offset). Клик по строке — обычная карточка брони
 * (ReservationDetailsDialog) со всеми действиями. Если заселить/выселить из
 * строки нельзя без решения (номер не убран, есть долг) — открываем карточку.
 */
import React from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AccessTimeOutlined from "@mui/icons-material/AccessTimeOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import PeopleOutlineOutlined from "@mui/icons-material/PeopleOutlineOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import FlightLandOutlined from "@mui/icons-material/FlightLandOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import KingBedOutlined from "@mui/icons-material/KingBedOutlined";
import ReportProblemOutlined from "@mui/icons-material/ReportProblemOutlined";
import EventNoteOutlined from "@mui/icons-material/EventNoteOutlined";
import dayjs, { type Dayjs } from "dayjs";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router";
import { useSnackbar } from "notistack";

import { usePageTitle } from "../hooks/usePageTitle";
import { useCan } from "../hooks/useCan";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { checkInReservationItem, checkOutReservationItem, listReservations, type HotelReservation } from "../api/hotel";
import { ApiError, getErrorMessage } from "../api/client";
import { subtleBorder } from "../theme/uiHelpers";
import { useHotelProperty } from "./useHotelProperty";
import { HotelPropertyMissing } from "./HotelPropertyMissing";
import { formatHotelDate, formatHotelDateRange, initialsOf, nightsBetween, useIsVivaActive } from "./mockDemoData";
import {
  HOTEL_BOOKING_SOURCE_LABELS,
  HOTEL_RESERVATION_STATUS_LABELS,
  HOTEL_STAY_STATUS_LABELS,
  hotelStayStatusColor,
  hotelSourceColor,
  formatHotelTime,
  mapStayDisplayStatus,
} from "./hotelDisplay";
import { CreateBookingButton } from "./CreateBookingButton";
import { exportReservationsXlsx } from "./hotelListsXlsx";
import { fetchAllReservations } from "./hotelReportData";
import { ReservationDetailsDialog } from "./ReservationDetailsDialog";
import { DateStepper, EmptyState, FilterChip, HotelPage, HotelPageHeader, plural, StatusPill, Surface, useHotelTableSx } from "./hotelUi";

type Tab = "today" | "all";
const LIVE = new Set<HotelReservation["status"]>(["draft", "hold", "confirmed"]);
const PAGE_SIZE = 25;

const money = (v: string | number) => `${Number(v).toLocaleString("ru-RU")} сом`;

/** «к оплате 8 400 сом» / «оплачено». */
const BalancePill: React.FC<{ reservation: HotelReservation }> = ({ reservation }) => {
  const theme = useTheme();
  const balance = Number(reservation.balanceDue);
  return balance > 0 ? (
    <StatusPill color={theme.palette.error.main} label={`к оплате ${money(balance)}`} />
  ) : (
    <StatusPill color={theme.palette.success.main} label="оплачено" />
  );
};

// ── «Кто сегодня заедет?» ───────────────────────────────────────────────────

/**
 * Карточка заезда: гость, номер (или «без номера»), даты, гости, источник,
 * долг и паспорт — всё, что администратору нужно перед заселением, без
 * открытия брони. Кнопка — заселить в один клик (или открыть бронь, если
 * решение за человеком: номер не убран, группа, нет номера).
 */
const ArrivalCard: React.FC<{
  reservation: HotelReservation;
  checkInTime: string | null;
  action?: { label: string; onClick: () => void; busy: boolean; disabled?: boolean };
  onOpen: () => void;
}> = ({ reservation: r, checkInTime, action, onOpen }) => {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  const item = r.items[0];
  const guest = item?.guests.find((g) => g.isPrimary) ?? item?.guests[0];
  const name = r.customerName || guest?.fullName || "Без заказчика";
  const balance = Number(r.balanceDue);
  const arrived = r.items.every((i) => i.stayStatus !== "expected");
  const nights = item ? nightsBetween(item.checkIn, item.checkOut) : 0;
  const guests = r.items.reduce((s, i) => s + i.adults + i.children, 0);
  // null — нет права видеть документы: тогда про паспорт не говорим ничего.
  const docKnown = guest?.document != null;
  const hasDoc = Boolean(guest?.document?.documentNumber);
  const rooms = r.items.map((i) => i.roomNumber).filter(Boolean) as string[];
  const accent = arrived ? theme.palette.success.main : balance > 0 ? theme.palette.error.main : theme.palette.primary.main;
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      sx={{
        position: "relative",
        p: 2,
        borderRadius: "16px",
        bgcolor: "background.paper",
        border: `1px solid ${subtleBorder(theme)}`,
        boxShadow: dark ? "none" : "0 1px 2px rgba(15,23,42,.04)",
        cursor: "pointer",
        overflow: "hidden",
        transition: "border-color .15s, box-shadow .15s, transform .15s",
        opacity: arrived ? 0.75 : 1,
        "&::before": { content: '""', position: "absolute", left: 0, top: 0, bottom: 0, width: 4, bgcolor: accent },
        "&:hover, &:focus-visible": {
          borderColor: alpha(accent, 0.5),
          boxShadow: dark ? "none" : "0 8px 24px rgba(15,23,42,.08)",
          outline: "none",
        },
      }}
    >
      <Stack direction="row" alignItems="flex-start" gap={1.5}>
        <Avatar sx={{ width: 44, height: 44, fontSize: 15, fontWeight: 800, bgcolor: alpha(accent, dark ? 0.25 : 0.12), color: accent }}>
          {initialsOf(name)}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 15.5, lineHeight: 1.25 }} noWrap title={name}>
            {name}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div" noWrap>
            Бронь №{r.number}
            {item ? ` · ${item.roomTypeName}` : ""}
          </Typography>
        </Box>
        <Box
          sx={{
            flexShrink: 0,
            px: 1.25,
            py: 0.5,
            borderRadius: "10px",
            textAlign: "center",
            bgcolor: rooms.length ? alpha(theme.palette.text.primary, dark ? 0.1 : 0.05) : alpha(theme.palette.warning.main, 0.14),
            color: rooms.length ? "text.primary" : "warning.main",
          }}
        >
          <Typography sx={{ fontWeight: 800, fontSize: rooms.length ? 18 : 12, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
            {rooms.length ? rooms.slice(0, 3).join(", ") : "без номера"}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10.5 }}>
            {r.items.length > 1 ? `${r.items.length} номера` : "номер"}
          </Typography>
        </Box>
      </Stack>

      <Stack direction="row" gap={1.5} rowGap={0.5} flexWrap="wrap" sx={{ mt: 1.5, color: "text.secondary" }}>
        <Stack direction="row" alignItems="center" gap={0.5}>
          <AccessTimeOutlined sx={{ fontSize: 15 }} />
          <Typography variant="caption">
            {checkInTime ? `с ${checkInTime}` : "сегодня"} · {nights} {plural(nights, "ночь", "ночи", "ночей")}
            {item ? ` · до ${formatHotelDate(item.checkOut)}` : ""}
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" gap={0.5}>
          <PeopleOutlineOutlined sx={{ fontSize: 15 }} />
          <Typography variant="caption">{guests} {plural(guests, "гость", "гостя", "гостей")}</Typography>
        </Stack>
        <Stack direction="row" alignItems="center" gap={0.5}>
          <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: hotelSourceColor(r.source) }} />
          <Typography variant="caption">{HOTEL_BOOKING_SOURCE_LABELS[r.source] ?? r.source}</Typography>
        </Stack>
      </Stack>

      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ mt: 1.5 }}>
        {balance > 0 ? (
          <StatusPill color={theme.palette.error.main} label={`к оплате ${money(balance)}`} />
        ) : (
          <StatusPill color={theme.palette.success.main} label="оплачено" />
        )}
        {docKnown && (
          <StatusPill
            color={hasDoc ? theme.palette.success.main : theme.palette.warning.main}
            label={
              <Stack component="span" direction="row" alignItems="center" gap={0.5}>
                <BadgeOutlined sx={{ fontSize: 13 }} />
                {hasDoc ? "паспорт внесён" : "нет паспорта"}
              </Stack>
            }
          />
        )}
        <Box sx={{ ml: "auto" }}>
          {arrived ? (
            <Stack direction="row" alignItems="center" gap={0.5} sx={{ color: "success.main" }}>
              <CheckCircleOutlined sx={{ fontSize: 18 }} />
              <Typography variant="body2" fontWeight={700}>
                Заселён
              </Typography>
            </Stack>
          ) : action ? (
            <Button
              size="small"
              variant="contained"
              disableElevation
              disabled={action.busy || action.disabled}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
              }}
              sx={{ borderRadius: "10px", fontWeight: 700, minWidth: 104 }}
            >
              {action.busy ? "…" : action.label}
            </Button>
          ) : null}
        </Box>
      </Stack>
    </Box>
  );
};

// ── Строка списка «Сегодня» ─────────────────────────────────────────────────

const ReservationRow: React.FC<{
  reservation: HotelReservation;
  action?: { label: string; onClick: () => void; busy: boolean; disabled?: boolean };
  note?: string;
  onOpen: () => void;
}> = ({ reservation, action, note, onOpen }) => {
  const theme = useTheme();
  const item = reservation.items[0];
  const name = reservation.customerName || item?.guests[0]?.fullName || "Без заказчика";
  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={1.5}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      sx={{
        px: 2,
        py: 1.25,
        cursor: "pointer",
        borderTop: `1px solid ${subtleBorder(theme)}`,
        "&:first-of-type": { borderTop: "none" },
        "&:hover, &:focus-visible": { bgcolor: "action.hover", outline: "none" },
      }}
    >
      <Avatar sx={{ width: 36, height: 36, fontSize: 12, fontWeight: 700 }}>{initialsOf(name)}</Avatar>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" fontWeight={700} noWrap>
          {name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap component="div">
          {reservation.items.length > 1 && item
            ? `группа · ${reservation.items.length} номеров: ${reservation.items.map((i) => i.roomNumber ?? "—").join(", ")} · ${formatHotelDateRange(item.checkIn, item.checkOut)}`
            : item
            ? `номер ${item.roomNumber ?? "не назначен"} · ${item.roomTypeName} · ${formatHotelDateRange(item.checkIn, item.checkOut)} · ${nightsBetween(item.checkIn, item.checkOut)} ноч.`
            : `бронь №${reservation.number}`}
        </Typography>
        {note && (
          <Typography variant="caption" color="error.main" fontWeight={600} component="div">
            {note}
          </Typography>
        )}
      </Box>
      {/* sm в теме — 360px: на телефоне пилюля съедает имя, показываем её с md. */}
      <Box sx={{ display: { xs: "none", md: "block" }, flexShrink: 0 }}>
        <BalancePill reservation={reservation} />
      </Box>
      {action && (
        <Button
          size="small"
          variant="contained"
          disableElevation
          disabled={action.busy || action.disabled}
          onClick={(e) => {
            e.stopPropagation();
            action.onClick();
          }}
          sx={{ flexShrink: 0, borderRadius: "8px", minWidth: 96 }}
        >
          {action.busy ? "…" : action.label}
        </Button>
      )}
    </Stack>
  );
};

const ListCard: React.FC<{ icon: React.ReactNode; title: string; count: number; color: string; empty: string; loading: boolean; children: React.ReactNode }> = ({
  icon,
  title,
  count,
  color,
  empty,
  loading,
  children,
}) => (
  <Surface padded={false} sx={{ overflow: "hidden" }}>
    <Stack direction="row" alignItems="center" gap={1.25} sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
      <Box sx={{ color, display: "flex", "& svg": { fontSize: 20 } }}>{icon}</Box>
      <Typography sx={{ fontWeight: 700, flex: 1 }}>{title}</Typography>
      <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: count > 0 ? "text.primary" : "text.disabled" }}>{count}</Typography>
    </Stack>
    {loading ? (
      <Stack alignItems="center" sx={{ py: 3 }}>
        <CircularProgress size={22} />
      </Stack>
    ) : count === 0 ? (
      <Typography variant="body2" color="text.disabled" sx={{ px: 2, py: 2.5 }}>
        {empty}
      </Typography>
    ) : (
      children
    )}
  </Surface>
);

// ── «Сегодня» ───────────────────────────────────────────────────────────────

const OVERDUE_PREVIEW = 3;

const TodayTab: React.FC<{ propertyId: number; onOpen: (id: number) => void }> = ({ propertyId, onOpen }) => {
  const theme = useTheme();
  const { property } = useHotelProperty();
  const checkInTime = property?.checkInTime ? formatHotelTime(property.checkInTime) : null;
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const canManageStays = useCan("hotel.stays.manage");
  const [date, setDate] = React.useState<Dayjs>(dayjs());
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [showAllOverdue, setShowAllOverdue] = React.useState(false);
  const dateStr = date.format("YYYY-MM-DD");
  const todayStr = dayjs().format("YYYY-MM-DD");
  const isToday = dateStr === todayStr;

  const useList = (name: string, params: Record<string, string | number>, enabled = true) =>
    useQuery({
      queryKey: ["hotel", "reservations", "reception", propertyId, name, params],
      queryFn: ({ signal }) => listReservations({ propertyId, limit: 200, ...params }, signal),
      enabled,
      // Списки одной даты: при смене даты прошлые строки не показываем.
      placeholderData: undefined,
    });
  const arrivingQuery = useList("arriving", { arrivingOn: dateStr });
  const departingQuery = useList("departing", { departingOn: dateStr });
  const inHouseQuery = useList("inHouse", { inHouseOn: dateStr });
  // Просроченные: брони последних 30 дней, срок которых уже прошёл, а гость
  // так и не заехал либо не выехал. Только для «сегодня».
  const recentQuery = useList(
    "recent",
    { from: dayjs().subtract(30, "day").format("YYYY-MM-DD"), to: todayStr, status: "confirmed" },
    isToday,
  );

  const live = (list: HotelReservation[] | undefined) => (list ?? []).filter((r) => LIVE.has(r.status));
  const arriving = live(arrivingQuery.data?.results);
  const departing = live(departingQuery.data?.results);
  const inHouse = live(inHouseQuery.data?.results).filter((r) => r.items.some((i) => i.stayStatus === "checked_in"));
  const overdue = isToday
    ? live(recentQuery.data?.results)
        .map((r) => {
          const item = r.items[0];
          if (!item) return null;
          if (item.stayStatus === "checked_in" && item.checkOut < todayStr) return { r, note: `Не выехал: выезд был ${formatHotelDate(item.checkOut)}` };
          if (item.stayStatus === "expected" && item.checkIn < todayStr) return { r, note: `Не заехал: заезд был ${formatHotelDate(item.checkIn)}` };
          return null;
        })
        .filter((x): x is { r: HotelReservation; note: string } => x != null)
    : [];

  const act = async (reservation: HotelReservation, kind: "in" | "out") => {
    const item = reservation.items[0];
    if (!item) return;
    setBusyId(reservation.id);
    try {
      if (kind === "in") await checkInReservationItem(reservation.id, item.id, { version: reservation.version });
      else await checkOutReservationItem(reservation.id, item.id, { version: reservation.version });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reservation", reservation.id] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "housekeepingTasks"] });
      enqueueSnackbar(kind === "in" ? `Гость заселён в номер ${item.roomNumber ?? ""}` : `Гость выселен из номера ${item.roomNumber ?? ""}`, { variant: "success" });
    } catch (err) {
      // Нужно решение человека — оно принимается в карточке брони.
      if (err instanceof ApiError && err.code === "ROOM_NOT_READY") {
        enqueueSnackbar("Номер не убран — решите в карточке брони", { variant: "warning" });
        onOpen(reservation.id);
      } else if (err instanceof ApiError && err.code === "HAS_DEBT") {
        enqueueSnackbar("У гостя долг — примите оплату или выселите с долгом в карточке брони", { variant: "warning" });
        onOpen(reservation.id);
      } else {
        enqueueSnackbar(getErrorMessage(err, kind === "in" ? "Не удалось заселить" : "Не удалось выселить"), { variant: "error" });
      }
    } finally {
      setBusyId(null);
    }
  };

  // Групповую бронь заселяют и выселяют по номерам в карточке — одной кнопкой
  // в строке было бы непонятно, какой номер.
  const groupAction = (r: HotelReservation) => ({ label: "Открыть", onClick: () => onOpen(r.id), busy: false });
  const checkInAction = (r: HotelReservation) =>
    r.items.length > 1
      ? canManageStays && r.status === "confirmed" && r.items.some((i) => i.stayStatus === "expected")
        ? groupAction(r)
        : undefined
      : canManageStays && r.status === "confirmed" && r.items[0]?.stayStatus === "expected"
      ? { label: "Заселить", onClick: () => void act(r, "in"), busy: busyId === r.id, disabled: busyId != null && busyId !== r.id }
      : undefined;
  const checkOutAction = (r: HotelReservation) =>
    r.items.length > 1
      ? canManageStays && r.items.some((i) => i.stayStatus === "checked_in")
        ? groupAction(r)
        : undefined
      : canManageStays && r.items[0]?.stayStatus === "checked_in"
      ? { label: "Выселить", onClick: () => void act(r, "out"), busy: busyId === r.id, disabled: busyId != null && busyId !== r.id }
      : undefined;

  const anyError = arrivingQuery.error ?? departingQuery.error ?? inHouseQuery.error;

  return (
    <>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
        <Typography variant="body2" color="text.secondary">
          {arriving.length} {plural(arriving.length, "заезд", "заезда", "заездов")} · {departing.length}{" "}
          {plural(departing.length, "выезд", "выезда", "выездов")} · {inHouse.length} {plural(inHouse.length, "проживает", "проживают", "проживают")}
        </Typography>
        <DateStepper value={date} onChange={setDate} />
      </Stack>

      {anyError && (
        <Alert severity="error" variant="outlined">
          {getErrorMessage(anyError, "Не удалось загрузить брони")}
        </Alert>
      )}

      {/* «Кто сегодня заедет?» — карточками, крупно: это первое, что смотрит ресепшен утром. */}
      <Box>
        <Stack direction="row" alignItems="center" gap={1.25} sx={{ mb: 1.5 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "11px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: alpha(theme.palette.success.main, theme.palette.mode === "dark" ? 0.2 : 0.1),
              color: "success.main",
            }}
          >
            <FlightLandOutlined fontSize="small" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em" }}>
              {isToday ? "Кто сегодня заедет?" : `Кто заедет ${formatHotelDate(dateStr)}?`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {arrivingQuery.isPending
                ? "Загружаем…"
                : arriving.length === 0
                  ? "Заездов нет"
                  : `${arriving.length} ${plural(arriving.length, "заезд", "заезда", "заездов")} · заселено ${arriving.filter((r) => r.items.every((i) => i.stayStatus !== "expected")).length} · с долгом ${arriving.filter((r) => Number(r.balanceDue) > 0).length}`}
            </Typography>
          </Box>
        </Stack>
        {arrivingQuery.isPending ? (
          <Stack alignItems="center" sx={{ py: 3 }}>
            <CircularProgress size={22} />
          </Stack>
        ) : arriving.length === 0 ? (
          <Surface sx={{ py: 2.5 }}>
            <Typography variant="body2" color="text.secondary">
              {isToday ? "Сегодня заездов нет — самое время проверить уборку и завтрашние брони." : "На эту дату заездов нет."}
            </Typography>
          </Surface>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr", xl: "1fr 1fr 1fr" }, gap: 1.5 }}>
            {[...arriving]
              .sort((a, b) => Number(a.items.every((i) => i.stayStatus !== "expected")) - Number(b.items.every((i) => i.stayStatus !== "expected")))
              .map((r) => (
                <ArrivalCard key={r.id} reservation={r} checkInTime={checkInTime} action={isToday ? checkInAction(r) : undefined} onOpen={() => onOpen(r.id)} />
              ))}
          </Box>
        )}
      </Box>

      {/* Просроченные — важны, но не должны заслонять заезды дня: первые три, остальные по кнопке. */}
      {overdue.length > 0 && (
        <ListCard icon={<ReportProblemOutlined />} title="Требуют внимания" count={overdue.length} color={theme.palette.error.main} empty="" loading={false}>
          {(showAllOverdue ? overdue : overdue.slice(0, OVERDUE_PREVIEW)).map(({ r, note }) => (
            <ReservationRow key={r.id} reservation={r} note={note} action={checkOutAction(r) ?? checkInAction(r)} onOpen={() => onOpen(r.id)} />
          ))}
          {overdue.length > OVERDUE_PREVIEW && (
            <Box sx={{ borderTop: 1, borderColor: "divider", px: 1, py: 0.5 }}>
              <Button size="small" onClick={() => setShowAllOverdue((v) => !v)} sx={{ fontWeight: 600 }}>
                {showAllOverdue ? "Свернуть" : `Показать все ${overdue.length}`}
              </Button>
            </Box>
          )}
        </ListCard>
      )}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2, alignItems: "start" }}>
        <ListCard
          icon={<LogoutOutlined />}
          title={isToday ? "Выезжают сегодня" : "Выезжают"}
          count={departing.length}
          color={theme.palette.error.main}
          empty="Выездов нет"
          loading={departingQuery.isPending}
        >
          {departing.map((r) => (
            <ReservationRow key={r.id} reservation={r} action={isToday ? checkOutAction(r) : undefined} onOpen={() => onOpen(r.id)} />
          ))}
        </ListCard>
        <ListCard icon={<KingBedOutlined />} title="Проживают" count={inHouse.length} color={theme.palette.info.main} empty="Сейчас никто не проживает" loading={inHouseQuery.isPending}>
          {inHouse.map((r) => (
            <ReservationRow key={r.id} reservation={r} onOpen={() => onOpen(r.id)} />
          ))}
        </ListCard>
      </Box>
    </>
  );
};

// ── «Все брони» ─────────────────────────────────────────────────────────────

const STATUS_FILTERS: Array<{ value: "" | HotelReservation["status"]; label: string }> = [
  { value: "", label: "Все" },
  { value: "confirmed", label: "Подтверждены" },
  { value: "hold", label: "Удержание" },
  { value: "draft", label: "Черновики" },
  { value: "cancelled", label: "Отменены" },
  { value: "no_show", label: "Незаезд" },
];

const AllTab: React.FC<{ propertyId: number; onOpen: (id: number) => void }> = ({ propertyId, onOpen }) => {
  const theme = useTheme();
  const tableSx = useHotelTableSx();
  const [search, setSearch] = React.useState("");
  const q = useDebouncedValue(search.trim());
  const [status, setStatus] = React.useState<"" | HotelReservation["status"]>("");
  const [limit, setLimit] = React.useState(PAGE_SIZE);

  // Новый поиск или фильтр — снова с первой страницы.
  React.useEffect(() => setLimit(PAGE_SIZE), [q, status]);

  const query = useQuery({
    queryKey: ["hotel", "reservations", "all", propertyId, q, status, limit],
    queryFn: ({ signal }) => listReservations({ propertyId, q: q || undefined, status: status || undefined, limit }, signal),
    // «Показать ещё» и набор в поиске — без мигания таблицы; строки при этом
    // того же объекта, поэтому прошлые данные здесь уместны.
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.results ?? [];
  const total = query.data?.count ?? 0;
  const [exporting, setExporting] = React.useState(false);
  const { enqueueSnackbar } = useSnackbar();
  // В файл — все брони под фильтром (до 2000), а не только показанные строки.
  const handleExport = async () => {
    setExporting(true);
    try {
      const all = await fetchAllReservations({ propertyId, q: q || undefined, status: status || undefined });
      const label = [
        `Статус: ${STATUS_FILTERS.find((f) => f.value === status)?.label ?? "все"}`,
        q ? `поиск: «${q}»` : "",
        all.truncated ? "выгружены первые 2000" : "",
      ]
        .filter(Boolean)
        .join(" · ");
      await exportReservationsXlsx(all.rows, label);
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось выгрузить брони"), { variant: "error" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} justifyContent="space-between" gap={1.5}>
        <TextField
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Имя, телефон или номер брони"
          sx={{ width: { xs: "100%", md: 340 } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: query.isFetching ? <CircularProgress size={16} /> : undefined,
            },
          }}
        />
        <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
          {STATUS_FILTERS.map((f) => (
            <FilterChip key={f.value || "all"} label={f.label} active={status === f.value} onClick={() => setStatus(f.value)} />
          ))}
          <Button size="small" variant="outlined" startIcon={<FileDownloadOutlined />} disabled={exporting || total === 0} onClick={() => void handleExport()} sx={{ ml: { md: 1 } }}>
            {exporting ? "Готовим…" : "Excel"}
          </Button>
        </Stack>
      </Stack>

      {query.isPending ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : query.isError ? (
        <Alert severity="error" variant="outlined">
          {getErrorMessage(query.error, "Не удалось загрузить брони")}
        </Alert>
      ) : rows.length === 0 ? (
        <Surface>
          <EmptyState
            icon={<EventNoteOutlined />}
            title={q || status ? "Ничего не найдено" : "Броней пока нет"}
            description={q ? "Проверьте имя, телефон или номер брони." : undefined}
          />
        </Surface>
      ) : (
        <>
          <Surface padded={false} sx={{ overflow: "hidden" }}>
            <Box sx={{ overflowX: "auto" }}>
              <Table sx={tableSx}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ pl: 2.5 }}>№</TableCell>
                    <TableCell>Гость</TableCell>
                    <TableCell>Номер</TableCell>
                    <TableCell>Даты</TableCell>
                    <TableCell align="right">Сумма</TableCell>
                    <TableCell>Оплата</TableCell>
                    <TableCell>Статус</TableCell>
                    <TableCell sx={{ pr: 2.5 }}>Источник</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => {
                    const item = r.items[0];
                    const stay = item && r.status === "confirmed" ? mapStayDisplayStatus(item.stayStatus) : null;
                    return (
                      <TableRow key={r.id} hover onClick={() => onOpen(r.id)} sx={{ cursor: "pointer" }}>
                        <TableCell sx={{ pl: 2.5, fontVariantNumeric: "tabular-nums", color: "text.secondary" }}>{r.number}</TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={700} noWrap>
                            {r.customerName || item?.guests[0]?.fullName || "Без заказчика"}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          <Typography variant="body2" fontWeight={600} component="span">
                            {item?.roomNumber ?? "—"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" component="span">
                            {item ? ` · ${item.roomTypeName}` : ""}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          {item ? `${formatHotelDateRange(item.checkIn, item.checkOut)} · ${nightsBetween(item.checkIn, item.checkOut)} ноч.` : "—"}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                          {money(r.totalAmount)}
                        </TableCell>
                        <TableCell>{LIVE.has(r.status) ? <BalancePill reservation={r} /> : <Typography variant="body2" color="text.disabled">—</Typography>}</TableCell>
                        <TableCell>
                          {stay ? (
                            <StatusPill color={hotelStayStatusColor(stay, theme)} label={HOTEL_STAY_STATUS_LABELS[stay]} />
                          ) : (
                            <StatusPill color={theme.palette.text.secondary} label={HOTEL_RESERVATION_STATUS_LABELS[r.status] ?? r.status} />
                          )}
                        </TableCell>
                        <TableCell sx={{ pr: 2.5, color: "text.secondary", whiteSpace: "nowrap" }}>{HOTEL_BOOKING_SOURCE_LABELS[r.source] ?? r.source}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          </Surface>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
            <Typography variant="caption" color="text.secondary">
              Показано {rows.length} из {total}
            </Typography>
            {rows.length < total && (
              <Button size="small" disabled={query.isFetching} onClick={() => setLimit((l) => Math.min(l + PAGE_SIZE, 200))}>
                {query.isFetching ? "Загружаем…" : "Показать ещё"}
              </Button>
            )}
          </Stack>
        </>
      )}
    </>
  );
};

// ── Страница ────────────────────────────────────────────────────────────────

export const HotelReceptionPage: React.FC = () => {
  usePageTitle("Ресепшен");
  const vivaActive = useIsVivaActive();
  const { property, isLoading: propertyLoading } = useHotelProperty();
  const canManageBookings = useCan(["schedule.manage", "hotel.reservations.manage"]);
  const [tab, setTab] = React.useState<Tab>("today");
  const [openId, setOpenId] = React.useState<number | null>(null);

  if (!vivaActive) return <Navigate to="/" replace />;

  return (
    <HotelPage>
      <HotelPageHeader
        title="Ресепшен"
        subtitle="Заезды, выезды и все брони объекта"
        info="«Сегодня» — кого заселять и выселять прямо сейчас. «Все брони» — поиск по имени, телефону или номеру брони. Клик по строке открывает карточку брони: оплата, правка дат, смена номера."
        actions={canManageBookings ? <CreateBookingButton /> : undefined}
      />

      <Stack direction="row" gap={1}>
        <FilterChip label="Сегодня" active={tab === "today"} onClick={() => setTab("today")} />
        <FilterChip label="Все брони" active={tab === "all"} onClick={() => setTab("all")} />
      </Stack>

      {!property ? (
        propertyLoading ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : (
          <HotelPropertyMissing />
        )
      ) : tab === "today" ? (
        <TodayTab propertyId={property.id} onOpen={setOpenId} />
      ) : (
        <AllTab propertyId={property.id} onOpen={setOpenId} />
      )}

      <ReservationDetailsDialog reservationId={openId} onClose={() => setOpenId(null)} />
    </HotelPage>
  );
};

export default HotelReceptionPage;
