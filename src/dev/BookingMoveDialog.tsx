/**
 * Подтверждение переноса брони, перетащенной в шахматке: было → станет, что
 * будет с ценой, у заселённого гостя — причина переселения. Запросы и их
 * порядок — planMove (bookingMove.ts); перед ними бронь перечитывается, чтобы
 * взять свежую версию и состояние (гостя могли заселить, пока тянули).
 */
import React from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, Stack, TextField, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowForwardOutlined from "@mui/icons-material/ArrowForwardOutlined";
import { useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { ApiError, getErrorMessage } from "../api/client";
import { assignRoom, getReservation, moveRoom, updateReservationItem, type HotelCalendarItem, type HotelReservationDetail } from "../api/hotel";
import { planMove } from "./bookingMove";
import { formatHotelDateRange, nightsBetween } from "./mockDemoData";

export interface BookingMoveTarget {
  item: HotelCalendarItem;
  fromRoomNumber: string | null;
  toRoom: { id: number; number: string; roomTypeId: number };
  newCheckIn: string;
  newCheckOut: string;
}

const errorText = (err: unknown) => {
  const code = err instanceof ApiError ? err.code : null;
  if (code === "NO_AVAILABILITY") return "На эти даты нет места — номер или категория заняты.";
  if (code === "VERSION_CONFLICT") return "Бронь только что изменили — шахматка обновлена, перетащите ещё раз.";
  return getErrorMessage(err, "Не удалось перенести бронь");
};

export const BookingMoveDialog: React.FC<{
  target: BookingMoveTarget;
  roomTypeName: (id: number) => string | undefined;
  onClose: () => void;
}> = ({ target, roomTypeName, onClose }) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { item, toRoom, newCheckIn, newCheckOut } = target;
  const checkedIn = item.stayStatus === "checked_in";
  const typeChanged = toRoom.roomTypeId !== item.roomTypeId;
  const datesChanged = newCheckIn !== item.checkIn;
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const plan = planMove({
    stayStatus: item.stayStatus,
    fromRoomId: item.roomId,
    fromRoomTypeId: item.roomTypeId,
    toRoom,
    checkIn: item.checkIn,
    checkOut: item.checkOut,
    newCheckIn,
    newCheckOut,
  });
  const refusal = typeof plan === "string" ? plan : null;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["hotel", "calendar"] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "reservations"] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "reservation", item.reservationId] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "dashboard"] });
  };

  const run = async () => {
    if (refusal || (checkedIn && !reason.trim())) return;
    setSaving(true);
    setError(null);
    let done = 0;
    try {
      let detail: HotelReservationDetail = await getReservation(item.reservationId);
      const before = Number(detail.totalAmount);
      const fresh = detail.items.find((i) => i.id === item.itemId);
      if (!fresh) throw new Error("Позиция брони не найдена — обновите шахматку.");
      // План по свежим данным: гостя могли заселить или переселить, пока тянули полосу.
      const steps = planMove({
        stayStatus: fresh.stayStatus,
        fromRoomId: fresh.roomId,
        fromRoomTypeId: fresh.roomTypeId,
        toRoom,
        checkIn: fresh.checkIn,
        checkOut: fresh.checkOut,
        newCheckIn,
        newCheckOut,
      });
      if (typeof steps === "string") throw new Error(steps);
      for (const step of steps) {
        const version = detail.version;
        if (step.kind === "unassign") detail = await assignRoom(item.reservationId, item.itemId, { roomId: null, version });
        else if (step.kind === "assign") detail = await assignRoom(item.reservationId, item.itemId, { roomId: step.roomId, version });
        else if (step.kind === "move") detail = await moveRoom(item.reservationId, item.itemId, { roomId: step.roomId, reason: reason.trim(), version });
        else
          detail = await updateReservationItem(item.reservationId, item.itemId, {
            version,
            ...(step.checkIn ? { checkIn: step.checkIn, checkOut: step.checkOut } : {}),
            ...(step.roomTypeId ? { roomTypeId: step.roomTypeId } : {}),
          });
        done += 1;
      }
      refresh();
      const after = Number(detail.totalAmount);
      const money = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
      enqueueSnackbar(
        `Бронь перенесена: №${toRoom.number}, ${formatHotelDateRange(newCheckIn, newCheckOut)}${Math.abs(after - before) > 0.004 ? ` · сумма ${money(before)} → ${money(after)}` : ""}`,
        { variant: "success" },
      );
      onClose();
    } catch (err) {
      refresh();
      setError(`${errorText(err)}${done > 0 ? " Часть изменений уже сохранена — проверьте бронь в карточке." : ""}`);
    } finally {
      setSaving(false);
    }
  };

  const nights = nightsBetween(item.checkIn, item.checkOut);
  const side = (room: string | null, from: string, to: string, highlight: boolean) => (
    <Box
      sx={{
        flex: 1,
        p: 1.25,
        borderRadius: "10px",
        border: 1,
        borderColor: highlight ? alpha(theme.palette.primary.main, 0.5) : "divider",
        bgcolor: highlight ? alpha(theme.palette.primary.main, 0.05) : "transparent",
      }}
    >
      <Typography fontWeight={800}>{room ? `№${room}` : "Без номера"}</Typography>
      <Typography variant="body2" color="text.secondary">
        {formatHotelDateRange(from, to)} · {nights} ноч.
      </Typography>
    </Box>
  );

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth PaperProps={{ sx: { maxWidth: 480, borderRadius: "16px", backgroundImage: "none" } }}>
      <Box sx={{ px: 3, pt: 2.5, pb: 0.5 }}>
        <Typography variant="subtitle1" fontWeight={800}>
          {checkedIn ? "Переселить гостя" : "Перенести бронь"} №{item.reservationNumber}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {item.customerName}
        </Typography>
      </Box>
      <DialogContent>
        <Stack gap={1.75}>
          <Stack direction="row" alignItems="center" gap={1}>
            {side(target.fromRoomNumber, item.checkIn, item.checkOut, false)}
            <ArrowForwardOutlined sx={{ color: "text.secondary", flexShrink: 0 }} />
            {side(toRoom.number, newCheckIn, newCheckOut, true)}
          </Stack>
          {refusal ? (
            <Alert severity="warning" variant="outlined">
              {refusal}
            </Alert>
          ) : (
            <>
              {typeChanged && (
                <Typography variant="body2">
                  Категория: {roomTypeName(item.roomTypeId) ?? "прежняя"} → <b>{roomTypeName(toRoom.roomTypeId) ?? "другая"}</b>.{" "}
                  {checkedIn ? "Цена проживания не меняется — переселение." : "Цена всех ночей пересчитается по тарифу новой категории."}
                </Typography>
              )}
              {datesChanged && !typeChanged && (
                <Typography variant="body2" color="text.secondary">
                  Ночи на новые даты считаются по текущим ценам, совпадающие ночи сохраняют свою цену.
                </Typography>
              )}
              {checkedIn && (
                <TextField
                  size="small"
                  label="Причина переселения"
                  required
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value.slice(0, 255))}
                  placeholder="Например: шумно, просьба гостя"
                  helperText="Старый номер освободится сегодня и уйдёт в уборку"
                />
              )}
            </>
          )}
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
        {!refusal && (
          <Button
            variant="contained"
            disableElevation
            onClick={() => void run()}
            disabled={saving || (checkedIn && !reason.trim())}
            sx={{ borderRadius: "10px", fontWeight: 700 }}
          >
            {saving ? "Переносим…" : checkedIn ? "Переселить" : "Перенести"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default BookingMoveDialog;
