/**
 * «Цена проживания на 6 октября 2026 (Вт)» — как в Exely: клик по цене ночи в
 * «Проживании» открывает окно со значением, причиной и охватом («к выбранной
 * дате», «к выбранной и последующим», «ко всем датам»). Сохраняется тем же
 * PATCH …/pricing/, что и «Изменить цены» (право hotel.prices.override,
 * причина обязательна на сервере и попадает в историю брони). Окно создаётся
 * заново на каждую ночь (key у родителя) — поля всегда начинаются с текущей цены.
 */
import React from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, FormControlLabel, InputAdornment, Radio, RadioGroup, Stack, TextField, Typography } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { ApiError, getErrorMessage } from "../api/client";
import { updateItemPricing, type HotelReservation } from "../api/hotel";
import { NIGHT_PRICE_SCOPES, NIGHT_PRICE_SCOPE_LABELS, nightDatesForScope, nightsToChange, parsePriceInput, type NightPriceScope } from "./nightPriceScope";

type Item = HotelReservation["items"][number];

const REASON_MAX = 255;

interface Props {
  open: boolean;
  onClose: () => void;
  reservation: HotelReservation;
  item: Item;
  /** Ночь, по которой кликнули, YYYY-MM-DD. */
  date: string;
  /** «6 октября 2026 (Вт)» — как в таблице. */
  dateLabel: string;
  unit: string;
}

export const NightPriceDialog: React.FC<Props> = ({ open, onClose, reservation, item, date, dateLabel, unit }) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const night = item.nights.find((n) => n.date === date);
  const [value, setValue] = React.useState(() => (night ? String(Number(night.price)) : ""));
  const [reason, setReason] = React.useState("");
  const [scope, setScope] = React.useState<NightPriceScope>("date");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const price = parsePriceInput(value);
  const toChange = price == null ? [] : nightsToChange(item.nights, date, scope, price);
  const money = (v: number) => `${v.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${unit}`;
  const hasDiscount = item.discountPercent != null && Number(item.discountPercent) > 0;

  const canSave = !saving && price != null && toChange.length > 0 && reason.trim() !== "";
  const hint =
    price == null
      ? "Введите цену ночи"
      : toChange.length === 0
      ? "У выбранных ночей уже такая цена"
      : `Изменится ${toChange.length} ${toChange.length === 1 ? "ночь" : toChange.length < 5 ? "ночи" : "ночей"}: по ${money(price)}${hasDiscount ? ". Скидка номера применится поверх." : ""}`;

  const save = async () => {
    if (!canSave || price == null) return;
    setSaving(true);
    setError(null);
    try {
      await updateItemPricing(reservation.id, item.id, {
        version: reservation.version,
        nights: toChange.map((d) => ({ date: d, price: price.toFixed(2) })),
        reason: reason.trim(),
      });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reservation", reservation.id] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "calendar"] });
      enqueueSnackbar("Цена сохранена — счёт и баланс пересчитаны", { variant: "success" });
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "VERSION_CONFLICT") {
        // Бронь поправили в другом окне: перечитываем, чтобы повтор прошёл с новой версией.
        void queryClient.invalidateQueries({ queryKey: ["hotel", "reservation", reservation.id] });
        setError("Бронь изменили в другом окне — данные обновлены. Нажмите «Сохранить» ещё раз.");
      } else {
        setError(getErrorMessage(err, "Не удалось сохранить цену"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth PaperProps={{ sx: { maxWidth: 480, borderRadius: "16px", backgroundImage: "none" } }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Box sx={{ px: 3, pt: 2.5, pb: 0.5 }}>
          <Typography variant="subtitle1" fontWeight={800} sx={{ lineHeight: 1.3 }}>
            Цена проживания на {dateLabel}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {item.roomNumber ? `Номер ${item.roomNumber}` : "Номер не назначен"} · {item.roomTypeName}
          </Typography>
        </Box>
        <DialogContent>
          <Stack gap={2}>
            <TextField
              label="Значение"
              size="small"
              value={value}
              autoFocus
              onFocus={(e) => e.target.select()}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.,\s]/g, "").slice(0, 12))}
              error={value.trim() !== "" && price == null}
              slotProps={{ input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> }, htmlInput: { inputMode: "decimal" } }}
            />
            <TextField
              label="Причина"
              size="small"
              multiline
              minRows={2}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
              placeholder="Например: постоянный гость, договорились по телефону"
              helperText="Попадёт в историю брони вместе с вашим именем"
            />
            <Box>
              <Typography variant="body2" fontWeight={700} sx={{ mb: 0.25 }}>
                Применить
              </Typography>
              <RadioGroup value={scope} onChange={(_, v) => setScope(v as NightPriceScope)}>
                {NIGHT_PRICE_SCOPES.map((s) => {
                  const count = nightDatesForScope(item.nights, date, s).length;
                  return (
                    <FormControlLabel
                      key={s}
                      value={s}
                      control={<Radio size="small" />}
                      label={
                        <Typography component="span" variant="body2">
                          {NIGHT_PRICE_SCOPE_LABELS[s]}
                          <Typography component="span" variant="body2" color="text.secondary">
                            {" "}
                            · {count} {count === 1 ? "ночь" : count < 5 ? "ночи" : "ночей"}
                          </Typography>
                        </Typography>
                      }
                    />
                  );
                })}
              </RadioGroup>
            </Box>
            <Typography variant="body2" color="text.secondary" aria-live="polite">
              {hint}
            </Typography>
            {error && (
              <Alert severity="error" variant="outlined">
                {error}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 0, gap: 1 }}>
          <Button color="inherit" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button type="submit" variant="contained" disableElevation disabled={!canSave} sx={{ borderRadius: "10px", fontWeight: 700 }}>
            {saving ? "Сохраняем…" : "Сохранить"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default NightPriceDialog;
