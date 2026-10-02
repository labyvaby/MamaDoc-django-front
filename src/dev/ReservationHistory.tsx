/**
 * «История изменений» в карточке брони: кто и когда поменял даты, номер,
 * статус, цену. Журнал бэк уже отдаёт вместе с бронью (reservation.logs) —
 * раньше он просто нигде не показывался. Свёрнут по умолчанию: это справка
 * для разбора «кто отменил», а не рабочая часть карточки.
 */
import React from "react";
import { Box, Button, Collapse, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import dayjs from "dayjs";

import type { HotelReservationLog } from "../api/hotel";
import { subtleBorder } from "../theme/uiHelpers";
import { HOTEL_BOARD_TYPE_LABELS, HOTEL_RESERVATION_STATUS_LABELS } from "./hotelDisplay";
import { formatHotelDate } from "./mockDemoData";
import { plural } from "./hotelUi";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const value = (v: string) => (ISO_DATE.test(v) ? formatHotelDate(v) : v || "—");
const change = (log: HotelReservationLog, map?: Record<string, string>) =>
  `${map?.[log.oldValue] ?? value(log.oldValue)} → ${map?.[log.newValue] ?? value(log.newValue)}`;

const ITEM_FIELDS: Record<string, string> = {
  check_in: "Заезд",
  check_out: "Выезд",
  room_type: "Категория",
  rate_plan: "Тариф",
  board_type: "Питание",
  adults: "Взрослых",
  children: "Детей",
};

/** Человеческая строка записи журнала; незнакомое действие показываем как есть, а не прячем. */
function describe(log: HotelReservationLog): string {
  switch (log.action) {
    case "created":
      return "Бронь создана";
    case "status":
      return `Статус: ${change(log, HOTEL_RESERVATION_STATUS_LABELS)}`;
    case "item_updated":
      return `${ITEM_FIELDS[log.field] ?? "Изменение"}: ${change(log, log.field === "board_type" ? HOTEL_BOARD_TYPE_LABELS : undefined)}`;
    case "room_assigned":
      return `Назначен номер ${value(log.newValue)}`;
    case "room_unassigned":
      return `Номер ${value(log.oldValue)} снят с брони`;
    case "room_moved":
      return `Переселение: номер ${change(log)}`;
    case "overbooking":
      return `Овербукинг: ${value(log.newValue)}`;
    case "repriced":
      return `Пересчёт цены: ${change(log)}`;
    case "payment":
      return `Оплата: ${value(log.newValue)}`;
    case "charge_added":
      return `Услуга в счёт: ${value(log.newValue)}`;
    case "charge_voided":
      return `Услуга отменена: ${value(log.oldValue || log.newValue)}`;
    case "checked_in":
      return "Гость заселён";
    case "checked_out":
      return "Гость выселен";
    case "early_checkout":
      return `Ранний выезд: ${change(log)}`;
    case "item_removed":
      return "Номер убран из брони";
    case "channel_modified":
      return "Изменено площадкой бронирования";
    case "updated":
      return log.field ? `Изменено: ${log.field}` : "Данные брони изменены";
    default:
      return log.field ? `${log.action}: ${change(log)}` : log.action;
  }
}

export const ReservationHistory: React.FC<{ logs: HotelReservationLog[]; defaultOpen?: boolean }> = ({ logs, defaultOpen = false }) => {
  const theme = useTheme();
  const [open, setOpen] = React.useState(defaultOpen);
  if (logs.length === 0) return null;
  // Новые сверху.
  const sorted = [...logs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Box sx={{ mt: 3 }}>
      <Button
        size="small"
        color="inherit"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        endIcon={<ExpandMoreOutlined sx={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />}
        sx={{ color: "text.secondary", ml: -1 }}
      >
        История изменений · {logs.length} {plural(logs.length, "запись", "записи", "записей")}
      </Button>
      <Collapse in={open} unmountOnExit>
        <Stack sx={{ mt: 1 }}>
          {sorted.map((log, i) => (
            <Stack key={log.id} direction="row" gap={2} sx={{ py: 1, borderTop: i === 0 ? "none" : `1px solid ${subtleBorder(theme)}` }}>
              <Typography variant="caption" color="text.secondary" sx={{ width: 118, flexShrink: 0, fontVariantNumeric: "tabular-nums", pt: 0.25 }}>
                {dayjs(log.createdAt).format("D MMM, HH:mm")}
              </Typography>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2">{describe(log)}</Typography>
                {(log.reason || log.userName) && (
                  <Typography variant="caption" color="text.secondary" component="div">
                    {[log.userName, log.reason && `причина: ${log.reason}`].filter(Boolean).join(" · ")}
                  </Typography>
                )}
              </Box>
            </Stack>
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
};

export default ReservationHistory;
