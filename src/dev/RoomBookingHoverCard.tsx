/**
 * Карточка брони при наведении на полосу в шахматке: даты со временем заезда и
 * выезда, гости, источник, питание и деньги — сумма, оплачено, к оплате. Как
 * подсказка в Exely, только читаемее и в цветах темы.
 *
 * Одна карточка на всю шахматку и своё состояние внутри (imperative handle):
 * наведение не должно перерисовывать сетку из тысяч ячеек. Полоса зовёт
 * show(anchor, data) на mouseenter/focus и hide() на mouseleave/blur.
 */
import React from "react";
import { Box, Divider, Popper, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import EditNoteOutlined from "@mui/icons-material/EditNoteOutlined";

import type { HotelCalendarItem } from "../api/hotel";
import {
  HOTEL_BOARD_TYPE_LABELS,
  HOTEL_BOOKING_SOURCE_LABELS,
  HOTEL_STAY_STATUS_ICONS,
  HOTEL_STAY_STATUS_LABELS,
  hotelSourceColor,
  hotelStayStatusColor,
  mapStayDisplayStatus,
} from "./hotelDisplay";
import { formatHotelDate, nightsBetween } from "./mockDemoData";
import type { StayBalance } from "./useStayBalances";

export interface BarHoverData {
  item: HotelCalendarItem;
  roomNumber: string | null;
  roomTypeName: string | undefined;
  balance: StayBalance | undefined;
  checkInTime: string | null;
  checkOutTime: string | null;
}

export interface BarHoverHandle {
  show: (anchor: HTMLElement, data: BarHoverData) => void;
  hide: () => void;
}

const SHOW_DELAY = 180;
const HIDE_DELAY = 60;

const money = (v: number, currency: string) =>
  `${v.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${currency === "KGS" || !currency ? "сом" : currency}`;
const nightsWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "ночь" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "ночи" : "ночей");

export const RoomBookingHoverCard = React.forwardRef<BarHoverHandle>((_, ref) => {
  const theme = useTheme();
  const [state, setState] = React.useState<{ anchor: HTMLElement; data: BarHoverData } | null>(null);
  const timer = React.useRef<number | null>(null);

  React.useImperativeHandle(
    ref,
    () => ({
      show: (anchor, data) => {
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setState({ anchor, data }), SHOW_DELAY);
      },
      hide: () => {
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setState(null), HIDE_DELAY);
      },
    }),
    [],
  );
  React.useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  if (!state) return null;
  const { item: it, balance, roomNumber, roomTypeName, checkInTime, checkOutTime } = state.data;
  const status = mapStayDisplayStatus(it.stayStatus);
  const StatusIcon = HOTEL_STAY_STATUS_ICONS[status];
  const statusColor = hotelStayStatusColor(status, theme);
  const nights = nightsBetween(it.checkIn, it.checkOut);
  const isDraft = it.reservationStatus === "draft";
  const currency = balance?.currency ?? "KGS";
  const total = balance?.total ?? Number(it.totalAmount);
  const guests = it.guests.map((g) => g.fullName).filter(Boolean);
  const sourceLabel = it.source ? (HOTEL_BOOKING_SOURCE_LABELS[it.source] ?? it.source) : "—";
  const dark = theme.palette.mode === "dark";

  const row = (label: string, value: React.ReactNode, strong = false, color?: string) => (
    <Stack direction="row" justifyContent="space-between" gap={2}>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography variant="caption" sx={{ fontWeight: strong ? 800 : 600, color: color ?? "text.primary", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
        {value}
      </Typography>
    </Stack>
  );

  return (
    <Popper
      open
      anchorEl={state.anchor}
      placement="top"
      modifiers={[
        { name: "offset", options: { offset: [0, 8] } },
        { name: "preventOverflow", options: { padding: 12 } },
        { name: "flip", options: { fallbackPlacements: ["bottom", "right", "left"] } },
      ]}
      sx={{ zIndex: theme.zIndex.tooltip, pointerEvents: "none" }}
    >
      <Box
        role="tooltip"
        sx={{
          width: 300,
          p: 1.75,
          borderRadius: "14px",
          bgcolor: "background.paper",
          border: `1px solid ${alpha(theme.palette.text.primary, dark ? 0.16 : 0.1)}`,
          boxShadow: dark ? "0 18px 40px rgba(0,0,0,.55)" : "0 18px 40px rgba(15,23,42,.18)",
          borderTop: `3px solid ${statusColor}`,
        }}
      >
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 15, lineHeight: 1.25 }} noWrap>
              {it.customerName || guests[0] || `Бронь №${it.reservationNumber}`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Бронь №{it.reservationNumber}
            </Typography>
          </Box>
          <Stack direction="row" alignItems="center" gap={0.5} sx={{ flexShrink: 0, px: 1, py: 0.25, borderRadius: "999px", bgcolor: alpha(statusColor, dark ? 0.22 : 0.12), color: statusColor }}>
            <StatusIcon sx={{ fontSize: 14 }} />
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              {HOTEL_STAY_STATUS_LABELS[status]}
            </Typography>
          </Stack>
        </Stack>

        {(it.isOverbooking || isDraft) && (
          <Stack direction="row" gap={1} sx={{ mt: 1 }}>
            {it.isOverbooking && (
              <Stack direction="row" alignItems="center" gap={0.5} sx={{ color: "warning.main" }}>
                <WarningAmberOutlined sx={{ fontSize: 14 }} />
                <Typography variant="caption" fontWeight={700}>
                  Овербукинг
                </Typography>
              </Stack>
            )}
            {isDraft && (
              <Stack direction="row" alignItems="center" gap={0.5} sx={{ color: "text.secondary" }}>
                <EditNoteOutlined sx={{ fontSize: 14 }} />
                <Typography variant="caption" fontWeight={700}>
                  Черновик — номер не занимает
                </Typography>
              </Stack>
            )}
          </Stack>
        )}

        <Stack gap={0.5} sx={{ mt: 1.25 }}>
          {row(
            "Заезд",
            `${formatHotelDate(it.checkIn)}${checkInTime ? `, ${checkInTime}` : ""}`,
          )}
          {row(
            "Выезд",
            `${formatHotelDate(it.checkOut)}${checkOutTime ? `, ${checkOutTime}` : ""}`,
          )}
          {row("Ночей", `${nights} ${nightsWord(nights)}`)}
          {row("Номер", `${roomNumber ?? "не назначен"}${roomTypeName ? ` · ${roomTypeName}` : ""}`)}
          {guests.length > 0 && row(guests.length > 1 ? "Гости" : "Гость", guests.slice(0, 3).join(", ") + (guests.length > 3 ? ` +${guests.length - 3}` : ""))}
          {row(
            "Источник",
            <Stack component="span" direction="row" alignItems="center" gap={0.5} sx={{ display: "inline-flex" }}>
              <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: hotelSourceColor(it.source) }} />
              {sourceLabel}
            </Stack>,
          )}
          {it.boardType && it.boardType !== "none" && row("Питание", HOTEL_BOARD_TYPE_LABELS[it.boardType] ?? it.boardType)}
        </Stack>

        <Divider sx={{ my: 1.25 }} />
        <Stack gap={0.5}>
          {row("Сумма", money(total, currency))}
          {balance ? (
            <>
              {row("Оплачено", money(balance.paid, currency), false, balance.paid > 0 ? theme.palette.success.main : undefined)}
              {balance.balance > 0
                ? row("К оплате", money(balance.balance, currency), true, theme.palette.error.main)
                : balance.balance < 0
                  ? row("К возврату", money(-balance.balance, currency), true, theme.palette.warning.main)
                  : row("К оплате", "оплачено полностью", true, theme.palette.success.main)}
            </>
          ) : (
            <Typography variant="caption" color="text.disabled">
              Оплаты загружаются…
            </Typography>
          )}
        </Stack>
      </Box>
    </Popper>
  );
});
RoomBookingHoverCard.displayName = "RoomBookingHoverCard";

export default RoomBookingHoverCard;
