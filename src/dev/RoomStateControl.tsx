/**
 * Состояние номера (Убрано / Грязно / Проверено / Ремонт) — чип, по клику на
 * который открывается меню смены. Раньше состояние только показывалось (точка у
 * номера в шахматке и чип в RoomDetailsDialog), и номер, поставленный на ремонт,
 * вернуть в работу было нечем. Показывается в RoomDetailsDialog и на странице
 * редактирования номера (HotelRoomFormPage).
 *
 * Реальный бэкенд: PATCH /hotel/rooms/{id}/housekeeping/ (setRoomHousekeeping,
 * src/api/hotel.ts). Права на стороне бэка: убрано/грязно/проверено — право
 * уборки, «Ремонт» — hotel.manage; при отказе (403) сообщение бэка показываем
 * как есть, а не гадаем по правам на фронте. Смена применяется сразу, без
 * общей кнопки «Сохранить».
 */
import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Box, Chip, CircularProgress, Menu, MenuItem, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowDropDownOutlined from "@mui/icons-material/ArrowDropDownOutlined";
import { useSnackbar } from "notistack";

import { setRoomHousekeeping } from "../api/hotel";
import { getErrorMessage } from "../api/client";
import { HOTEL_ROOM_STATES, HOTEL_ROOM_STATE_LABELS, hotelRoomStateColor, type HotelRoomState } from "./hotelDisplay";

export interface RoomStateControlProps {
  roomId: number;
  /** Текущее состояние (HotelRoom.state). */
  state: string;
}

export const RoomStateControl: React.FC<RoomStateControlProps> = ({ roomId, state }) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const [saving, setSaving] = React.useState(false);

  const label = HOTEL_ROOM_STATE_LABELS[state as HotelRoomState] ?? state;
  const color = hotelRoomStateColor(state, theme);
  const dark = theme.palette.mode === "dark";

  const choose = async (next: HotelRoomState) => {
    setAnchor(null);
    if (next === state) return;
    setSaving(true);
    try {
      await setRoomHousekeeping(roomId, next);
      // Состояние видно в шахматке (точка у номера), в карточках над ней и в списке
      // задач уборки — перечитываем всё это. Ждём только лёгкие запросы самого
      // номера, чтобы чип не показывал старое состояние; шахматка перечитывается
      // в фоне (это несколько кусков по 60 дней).
      void queryClient.invalidateQueries({ queryKey: ["hotel", "calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "housekeepingTasks"] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["hotel", "room-availability"] }),
        queryClient.invalidateQueries({ queryKey: ["hotel", "rooms"] }),
      ]);
    } catch (err) {
      // Тост приложения (как в остальных формах); текст бэка показываем как есть.
      enqueueSnackbar(getErrorMessage(err, "Не удалось изменить состояние номера"), { variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const open = (e: React.MouseEvent<HTMLElement>) => setAnchor(e.currentTarget);

  return (
    <>
      <Chip
        // Цвет состояния — цветная точка, а текст text.primary: цвет состояния как цвет
        // текста давал 2.7–4.3:1 в светлой теме («Ремонт» хуже всех), так ≥ 13:1.
        label={
          <Stack component="span" direction="row" alignItems="center" gap={0.75}>
            <Box component="span" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />
            {label}
          </Stack>
        }
        size="small"
        onClick={open}
        onDelete={open}
        deleteIcon={saving ? <CircularProgress size={14} color="inherit" /> : <ArrowDropDownOutlined />}
        disabled={saving}
        aria-haspopup="menu"
        aria-label={`Состояние номера: ${label}. Изменить`}
        title="Изменить состояние номера"
        sx={{
          bgcolor: alpha(color, dark ? 0.25 : 0.14),
          color: "text.primary",
          fontWeight: 600,
          "& .MuiChip-deleteIcon": { color: "inherit", opacity: 0.8 },
          "&:hover, &:focus": { bgcolor: alpha(color, dark ? 0.35 : 0.22) },
        }}
      />
      <Menu anchorEl={anchor} open={anchor != null} onClose={() => setAnchor(null)}>
        {HOTEL_ROOM_STATES.map((s) => (
          <MenuItem key={s} selected={s === state} onClick={() => void choose(s)} sx={{ gap: 1.25, minWidth: 160 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: hotelRoomStateColor(s, theme), flexShrink: 0 }} />
            <Typography variant="body2">{HOTEL_ROOM_STATE_LABELS[s]}</Typography>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default RoomStateControl;
