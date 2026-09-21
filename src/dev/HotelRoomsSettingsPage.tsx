/**
 * «Настройки» → «Номера» для Viva — вкладка рельса SettingsLayout.tsx,
 * видна только vertical==="hotel" (useVisibleSettingsTabs), маршрут
 * /settings/rooms гейтит hotel.manage (см. App.tsx, accessPermissions.ts).
 * Реальный бэкенд (src/api/hotel.ts): номера — GET/POST/PATCH/DELETE
 * /hotel/rooms/, категории — только чтение GET /hotel/room-types/ (см.
 * hotel-viva-frontend-api.md §4.2, §6).
 *
 * Здесь только сами номера. Категории (тарифы) — тип номера с ценой за ночь и
 * характеристиками — заводятся и правятся на своей странице «Категории и
 * тарифы» (HotelRoomCategoriesSettingsPage.tsx, /settings/room-categories);
 * тут они показаны справочно, как группы, в которые входят номера.
 *
 * Номера сгруппированы по категориям, как в RoomBookingGrid и
 * RoomDetailsDialog. «Добавить номер» создаёт номер в выбранной категории;
 * шахматка и форма создания брони подхватывают его сразу же (react-query
 * invalidate), без reload.
 *
 * «Питание» при добавлении номера — HotelRoom.mealOptions, ключи из
 * catalogs.mealOptions (какое питание доступно физически в этом номере) —
 * отдельно от boardType брони (что выбрано на конкретный заезд, см.
 * CreateBookingButton).
 *
 * Способов оплаты здесь нет: их справочник ведётся в «Настройки → Способы
 * безнала» (/settings/cashless-methods), а не отдельным списком объекта.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import HotelOutlined from "@mui/icons-material/HotelOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router";

import { usePageTitle } from "../hooks/usePageTitle";
import { SettingsLayout } from "../pages/settings/SettingsLayout";
import { useHotelProperty } from "./useHotelProperty";
import { getHotelCatalogs, listRoomTypes, listRooms, createRoom, updateRoom, deleteRoom, type HotelRoom } from "../api/hotel";
import { ApiError, getErrorMessage } from "../api/client";

export const HotelRoomsSettingsPage: React.FC = () => {
  usePageTitle("Номера");
  const { property } = useHotelProperty();
  const queryClient = useQueryClient();

  const catalogsQuery = useQuery({
    queryKey: ["hotel", "catalogs", property?.id],
    queryFn: ({ signal }) => getHotelCatalogs(property!.id, signal),
    enabled: property != null,
  });
  const mealOptionChoices = catalogsQuery.data?.mealOptions ?? [];

  const roomTypesQuery = useQuery({
    queryKey: ["hotel", "roomTypes", property?.id],
    queryFn: ({ signal }) => listRoomTypes(property!.id, {}, signal),
    enabled: property != null,
  });
  const roomTypes = roomTypesQuery.data ?? [];

  const roomsQuery = useQuery({
    queryKey: ["hotel", "rooms", property?.id],
    queryFn: ({ signal }) => listRooms({ propertyId: property!.id }, signal),
    enabled: property != null,
  });
  const roomsByType = React.useMemo(() => {
    const map = new Map<number, HotelRoom[]>();
    for (const r of roomsQuery.data ?? []) {
      const arr = map.get(r.roomTypeId) ?? [];
      arr.push(r);
      map.set(r.roomTypeId, arr);
    }
    return map;
  }, [roomsQuery.data]);

  const invalidateRoomTypes = () => void queryClient.invalidateQueries({ queryKey: ["hotel", "roomTypes", property?.id] });
  const invalidateRooms = () => void queryClient.invalidateQueries({ queryKey: ["hotel", "rooms", property?.id] });

  const [addOpen, setAddOpen] = React.useState(false);
  const [roomTypeId, setRoomTypeId] = React.useState<number | "">("");
  const [roomNumber, setRoomNumber] = React.useState("");
  const [meals, setMeals] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Редактирование уже созданного номера — категорию/номер/питание можно
  // поправить без удаления и создания заново.
  const [editRoom, setEditRoom] = React.useState<HotelRoom | null>(null);
  const [editRoomTypeId, setEditRoomTypeId] = React.useState<number | "">("");
  const [editRoomNumber, setEditRoomNumber] = React.useState("");
  const [editMeals, setEditMeals] = React.useState<string[]>([]);
  const [editSaving, setEditSaving] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);

  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const openAdd = () => {
    setRoomTypeId(roomTypes[0]?.id ?? "");
    setRoomNumber("");
    setMeals([]);
    setError(null);
    setAddOpen(true);
  };

  const submitAdd = async () => {
    const trimmed = roomNumber.trim();
    if (!trimmed) {
      setError("Введите номер комнаты");
      return;
    }
    if (!property || roomTypeId === "") return;
    setSaving(true);
    setError(null);
    try {
      await createRoom({ propertyId: property.id, roomTypeId, number: trimmed, mealOptions: meals });
      invalidateRooms();
      invalidateRoomTypes();
      setAddOpen(false);
    } catch (err) {
      setError(getErrorMessage(err, "Не удалось добавить номер"));
    } finally {
      setSaving(false);
    }
  };

  const openEditRoom = (room: HotelRoom) => {
    setEditRoom(room);
    setEditRoomTypeId(room.roomTypeId);
    setEditRoomNumber(room.number);
    setEditMeals(room.mealOptions);
    setEditError(null);
  };

  const submitEditRoom = async () => {
    if (!editRoom) return;
    const trimmed = editRoomNumber.trim();
    if (!trimmed) {
      setEditError("Введите номер комнаты");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await updateRoom(editRoom.id, { roomTypeId: editRoomTypeId || undefined, number: trimmed, mealOptions: editMeals });
      invalidateRooms();
      invalidateRoomTypes();
      setEditRoom(null);
    } catch (err) {
      setEditError(getErrorMessage(err, "Не удалось сохранить номер"));
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteRoom = async (room: HotelRoom) => {
    setDeleteError(null);
    try {
      await deleteRoom(room.id);
      invalidateRooms();
      invalidateRoomTypes();
    } catch (err) {
      if (err instanceof ApiError && err.code === "HAS_DEPENDENTS") {
        // Номер уже фигурирует в бронях — удалить нельзя, снимаем с продажи вместо этого.
        try {
          await updateRoom(room.id, { status: "out_of_service" });
          invalidateRooms();
        } catch (err2) {
          setDeleteError(getErrorMessage(err2, "Не удалось изменить статус номера"));
        }
      } else {
        setDeleteError(getErrorMessage(err, "Не удалось удалить номер"));
      }
    }
  };

  const loading = catalogsQuery.isLoading || roomTypesQuery.isLoading || roomsQuery.isLoading;

  return (
    <SettingsLayout>
      <Stack spacing={2} sx={{ height: "100%" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Stack direction="row" alignItems="center" gap={1}>
          <HotelOutlined color="action" />
          <Typography variant="h6" fontWeight={600}>
            Номера
          </Typography>
        </Stack>
        <Stack direction="row" gap={1}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<CategoryOutlined />}
            component={RouterLink}
            to="/settings/room-categories"
          >
            Категории и тарифы
          </Button>
          <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={openAdd} disabled={!property || roomTypes.length === 0}>
            Добавить номер
          </Button>
        </Stack>
      </Stack>

      <Alert severity="info" variant="outlined" sx={{ fontSize: "0.8rem" }}>
        Номера Viva, сгруппированные по категориям. Новый номер сразу появляется в шахматке броней и в
        списке выбора при создании брони; нажмите на номер, чтобы изменить его категорию, код или
        питание; ✕ на чипе — удаляет номер (если он уже фигурирует в бронях — просто снимается с
        продажи). Сами категории, их цены и характеристики — в разделе «Категории и тарифы».
      </Alert>

      {deleteError && (
        <Alert severity="error" variant="outlined" sx={{ fontSize: "0.8rem" }} onClose={() => setDeleteError(null)}>
          {deleteError}
        </Alert>
      )}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : !property ? (
        <Alert severity="warning" variant="outlined">
          Не найден объект размещения для текущего филиала.
        </Alert>
      ) : (
        <Stack gap={2} sx={{ maxWidth: 640 }}>
          {roomTypes.length === 0 && (
            <Typography variant="body2" color="text.disabled">
              Категорий пока нет — сначала заведите их в разделе «Категории и тарифы», затем добавляйте номера.
            </Typography>
          )}
          {roomTypes.map((cat) => {
            const rooms = roomsByType.get(cat.id) ?? [];
            const totalPrice = Number(cat.totalPrice);
            return (
              <Paper key={cat.id} elevation={0} variant="outlined" sx={{ p: 1.75 }}>
                <Stack direction="row" alignItems="baseline" gap={1} flexWrap="wrap" sx={{ mb: 1 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {cat.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {totalPrice.toLocaleString("ru-RU")} сом/ночь · до {cat.capacity} гостей
                  </Typography>
                </Stack>
                <Stack direction="row" flexWrap="wrap" gap={0.75}>
                  {rooms.length === 0 && (
                    <Typography variant="caption" color="text.disabled">
                      Номеров пока нет
                    </Typography>
                  )}
                  {rooms.map((room) => {
                    const chip = (
                      <Chip
                        key={room.id}
                        label={room.number}
                        size="small"
                        onClick={() => openEditRoom(room)}
                        onDelete={() => void handleDeleteRoom(room)}
                        sx={room.status === "out_of_service" ? { opacity: 0.5, textDecoration: "line-through" } : undefined}
                      />
                    );
                    const mealLabels = room.mealOptions.map((mo) => mealOptionChoices.find((c) => c.value === mo)?.label ?? mo);
                    const tooltipTitle =
                      (room.status === "out_of_service" ? "Снят с продажи · " : "") +
                      (mealLabels.length === 0 ? "Нажмите, чтобы изменить" : `Питание: ${mealLabels.join(", ")} · нажмите, чтобы изменить`);
                    return (
                      <Tooltip key={room.id} title={tooltipTitle}>
                        {chip}
                      </Tooltip>
                    );
                  })}
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Новый номер</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 0.5 }}>
            <TextField
              select
              label="Категория"
              value={roomTypeId}
              onChange={(e) => setRoomTypeId(Number(e.target.value))}
              disabled={saving}
              fullWidth
            >
              {roomTypes.map((cat) => (
                <MenuItem key={cat.id} value={cat.id}>
                  {cat.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Номер"
              placeholder="Например, 205"
              value={roomNumber}
              onChange={(e) => {
                setRoomNumber(e.target.value);
                setError(null);
              }}
              autoFocus
              disabled={saving}
              fullWidth
            />
            <TextField
              select
              label="Питание"
              value={meals}
              onChange={(e) => {
                const v = e.target.value;
                setMeals(typeof v === "string" ? v.split(",") : v);
              }}
              disabled={saving}
              SelectProps={{
                multiple: true,
                renderValue: (selected) => (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {(selected as string[]).map((key) => (
                      <Chip key={key} label={mealOptionChoices.find((c) => c.value === key)?.label ?? key} size="small" sx={{ height: 20, borderRadius: "6px" }} />
                    ))}
                  </Box>
                ),
              }}
              helperText="Необязательно — какое питание доступно в этом номере"
              fullWidth
            >
              {mealOptionChoices.map((c) => (
                <MenuItem key={c.value} value={c.value}>
                  {c.label}
                </MenuItem>
              ))}
            </TextField>
            {error && (
              <Alert severity="warning" variant="outlined" sx={{ fontSize: "0.8rem" }}>
                {error}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddOpen(false)} disabled={saving}>
            Отмена
          </Button>
          <Button variant="contained" disabled={!roomNumber.trim() || saving} onClick={() => void submitAdd()}>
            {saving ? "Добавляем…" : "Добавить"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editRoom != null} onClose={() => setEditRoom(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Номер {editRoom?.number}</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 0.5 }}>
            <TextField
              select
              label="Категория"
              value={editRoomTypeId}
              onChange={(e) => setEditRoomTypeId(Number(e.target.value))}
              disabled={editSaving}
              fullWidth
            >
              {roomTypes.map((cat) => (
                <MenuItem key={cat.id} value={cat.id}>
                  {cat.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Номер"
              value={editRoomNumber}
              onChange={(e) => {
                setEditRoomNumber(e.target.value);
                setEditError(null);
              }}
              autoFocus
              disabled={editSaving}
              fullWidth
            />
            <TextField
              select
              label="Питание"
              value={editMeals}
              onChange={(e) => {
                const v = e.target.value;
                setEditMeals(typeof v === "string" ? v.split(",") : v);
              }}
              disabled={editSaving}
              SelectProps={{
                multiple: true,
                renderValue: (selected) => (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {(selected as string[]).map((key) => (
                      <Chip key={key} label={mealOptionChoices.find((c) => c.value === key)?.label ?? key} size="small" sx={{ height: 20, borderRadius: "6px" }} />
                    ))}
                  </Box>
                ),
              }}
              helperText="Необязательно — какое питание доступно в этом номере"
              fullWidth
            >
              {mealOptionChoices.map((c) => (
                <MenuItem key={c.value} value={c.value}>
                  {c.label}
                </MenuItem>
              ))}
            </TextField>
            {editError && (
              <Alert severity="warning" variant="outlined" sx={{ fontSize: "0.8rem" }}>
                {editError}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditRoom(null)} disabled={editSaving}>
            Отмена
          </Button>
          <Button variant="contained" disabled={!editRoomNumber.trim() || editSaving} onClick={() => void submitEditRoom()}>
            {editSaving ? "Сохраняем…" : "Сохранить"}
          </Button>
        </DialogActions>
      </Dialog>
      </Stack>
    </SettingsLayout>
  );
};

export default HotelRoomsSettingsPage;
