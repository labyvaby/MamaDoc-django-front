/**
 * «Детализация проживания» в карточке брони — как в Exely: по каждой ночи
 * дата, тариф и цена; внизу ночей всего, средняя цена ночи и стоимость
 * проживания. Цены ночей бэк замораживает при создании брони (и при правке с
 * перерасчётом), поэтому здесь ровно то, что попадёт в счёт. Скидка юрлица —
 * отдельной строкой: она действует на проживание, не на допуслуги.
 */
import React from "react";
import { Box, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import dayjs from "dayjs";

import type { HotelReservation } from "../api/hotel";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";
import { HOTEL_BOARD_TYPE_LABELS } from "./hotelDisplay";
import { formatHotelDate, formatHotelDateRange, nightsBetween } from "./mockDemoData";

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

export const ReservationStaySection: React.FC<{ reservation: HotelReservation; activeItemId: number }> = ({ reservation, activeItemId }) => {
  const theme = useTheme();
  const unit = reservation.currency === "KGS" || !reservation.currency ? "сом" : reservation.currency;
  const money = (v: number) => `${v.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${unit}`;
  const discount = Number(reservation.corporateDiscountPercent ?? 0);
  // Выбранный номер групповой брони — первым.
  const items = [...reservation.items].sort((a, b) => Number(b.id === activeItemId) - Number(a.id === activeItemId));
  const line = `1px solid ${subtleBorder(theme)}`;

  return (
    <Stack gap={2.5}>
      {items.map((it) => {
        const nights = it.nights.length
          ? it.nights
          : [{ date: it.checkIn, price: it.totalAmount, ratePlanName: it.ratePlanName ?? "" }];
        const count = Math.max(1, nightsBetween(it.checkIn, it.checkOut));
        const stayTotal = nights.reduce((s, n) => s + Number(n.price), 0);
        const prices = nights.map((n) => Number(n.price));
        const varies = prices.some((p) => p !== prices[0]);
        return (
          <Box key={it.id} sx={{ borderRadius: "14px", border: line, overflow: "hidden" }}>
            <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={2} flexWrap="wrap" sx={{ px: 2, py: 1.5, bgcolor: subtleBg(theme) }}>
              <Typography sx={{ fontWeight: 700 }}>
                {it.roomNumber ? `Номер ${it.roomNumber}` : "Номер не назначен"} · {it.roomTypeName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatHotelDateRange(it.checkIn, it.checkOut)} · {it.adults} взр.{it.children ? ` + ${it.children} дет.` : ""} ·{" "}
                {HOTEL_BOARD_TYPE_LABELS[it.boardType] ?? it.boardType}
              </Typography>
            </Stack>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ "& td, & th": { borderColor: subtleBorder(theme) } }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ pl: 2, color: "text.secondary", fontWeight: 600 }}>Дата</TableCell>
                    <TableCell sx={{ color: "text.secondary", fontWeight: 600 }}>Тариф</TableCell>
                    <TableCell align="right" sx={{ pr: 2, color: "text.secondary", fontWeight: 600 }}>
                      Цена ночи
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {nights.map((n) => {
                    const weekend = [0, 6].includes(dayjs(n.date).day());
                    return (
                      <TableRow key={n.date}>
                        <TableCell sx={{ pl: 2, whiteSpace: "nowrap" }}>
                          {formatHotelDate(n.date)} {dayjs(n.date).year()}
                          <Typography component="span" variant="body2" sx={{ color: weekend ? "warning.main" : "text.secondary", ml: 0.75 }}>
                            ({WEEKDAYS[dayjs(n.date).day()]})
                          </Typography>
                        </TableCell>
                        <TableCell>{n.ratePlanName || it.ratePlanName || "Основной тариф"}</TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            pr: 2,
                            fontWeight: 600,
                            fontVariantNumeric: "tabular-nums",
                            color: varies && Number(n.price) !== Math.min(...prices) ? "warning.main" : "text.primary",
                          }}
                        >
                          {money(Number(n.price))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
            <Stack
              direction="row"
              gap={3}
              rowGap={0.5}
              flexWrap="wrap"
              sx={{ px: 2, py: 1.25, borderTop: line, bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.08 : 0.04) }}
            >
              <Typography variant="body2">
                Ночей: <b>{count}</b>
              </Typography>
              <Typography variant="body2">
                Средняя цена ночи: <b>{money(Math.round((stayTotal / count) * 100) / 100)}</b>
              </Typography>
              <Typography variant="body2">
                Стоимость проживания: <b>{money(stayTotal)}</b>
              </Typography>
              {discount > 0 && (
                <Typography variant="body2" color="success.main">
                  Скидка {reservation.corporateName ?? "юрлица"}: <b>−{discount.toLocaleString("ru-RU")}%</b>
                </Typography>
              )}
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
};

export default ReservationStaySection;
