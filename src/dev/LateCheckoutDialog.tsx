/**
 * «Поздний выезд» из карточки брони: до скольки гость остаётся и сколько это
 * стоит по правилу отеля (lateCheckout.ts: до +5 ч — 50% ночи, позже — ночь).
 * Сохраняет два готовых запроса: своё время выезда брони (PATCH брони,
 * expectedDepartureTime — его видят ресепшен и горничные) и строку счёта
 * «Поздний выезд до 16:00» (POST …/charges/, право hotel.payments.manage).
 * Уже начисленный поздний выезд заменяется, а не дублируется. Сумму можно
 * поправить или не начислять вовсе (договорились бесплатно).
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  FormControlLabel,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { ApiError, getErrorMessage } from "../api/client";
import { addCharge, listCharges, updateReservation, voidCharge, type HotelReservation } from "../api/hotel";
import { formatHotelDate } from "./mockDemoData";
import { hhmm } from "./stayTimes";
import {
  LATE_CHECKOUT_HALF_UP_TO_HOURS,
  isLateCheckoutCharge,
  lastNightPrice,
  lateCheckoutChargeName,
  lateCheckoutFee,
  lateCheckoutPresets,
} from "./lateCheckout";
import { parsePriceInput } from "./nightPriceScope";

type Item = HotelReservation["items"][number];

interface Props {
  open: boolean;
  onClose: () => void;
  reservation: HotelReservation;
  item: Item;
  /** Выезд по правилам объекта (Property.checkOutTime). */
  ruleTime: string;
  /** Право hotel.payments.manage — без него время ставится, а начислить нельзя. */
  canCharge: boolean;
}

const shareLabel = (share: number) => (share === 1 ? "полная ночь" : share === 0.5 ? "50% ночи" : "бесплатно");

export const LateCheckoutDialog: React.FC<Props> = ({ open, onClose, reservation, item, ruleTime, canCharge }) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const rule = hhmm(ruleTime) ?? "12:00";
  const presets = lateCheckoutPresets(rule);
  const current = hhmm(reservation.expectedDepartureTime);
  const nightPrice = lastNightPrice(item);
  const unit = reservation.currency === "KGS" || !reservation.currency ? "сом" : reservation.currency;
  const money = (v: number) => `${v.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${unit}`;

  const [time, setTime] = React.useState(() => (current && current > rule ? current : presets[3] ?? presets[0] ?? ""));
  const fee = lateCheckoutFee(rule, time, nightPrice);
  const [amount, setAmount] = React.useState(() => String(fee.amount));
  const [charge, setCharge] = React.useState(canCharge);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const chargesQuery = useQuery({
    queryKey: ["hotel", "reservation", reservation.id, "charges", false],
    queryFn: ({ signal }) => listCharges(reservation.id, { includeVoided: false }, signal),
    enabled: open,
  });
  const existing = (chargesQuery.data?.results ?? []).filter(isLateCheckoutCharge);

  const pickTime = (next: string) => {
    setTime(next);
    // Сумма идёт за правилом, пока её не поправили руками под новое время.
    setAmount(String(lateCheckoutFee(rule, next, nightPrice).amount));
  };

  const amountNum = parsePriceInput(amount);
  const late = fee.minutesLate > 0;
  const canSave = !saving && late && (!charge || (amountNum != null && amountNum > 0));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["hotel", "reservation", reservation.id] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "reservations"] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "calendar"] });
  };

  // Время и начисление — два запроса: время сохраняется первым, его видят горничные.
  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    let timeSaved = false;
    try {
      await updateReservation(reservation.id, { version: reservation.version, expectedDepartureTime: time });
      timeSaved = true;
      if (charge && amountNum != null) {
        for (const c of existing) await voidCharge(reservation.id, c.id);
        await addCharge(reservation.id, {
          name: lateCheckoutChargeName(time),
          price: amountNum.toFixed(2),
          quantity: "1",
          date: item.checkOut,
          comment: `${shareLabel(fee.share)} — ночь ${money(nightPrice)}`,
        });
      }
      refresh();
      enqueueSnackbar(charge ? `Поздний выезд до ${time} — ${money(amountNum ?? 0)} в счёте` : `Поздний выезд до ${time}, без начисления`, { variant: "success" });
      onClose();
    } catch (err) {
      refresh();
      const text = err instanceof ApiError && err.code === "VERSION_CONFLICT" ? "Бронь изменили в другом окне — данные обновлены, сохраните ещё раз." : getErrorMessage(err, "Не удалось сохранить");
      setError(timeSaved ? `Время выезда сохранено, а начислить не получилось: ${text} Добавьте строку во вкладке «Оплата».` : text);
    } finally {
      setSaving(false);
    }
  };

  // Вернуть выезд по правилам: своё время убрать, начисленный поздний выезд отменить.
  const remove = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateReservation(reservation.id, { version: reservation.version, expectedDepartureTime: null });
      if (canCharge) for (const c of existing) await voidCharge(reservation.id, c.id);
      refresh();
      enqueueSnackbar(`Выезд по правилам — в ${rule}`, { variant: "success" });
      onClose();
    } catch (err) {
      refresh();
      setError(getErrorMessage(err, "Не удалось убрать поздний выезд"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth PaperProps={{ sx: { maxWidth: 480, borderRadius: "16px", backgroundImage: "none" } }}>
      <Box sx={{ px: 3, pt: 2.5, pb: 0.5 }}>
        <Typography variant="subtitle1" fontWeight={800}>
          Поздний выезд
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {item.roomNumber ? `Номер ${item.roomNumber}` : "Номер не назначен"} · выезд {formatHotelDate(item.checkOut)}, по правилам в {rule}
        </Typography>
      </Box>
      <DialogContent>
        <Stack gap={2}>
          <Box>
            <Typography variant="body2" fontWeight={700} sx={{ mb: 0.75 }}>
              До скольки остаётся
            </Typography>
            <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mb: 1 }}>
              {presets.map((p) => {
                const share = lateCheckoutFee(rule, p, nightPrice).share;
                return (
                  <Chip
                    key={p}
                    label={`${p} · ${share === 1 ? "ночь" : "50%"}`}
                    color={p === time ? "primary" : "default"}
                    variant={p === time ? "filled" : "outlined"}
                    onClick={() => pickTime(p)}
                    sx={{ fontVariantNumeric: "tabular-nums" }}
                  />
                );
              })}
            </Stack>
            <TextField
              size="small"
              type="time"
              label="Время выезда"
              value={time}
              onChange={(e) => pickTime(e.target.value)}
              error={time !== "" && !late}
              helperText={time !== "" && !late ? `Позже ${rule} — иначе это обычный выезд` : `До ${LATE_CHECKOUT_HALF_UP_TO_HOURS} ч после ${rule} — 50% ночи, позже — полная ночь`}
              sx={{ width: { xs: "100%", md: 200 } }}
            />
          </Box>

          <Box>
            <FormControlLabel
              control={<Checkbox checked={charge} disabled={!canCharge} onChange={(e) => setCharge(e.target.checked)} />}
              label={<Typography variant="body2">Начислить в счёт</Typography>}
            />
            {!canCharge && (
              <Typography variant="caption" color="text.secondary" display="block">
                Начислить может сотрудник с правом на оплату — время выезда сохранится и без начисления.
              </Typography>
            )}
            {charge && late && (
              <Stack direction={{ xs: "column", md: "row" }} gap={1.5} alignItems={{ md: "center" }} sx={{ mt: 0.5 }}>
                <TextField
                  size="small"
                  label="Сумма"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.,\s]/g, "").slice(0, 12))}
                  error={amountNum == null || amountNum <= 0}
                  slotProps={{ input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> }, htmlInput: { inputMode: "decimal" } }}
                  sx={{ width: { xs: "100%", md: 170 } }}
                />
                <Typography variant="body2" color="text.secondary">
                  {shareLabel(fee.share)} от ночи {money(nightPrice)}
                </Typography>
              </Stack>
            )}
          </Box>

          {existing.length > 0 && (
            <Alert severity="info" variant="outlined">
              Уже начислено: {existing.map((c) => `${c.name} — ${money(Number(c.totalAmount))}`).join(", ")}.{" "}
              {charge ? "Заменим новым начислением." : "Останется в счёте."}
            </Alert>
          )}
          {error && (
            <Alert severity="error" variant="outlined">
              {error}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 0, gap: 1, flexWrap: "wrap" }}>
        {current && current > rule && (
          <Button color="inherit" onClick={() => void remove()} disabled={saving} sx={{ mr: "auto" }}>
            Выезд по правилам
          </Button>
        )}
        <Button color="inherit" onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button variant="contained" disableElevation disabled={!canSave} onClick={() => void save()} sx={{ borderRadius: "10px", fontWeight: 700 }}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LateCheckoutDialog;
