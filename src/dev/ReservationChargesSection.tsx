/**
 * «Услуги» в карточке брони — допуслуги к счёту гостя: мини-бар, прачечная,
 * поздний выезд. Бэк: /hotel/reservations/{id}/charges/ (право
 * hotel.payments.manage на запись). Название и цена фиксируются в начислении —
 * правка справочника старые счета не меняет. Сумма и долг брони уже включают
 * услуги, поэтому здесь они только перечитываются, а не прибавляются.
 *
 * Отмена начисления сохраняет автора и историю: строку можно показать
 * вместе с отменёнными.
 */
import React from "react";
import { Alert, Box, Button, Collapse, FormControlLabel, MenuItem, Stack, Switch, TextField, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import RoomServiceOutlined from "@mui/icons-material/RoomServiceOutlined";
import SellOutlined from "@mui/icons-material/SellOutlined";
import NotesOutlined from "@mui/icons-material/NotesOutlined";
import NumbersOutlined from "@mui/icons-material/NumbersOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import dayjs from "dayjs";

import { CustomDatePicker } from "../components/ui";
import { useCan } from "../hooks/useCan";
import { subtleBorder } from "../theme/uiHelpers";
import { addCharge, listCharges, listExtraServices, voidCharge, type HotelReservation } from "../api/hotel";
import { ApiError, getErrorMessage } from "../api/client";
import { FormField } from "./formField";
import { FieldIcon } from "./FieldIcon";
import { fieldError, type FieldRules } from "./formRules";
import { formatHotelDate } from "./mockDemoData";

const RULES = {
  quantity: { kind: "decimal", required: true, min: 0.001, max: 100_000, maxDecimals: 3 },
  price: { kind: "decimal", required: true, min: 0, max: 10_000_000, maxDecimals: 2 },
  name: { required: true, maxLength: 120 },
  comment: { maxLength: 300 },
} satisfies Record<string, FieldRules>;

const CUSTOM = "custom";
const money = (v: string | number) => Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 2 });

export const ReservationChargesSection: React.FC<{
  reservation: HotelReservation;
  /** После начисления или отмены — перечитать карточку (сумма, долг, версия). */
  onChanged: () => void;
}> = ({ reservation, onChanged }) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const canManage = useCan("hotel.payments.manage");
  const closed = reservation.status === "cancelled" || reservation.status === "no_show";

  const [showVoided, setShowVoided] = React.useState(false);
  const chargesQuery = useQuery({
    queryKey: ["hotel", "reservation", reservation.id, "charges", showVoided],
    queryFn: ({ signal }) => listCharges(reservation.id, { includeVoided: showVoided }, signal),
    placeholderData: undefined,
  });
  const servicesQuery = useQuery({
    queryKey: ["hotel", "extraServices", reservation.propertyId, "active"],
    queryFn: ({ signal }) => listExtraServices(reservation.propertyId, { limit: 200 }, signal),
    enabled: canManage,
    staleTime: 5 * 60_000,
  });
  const services = servicesQuery.data?.results ?? [];
  const charges = chargesQuery.data?.reservationId === reservation.id ? chargesQuery.data.results : [];

  const [formOpen, setFormOpen] = React.useState(false);
  // null — «по умолчанию»: первая услуга справочника, как только он загрузится.
  const [pickedKey, setPickedKey] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [date, setDate] = React.useState(dayjs());
  const [comment, setComment] = React.useState("");
  const [showErrors, setShowErrors] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [voidingId, setVoidingId] = React.useState<number | null>(null);

  // Другая бронь — форма с нуля.
  React.useEffect(() => {
    setFormOpen(false);
    setError(null);
    setShowVoided(false);
  }, [reservation.id]);

  const serviceKey = pickedKey ?? (services.length > 0 ? String(services[0].id) : CUSTOM);
  const service = services.find((s) => String(s.id) === serviceKey);
  const fromCatalog = service != null;
  const effectiveName = fromCatalog ? service.name : name;
  const effectivePrice = fromCatalog && price === "" ? service.price : price;
  const total = Number(effectivePrice) * Number(quantity);

  const openForm = () => {
    setPickedKey(null);
    setName("");
    setPrice("");
    setQuantity("1");
    setDate(dayjs());
    setComment("");
    setShowErrors(false);
    setError(null);
    setFormOpen(true);
  };

  const invalid =
    fieldError(quantity, RULES.quantity) != null ||
    (!fromCatalog && (fieldError(name, RULES.name) != null || fieldError(price, RULES.price) != null)) ||
    (fromCatalog && price !== "" && fieldError(price, RULES.price) != null) ||
    fieldError(comment, RULES.comment) != null ||
    !date.isValid();

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["hotel", "reservation", reservation.id, "charges"] });
    onChanged();
  };

  const handleAdd = async () => {
    if (invalid) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addCharge(reservation.id, {
        ...(fromCatalog ? { serviceId: service.id, ...(price !== "" ? { name: service.name, price: String(Number(price)) } : {}) } : { name: name.trim(), price: String(Number(price)) }),
        quantity: String(Number(quantity)),
        date: date.format("YYYY-MM-DD"),
        comment: comment.trim() || undefined,
        version: reservation.version,
      });
      setFormOpen(false);
      refresh();
      enqueueSnackbar(`Услуга «${effectiveName}» добавлена в счёт`, { variant: "success" });
    } catch (err) {
      if (err instanceof ApiError && err.code === "VERSION_CONFLICT") {
        // Бронь изменили параллельно — перечитываем и просим повторить, введённое остаётся.
        refresh();
        setError("Бронь только что изменили. Данные обновлены — нажмите «Добавить» ещё раз.");
      } else {
        setError(getErrorMessage(err, "Не удалось добавить услугу"));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleVoid = async (id: number, title: string) => {
    setVoidingId(id);
    try {
      await voidCharge(reservation.id, id);
      refresh();
      enqueueSnackbar(`Услуга «${title}» отменена, сумма пересчитана`, { variant: "success" });
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось отменить услугу"), { variant: "error" });
    } finally {
      setVoidingId(null);
    }
  };

  if (!canManage && charges.length === 0 && !showVoided) return null;

  const line = `1px solid ${subtleBorder(theme)}`;
  const active = charges.filter((c) => !c.voidedAt);
  const activeSum = active.reduce((s, c) => s + Number(c.totalAmount), 0);

  return (
    <Box sx={{ mt: 3.5 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }} gap={1}>
        <Typography
          component="div"
          sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}
        >
          Услуги
        </Typography>
        {canManage && !formOpen && !closed && (
          <Button size="small" startIcon={<AddOutlined fontSize="small" />} onClick={openForm}>
            Добавить услугу
          </Button>
        )}
      </Stack>

      {chargesQuery.isPending ? (
        <Typography variant="body2" color="text.disabled">
          Загружаем…
        </Typography>
      ) : charges.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Допуслуг в счёте нет. {canManage && !closed ? "Мини-бар, прачечная, поздний выезд — добавьте сюда." : ""}
        </Typography>
      ) : (
        <Box>
          {charges.map((c, i) => {
            const voided = c.voidedAt != null;
            return (
              <Stack key={c.id} direction="row" alignItems="center" gap={1.5} sx={{ py: 1.1, borderTop: i === 0 ? "none" : line, opacity: voided ? 0.55 : 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} sx={{ textDecoration: voided ? "line-through" : "none" }}>
                    {c.name}
                    <Typography component="span" variant="body2" color="text.secondary">
                      {" "}
                      · {Number(c.quantity).toLocaleString("ru-RU", { maximumFractionDigits: 3 })} × {money(c.price)}
                    </Typography>
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="div" noWrap>
                    {[
                      formatHotelDate(c.date),
                      c.createdByName,
                      c.comment,
                      voided ? `отменена${c.voidedByName ? `: ${c.voidedByName}` : ""}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Typography>
                </Box>
                <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", flexShrink: 0, textDecoration: voided ? "line-through" : "none" }}>
                  {money(c.totalAmount)}
                </Typography>
                {canManage && !voided && !closed && (
                  <Tooltip title="Отменить услугу">
                    <span>
                      <Button
                        size="small"
                        color="inherit"
                        onClick={() => void handleVoid(c.id, c.name)}
                        disabled={voidingId != null}
                        aria-label={`Отменить услугу ${c.name}`}
                        sx={{ minWidth: 0, px: 0.75 }}
                      >
                        <CloseOutlined fontSize="small" />
                      </Button>
                    </span>
                  </Tooltip>
                )}
              </Stack>
            );
          })}
          {active.length > 0 && (
            <Stack direction="row" justifyContent="space-between" sx={{ pt: 1, borderTop: line }}>
              <Typography variant="body2" color="text.secondary">
                Услуги в счёте
              </Typography>
              <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
                {money(activeSum)}
              </Typography>
            </Stack>
          )}
        </Box>
      )}
      {(charges.some((c) => c.voidedAt) || showVoided) && (
        <FormControlLabel
          sx={{ mt: 0.5 }}
          control={<Switch size="small" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />}
          label={<Typography variant="caption">Показать отменённые</Typography>}
        />
      )}

      <Collapse in={formOpen} unmountOnExit>
        <Stack gap={1.5} sx={{ mt: 1.5, p: 2, borderRadius: "12px", border: line }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            select
            size="small"
            label="Услуга"
            value={serviceKey}
            onChange={(e) => {
              setPickedKey(e.target.value);
              setPrice("");
            }}
            disabled={saving}
            slotProps={{ input: { startAdornment: <FieldIcon icon={<RoomServiceOutlined />} /> } }}
            fullWidth
          >
            {services.map((s) => (
              <MenuItem key={s.id} value={String(s.id)}>
                {s.name} — {money(s.price)}
              </MenuItem>
            ))}
            <MenuItem value={CUSTOM}>Другая услуга…</MenuItem>
          </TextField>
          {!fromCatalog && (
            <FormField
              icon={<RoomServiceOutlined />}
              size="small"
              label="Название"
              placeholder="Поздний выезд"
              value={name}
              onValueChange={setName}
              rules={RULES.name}
              showErrors={showErrors}
              disabled={saving}
              autoFocus
              fullWidth
            />
          )}
          <Stack direction="row" gap={1.5}>
            <FormField
              icon={<NumbersOutlined />}
              size="small"
              label="Количество"
              value={quantity}
              onValueChange={setQuantity}
              rules={RULES.quantity}
              showErrors={showErrors}
              disabled={saving}
              sx={{ flex: 1 }}
            />
            <FormField
              icon={<SellOutlined />}
              size="small"
              label="Цена за единицу"
              unit="сом"
              value={fromCatalog && price === "" ? "" : price}
              placeholder={fromCatalog ? money(service.price) : undefined}
              onValueChange={setPrice}
              rules={fromCatalog && price === "" ? { kind: "decimal", maxDecimals: 2 } : RULES.price}
              showErrors={showErrors}
              disabled={saving}
              helperText={fromCatalog ? "Пусто — цена из справочника" : " "}
              sx={{ flex: 1 }}
            />
          </Stack>
          <CustomDatePicker label="Дата" value={date} onChange={(d) => d && setDate(d)} slotProps={{ textField: { size: "small" } }} disabled={saving} />
          <FormField
            icon={<NotesOutlined />}
            size="small"
            label="Комментарий"
            placeholder="Необязательно"
            value={comment}
            onValueChange={setComment}
            rules={RULES.comment}
            disabled={saving}
            fullWidth
          />
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
            <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
              {Number.isFinite(total) && total > 0 ? `${money(Math.round(total * 100) / 100)} сом` : ""}
            </Typography>
            <Stack direction="row" gap={1}>
              <Button size="small" onClick={() => setFormOpen(false)} disabled={saving}>
                Отмена
              </Button>
              <Button size="small" variant="contained" disableElevation onClick={() => void handleAdd()} disabled={saving}>
                {saving ? "Добавляем…" : "Добавить"}
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Collapse>
    </Box>
  );
};

export default ReservationChargesSection;
