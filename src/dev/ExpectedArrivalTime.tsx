/**
 * «Приедет около» в карточке брони — время заезда со слов гостя
 * (expectedArrivalTime, "HH:MM" по часам объекта). Ресепшен видит его в
 * «Кто сегодня заедет» и в отчёте «Заезды» вместо времени по правилам.
 * Поправить или очистить — прямо в строке; PATCH брони с version.
 */
import React from "react";
import { Button, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import { useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { getErrorMessage } from "../api/client";
import { updateReservation, type HotelReservation } from "../api/hotel";

/** "14:30:00" → "14:30"; пусто — null. */
export const arrivalTimeLabel = (v: string | null | undefined): string | null => (v ? v.slice(0, 5) : null);

export const ExpectedArrivalTime: React.FC<{ reservation: HotelReservation; canEdit: boolean }> = ({ reservation, canEdit }) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const current = arrivalTimeLabel(reservation.expectedArrivalTime);
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(current ?? "");
  const [saving, setSaving] = React.useState(false);

  const save = async (next: string | null) => {
    setSaving(true);
    try {
      await updateReservation(reservation.id, { version: reservation.version, expectedArrivalTime: next });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reservation", reservation.id] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reservations"] });
      setEditing(false);
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось сохранить время заезда"), { variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <Stack direction="row" alignItems="center" gap={0.75} justifyContent="flex-end">
        <TextField
          size="small"
          type="time"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          slotProps={{ htmlInput: { "aria-label": "Приедет около" } }}
          sx={{ width: 120 }}
          autoFocus
        />
        <Button size="small" variant="contained" disableElevation disabled={saving || !value || value === current} onClick={() => void save(value)}>
          ОК
        </Button>
        {current && (
          <Button size="small" color="inherit" disabled={saving} onClick={() => void save(null)}>
            Очистить
          </Button>
        )}
        <Button size="small" color="inherit" disabled={saving} onClick={() => setEditing(false)}>
          Отмена
        </Button>
      </Stack>
    );
  }
  return (
    <Stack direction="row" alignItems="center" gap={0.5} justifyContent="flex-end">
      <Typography variant="body2" fontWeight={current ? 600 : 400} color={current ? "text.primary" : "text.disabled"}>
        {current ? `около ${current}` : "не указано"}
      </Typography>
      {canEdit && (
        <Tooltip title="Во сколько приедет гость">
          <IconButton
            size="small"
            aria-label="Изменить время заезда"
            onClick={() => {
              setValue(current ?? "");
              setEditing(true);
            }}
          >
            <EditOutlined sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  );
};

export default ExpectedArrivalTime;
