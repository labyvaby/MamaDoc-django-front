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
 *
 * «Ремонт» спрашивает срок (просьба заказчика: был только бессрочным): «без
 * срока» или день возврата в продажу — номер вернётся сам, сервер проверяет раз
 * в 5 минут. Брони после этого дня ремонту не мешают. Срок можно поменять.
 */
import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Menu,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from "@mui/material";
import dayjs, { type Dayjs } from "dayjs";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowDropDownOutlined from "@mui/icons-material/ArrowDropDownOutlined";
import { useSnackbar } from "notistack";

import { setRoomHousekeeping } from "../api/hotel";
import { getErrorMessage } from "../api/client";
import { CustomDatePicker } from "../components/ui";
import { HOTEL_ROOM_STATES, HOTEL_ROOM_STATE_LABELS, hotelRoomStateColor, type HotelRoomState } from "./hotelDisplay";

export interface RoomStateControlProps {
  roomId: number;
  /** Текущее состояние (HotelRoom.state). */
  state: string;
  /** Ремонт со сроком: первый день снова в продаже (HotelRoom.returnsOn). */
  returnsOn?: string | null;
}

export const RoomStateControl: React.FC<RoomStateControlProps> = ({ roomId, state, returnsOn }) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const [saving, setSaving] = React.useState(false);
  // Диалог срока ремонта: dated — до даты, иначе без срока.
  const [repairOpen, setRepairOpen] = React.useState(false);
  const [dated, setDated] = React.useState(false);
  const [back, setBack] = React.useState<Dayjs | null>(null);

  const repairUntil = state === "repair" && returnsOn ? dayjs(returnsOn) : null;
  const label =
    repairUntil != null ? `Ремонт · в продаже с ${repairUntil.format("D MMM")}` : (HOTEL_ROOM_STATE_LABELS[state as HotelRoomState] ?? state);
  const color = hotelRoomStateColor(state, theme);
  const dark = theme.palette.mode === "dark";

  const openRepair = () => {
    setAnchor(null);
    setDated(repairUntil != null);
    setBack(repairUntil ?? dayjs().add(7, "day"));
    setRepairOpen(true);
  };

  const choose = async (next: HotelRoomState, returnsOnDate?: string) => {
    setAnchor(null);
    if (next === "repair" && returnsOnDate === undefined && !repairOpen) {
      openRepair();
      return;
    }
    if (next === state && next !== "repair") return;
    setSaving(true);
    try {
      await setRoomHousekeeping(roomId, next, returnsOnDate || undefined);
      setRepairOpen(false);
      // Открытые задачи уборки по убранному номеру здесь не закрываем: это
      // делает бэкенд одной транзакцией (статус «Отменена»), а не фронт пачкой
      // PATCH-запросов. Список задач перечитываем ниже — он покажет результат.
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
        {state === "repair" && <Divider />}
        {state === "repair" && (
          <MenuItem onClick={openRepair} sx={{ minWidth: 160 }}>
            <Typography variant="body2">{repairUntil ? "Изменить срок ремонта…" : "Указать срок ремонта…"}</Typography>
          </MenuItem>
        )}
      </Menu>
      <Dialog open={repairOpen} onClose={() => (saving ? null : setRepairOpen(false))} maxWidth="xs" fullWidth>
        <DialogTitle>{state === "repair" ? "Срок ремонта" : "Номер в ремонт"}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Номер снимется с продажи в шахматке и на сайте. Если на время ремонта есть брони, их сначала надо перенести.
          </Typography>
          <RadioGroup value={dated ? "dated" : "open"} onChange={(e) => setDated(e.target.value === "dated")}>
            <FormControlLabel value="dated" control={<Radio size="small" />} label="До даты — вернётся в продажу сам" />
            {dated && (
              <Box sx={{ pl: 3.75, pb: 1 }}>
                <CustomDatePicker
                  label="В продаже с"
                  value={back}
                  onChange={(v) => setBack(v)}
                  minDate={dayjs().add(1, "day")}
                  shortYearMode="future"
                  slotProps={{ textField: { size: "small", fullWidth: true, helperText: back ? `последний день ремонта — ${back.subtract(1, "day").format("D MMMM")}` : " " } }}
                />
              </Box>
            )}
            <FormControlLabel value="open" control={<Radio size="small" />} label="Без срока — вернуть в продажу вручную" />
          </RadioGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRepairOpen(false)} disabled={saving}>
            Отмена
          </Button>
          <Button
            variant="contained"
            disableElevation
            disabled={saving || (dated && (!back || !back.isValid() || !back.isAfter(dayjs(), "day")))}
            onClick={() => void choose("repair", dated && back ? back.format("YYYY-MM-DD") : "")}
          >
            {saving ? "Сохраняем…" : state === "repair" ? "Сохранить срок" : "Поставить в ремонт"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default RoomStateControl;
