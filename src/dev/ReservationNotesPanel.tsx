/**
 * «Заметки» в карточке брони — как вкладка Exely: внутренняя заметка для
 * сотрудников (гость её не видит) и пожелание гостя. Сохраняется в саму бронь
 * (PATCH /reservations/{id}/ internalNote/guestComment с version), поэтому
 * видна всем сменам и попадает в историю.
 */
import React from "react";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import LockOutlined from "@mui/icons-material/LockOutlined";
import ChatBubbleOutlineOutlined from "@mui/icons-material/ChatBubbleOutlineOutlined";
import { useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { ApiError, getErrorMessage } from "../api/client";
import { updateReservation, type HotelReservation } from "../api/hotel";
import { useCan } from "../hooks/useCan";

const QUICK = ["Поздний заезд", "Ранний заезд", "Нужна детская кроватка", "Трансфер из аэропорта", "Постоянный гость", "Оплатит при выезде"];

export const ReservationNotesPanel: React.FC<{ reservation: HotelReservation }> = ({ reservation }) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const canEdit = useCan("hotel.reservations.manage");
  const [note, setNote] = React.useState(reservation.internalNote ?? "");
  const [comment, setComment] = React.useState(reservation.guestComment ?? "");
  const [saving, setSaving] = React.useState(false);
  const [conflict, setConflict] = React.useState(false);
  React.useEffect(() => {
    setNote(reservation.internalNote ?? "");
    setComment(reservation.guestComment ?? "");
    setConflict(false);
  }, [reservation.id, reservation.internalNote, reservation.guestComment]);
  const dirty = note !== (reservation.internalNote ?? "") || comment !== (reservation.guestComment ?? "");

  const save = async () => {
    setSaving(true);
    try {
      await updateReservation(reservation.id, { version: reservation.version, internalNote: note.trim(), guestComment: comment.trim() });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reservation", reservation.id] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reservations"] });
      enqueueSnackbar("Заметки сохранены", { variant: "success" });
    } catch (err) {
      if (err instanceof ApiError && err.code === "VERSION_CONFLICT") setConflict(true);
      else enqueueSnackbar(getErrorMessage(err, "Не удалось сохранить заметки"), { variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap={2.5}>
      {conflict && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={() => void queryClient.invalidateQueries({ queryKey: ["hotel", "reservation", reservation.id] })}>
              Обновить
            </Button>
          }
        >
          Бронь только что изменил кто-то другой — обновите карточку и сохраните заметку ещё раз.
        </Alert>
      )}
      <Box>
        <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 1 }}>
          <LockOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
          <Typography variant="body2" fontWeight={700}>
            Для сотрудников
          </Typography>
          <Typography variant="caption" color="text.secondary">
            — гость не видит
          </Typography>
        </Stack>
        <TextField
          fullWidth
          multiline
          minRows={4}
          placeholder="Например: гость просил тихий номер, оплатит остаток при выезде наличными"
          value={note}
          disabled={!canEdit || saving}
          onChange={(e) => setNote(e.target.value.slice(0, 2000))}
        />
        {canEdit && (
          <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 1 }}>
            {QUICK.map((q) => (
              <Button
                key={q}
                size="small"
                variant="outlined"
                sx={{ borderRadius: "999px", py: 0.25, fontSize: 12 }}
                onClick={() => setNote((n) => (n.includes(q) ? n : `${n.trim()}${n.trim() ? "\n" : ""}${q}`))}
              >
                + {q}
              </Button>
            ))}
          </Stack>
        )}
      </Box>
      <Box>
        <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 1 }}>
          <ChatBubbleOutlineOutlined sx={{ fontSize: 16, color: "text.secondary" }} />
          <Typography variant="body2" fontWeight={700}>
            Пожелание гостя
          </Typography>
        </Stack>
        <TextField
          fullWidth
          multiline
          minRows={2}
          placeholder="Что гость просил при бронировании"
          value={comment}
          disabled={!canEdit || saving}
          onChange={(e) => setComment(e.target.value.slice(0, 2000))}
        />
      </Box>
      {canEdit && (
        <Stack direction="row" justifyContent="flex-end" gap={1}>
          <Button
            disabled={!dirty || saving}
            onClick={() => {
              setNote(reservation.internalNote ?? "");
              setComment(reservation.guestComment ?? "");
            }}
          >
            Отменить
          </Button>
          <Button variant="contained" disableElevation disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "Сохраняем…" : "Сохранить заметки"}
          </Button>
        </Stack>
      )}
    </Stack>
  );
};

export default ReservationNotesPanel;
