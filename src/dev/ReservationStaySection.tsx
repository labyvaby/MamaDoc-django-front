/**
 * «Детализация проживания» в карточке брони — как в Exely: по каждой ночи
 * дата, тариф, цена, скидка и стоимость; внизу ночей всего, средняя цена
 * ночи и стоимость проживания. Цены ночей бэк замораживает при создании брони
 * (и при правке с перерасчётом), поэтому здесь ровно то, что попадёт в счёт.
 *
 * «Изменить цены» — своя цена любой ночи и скидка номера с причиной
 * (заказчик: «менять цену чего угодно в любой момент»). Бэк:
 * PATCH /reservations/{id}/items/{itemId}/pricing/ — скидка номера приходит в
 * items[].discountPercent, своя цена — nights[].isManual. Сервер без этого
 * (404) — демо-режим: своя цена на этом устройстве (priceOverrideDemo) с
 * пометкой. Если сервер уже хранит цены, а на устройстве осталась демо-цена,
 * она поверх не накладывается — её предлагают перенести на сервер или забыть
 * (на сервер сами демо-цены не переезжают).
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import EditOutlined from "@mui/icons-material/EditOutlined";
import RestartAltOutlined from "@mui/icons-material/RestartAltOutlined";
import dayjs from "dayjs";
import { useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { ApiError, getErrorMessage } from "../api/client";
import { updateItemPricing, type HotelReservation } from "../api/hotel";
import { useCan } from "../hooks/useCan";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";
import { HOTEL_BOARD_TYPE_LABELS } from "./hotelDisplay";
import { formatHotelDate, formatHotelDateRange, nightsBetween } from "./mockDemoData";
import { DEMO_KEYS, useDemoValue } from "./hotelDemoStore";
import { NightPriceDialog } from "./NightPriceDialog";
import { applyDemoPricing, demoPricingFor, saveDemoPricing, type DemoItemPricing, type DemoPrices } from "./priceOverrideDemo";

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const LIVE = new Set(["draft", "hold", "confirmed"]);

type Item = HotelReservation["items"][number];

export const ReservationStaySection: React.FC<{ reservation: HotelReservation; activeItemId: number }> = ({ reservation, activeItemId }) => {
  const theme = useTheme();
  // Как на сервере: правка цен брони — только с hotel.prices.override (суперадмину — всегда).
  const canOverride = useCan("hotel.prices.override");
  const unit = reservation.currency === "KGS" || !reservation.currency ? "сом" : reservation.currency;
  const money = (v: number) => `${v.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${unit}`;
  const corporateDiscount = Number(reservation.corporateDiscountPercent ?? 0);
  // Выбранный номер групповой брони — первым.
  const items = [...reservation.items].sort((a, b) => Number(b.id === activeItemId) - Number(a.id === activeItemId));
  const line = `1px solid ${subtleBorder(theme)}`;
  const [editingId, setEditingId] = React.useState<number | null>(null);
  // Клик по цене ночи — окно «Цена проживания на …» как в Exely.
  const [priceTarget, setPriceTarget] = React.useState<{ itemId: number; date: string } | null>(null);
  const demoPrices = useDemoValue<DemoPrices>(DEMO_KEYS.prices, {});
  const unitMoney = (v: number) => `${v.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${unit}`;

  return (
    <Stack gap={2.5}>
      {items.map((it) => {
        const demo = demoPricingFor(demoPrices, reservation.id, it.id);
        // Сервер сам хранит свою цену (в ночах есть isManual) — демо с устройства не накладываем.
        const onServer = it.nights.some((n) => n.isManual !== undefined);
        const pricing = onServer ? undefined : demo;
        const leftover = onServer ? demo : undefined;
        const serverTotal = it.nights.reduce((s, n) => s + Number(n.price) - Number(n.discount ?? 0), 0);
        const nights = it.nights.length
          ? applyDemoPricing(it.nights, pricing)
          : [{ date: it.checkIn, price: it.totalAmount, ratePlanName: it.ratePlanName ?? "" }];
        const count = Math.max(1, nightsBetween(it.checkIn, it.checkOut));
        const net = (n: (typeof nights)[number]) => Number(n.price) - Number(("discount" in n && n.discount) || 0);
        const stayTotal = nights.reduce((s, n) => s + net(n), 0);
        const prices = nights.map((n) => Number(n.price));
        const varies = prices.some((p) => p !== prices[0]);
        const hasDiscount = nights.some((n) => "discount" in n && Number(n.discount) > 0);
        const editable = canOverride && LIVE.has(reservation.status) && it.stayStatus !== "checked_out" && it.nights.length > 0;
        return (
          <Box key={it.id} sx={{ borderRadius: "14px", border: line, overflow: "hidden" }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap" sx={{ px: 2, py: 1.25, bgcolor: subtleBg(theme) }}>
              <Box>
                <Typography sx={{ fontWeight: 700 }}>
                  {it.roomNumber ? `Номер ${it.roomNumber}` : "Номер не назначен"} · {it.roomTypeName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatHotelDateRange(it.checkIn, it.checkOut)} · {it.adults} взр.{it.children ? ` + ${it.children} дет.` : ""} ·{" "}
                  {HOTEL_BOARD_TYPE_LABELS[it.boardType] ?? it.boardType}
                </Typography>
              </Box>
              {editable && editingId !== it.id && (
                <Button size="small" startIcon={<EditOutlined fontSize="small" />} onClick={() => setEditingId(it.id)}>
                  Изменить цены
                </Button>
              )}
            </Stack>
            {leftover && editingId !== it.id && (
              <Alert
                severity="warning"
                variant="outlined"
                sx={{ m: 1.5, mb: 0 }}
                action={
                  <Stack direction="row" gap={0.5}>
                    {editable && (
                      <Button color="inherit" size="small" onClick={() => setEditingId(it.id)} sx={{ fontWeight: 700 }}>
                        Перенести
                      </Button>
                    )}
                    <Button color="inherit" size="small" onClick={() => saveDemoPricing(reservation.id, it.id, null)}>
                      Забыть
                    </Button>
                  </Stack>
                }
              >
                На этом устройстве осталась своя цена из демо-режима
                {leftover.discountPercent ? ` (скидка ${leftover.discountPercent}%)` : ""}
                {leftover.reason ? `, «${leftover.reason}»` : ""}. На сервере её нет — в счёте {unitMoney(serverTotal)}. Перенесите её на сервер или забудьте.
              </Alert>
            )}
            {editingId === it.id ? (
              <NightPricesEditor
                reservation={reservation}
                item={it}
                unit={unit}
                pricing={pricing ?? leftover}
                onDone={() => setEditingId(null)}
                onSaved={leftover ? () => saveDemoPricing(reservation.id, it.id, null) : undefined}
              />
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small" sx={{ "& td, & th": { borderColor: subtleBorder(theme) } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ pl: 2, color: "text.secondary", fontWeight: 600 }}>Дата</TableCell>
                      <TableCell sx={{ color: "text.secondary", fontWeight: 600 }}>Тариф</TableCell>
                      <TableCell align="right" sx={{ color: "text.secondary", fontWeight: 600, pr: hasDiscount ? undefined : 2 }}>
                        Цена ночи
                      </TableCell>
                      {hasDiscount && (
                        <>
                          <TableCell align="right" sx={{ color: "text.secondary", fontWeight: 600 }}>
                            Скидка
                          </TableCell>
                          <TableCell align="right" sx={{ pr: 2, color: "text.secondary", fontWeight: 600 }}>
                            Стоимость
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {nights.map((n) => {
                      const weekend = [0, 6].includes(dayjs(n.date).day());
                      const manual = "isManual" in n && n.isManual;
                      const demoNight = "demo" in n && Boolean((n as { demo?: boolean }).demo);
                      const base = "basePrice" in n && n.basePrice != null ? Number(n.basePrice) : null;
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
                              pr: hasDiscount ? undefined : 2,
                              fontWeight: 600,
                              fontVariantNumeric: "tabular-nums",
                              whiteSpace: "nowrap",
                              color: varies && Number(n.price) !== Math.min(...prices) ? "warning.main" : "text.primary",
                            }}
                          >
                            {manual && (
                              <Tooltip title={base != null ? `Цену поставил сотрудник. По тарифу — ${money(base)}` : "Цену поставил сотрудник"}>
                                <Chip
                                  size="small"
                                  label={demoNight ? "вручную · демо" : "вручную"}
                                  sx={{ mr: 1, height: 20, fontSize: 11, bgcolor: alpha(theme.palette.info.main, 0.12), color: "info.main" }}
                                />
                              </Tooltip>
                            )}
                            {editable && onServer ? (
                              <Tooltip title="Изменить цену ночи">
                                <Box
                                  component="button"
                                  type="button"
                                  onClick={() => setPriceTarget({ itemId: it.id, date: n.date })}
                                  aria-label={`Изменить цену ночи ${formatHotelDate(n.date)}: ${money(Number(n.price))}`}
                                  sx={{
                                    px: 0.75,
                                    py: 0.25,
                                    mr: -0.75,
                                    border: 0,
                                    borderRadius: "6px",
                                    bgcolor: "transparent",
                                    color: "inherit",
                                    font: "inherit",
                                    cursor: "pointer",
                                    textDecoration: "underline dotted",
                                    textUnderlineOffset: 3,
                                    "&:hover": { bgcolor: subtleBg(theme, true) },
                                  }}
                                >
                                  {money(Number(n.price))}
                                </Box>
                              </Tooltip>
                            ) : (
                              money(Number(n.price))
                            )}
                          </TableCell>
                          {hasDiscount && (
                            <>
                              <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", color: "success.main" }}>
                                {"discount" in n && Number(n.discount) > 0 ? `−${money(Number(n.discount))}` : "—"}
                              </TableCell>
                              <TableCell align="right" sx={{ pr: 2, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                                {money(net(n))}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            )}
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
              {corporateDiscount > 0 && (
                <Typography variant="body2" color="success.main">
                  Скидка {reservation.corporateName ?? "юрлица"}: <b>−{corporateDiscount.toLocaleString("ru-RU")}%</b>
                </Typography>
              )}
            </Stack>
            {pricing && (
              <Stack
                direction={{ xs: "column", sm: "row" }}
                alignItems={{ sm: "center" }}
                gap={1}
                sx={{ px: 2, py: 1, borderTop: line, bgcolor: alpha(theme.palette.info.main, theme.palette.mode === "dark" ? 0.12 : 0.06) }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                  Демо-режим: своя цена сохранена на этом устройстве{pricing.reason ? ` («${pricing.reason}»)` : ""}. В счёте и балансе сервера пока {money(serverTotal)} — пересчитает
                  после обновления сервера.
                </Typography>
                {editable && (
                  <Button size="small" color="inherit" onClick={() => saveDemoPricing(reservation.id, it.id, null)}>
                    Вернуть расчётную
                  </Button>
                )}
              </Stack>
            )}
          </Box>
        );
      })}
      {(() => {
        const target = priceTarget ? items.find((x) => x.id === priceTarget.itemId) : undefined;
        if (!priceTarget || !target) return null;
        const d = dayjs(priceTarget.date);
        return (
          <NightPriceDialog
            key={`${priceTarget.itemId}-${priceTarget.date}`}
            open
            onClose={() => setPriceTarget(null)}
            reservation={reservation}
            item={target}
            date={priceTarget.date}
            dateLabel={`${formatHotelDate(priceTarget.date)} ${d.year()} (${WEEKDAYS[d.day()]})`}
            unit={unit}
          />
        );
      })()}
    </Stack>
  );
};

/** Текущая скидка номера на сервере: "10.00" → 10, нет — null. */
const serverDiscountOf = (item: Item): number | null =>
  item.discountPercent != null && item.discountPercent !== "" && Number(item.discountPercent) > 0 ? Number(item.discountPercent) : null;

/**
 * Правка цен ночей номера: своя цена любой ночи, «всем ночам», скидка %, причина.
 * pricing — демо-цена с устройства: в демо-режиме это текущее состояние, при
 * переносе на сервер — начальные значения формы (onSaved её стирает).
 */
const NightPricesEditor: React.FC<{
  reservation: HotelReservation;
  item: Item;
  unit: string;
  pricing?: DemoItemPricing;
  onDone: () => void;
  onSaved?: () => void;
}> = ({ reservation, item, unit, pricing, onDone, onSaved }) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const initial = React.useMemo(
    () => Object.fromEntries(item.nights.map((n) => [n.date, String(pricing?.nights[n.date] ?? Number(n.price))])),
    [item.nights, pricing],
  );
  const [prices, setPrices] = React.useState<Record<string, string>>(initial);
  const [resetDates, setResetDates] = React.useState<Set<string>>(new Set());
  const [all, setAll] = React.useState("");
  const serverDiscount = serverDiscountOf(item);
  const [discount, setDiscount] = React.useState(() => {
    const d = pricing?.discountPercent ?? serverDiscount;
    return d ? String(d) : "";
  });
  const [reason, setReason] = React.useState(pricing?.reason ?? "");
  const [saving, setSaving] = React.useState(false);
  const [unsupported, setUnsupported] = React.useState(false);

  // Сравниваем с тем, что на сервере: при переносе демо-цены отличаются как раз от него.
  const changed = item.nights.filter((n) => resetDates.has(n.date) || Number(prices[n.date]) !== Number(n.price));
  const total = item.nights.reduce((s, n) => s + (Number(prices[n.date]) || 0), 0);
  const oldTotal = item.nights.reduce((s, n) => s + Number(n.price) - Number(n.discount ?? 0), 0);
  const discountNum = discount.trim() === "" ? null : Number(discount.replace(",", "."));
  // Скидку шлём, только если её поменяли: пустое поле при скидке на сервере — убрать её (null).
  const discountChanged = (discountNum || null) !== serverDiscount;
  const invalid =
    item.nights.some((n) => !(Number(prices[n.date]) >= 0) || prices[n.date] === "") || (discountNum != null && !(discountNum >= 0 && discountNum <= 100));
  const nothing = changed.length === 0 && !discountChanged;
  const money = (v: number) => `${v.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${unit}`;

  const save = async () => {
    if (invalid || nothing || !reason.trim()) return;
    setSaving(true);
    try {
      await updateItemPricing(reservation.id, item.id, {
        version: reservation.version,
        ...(changed.length ? { nights: changed.map((n) => ({ date: n.date, price: resetDates.has(n.date) ? null : Number(prices[n.date]).toFixed(2) })) } : {}),
        ...(discountChanged ? { discountPercent: discountNum ? String(discountNum) : null } : {}),
        reason: reason.trim(),
      });
      onSaved?.();
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reservation", reservation.id] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "calendar"] });
      enqueueSnackbar("Цены сохранены — счёт и баланс пересчитаны", { variant: "success" });
      onDone();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
        // Бэкенд ещё не умеет — сохраняем в демо-режиме на устройстве.
        const own: Record<string, number> = { ...(pricing?.nights ?? {}) };
        for (const n of item.nights) {
          if (resetDates.has(n.date) || Number(prices[n.date]) === Number(n.price)) delete own[n.date];
          else own[n.date] = Number(prices[n.date]);
        }
        saveDemoPricing(reservation.id, item.id, { nights: own, discountPercent: discountNum, reason: reason.trim(), at: new Date().toISOString() });
        setUnsupported(true);
        enqueueSnackbar("Сохранено в демо-режиме — видно в «Проживании» на этом устройстве", { variant: "info" });
        onDone();
      } else {
        enqueueSnackbar(getErrorMessage(err, "Не удалось сохранить цены"), { variant: "error" });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      {unsupported && (
        <Alert severity="info" variant="outlined" sx={{ mb: 1.5 }}>
          Своя цена ночи начнёт сохраняться после обновления сервера — интерфейс уже готов.
        </Alert>
      )}
      {/* sm в теме — 360 px (телефон): в ряд и в несколько колонок — только с md. */}
      <Stack direction={{ xs: "column", md: "row" }} gap={1} alignItems={{ md: "center" }} sx={{ mb: 1.5 }}>
        <TextField
          size="small"
          label="Всем ночам"
          value={all}
          onChange={(e) => setAll(e.target.value.replace(/[^\d.,]/g, "").slice(0, 9))}
          sx={{ width: { md: 170 } }}
          slotProps={{ input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> }, htmlInput: { inputMode: "decimal" } }}
        />
        <Button
          size="small"
          variant="outlined"
          disabled={!(Number(all.replace(",", ".")) >= 0) || all === ""}
          onClick={() => {
            const v = String(Number(all.replace(",", ".")));
            setPrices(Object.fromEntries(item.nights.map((n) => [n.date, v])));
            setResetDates(new Set());
          }}
        >
          Применить
        </Button>
        <Box sx={{ flex: 1 }} />
        <TextField
          size="small"
          label="Скидка"
          value={discount}
          onChange={(e) => setDiscount(e.target.value.replace(/[^\d.,]/g, "").slice(0, 5))}
          sx={{ width: { md: 120 } }}
          slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> }, htmlInput: { inputMode: "decimal" } }}
        />
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 1 }}>
        {item.nights.map((n) => {
          const isChanged = resetDates.has(n.date) || Number(prices[n.date]) !== Number(n.price);
          const base = n.basePrice != null ? Number(n.basePrice) : null;
          return (
            <Stack
              key={n.date}
              direction="row"
              alignItems="center"
              gap={1}
              sx={{
                p: 1,
                borderRadius: "10px",
                border: `1px solid ${isChanged ? alpha(theme.palette.primary.main, 0.45) : subtleBorder(theme)}`,
                bgcolor: isChanged ? alpha(theme.palette.primary.main, 0.05) : "transparent",
              }}
            >
              <Box sx={{ width: 72, flexShrink: 0 }}>
                <Typography variant="body2" fontWeight={700}>
                  {dayjs(n.date).format("D MMM")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {WEEKDAYS[dayjs(n.date).day()]}
                </Typography>
              </Box>
              <TextField
                size="small"
                value={resetDates.has(n.date) ? (base != null ? String(base) : prices[n.date]) : prices[n.date]}
                disabled={resetDates.has(n.date)}
                onChange={(e) => setPrices((p) => ({ ...p, [n.date]: e.target.value.replace(/[^\d.,]/g, "").replace(",", ".").slice(0, 9) }))}
                sx={{ flex: 1 }}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> }, htmlInput: { inputMode: "decimal" } }}
              />
              {n.isManual && (
                <Tooltip title={base != null ? `Вернуть цену по тарифу (${money(base)})` : "Вернуть цену по тарифу"}>
                  <span>
                    <Button
                      size="small"
                      color="inherit"
                      sx={{ minWidth: 0, px: 0.75 }}
                      onClick={() =>
                        setResetDates((s) => {
                          const next = new Set(s);
                          if (next.has(n.date)) next.delete(n.date);
                          else next.add(n.date);
                          return next;
                        })
                      }
                    >
                      <RestartAltOutlined fontSize="small" />
                    </Button>
                  </span>
                </Tooltip>
              )}
            </Stack>
          );
        })}
      </Box>
      <TextField
        fullWidth
        size="small"
        label="Причина изменения"
        placeholder="Например: постоянный гость, договорились по телефону"
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, 255))}
        sx={{ mt: 1.5 }}
        helperText="Обязательно — попадёт в историю брони вместе с вашим именем"
      />
      <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} gap={1.5} sx={{ mt: 1.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          Было {money(oldTotal)} → станет <b>{money(discountNum ? Math.round(total * (1 - discountNum / 100) * 100) / 100 : total)}</b>
          {discountNum ? ` (скидка ${discountNum}%)` : serverDiscount && discountChanged ? " (скидка снята)" : ""}
        </Typography>
        <Button onClick={onDone} disabled={saving}>
          Отмена
        </Button>
        <Button variant="contained" disableElevation disabled={saving || invalid || nothing || !reason.trim()} onClick={() => void save()}>
          {saving ? "Сохраняем…" : "Сохранить цены"}
        </Button>
      </Stack>
    </Box>
  );
};

export default ReservationStaySection;
