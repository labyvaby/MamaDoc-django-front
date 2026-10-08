/**
 * Номер брони в канале (Booking.com, Островок, турагент) в карточке брони:
 * гость называет его по телефону — по нему бронь находится в поиске шахматки и
 * списка броней (сервер ищет по external_id). Поправить или вписать — прямо в
 * строке; PATCH брони с version (externalId, до 128 символов, пусто — убрать).
 */
import React from "react";
import { Button, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import EditOutlined from "@mui/icons-material/EditOutlined";
import { useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { getErrorMessage } from "../api/client";
import { updateReservation, type HotelReservation } from "../api/hotel";
import { CopyValue } from "./RoomBookingHoverCard";

const MAX_LENGTH = 128;

export const ReservationExternalId: React.FC<{ reservation: HotelReservation; canEdit: boolean }> = ({ reservation, canEdit }) => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const current = reservation.externalId?.trim() ?? "";
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateReservation(reservation.id, { version: reservation.version, externalId: value.trim() });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reservation", reservation.id] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "calendar"] });
      setEditing(false);
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, "Не удалось сохранить номер брони канала"), { variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <Stack
        component="form"
        direction="row"
        alignItems="center"
        gap={0.75}
        justifyContent="flex-end"
        flexWrap="wrap"
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          if (!saving && value.trim() !== current) void save();
        }}
      >
        <TextField
          size="small"
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_LENGTH))}
          placeholder="Например, 943215196"
          slotProps={{ htmlInput: { "aria-label": "Номер брони в канале" } }}
          sx={{ width: 180 }}
          autoFocus
        />
        <Button type="submit" size="small" variant="contained" disableElevation disabled={saving || value.trim() === current}>
          ОК
        </Button>
        <Button size="small" color="inherit" disabled={saving} onClick={() => setEditing(false)}>
          Отмена
        </Button>
      </Stack>
    );
  }

  return (
    <Stack direction="row" alignItems="center" gap={0.5} justifyContent="flex-end">
      <Typography variant="body2" fontWeight={current ? 700 : 400} color={current ? "text.primary" : "text.disabled"} sx={{ fontVariantNumeric: "tabular-nums", wordBreak: "break-all" }}>
        {current || "не указан"}
      </Typography>
      {current && <CopyValue value={current} label="Скопировать номер брони канала" />}
      {canEdit && (
        <Tooltip title="Номер брони на Booking.com, Островке или у турагента — по нему бронь находится в поиске">
          <IconButton
            size="small"
            aria-label="Изменить номер брони в канале"
            onClick={() => {
              setValue(current);
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

export default ReservationExternalId;
