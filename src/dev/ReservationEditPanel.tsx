/**
 * Правка брони и смена номера — панели внутри карточки брони
 * (ReservationDetailsDialog). Раньше бронь нельзя было изменить вовсе: гость
 * переносил заезд на день — и её приходилось отменять и создавать заново.
 *
 *   • mode "edit" — даты, число гостей, питание: PATCH
 *     /reservations/{id}/items/{itemId}/. Заселённому гостю дату заезда бэк
 *     менять не даёт, позицию с выездом — совсем. Цена: новые ночи считаются
 *     по текущей цене, старые остаются как проданы; «Пересчитать всю бронь» —
 *     reprice.
 *   • mode "room" — другой номер. До заезда это назначение номера той же
 *     категории (assign-room), у заселённого гостя — переселение с причиной
 *     (move-room): старый номер освобождается сегодня, неубранный номер бэк
 *     не примет.
 *
 * Свободные номера — GET …/items/{itemId}/free-rooms/. Пересечение дат бэк
 * проверяет сам (409 NO_AVAILABILITY); если овербукинг разрешён — предлагаем
 * сохранить с ним, как в форме новой брони.
 */
import React from "react";
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, MenuItem, Stack, Typography } from "@mui/material";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import RestaurantOutlined from "@mui/icons-material/RestaurantOutlined";
import SwapHorizOutlined from "@mui/icons-material/SwapHorizOutlined";
import dayjs, { type Dayjs } from "dayjs";
import { useQuery } from "@tanstack/react-query";

import { CustomDatePicker } from "../components/ui";
import {
  assignRoom,
  getItemFreeRooms,
  isOverbookingConfirmable,
  listRoomTypes,
  moveRoom,
  updateReservationItem,
  type HotelCatalogs,
  type HotelReservationDetail,
} from "../api/hotel";
import { getErrorMessage } from "../api/client";
import { subtleBg } from "../theme/uiHelpers";
import { HOTEL_BOARD_TYPE_LABELS, HOTEL_ROOM_STATE_LABELS, hotelRoomStateColor, type HotelRoomState } from "./hotelDisplay";
import { CountStepper, plural } from "./hotelUi";
import { FormField } from "./formField";

type ReservationItem = HotelReservationDetail["items"][number];

export interface ReservationEditPanelProps {
  mode: "edit" | "room";
  reservation: HotelReservationDetail;
  item: ReservationItem;
  catalogs: HotelCatalogs | undefined;
  /** Сохранено — карточка перечитывает бронь и закрывает панель. */
  onSaved: (message: string) => void;
  onCancel: () => void;
}

const panelSx = (theme: Theme) => ({ p: 2, borderRadius: "12px", bgcolor: subtleBg(theme, true) });

export const ReservationEditPanel: React.FC<ReservationEditPanelProps> = (props) =>
  props.mode === "edit" ? <EditStayPanel {...props} /> : <ChangeRoomPanel {...props} />;

// ── Даты, гости, питание ────────────────────────────────────────────────────

const EditStayPanel: React.FC<ReservationEditPanelProps> = ({ reservation, item, catalogs, onSaved, onCancel }) => {
  const theme = useTheme();
  const checkedIn = item.stayStatus === "checked_in";
  const [checkIn, setCheckIn] = React.useState<Dayjs | null>(dayjs(item.checkIn));
  const [checkOut, setCheckOut] = React.useState<Dayjs | null>(dayjs(item.checkOut));
  const [adults, setAdults] = React.useState(item.adults);
  const [children, setChildren] = React.useState(item.children);
  const [boardType, setBoardType] = React.useState(item.boardType || "none");
  const [reprice, setReprice] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [canOverbook, setCanOverbook] = React.useState(false);

  // Лимит гостей — вместимость категории, как в форме новой брони.
  const roomTypesQuery = useQuery({
    queryKey: ["hotel", "roomTypes", reservation.propertyId],
    queryFn: ({ signal }) => listRoomTypes(reservation.propertyId, {}, signal),
  });
  const roomType = roomTypesQuery.data?.find((rt) => rt.id === item.roomTypeId);
  // То же правило, что проверяет бэк и форма новой брони: взрослых не больше
  // adultsCapacity, всего гостей не больше capacity. Дети могут занять
  // свободные взрослые места (в «2+0» допустимо 1 взрослый + 1 ребёнок).
  const maxAdults = roomType?.adultsCapacity ?? 20;
  const capacity = roomType?.capacity ?? 40;
  const maxChildren = Math.max(0, capacity - adults);
  // Взрослых стало больше — детей не оставляем выше нового предела.
  const changeAdults = (next: number) => {
    setAdults(next);
    setChildren((cur) => Math.min(cur, Math.max(0, capacity - next)));
  };

  const datesError =
    !checkIn || !checkOut ? "Укажите даты" : !checkOut.isAfter(checkIn, "day") ? "Выезд должен быть позже заезда" : null;
  const nights = checkIn && checkOut && !datesError ? checkOut.startOf("day").diff(checkIn.startOf("day"), "day") : 0;
  const nightsDelta = nights - item.nightsCount;
  const guestsError =
    adults > maxAdults
      ? `В этой категории не больше ${maxAdults} ${plural(maxAdults, "взрослого", "взрослых", "взрослых")}`
      : adults + children > capacity
        ? `Всего не больше ${capacity} ${plural(capacity, "гостя", "гостей", "гостей")}`
        : null;

  const changed =
    checkIn?.format("YYYY-MM-DD") !== item.checkIn ||
    checkOut?.format("YYYY-MM-DD") !== item.checkOut ||
    adults !== item.adults ||
    children !== item.children ||
    boardType !== (item.boardType || "none") ||
    reprice;

  const save = async (allowOverbooking = false) => {
    if (datesError || guestsError || !checkIn || !checkOut) return;
    setSaving(true);
    setError(null);
    try {
      await updateReservationItem(reservation.id, item.id, {
        version: reservation.version,
        checkIn: checkIn.format("YYYY-MM-DD"),
        checkOut: checkOut.format("YYYY-MM-DD"),
        adults,
        children,
        boardType,
        reprice: reprice || undefined,
        allowOverbooking: allowOverbooking || undefined,
      });
      onSaved("Бронь изменена");
    } catch (err) {
      setCanOverbook(isOverbookingConfirmable(err));
      setError(getErrorMessage(err, "Не удалось изменить бронь"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap={2} sx={panelSx(theme)}>
      <Stack direction={{ xs: "column", sm: "row" }} gap={2}>
        <CustomDatePicker
          label="Заезд"
          value={checkIn}
          onChange={setCheckIn}
          disabled={checkedIn || saving}
          sx={{ flex: 1 }}
          slotProps={{ textField: { helperText: checkedIn ? "Гость уже заселён — заезд не меняется" : undefined } }}
        />
        <CustomDatePicker
          label="Выезд"
          value={checkOut}
          onChange={setCheckOut}
          minDate={checkIn?.add(1, "day")}
          disabled={saving}
          sx={{ flex: 1 }}
        />
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}>
        <CountStepper label="Взрослых" hint={`до ${maxAdults}`} value={adults} min={1} max={maxAdults} onChange={changeAdults} disabled={saving} />
        <CountStepper label="Детей" hint={`всего до ${capacity}`} value={children} min={0} max={maxChildren} onChange={setChildren} disabled={saving} />
      </Stack>
      <FormField select icon={<RestaurantOutlined />} label="Питание" value={boardType} onValueChange={setBoardType} disabled={saving} fullWidth>
        {(catalogs?.boardTypes ?? [{ value: boardType, label: HOTEL_BOARD_TYPE_LABELS[boardType] ?? boardType }]).map((c) => (
          <MenuItem key={c.value} value={c.value}>
            {c.label}
          </MenuItem>
        ))}
      </FormField>

      <Box>
        <FormControlLabel
          control={<Checkbox size="small" checked={reprice} onChange={(e) => setReprice(e.target.checked)} disabled={saving} />}
          label={<Typography variant="body2">Пересчитать всю бронь по текущим ценам</Typography>}
        />
        <Typography variant="caption" color="text.secondary" component="div" sx={{ pl: 3.75 }}>
          Без галочки новые ночи считаются по сегодняшней цене, а уже проданные остаются по цене продажи.
        </Typography>
      </Box>

      {(datesError || guestsError) && <Alert severity="warning">{datesError ?? guestsError}</Alert>}
      {error && (
        <Alert
          severity="error"
          action={
            canOverbook ? (
              <Button size="small" color="inherit" disabled={saving} onClick={() => void save(true)}>
                Сохранить с овербукингом
              </Button>
            ) : undefined
          }
        >
          {error}
        </Alert>
      )}

      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
        <Typography variant="body2" color="text.secondary">
          {nights > 0 ? `${nights} ${plural(nights, "ночь", "ночи", "ночей")}` : "—"}
          {nights > 0 && nightsDelta !== 0 ? ` · ${nightsDelta > 0 ? "+" : "−"}${Math.abs(nightsDelta)} к прежнему сроку` : ""}
        </Typography>
        <Stack direction="row" gap={1}>
          <Button size="small" onClick={onCancel} disabled={saving}>
            Не менять
          </Button>
          <Button
            size="small"
            variant="contained"
            disableElevation
            disabled={saving || !changed || datesError != null || guestsError != null}
            onClick={() => void save()}
          >
            {saving ? "Сохраняем…" : "Сохранить изменения"}
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );
};

// ── Другой номер ────────────────────────────────────────────────────────────

const ChangeRoomPanel: React.FC<ReservationEditPanelProps> = ({ reservation, item, onSaved, onCancel }) => {
  const theme = useTheme();
  // Заселённого гостя бэк «переселяет» (move-room, с причиной и только в убранный
  // номер), ожидаемому — просто назначает другой номер той же категории.
  const isMove = item.stayStatus === "checked_in";
  const [roomId, setRoomId] = React.useState<number | null>(null);
  const [reason, setReason] = React.useState("");
  const [showErrors, setShowErrors] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const freeRoomsQuery = useQuery({
    queryKey: ["hotel", "reservation", reservation.id, "item", item.id, "free-rooms"],
    queryFn: ({ signal }) => getItemFreeRooms(reservation.id, item.id, signal),
    placeholderData: undefined,
    staleTime: 0,
  });
  const rooms = (freeRoomsQuery.data ?? []).filter((r) => r.id !== item.roomId);
  const selected = rooms.find((r) => r.id === roomId) ?? null;
  const notReady = (state: string) => state === "dirty" || state === "repair";

  const save = async () => {
    if (roomId == null) return;
    if (isMove && !reason.trim()) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isMove) await moveRoom(reservation.id, item.id, { roomId, reason: reason.trim(), version: reservation.version });
      else await assignRoom(reservation.id, item.id, { roomId, version: reservation.version });
      onSaved(isMove ? `Гость переселён в номер ${selected?.number ?? ""}` : `Назначен номер ${selected?.number ?? ""}`);
    } catch (err) {
      setError(getErrorMessage(err, isMove ? "Не удалось переселить" : "Не удалось сменить номер"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap={2} sx={panelSx(theme)}>
      <Typography variant="body2" color="text.secondary">
        {isMove
          ? `Гость сейчас в номере ${item.roomNumber ?? "—"}. После переселения старый номер освободится с сегодняшнего дня.`
          : `Сейчас назначен номер ${item.roomNumber ?? "—"}. Свободные номера той же категории на даты брони:`}
      </Typography>

      {freeRoomsQuery.isPending ? (
        <Stack direction="row" alignItems="center" gap={1.5}>
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">
            Ищем свободные номера…
          </Typography>
        </Stack>
      ) : freeRoomsQuery.isError ? (
        <Alert severity="error">{getErrorMessage(freeRoomsQuery.error, "Не удалось загрузить свободные номера")}</Alert>
      ) : rooms.length === 0 ? (
        <Alert severity="info">Свободных номеров этой категории на даты брони нет.</Alert>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: 1 }}>
          {rooms.map((r) => {
            const active = r.id === roomId;
            const blocked = isMove && notReady(r.housekeepingState);
            const color = hotelRoomStateColor(r.housekeepingState, theme);
            return (
              <Box
                key={r.id}
                component="button"
                type="button"
                disabled={blocked || saving}
                onClick={() => setRoomId(r.id)}
                aria-pressed={active}
                title={blocked ? "Номер не убран — переселить в него нельзя" : undefined}
                sx={{
                  px: 1.25,
                  py: 1,
                  borderRadius: "10px",
                  border: `1.5px solid ${active ? theme.palette.primary.main : alpha(theme.palette.text.primary, 0.14)}`,
                  bgcolor: active ? alpha(theme.palette.primary.main, 0.08) : "background.paper",
                  color: "text.primary",
                  font: "inherit",
                  textAlign: "left",
                  cursor: blocked ? "not-allowed" : "pointer",
                  opacity: blocked ? 0.5 : 1,
                  "&:hover": blocked ? undefined : { borderColor: theme.palette.primary.main },
                }}
              >
                <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>{r.number}</Typography>
                <Stack direction="row" alignItems="center" gap={0.6} sx={{ mt: 0.25 }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {HOTEL_ROOM_STATE_LABELS[r.housekeepingState as HotelRoomState] ?? r.housekeepingState}
                    {r.floor ? ` · ${r.floor} эт.` : ""}
                  </Typography>
                </Stack>
              </Box>
            );
          })}
        </Box>
      )}

      {isMove && rooms.length > 0 && (
        <FormField
          icon={<SwapHorizOutlined />}
          label="Причина переселения"
          placeholder="Например, течёт кран"
          value={reason}
          onValueChange={setReason}
          rules={{ required: true, maxLength: 300 }}
          showErrors={showErrors}
          size="small"
          disabled={saving}
          fullWidth
        />
      )}

      {error && <Alert severity="error">{error}</Alert>}

      <Stack direction="row" gap={1} justifyContent="flex-end">
        <Button size="small" onClick={onCancel} disabled={saving}>
          Оставить как есть
        </Button>
        <Button size="small" variant="contained" disableElevation disabled={saving || roomId == null} onClick={() => void save()}>
          {saving ? "Сохраняем…" : isMove ? "Переселить" : "Назначить номер"}
        </Button>
      </Stack>
    </Stack>
  );
};

export default ReservationEditPanel;
