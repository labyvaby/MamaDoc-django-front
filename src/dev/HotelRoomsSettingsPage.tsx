/**
 * «Настройки» → «Номера» для Viva — вкладка рельса SettingsLayout.tsx,
 * видна только vertical==="hotel" (useVisibleSettingsTabs), маршрут
 * /settings/rooms гейтит hotel.manage (см. App.tsx, accessPermissions.ts).
 * Реальный бэкенд (src/api/hotel.ts): категории — GET/POST/PATCH
 * /hotel/room-types/, номера — GET/POST/PATCH/DELETE /hotel/rooms/,
 * характеристики — GET/POST/PATCH /hotel/catalogs/amenities/ (см.
 * hotel-viva-frontend-api.md §4.2, §6). totalPrice считает бэкенд (basePrice
 * + Σ extraPrice отмеченных характеристик) — фронт больше не пересчитывает.
 *
 * Номера сгруппированы по категориям (тарифам), как в RoomBookingGrid и
 * RoomDetailsDialog. «Добавить номер» создаёт номер в выбранной категории;
 * шахматка и форма создания брони подхватывают его сразу же (react-query
 * invalidate), без reload.
 *
 * Характеристики категории — чекбоксы по группам из справочника ОБЪЕКТА
 * (catalogs.amenities, не платформы, см. hotel-viva-frontend-api.md §3) —
 * тот же принцип, что роль собирает права из общего RBAC-каталога в реальной
 * RolesSettingsPage.tsx. Справочник не фиксирован: прямо в форме категории
 * можно завести новую характеристику со своей наценкой (createAmenity) — она
 * появится у всех категорий объекта; наценка уже существующей правится там
 * же (updateAmenity, коммитится по onBlur, не на каждый символ — это
 * настоящий PATCH, не localStorage-запись).
 *
 * «Питание» при добавлении номера — HotelRoom.mealOptions, ключи из
 * catalogs.mealOptions (какое питание доступно физически в этом номере) —
 * отдельно от boardType брони (что выбрано на конкретный заезд, см.
 * CreateBookingButton).
 */
import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import HotelOutlined from "@mui/icons-material/HotelOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { usePageTitle } from "../hooks/usePageTitle";
import { SettingsLayout } from "../pages/settings/SettingsLayout";
import { useHotelProperty } from "./useHotelProperty";
import {
  getHotelCatalogs,
  listRoomTypes,
  createRoomType,
  updateRoomType,
  listRooms,
  createRoom,
  updateRoom,
  deleteRoom,
  createAmenity,
  updateAmenity,
  type HotelAmenity,
  type HotelRoom,
  type HotelRoomType,
} from "../api/hotel";
import { ApiError, getErrorMessage } from "../api/client";

interface CategoryEditState {
  /** null — создание новой категории, иначе id правящейся. */
  id: number | null;
  name: string;
  price: string;
  adultsCapacity: string;
  childrenCapacity: string;
  view: string;
  bedType: string;
  roomLayout: string;
  description: string;
  amenities: Set<string>;
  luxury: boolean;
}

export const HotelRoomsSettingsPage: React.FC = () => {
  usePageTitle("Номера");
  const { property } = useHotelProperty();
  const queryClient = useQueryClient();

  const catalogsQuery = useQuery({
    queryKey: ["hotel", "catalogs", property?.id],
    queryFn: ({ signal }) => getHotelCatalogs(property!.id, signal),
    enabled: property != null,
  });
  const amenitiesCatalog = catalogsQuery.data?.amenities ?? [];
  const amenityGroups = [...new Set(amenitiesCatalog.map((a) => a.group).filter(Boolean))];
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
  const invalidateCatalogs = () => void queryClient.invalidateQueries({ queryKey: ["hotel", "catalogs", property?.id] });

  const [addOpen, setAddOpen] = React.useState(false);
  const [roomTypeId, setRoomTypeId] = React.useState<number | "">("");
  const [roomNumber, setRoomNumber] = React.useState("");
  const [tariffs, setTariffs] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Редактирование уже созданного номера — категорию/номер/питание можно
  // поправить без удаления и создания заново.
  const [editRoom, setEditRoom] = React.useState<HotelRoom | null>(null);
  const [editRoomTypeId, setEditRoomTypeId] = React.useState<number | "">("");
  const [editRoomNumber, setEditRoomNumber] = React.useState("");
  const [editTariffs, setEditTariffs] = React.useState<string[]>([]);
  const [editSaving, setEditSaving] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);

  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  // Категория (тариф) — можно завести свой или поправить уже созданный
  // (цену/вместимость/характеристики), как роль собирает права в реальной
  // RolesSettingsPage.tsx — тот же принцип «название + отмеченные пункты
  // справочника» для catEdit.amenities.
  const [catEdit, setCatEdit] = React.useState<CategoryEditState | null>(null);
  const [catSaving, setCatSaving] = React.useState(false);
  const [catError, setCatError] = React.useState<string | null>(null);

  // Новая характеристика — заводится прямо в форме категории (createAmenity
  // кладёт её в справочник объекта) и сразу отмечается у текущей категории.
  const [newCharLabel, setNewCharLabel] = React.useState("");
  const [newCharGroup, setNewCharGroup] = React.useState("");
  const [newCharPrice, setNewCharPrice] = React.useState("");
  const [newCharSaving, setNewCharSaving] = React.useState(false);
  const [newCharError, setNewCharError] = React.useState<string | null>(null);

  // Наценка уже существующей характеристики — черновик до onBlur, чтобы не
  // слать PATCH на каждый символ (это настоящий запрос, не localStorage).
  const [amenityPriceDrafts, setAmenityPriceDrafts] = React.useState<Record<number, string>>({});

  const openAdd = () => {
    setRoomTypeId(roomTypes[0]?.id ?? "");
    setRoomNumber("");
    setTariffs([]);
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
      await createRoom({ propertyId: property.id, roomTypeId, number: trimmed, mealOptions: tariffs });
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
    setEditTariffs(room.mealOptions);
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
      await updateRoom(editRoom.id, { roomTypeId: editRoomTypeId || undefined, number: trimmed, mealOptions: editTariffs });
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

  const openAddCategory = () => {
    setCatEdit({
      id: null,
      name: "",
      price: "",
      adultsCapacity: "",
      childrenCapacity: "",
      view: "",
      bedType: "",
      roomLayout: "",
      description: "",
      amenities: new Set(),
      luxury: false,
    });
    setCatError(null);
    setNewCharLabel("");
    setNewCharGroup("");
    setNewCharPrice("");
    setNewCharError(null);
  };

  const openEditCategory = (cat: HotelRoomType) => {
    setCatEdit({
      id: cat.id,
      name: cat.name,
      price: String(Number(cat.basePrice)),
      adultsCapacity: String(cat.adultsCapacity),
      childrenCapacity: String(cat.childrenCapacity),
      view: cat.view,
      bedType: cat.bedType,
      roomLayout: cat.roomLayout,
      description: cat.description,
      amenities: new Set(cat.amenities),
      luxury: cat.isLuxury,
    });
    setCatError(null);
    setNewCharLabel("");
    setNewCharGroup("");
    setNewCharPrice("");
    setNewCharError(null);
  };

  const submitNewAmenity = async () => {
    if (!catEdit || !property) return;
    const trimmed = newCharLabel.trim();
    if (!trimmed) {
      setNewCharError("Введите название характеристики");
      return;
    }
    setNewCharSaving(true);
    setNewCharError(null);
    try {
      const created = await createAmenity({
        propertyId: property.id,
        label: trimmed,
        group: newCharGroup.trim() || undefined,
        extraPrice: newCharPrice ? String(Number(newCharPrice) || 0) : undefined,
      });
      invalidateCatalogs();
      setCatEdit({ ...catEdit, amenities: new Set([...catEdit.amenities, created.key]) });
      setNewCharLabel("");
      setNewCharGroup("");
      setNewCharPrice("");
    } catch (err) {
      setNewCharError(getErrorMessage(err, "Не удалось добавить характеристику"));
    } finally {
      setNewCharSaving(false);
    }
  };

  const commitAmenityPrice = async (amenity: HotelAmenity) => {
    const draft = amenityPriceDrafts[amenity.id];
    if (draft === undefined) return;
    const nextPrice = Number(draft) || 0;
    if (nextPrice === Number(amenity.extraPrice)) return;
    try {
      await updateAmenity(amenity.id, { extraPrice: String(nextPrice) });
      invalidateCatalogs();
      invalidateRoomTypes();
    } catch (err) {
      setCatError(getErrorMessage(err, "Не удалось изменить наценку"));
    }
  };

  const toggleAmenity = (key: string) => {
    if (!catEdit) return;
    const next = new Set(catEdit.amenities);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCatEdit({ ...catEdit, amenities: next });
  };

  const submitCategory = async () => {
    if (!catEdit || !property) return;
    const trimmed = catEdit.name.trim();
    if (!trimmed) {
      setCatError("Введите название категории");
      return;
    }
    setCatSaving(true);
    setCatError(null);
    try {
      const patch = {
        name: trimmed,
        basePrice: String(Number(catEdit.price) || 0),
        adultsCapacity: Number(catEdit.adultsCapacity) || 1,
        childrenCapacity: Number(catEdit.childrenCapacity) || 0,
        view: catEdit.view.trim(),
        bedType: catEdit.bedType.trim(),
        roomLayout: catEdit.roomLayout.trim(),
        description: catEdit.description.trim(),
        amenities: [...catEdit.amenities],
        isLuxury: catEdit.luxury,
      };
      if (catEdit.id != null) await updateRoomType(catEdit.id, patch);
      else await createRoomType({ propertyId: property.id, ...patch });
      invalidateRoomTypes();
      setCatEdit(null);
    } catch (err) {
      setCatError(getErrorMessage(err, "Не удалось сохранить категорию"));
    } finally {
      setCatSaving(false);
    }
  };

  // Живой предпросчёт «Итого» в диалоге категории — база из формы + наценки
  // отмеченных характеристик (из живого catalogsQuery, а не из cat.totalPrice
  // — чтобы правка наценки прямо здесь сразу отражалась в сумме до сохранения).
  const catEditTotalPrice = catEdit
    ? (Number(catEdit.price) || 0) +
      [...catEdit.amenities].reduce((sum, key) => {
        const a = amenitiesCatalog.find((c) => c.key === key);
        return sum + (a ? Number(a.extraPrice) : 0);
      }, 0)
    : 0;

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
          <Button size="small" variant="outlined" startIcon={<AddOutlined />} onClick={openAddCategory} disabled={!property}>
            Добавить категорию
          </Button>
          <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={openAdd} disabled={!property || roomTypes.length === 0}>
            Добавить номер
          </Button>
        </Stack>
      </Stack>

      <Alert severity="info" variant="outlined" sx={{ fontSize: "0.8rem" }}>
        Справочник номеров Viva, сгруппирован по категориям (тарифам). Цена категории — это номер
        «без ничего»: каждая отмеченная характеристика добавляет свою наценку сверху, итог считает
        бэкенд и показан в карточке категории и в «Изменить». Новый номер сразу появляется в
        шахматке броней и в списке выбора при создании брони; нажмите на номер, чтобы изменить его
        категорию, код или питание; ✕ на чипе — удаляет номер (если он уже фигурирует в бронях —
        просто снимается с продажи).
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
              Категорий пока нет — начните с «Добавить категорию».
            </Typography>
          )}
          {roomTypes.map((cat) => {
            const rooms = roomsByType.get(cat.id) ?? [];
            const totalPrice = Number(cat.totalPrice);
            const basePrice = Number(cat.basePrice);
            return (
              <Paper key={cat.id} elevation={0} variant="outlined" sx={{ p: 1.75 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={0.5} sx={{ mb: 1 }}>
                  <Stack direction="row" alignItems="baseline" gap={1} flexWrap="wrap">
                    <Typography variant="body2" fontWeight={600}>
                      {cat.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {totalPrice.toLocaleString("ru-RU")} сом/ночь
                      {totalPrice !== basePrice && ` (база ${basePrice.toLocaleString("ru-RU")})`} · до {cat.capacity} гостей
                    </Typography>
                  </Stack>
                  <Button size="small" startIcon={<EditOutlined fontSize="small" />} onClick={() => openEditCategory(cat)}>
                    Изменить
                  </Button>
                </Stack>
                {cat.amenities.length > 0 && (
                  <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mb: 1 }}>
                    {cat.amenities.map((key) => {
                      const def = amenitiesCatalog.find((a) => a.key === key);
                      const extra = def ? Number(def.extraPrice) : 0;
                      const label = def ? (extra > 0 ? `${def.label} +${extra.toLocaleString("ru-RU")}` : def.label) : key;
                      return <Chip key={key} label={label} size="small" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />;
                    })}
                  </Stack>
                )}
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
              value={tariffs}
              onChange={(e) => {
                const v = e.target.value;
                setTariffs(typeof v === "string" ? v.split(",") : v);
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
              value={editTariffs}
              onChange={(e) => {
                const v = e.target.value;
                setEditTariffs(typeof v === "string" ? v.split(",") : v);
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

      <Dialog open={catEdit != null} onClose={() => setCatEdit(null)} maxWidth="xs" fullWidth>
        {catEdit && (
          <>
            <DialogTitle>{catEdit.id != null ? "Изменить категорию" : "Новая категория (тариф)"}</DialogTitle>
            <DialogContent>
              <Stack gap={2} sx={{ mt: 0.5 }}>
                <TextField
                  label="Название"
                  placeholder="Например, Полулюкс"
                  value={catEdit.name}
                  onChange={(e) => {
                    setCatEdit({ ...catEdit, name: e.target.value });
                    setCatError(null);
                  }}
                  autoFocus
                  fullWidth
                />
                <Stack direction="row" gap={2}>
                  <TextField
                    label="Цена без характеристик, сом"
                    type="number"
                    value={catEdit.price}
                    onChange={(e) => setCatEdit({ ...catEdit, price: e.target.value })}
                    slotProps={{ htmlInput: { min: 0 } }}
                    helperText="Номер «без ничего» — характеристики ниже добавляются к ней"
                    fullWidth
                  />
                </Stack>
                <Stack direction="row" gap={2}>
                  <TextField
                    label="Взрослых"
                    type="number"
                    value={catEdit.adultsCapacity}
                    onChange={(e) => setCatEdit({ ...catEdit, adultsCapacity: e.target.value })}
                    slotProps={{ htmlInput: { min: 1 } }}
                    fullWidth
                  />
                  <TextField
                    label="Детей"
                    type="number"
                    value={catEdit.childrenCapacity}
                    onChange={(e) => setCatEdit({ ...catEdit, childrenCapacity: e.target.value })}
                    slotProps={{ htmlInput: { min: 0 } }}
                    fullWidth
                  />
                </Stack>
                <Alert severity="info" variant="outlined" sx={{ fontSize: "0.8rem", py: 0.5 }}>
                  Итого за ночь: <strong>{catEditTotalPrice.toLocaleString("ru-RU")} сом</strong>
                </Alert>
                <TextField
                  label="Вид из окна"
                  placeholder="Двор, Улица, Горы…"
                  value={catEdit.view}
                  onChange={(e) => setCatEdit({ ...catEdit, view: e.target.value })}
                  fullWidth
                />
                <TextField
                  label="Тип кровати"
                  placeholder="Двуспальная кровать King-size"
                  value={catEdit.bedType}
                  onChange={(e) => setCatEdit({ ...catEdit, bedType: e.target.value })}
                  fullWidth
                />
                <TextField
                  label="Планировка"
                  placeholder="1 комната, Студия, Апартаменты…"
                  value={catEdit.roomLayout}
                  onChange={(e) => setCatEdit({ ...catEdit, roomLayout: e.target.value })}
                  fullWidth
                />
                <TextField
                  label="Описание"
                  placeholder="Необязательно"
                  value={catEdit.description}
                  onChange={(e) => setCatEdit({ ...catEdit, description: e.target.value })}
                  multiline
                  minRows={2}
                  fullWidth
                />

                <Box>
                  <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
                    Характеристики
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Что в номере отличает его от обычного и на сколько дороже делает — как права у роли. Нет нужной — заведите ниже.
                  </Typography>
                  {amenityGroups.map((group) => (
                    <Box key={group} sx={{ mt: 1 }}>
                      <Typography variant="caption" fontWeight={600} color="text.secondary">
                        {group}
                      </Typography>
                      <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="center">
                        {amenitiesCatalog.filter((a) => a.group === group).map((a) => (
                          <Stack key={a.id} direction="row" alignItems="center" gap={0.25}>
                            <FormControlLabel
                              control={
                                <Checkbox
                                  size="small"
                                  checked={catEdit.amenities.has(a.key)}
                                  onChange={() => toggleAmenity(a.key)}
                                />
                              }
                              label={
                                <Typography variant="body2" color="text.secondary">
                                  {a.label}
                                </Typography>
                              }
                              sx={{ mr: 0 }}
                            />
                            <TextField
                              size="small"
                              type="number"
                              value={amenityPriceDrafts[a.id] ?? String(Number(a.extraPrice))}
                              onChange={(e) => setAmenityPriceDrafts((prev) => ({ ...prev, [a.id]: e.target.value }))}
                              onBlur={() => void commitAmenityPrice(a)}
                              slotProps={{ htmlInput: { min: 0, style: { textAlign: "right" } } }}
                              sx={{ width: 76 }}
                            />
                          </Stack>
                        ))}
                      </Stack>
                    </Box>
                  ))}

                  <Stack direction="row" gap={1} sx={{ mt: 1.5 }}>
                    <TextField
                      size="small"
                      label="Новая характеристика"
                      placeholder="Например, Балкон"
                      value={newCharLabel}
                      onChange={(e) => {
                        setNewCharLabel(e.target.value);
                        setNewCharError(null);
                      }}
                      disabled={newCharSaving}
                      fullWidth
                    />
                    <Autocomplete
                      size="small"
                      freeSolo
                      options={amenityGroups}
                      inputValue={newCharGroup}
                      onInputChange={(_, v) => setNewCharGroup(v)}
                      disabled={newCharSaving}
                      sx={{ minWidth: 140 }}
                      renderInput={(params) => <TextField {...params} label="Раздел" placeholder="Техника…" />}
                    />
                    <TextField
                      size="small"
                      label="Наценка, сом"
                      type="number"
                      value={newCharPrice}
                      onChange={(e) => setNewCharPrice(e.target.value)}
                      slotProps={{ htmlInput: { min: 0 } }}
                      disabled={newCharSaving}
                      sx={{ width: 110 }}
                    />
                    <Button variant="outlined" onClick={() => void submitNewAmenity()} disabled={!newCharLabel.trim() || newCharSaving} sx={{ whiteSpace: "nowrap" }}>
                      {newCharSaving ? "Добавляем…" : "Добавить"}
                    </Button>
                  </Stack>
                  {newCharError && (
                    <Alert severity="warning" variant="outlined" sx={{ fontSize: "0.75rem", mt: 0.75 }}>
                      {newCharError}
                    </Alert>
                  )}
                </Box>

                <FormControlLabel
                  control={<Checkbox checked={catEdit.luxury} onChange={(e) => setCatEdit({ ...catEdit, luxury: e.target.checked })} />}
                  label="Люкс-категория (акцентный бейдж в шахматке)"
                />
                {catError && (
                  <Alert severity="warning" variant="outlined" sx={{ fontSize: "0.8rem" }}>
                    {catError}
                  </Alert>
                )}
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setCatEdit(null)} disabled={catSaving}>
                Отмена
              </Button>
              <Button variant="contained" disabled={!catEdit.name.trim() || catSaving} onClick={() => void submitCategory()}>
                {catSaving ? "Сохраняем…" : catEdit.id != null ? "Сохранить" : "Добавить"}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
      </Stack>
    </SettingsLayout>
  );
};

export default HotelRoomsSettingsPage;
