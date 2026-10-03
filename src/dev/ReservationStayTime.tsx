/**
 * Время заезда и выезда в карточке брони: своё время брони (ранний заезд,
 * поздний выезд, время со слов гостя) или правило объекта «по правилам».
 * Поправить или вернуть правило — прямо в строке; PATCH брони с version
 * (expectedArrivalTime / expectedDepartureTime, null — как в правилах).
 * После заселения / выезда показывается фактическое время.
 */
import React from "react";
import { Box, Button, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import EditOutlined from "@mui/icons-material/EditOutlined";
import dayjs from "dayjs";
import { useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";

import { getErrorMessage } from "../api/client";
import { updateReservation, type HotelReservation } from "../api/hotel";
import { hhmm, stayTimeView, type StayTimeKind } from "./stayTimes";

const WORDS: Record<StayTimeKind, { field: "expectedArrivalTime" | "expectedDepartureTime"; label: string; done: string; hint: string }> = {
  arrival: { field: "expectedArrivalTime", label: "Время заезда", done: "заселён", hint: "Ранний заезд или во сколько приедет гость" },
  departure: { field: "expectedDepartureTime", label: "Время выезда", done: "выехал", hint: "Поздний выезд — до скольки гость останется" },
};

export const ReservationStayTime: React.FC<{
  kind: StayTimeKind;
  reservation: HotelReservation;
  /** Правило объекта: Property.checkInTime / checkOutTime. */
  ruleTime: string | null | undefined;
  /** Фактическое заселение / выезд (item.checkedInAt / checkedOutAt). */
  actualAt?: string | null;
  canEdit: boolean;
}> = ({ kind, reservation, ruleTime, actualAt, canEdit }) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const words = WORDS[kind];
  // Поля нет в ответе — сервер ещё без своего времени выезда: показываем правило, править нечего.
  const supported = words.field in reservation;
  const view = stayTimeView(kind, reservation[words.field], ruleTime);
  const own = view.own ? view.time : null;
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const save = async (next: string | null) => {
    setSaving(true);
    try {
      await updateReservation(
        reservation.id,
        kind === "arrival" ? { version: reservation.version, expectedArrivalTime: next } : { version: reservation.version, expectedDepartureTime: next },
      );
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reservation", reservation.id] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "calendar"] });
      setEditing(false);
    } catch (err) {
      enqueueSnackbar(getErrorMessage(err, `Не удалось сохранить ${words.label.toLowerCase()}`), { variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <Stack direction="row" alignItems="center" gap={0.75} justifyContent="flex-end" flexWrap="wrap">
        <TextField
          size="small"
          type="time"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          slotProps={{ htmlInput: { "aria-label": words.label } }}
          sx={{ width: 120 }}
          autoFocus
        />
        <Button size="small" variant="contained" disableElevation disabled={saving || !value || value === own} onClick={() => void save(value)}>
          ОК
        </Button>
        {own && (
          <Button size="small" color="inherit" disabled={saving} onClick={() => void save(null)}>
            Как в правилах{hhmm(ruleTime) ? ` (${hhmm(ruleTime)})` : ""}
          </Button>
        )}
        <Button size="small" color="inherit" disabled={saving} onClick={() => setEditing(false)}>
          Отмена
        </Button>
      </Stack>
    );
  }

  if (actualAt) {
    return (
      <Typography variant="body2" fontWeight={600} color="success.main" sx={{ fontVariantNumeric: "tabular-nums" }}>
        {dayjs(actualAt).format("HH:mm")} · {words.done}
        {own && (
          <Typography component="span" variant="body2" color="text.secondary" sx={{ fontWeight: 400 }}>
            {" "}
            (по брони {own})
          </Typography>
        )}
      </Typography>
    );
  }

  const pencil = (
    <IconButton
      size="small"
      aria-label={`Изменить: ${words.label.toLowerCase()}`}
      disabled={!supported}
      onClick={() => {
        setValue(view.time ?? "");
        setEditing(true);
      }}
    >
      <EditOutlined sx={{ fontSize: 16 }} />
    </IconButton>
  );
  return (
    <Stack direction="row" alignItems="center" gap={0.75} justifyContent="flex-end" flexWrap="wrap">
      {view.note && (
        <Box
          component="span"
          sx={{
            px: 0.75,
            py: 0.125,
            borderRadius: "6px",
            fontSize: 12,
            fontWeight: 700,
            color: theme.palette.warning.dark,
            bgcolor: alpha(theme.palette.warning.main, theme.palette.mode === "dark" ? 0.2 : 0.12),
          }}
        >
          {view.note}
        </Box>
      )}
      <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: view.own ? 700 : 400 }} color={view.time ? "text.primary" : "text.disabled"}>
        {view.time ?? "не указано"}
        {!view.own && view.time && (
          <Typography component="span" variant="body2" color="text.secondary">
            {" "}
            · по правилам
          </Typography>
        )}
      </Typography>
      {canEdit &&
        (supported ? (
          <Tooltip title={words.hint}>{pencil}</Tooltip>
        ) : (
          <Tooltip title="Своё время выезда у брони появится после обновления сервера">
            <span>{pencil}</span>
          </Tooltip>
        ))}
    </Stack>
  );
};

export default ReservationStayTime;
