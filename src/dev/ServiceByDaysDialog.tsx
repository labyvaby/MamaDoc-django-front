/**
 * «Услуга по дням» — окно как «Услуга в номере» в Exely: услуга справочника
 * (завтрак), темп «за гостя / за номер в сутки», цена и таблица дней
 * проживания: включить или выключить день, поменять цену и количество.
 * Логика и план изменений — serviceByDays.ts; на сервер уходят обычные строки
 * счёта: новая строка на день, изменённый или выключенный день — отмена старой.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import dayjs from "dayjs";
import { useSnackbar } from "notistack";

import { getErrorMessage } from "../api/client";
import { addCharge, voidCharge, type HotelCharge, type HotelExtraService, type HotelReservation } from "../api/hotel";
import { subtleBorder } from "../theme/uiHelpers";
import { formatHotelDate } from "./mockDemoData";
import {
  SERVICE_PACE_LABELS,
  buildDayRows,
  chargesOfService,
  isBreakfastName,
  planDayChanges,
  rowValid,
  rowsTotal,
  type DayRow,
  type ServicePace,
} from "./serviceByDays";

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const money = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const decimalInput = (v: string, max = 9) => v.replace(/[^\d.,]/g, "").replace(",", ".").slice(0, max);

interface Props {
  open: boolean;
  onClose: () => void;
  reservation: HotelReservation;
  services: HotelExtraService[];
  /** Строки счёта брони (отменённые не нужны). */
  charges: HotelCharge[];
  /** Открыть сразу на этой услуге (кнопка у строки счёта). */
  initialServiceId?: number;
  /** После сохранения (и после сбоя посередине) — перечитать счёт и карточку. */
  onChanged: () => void;
}

export const ServiceByDaysDialog: React.FC<Props> = ({ open, onClose, reservation, services, charges, initialServiceId, onChanged }) => {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const unit = reservation.currency === "KGS" || !reservation.currency ? "сом" : reservation.currency;
  const defaultService = services.find((s) => s.id === initialServiceId) ?? services.find((s) => isBreakfastName(s.name)) ?? services[0];
  const [serviceId, setServiceId] = React.useState<number | undefined>(defaultService?.id);
  const service = services.find((s) => s.id === serviceId);
  const [pace, setPace] = React.useState<ServicePace>("perGuest");
  const [price, setPrice] = React.useState(service ? String(Number(service.price)) : "");
  const [comment, setComment] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [progress, setProgress] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const existing = React.useMemo(() => (service ? chargesOfService(charges, service) : []), [charges, service]);
  const makeRows = React.useCallback(
    (s: HotelExtraService | undefined, p: ServicePace, unitPrice: number) =>
      s ? buildDayRows(reservation.items, chargesOfService(charges, s), { breakfast: isBreakfastName(s.name), pace: p, price: unitPrice }) : [],
    [charges, reservation.items],
  );
  const [rows, setRows] = React.useState<DayRow[]>(() => makeRows(service, pace, Number(service?.price ?? 0)));

  const pickService = (id: number) => {
    const next = services.find((s) => s.id === id);
    setServiceId(id);
    setPrice(next ? String(Number(next.price)) : "");
    setRows(makeRows(next, pace, Number(next?.price ?? 0)));
    setError(null);
  };
  const pickPace = (p: ServicePace) => {
    setPace(p);
    setRows(makeRows(service, p, Number(price) || 0));
  };
  // Цена сверху — всем дням, как в Exely; потом любой день можно поправить отдельно.
  const changePrice = (v: string) => {
    const clean = decimalInput(v);
    setPrice(clean);
    setRows((rs) => rs.map((r) => ({ ...r, price: clean })));
  };
  const patchRow = (date: string, patch: Partial<DayRow>) => setRows((rs) => rs.map((r) => (r.date === date ? { ...r, ...patch } : r)));

  const plan = planDayChanges(rows);
  const changes = plan.voidIds.length + plan.add.length;
  const invalid = rows.some((r) => !rowValid(r));
  const enabledDays = rows.filter((r) => r.enabled).length;
  const totalQty = rows.filter((r) => r.enabled).reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const total = rowsTotal(rows);
  const wasTotal = existing.reduce((s, c) => s + Number(c.totalAmount), 0);

  const save = async () => {
    if (!service || invalid || changes === 0) return;
    setSaving(true);
    setError(null);
    let done = 0;
    try {
      // Сначала отмены, потом новые строки: при сбое посередине в счёте не будет двойных дней.
      for (const id of plan.voidIds) {
        setProgress(`Сохраняем ${done + 1} из ${changes}…`);
        await voidCharge(reservation.id, id);
        done += 1;
      }
      for (const a of plan.add) {
        setProgress(`Сохраняем ${done + 1} из ${changes}…`);
        await addCharge(reservation.id, {
          serviceId: service.id,
          name: service.name,
          price: a.price.toFixed(2),
          quantity: String(a.quantity),
          date: a.date,
          comment: comment.trim() || undefined,
        });
        done += 1;
      }
      onChanged();
      enqueueSnackbar(`«${service.name}»: ${enabledDays} ${enabledDays === 1 ? "день" : enabledDays < 5 ? "дня" : "дней"}, ${money(total)} ${unit} в счёте`, { variant: "success" });
      onClose();
    } catch (err) {
      onChanged();
      setError(`${getErrorMessage(err, "Не удалось сохранить")}${done > 0 ? ` Уже сохранено ${done} из ${changes} — счёт обновлён, откройте окно заново.` : ""}`);
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  const line = `1px solid ${subtleBorder(theme)}`;
  const cellInput = { "& .MuiInputBase-input": { py: 0.5, px: 1, fontVariantNumeric: "tabular-nums", textAlign: "right" } } as const;

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth PaperProps={{ sx: { maxWidth: 640, borderRadius: "16px", backgroundImage: "none" } }}>
      <Box sx={{ px: 3, pt: 2.5, pb: 0.5 }}>
        <Typography variant="subtitle1" fontWeight={800}>
          Услуга по дням
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Бронь №{reservation.number} · включите нужные дни, поправьте цену и количество
        </Typography>
      </Box>
      <DialogContent>
        {services.length === 0 ? (
          <Alert severity="info" variant="outlined">
            В справочнике нет услуг. Добавьте «Завтрак» в «Услугах» отеля — и его можно будет начислять по дням.
          </Alert>
        ) : (
          <Stack gap={2}>
            <Stack direction={{ xs: "column", md: "row" }} gap={1.5}>
              <TextField select size="small" label="Услуга" value={serviceId ?? ""} onChange={(e) => pickService(Number(e.target.value))} sx={{ flex: 2 }} disabled={saving}>
                {services.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name} — {money(Number(s.price))} {unit}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Темп начисления" value={pace} onChange={(e) => pickPace(e.target.value as ServicePace)} sx={{ flex: 1.4 }} disabled={saving}>
                {(Object.keys(SERVICE_PACE_LABELS) as ServicePace[]).map((p) => (
                  <MenuItem key={p} value={p}>
                    {SERVICE_PACE_LABELS[p]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                label={`Цена, ${unit}`}
                value={price}
                onChange={(e) => changePrice(e.target.value)}
                helperText="всем дням"
                sx={{ flex: 1 }}
                disabled={saving}
                slotProps={{ htmlInput: { inputMode: "decimal" } }}
              />
            </Stack>
            {existing.length > 0 && (
              <Typography variant="body2" color="text.secondary">
                Уже в счёте: {existing.length} {existing.length === 1 ? "строка" : existing.length < 5 ? "строки" : "строк"} на {money(wasTotal)} {unit}. Выключенный день
                отменит свою строку.
              </Typography>
            )}

            <Box sx={{ border: line, borderRadius: "12px", overflowX: "auto" }}>
              <Table size="small" sx={{ "& td, & th": { borderColor: subtleBorder(theme) } }}>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" sx={{ pl: 1 }}>
                      Вкл.
                    </TableCell>
                    <TableCell>Дата</TableCell>
                    <TableCell align="right">Цена</TableCell>
                    <TableCell align="right">Кол-во</TableCell>
                    <TableCell align="right" sx={{ pr: 2 }}>
                      Стоимость
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => {
                    const d = dayjs(r.date);
                    const cost = (Number(r.price) || 0) * (Number(r.quantity) || 0);
                    const bad = !rowValid(r);
                    return (
                      <TableRow key={r.date} sx={{ opacity: r.enabled ? 1 : 0.55 }}>
                        <TableCell padding="checkbox" sx={{ pl: 1 }}>
                          <Checkbox
                            size="small"
                            checked={r.enabled}
                            disabled={saving}
                            onChange={(e) => patchRow(r.date, { enabled: e.target.checked })}
                            inputProps={{ "aria-label": `${formatHotelDate(r.date)}: начислять` }}
                          />
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          {formatHotelDate(r.date)}{" "}
                          <Typography component="span" variant="body2" color={[0, 6].includes(d.day()) ? "warning.main" : "text.secondary"}>
                            ({WEEKDAYS[d.day()]})
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <TextField
                            size="small"
                            value={r.price}
                            disabled={!r.enabled || saving}
                            error={r.enabled && bad}
                            onChange={(e) => patchRow(r.date, { price: decimalInput(e.target.value) })}
                            sx={{ width: 96, ...cellInput }}
                            slotProps={{ htmlInput: { inputMode: "decimal", "aria-label": `${formatHotelDate(r.date)}: цена` } }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <TextField
                            size="small"
                            value={r.quantity}
                            disabled={!r.enabled || saving}
                            error={r.enabled && bad}
                            onChange={(e) => patchRow(r.date, { quantity: decimalInput(e.target.value, 6) })}
                            sx={{ width: 64, ...cellInput }}
                            slotProps={{ htmlInput: { inputMode: "decimal", "aria-label": `${formatHotelDate(r.date)}: количество` } }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ pr: 2, fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                          {r.enabled ? `${money(Math.round(cost * 100) / 100)} ${unit}` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>

            <TextField size="small" label="Комментарий" placeholder="Необязательно" value={comment} onChange={(e) => setComment(e.target.value.slice(0, 300))} disabled={saving} />

            <Typography variant="body2" aria-live="polite">
              Дней: <b>{enabledDays}</b> · услуг за период: <b>{money(totalQty)}</b> · стоимость: <b>{money(total)} {unit}</b>
              {existing.length > 0 && Math.abs(total - wasTotal) > 0.004 && (
                <Typography component="span" variant="body2" color="text.secondary">
                  {" "}
                  (было {money(wasTotal)} {unit})
                </Typography>
              )}
            </Typography>
            {error && (
              <Alert severity="error" variant="outlined">
                {error}
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 0, gap: 1 }}>
        {progress && (
          <Typography variant="caption" color="text.secondary" sx={{ mr: "auto" }}>
            {progress}
          </Typography>
        )}
        <Button color="inherit" onClick={onClose} disabled={saving}>
          Отменить
        </Button>
        <Button variant="contained" disableElevation onClick={() => void save()} disabled={saving || !service || invalid || changes === 0} sx={{ borderRadius: "10px", fontWeight: 700 }}>
          {saving ? "Сохраняем…" : "Применить"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ServiceByDaysDialog;
