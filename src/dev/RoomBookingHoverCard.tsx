/**
 * Карточка брони при наведении на полосу в шахматке — как подсказка Exely,
 * но подробнее и читаемее: долг крупно сверху, проживание со временем, номер
 * и категория, гости и телефон, канал с номером брони канала, тариф,
 * питание, гарантия, юрлицо, когда заселился, заметка сотрудников и
 * пожелание гостя. Деньги — сумма, оплачено и к оплате/к возврату.
 *
 * Одна карточка на всю шахматку и своё состояние внутри (imperative handle):
 * наведение не должно перерисовывать сетку из тысяч ячеек. Полоса зовёт
 * show(anchor, data) на mouseenter/focus и hide() на mouseleave/blur.
 *
 * Карточка «липкая», чтобы из неё можно было копировать: между полосой и
 * карточкой нет зазора (прозрачный «мостик» — отступ внутри Popper), курсор
 * переходит на карточку, и она не закрывается; пока в ней выделен текст, она
 * держится и после ухода курсора — до клика мимо, Esc или наведения на другую
 * бронь. У телефона и номеров броней — кнопки «скопировать».
 */
import React from "react";
import { Box, Divider, IconButton, LinearProgress, Popper, Stack, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import EditNoteOutlined from "@mui/icons-material/EditNoteOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import CheckRounded from "@mui/icons-material/CheckRounded";
import dayjs from "dayjs";

import type { HotelCalendarItem } from "../api/hotel";
import { formatPhoneDisplay } from "../utility/phone";
import {
  HOTEL_BOARD_TYPE_LABELS,
  HOTEL_BOOKING_SOURCE_LABELS,
  HOTEL_GUARANTEE_METHOD_LABELS,
  HOTEL_STAY_STATUS_ICONS,
  HOTEL_STAY_STATUS_LABELS,
  hotelSourceColor,
  hotelStayStatusColor,
  mapStayDisplayStatus,
} from "./hotelDisplay";
import { nightsBetween } from "./mockDemoData";
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

const SHOW_DELAY = 160;
/** Хватает, чтобы довести курсор с полосы на карточку и наискосок, но не задерживает её на чужой брони. */
const HIDE_DELAY = 200;
/** Прозрачный «мостик» вокруг карточки: визуально отступ, но курсор на нём — уже «на карточке». */
const BRIDGE = 8;

/** Маленькая кнопка «скопировать» рядом со значением. */
const CopyValue: React.FC<{ value: string; label: string }> = ({ value, label }) => {
  const [done, setDone] = React.useState(false);
  React.useEffect(() => {
    if (!done) return undefined;
    const t = window.setTimeout(() => setDone(false), 1200);
    return () => window.clearTimeout(t);
  }, [done]);
  return (
    <Tooltip title={done ? "Скопировано" : label} placement="top" disableInteractive>
      <IconButton
        size="small"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          void navigator.clipboard
            ?.writeText(value)
            .then(() => setDone(true))
            .catch(() => undefined);
        }}
        sx={{ p: 0.25, ml: 0.25, color: done ? "success.main" : "text.secondary", "&:hover": { color: done ? "success.main" : "primary.main" } }}
      >
        {done ? <CheckRounded sx={{ fontSize: 14 }} /> : <ContentCopyOutlined sx={{ fontSize: 13 }} />}
      </IconButton>
    </Tooltip>
  );
};

const money = (v: number, currency: string) =>
  `${v.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${currency === "KGS" || !currency ? "сом" : currency}`;
const nightsWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "ночь" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "ночи" : "ночей");
const shortDate = (iso: string) => dayjs(iso).format("D MMM");

export const RoomBookingHoverCard = React.forwardRef<BarHoverHandle>((_, ref) => {
  const theme = useTheme();
  const [state, setState] = React.useState<{ anchor: HTMLElement; data: BarHoverData } | null>(null);
  const timer = React.useRef<number | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const pointerInside = React.useRef(false);

  /** В карточке выделен текст — её не закрываем, пока человек копирует. */
  const hasSelectionInside = () => {
    const sel = window.getSelection();
    return !!sel && !sel.isCollapsed && !!cardRef.current && !!sel.anchorNode && cardRef.current.contains(sel.anchorNode);
  };

  const scheduleHide = React.useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (pointerInside.current || hasSelectionInside()) return;
      setState(null);
    }, HIDE_DELAY);
  }, []);

  React.useImperativeHandle(
    ref,
    () => ({
      show: (anchor, data) => {
        if (timer.current) window.clearTimeout(timer.current);
        pointerInside.current = false;
        timer.current = window.setTimeout(() => setState({ anchor, data }), SHOW_DELAY);
      },
      hide: scheduleHide,
    }),
    [scheduleHide],
  );
  React.useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  // Оставленную открытой (из-за выделения) карточку закрывают клик мимо и Esc.
  const open = state != null;
  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (cardRef.current && e.target instanceof Node && cardRef.current.contains(e.target)) return;
      pointerInside.current = false;
      setState(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setState(null);
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!state) return null;
  const { item: it, balance, roomNumber, roomTypeName, checkInTime, checkOutTime } = state.data;
  const details = balance?.details;
  const itemInfo = details?.items[it.itemId];
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
  const debt = balance && balance.balance > 0 ? balance.balance : 0;
  const refund = balance && balance.balance < 0 ? -balance.balance : 0;
  const paidShare = balance && balance.total > 0 ? Math.min(100, (balance.paid / balance.total) * 100) : 0;
  const people = itemInfo ? `${itemInfo.adults} взр.${itemInfo.children ? ` + ${itemInfo.children} дет.` : ""}` : null;

  const row = (label: string, value: React.ReactNode, color?: string) => (
    <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={2}>
      <Typography variant="caption" sx={{ color: "text.secondary", flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="caption" sx={{ fontWeight: 600, color: color ?? "text.primary", fontVariantNumeric: "tabular-nums", textAlign: "right", minWidth: 0 }}>
        {value}
      </Typography>
    </Stack>
  );

  const moneyTone = debt > 0 ? theme.palette.error.main : refund > 0 ? theme.palette.warning.main : theme.palette.success.main;

  return (
    <Popper
      open
      anchorEl={state.anchor}
      placement="top"
      modifiers={[
        { name: "offset", options: { offset: [0, 0] } },
        { name: "preventOverflow", options: { padding: 12 - BRIDGE } },
        { name: "flip", options: { fallbackPlacements: ["bottom", "right", "left"] } },
      ]}
      sx={{ zIndex: theme.zIndex.tooltip }}
    >
      <Box
        ref={cardRef}
        onMouseEnter={() => {
          pointerInside.current = true;
          if (timer.current) window.clearTimeout(timer.current);
        }}
        onMouseLeave={() => {
          pointerInside.current = false;
          scheduleHide();
        }}
        sx={{ p: `${BRIDGE}px` }}
      >
        <Box
          role="tooltip"
          sx={{
            userSelect: "text",
            cursor: "auto",
            width: 340,
            borderRadius: "14px",
            overflow: "hidden",
            bgcolor: "background.paper",
            border: `1px solid ${alpha(theme.palette.text.primary, dark ? 0.16 : 0.1)}`,
            boxShadow: dark ? "0 18px 40px rgba(0,0,0,.55)" : "0 18px 40px rgba(15,23,42,.18)",
          }}
        >
          {/* Деньги — первым делом: долг видно сразу, как просил заказчик. */}
          <Box sx={{ px: 1.75, py: 1.25, bgcolor: alpha(moneyTone, dark ? 0.18 : 0.08), borderBottom: `1px solid ${alpha(moneyTone, 0.25)}` }}>
            {balance ? (
              <>
                <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={1}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: moneyTone, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {debt > 0 ? "Долг гостя" : refund > 0 ? "К возврату" : "Оплачено полностью"}
                  </Typography>
                  {debt > 0 || refund > 0 ? (
                    <Typography sx={{ fontWeight: 800, fontSize: 20, lineHeight: 1.1, color: moneyTone, fontVariantNumeric: "tabular-nums" }}>
                      {money(debt || refund, currency)}
                    </Typography>
                  ) : (
                    <CheckCircleOutlined sx={{ fontSize: 20, color: moneyTone }} />
                  )}
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={paidShare}
                  sx={{ mt: 0.75, height: 5, borderRadius: 3, bgcolor: alpha(moneyTone, 0.15), "& .MuiLinearProgress-bar": { bgcolor: debt > 0 ? theme.palette.success.main : moneyTone, borderRadius: 3 } }}
                />
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5, fontVariantNumeric: "tabular-nums" }}>
                  оплачено {money(balance.paid, currency)} из {money(total, currency)}
                </Typography>
              </>
            ) : (
              <Typography variant="caption" color="text.secondary">
                Сумма {money(total, currency)} · оплаты загружаются…
              </Typography>
            )}
          </Box>

          <Box sx={{ p: 1.75 }}>
            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={1}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 15, lineHeight: 1.25 }} noWrap>
                  {it.customerName || guests[0] || `Бронь №${it.reservationNumber}`}
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div" noWrap>
                  Бронь №{it.reservationNumber}
                  <CopyValue value={String(it.reservationNumber)} label="Скопировать номер брони" />
                  {details?.createdAt ? ` · создана ${dayjs(details.createdAt).format("D MMM, HH:mm")}` : ""}
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
                "Проживание",
                `${shortDate(it.checkIn)}${checkInTime ? ` (${checkInTime})` : ""} → ${shortDate(it.checkOut)}${checkOutTime ? ` (${checkOutTime})` : ""} · ${nights} ${nightsWord(nights)}`,
              )}
              {itemInfo?.checkedInAt && row("Заселился", dayjs(itemInfo.checkedInAt).format("D MMM, HH:mm"), theme.palette.success.main)}
              {itemInfo?.checkedOutAt && row("Выехал", dayjs(itemInfo.checkedOutAt).format("D MMM, HH:mm"))}
              {row("Номер", `${roomNumber ?? "не назначен"}${roomTypeName ? ` · ${roomTypeName}` : ""}`)}
              {(people || guests.length > 0) &&
                row(
                  guests.length > 1 ? "Гости" : "Гость",
                  [people, guests.slice(0, 2).join(", ") + (guests.length > 2 ? ` +${guests.length - 2}` : "")].filter(Boolean).join(" · "),
                )}
              {details?.phone &&
                row(
                  "Телефон",
                  <Box component="span" sx={{ display: "inline-flex", alignItems: "center" }}>
                    {formatPhoneDisplay(details.phone)}
                    <CopyValue value={details.phone} label="Скопировать телефон" />
                  </Box>,
                )}
              {row(
                "Источник",
                <Stack component="span" direction="row" alignItems="center" gap={0.5} sx={{ display: "inline-flex" }}>
                  <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: hotelSourceColor(it.source) }} />
                  {sourceLabel}
                  {details?.externalId ? (
                    <>
                      <Box component="span" sx={{ color: "text.secondary", fontWeight: 500 }}>
                        №{details.externalId}
                      </Box>
                      <CopyValue value={details.externalId} label="Скопировать номер брони канала" />
                    </>
                  ) : null}
                </Stack>,
              )}
              {itemInfo?.ratePlanName && row("Тариф", itemInfo.ratePlanName)}
              {it.boardType && it.boardType !== "none" && row("Питание", HOTEL_BOARD_TYPE_LABELS[it.boardType] ?? it.boardType)}
              {details?.guaranteeMethod && row("Гарантия", HOTEL_GUARANTEE_METHOD_LABELS[details.guaranteeMethod] ?? details.guaranteeMethod)}
              {details?.corporateName && row("Юрлицо", details.corporateName)}
              {details?.createdByName && row("Оформил", details.createdByName)}
            </Stack>

            {(details?.internalNote || details?.guestComment) && (
              <>
                <Divider sx={{ my: 1.25 }} />
                <Stack gap={0.75}>
                  {details?.internalNote && (
                    <Stack direction="row" gap={0.75} sx={{ pl: 1, borderLeft: `3px solid ${theme.palette.warning.main}` }}>
                      <LockOutlined sx={{ fontSize: 13, color: "text.secondary", mt: 0.25 }} />
                      <Typography variant="caption" sx={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "pre-wrap" }}>
                        {details.internalNote}
                      </Typography>
                    </Stack>
                  )}
                  {details?.guestComment && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ pl: 1, borderLeft: `3px solid ${alpha(theme.palette.text.primary, 0.15)}`, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                    >
                      «{details.guestComment}»
                    </Typography>
                  )}
                </Stack>
              </>
            )}

            <Divider sx={{ my: 1.25 }} />
            <Stack gap={0.5}>
              {row("Сумма", money(total, currency))}
              {balance && row("Оплачено", money(balance.paid, currency), balance.paid > 0 ? theme.palette.success.main : undefined)}
              {balance && row(debt > 0 ? "К оплате" : refund > 0 ? "К возврату" : "К оплате", debt > 0 || refund > 0 ? money(debt || refund, currency) : "0", moneyTone)}
            </Stack>
            <Typography variant="caption" color="text.disabled" component="div" sx={{ mt: 1, textAlign: "center" }}>
              Нажмите на бронь, чтобы открыть карточку · текст можно выделить и скопировать
            </Typography>
          </Box>
        </Box>
      </Box>
    </Popper>
  );
});
RoomBookingHoverCard.displayName = "RoomBookingHoverCard";

export default RoomBookingHoverCard;
