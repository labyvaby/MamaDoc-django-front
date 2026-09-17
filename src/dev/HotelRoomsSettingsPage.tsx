/**
 * «Настройки» → «Номера» для Viva — второй раздел рядом с «Роли и права»
 * (см. HotelSettingsPage.tsx, точка подключения в SettingsRouter.tsx).
 *
 * Номера сгруппированы по категориям (тарифам) — той же форме, в которой их
 * показывают RoomBookingGrid и RoomDetailsDialog. «Добавить номер» кладёт
 * номер в выбранную категорию через общий localStorage-стор
 * (addHotelRoom/subscribeHotelRoomCategories в mockDemoData.ts) — шахматка и
 * форма создания брони подхватывают его без reload, тот же приём, что у
 * ручных броней и ролей. Категории теперь тоже можно создавать и править
 * («Добавить категорию»/«Изменить»): цена, вместимость и характеристики
 * принадлежат тарифу, а не отдельному номеру.
 *
 * Характеристики категории (со слов заказчика — «наличие чего-то в номере,
 * что отличает его от обычного и делает его дороже») выбираются чекбоксами по
 * разделам из общего справочника (subscribeRoomCharacteristicCatalog в
 * mockDemoData.ts) — тот же принцип, что роль собирает права из
 * HOTEL_PERMISSION_CATALOG в HotelRolesSettingsPage.tsx. В отличие от прав,
 * справочник не фиксирован: прямо в форме категории можно завести новую
 * характеристику со своей наценкой (addRoomCharacteristic) — она сразу
 * появится во всех категориях, а не только у текущей; наценка уже
 * существующей — тоже редактируется прямо там же (updateRoomCharacteristicPrice).
 * Цена категории (pricePerNight) — это цена номера «без ничего»; сколько
 * реально стоит ночь — getCategoryTotalPrice (база + наценки отмеченных
 * характеристик), не одно pricePerNight напрямую.
 *
 * «Доп. тарифы» при добавлении номера — отдельный от категории мультивыбор
 * питания (Завтрак/Обед/Ужин/Всё включено, см. AdditionalTariff в
 * mockDemoData.ts): свойство конкретного номера, а не тарифа брони
 * (boardType/«Тариф» в CreateBookingButton — что выбрано на этот заезд),
 * поэтому и мультивыбор, и свой стор — можно скомбинировать Завтрак+Обед без Ужина.
 */
import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
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
import { useTheme } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import { Navigate } from "react-router";

import { usePageTitle } from "../hooks/usePageTitle";
import {
  isVivaActive,
  addHotelRoom,
  deleteHotelRoom,
  updateHotelRoom,
  roomNumberExists,
  addHotelRoomCategory,
  updateHotelRoomCategory,
  subscribeHotelRoomCategories,
  getHotelRoomCategoriesSnapshot,
  setRoomAdditionalTariffs,
  getRoomAdditionalTariffs,
  subscribeRoomAdditionalTariffs,
  getRoomAdditionalTariffsSnapshot,
  ADDITIONAL_TARIFF_LABELS,
  subscribeRoomCharacteristicCatalog,
  getRoomCharacteristicCatalogSnapshot,
  getRoomCharacteristicLabel,
  addRoomCharacteristic,
  updateRoomCharacteristicPrice,
  getCategoryTotalPrice,
  type AdditionalTariff,
  type HotelRoomCategory,
} from "./mockDemoData";

const ADDITIONAL_TARIFF_KEYS = Object.keys(ADDITIONAL_TARIFF_LABELS) as AdditionalTariff[];

interface CategoryEditState {
  /** null — создание новой категории, иначе имя правящейся (до переименования). */
  originalName: string | null;
  name: string;
  price: string;
  capacity: string;
  view: string;
  bedType: string;
  roomLayout: string;
  characteristics: Set<string>;
  luxury: boolean;
}

export const HotelRoomsSettingsPage: React.FC = () => {
  usePageTitle("Номера");
  const theme = useTheme();
  const categories = React.useSyncExternalStore(subscribeHotelRoomCategories, getHotelRoomCategoriesSnapshot);
  // Снимок в зависимостях — иначе список чипов не обновит подсказку с доп.
  // тарифами сразу после добавления номера (getRoomAdditionalTariffs сам не подписан).
  React.useSyncExternalStore(subscribeRoomAdditionalTariffs, getRoomAdditionalTariffsSnapshot);
  const characteristicCatalog = React.useSyncExternalStore(subscribeRoomCharacteristicCatalog, getRoomCharacteristicCatalogSnapshot);
  const characteristicCategories = [...new Set(characteristicCatalog.map((c) => c.category))];
  const [addOpen, setAddOpen] = React.useState(false);
  const [categoryName, setCategoryName] = React.useState("");
  const [roomNumber, setRoomNumber] = React.useState("");
  const [tariffs, setTariffs] = React.useState<AdditionalTariff[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  // Редактирование уже созданного номера — категория/номер/доп. тарифы можно
  // поправить без удаления и создания заново (updateHotelRoom переносит номер
  // между категориями и/или переименовывает его, сохраняя доп. тарифы).
  const [editRoom, setEditRoom] = React.useState<{ fromCategory: string; room: string } | null>(null);
  const [editCategoryName, setEditCategoryName] = React.useState("");
  const [editRoomNumber, setEditRoomNumber] = React.useState("");
  const [editTariffs, setEditTariffs] = React.useState<AdditionalTariff[]>([]);
  const [editError, setEditError] = React.useState<string | null>(null);

  // Категория (тариф) — раньше список категорий был фиксирован, теперь можно
  // завести свой тариф или поправить уже созданный (цену/вместимость/
  // характеристики), как роль собирает права (см. HotelRolesSettingsPage.tsx —
  // тот же принцип «название + отмеченные пункты справочника» для catEdit.characteristics).
  const [catEdit, setCatEdit] = React.useState<CategoryEditState | null>(null);
  const [catError, setCatError] = React.useState<string | null>(null);

  // Новая характеристика — заводится прямо в форме категории (addRoomCharacteristic
  // кладёт её в общий справочник) и сразу отмечается у текущей категории.
  const [newCharLabel, setNewCharLabel] = React.useState("");
  const [newCharCategory, setNewCharCategory] = React.useState("");
  const [newCharPrice, setNewCharPrice] = React.useState("");
  const [newCharError, setNewCharError] = React.useState<string | null>(null);

  // После хуков (Rules of Hooks) — страница доступна только Viva, как HotelRolesSettingsPage.
  if (!isVivaActive()) return <Navigate to="/" replace />;

  const openAdd = () => {
    setCategoryName(categories[0]?.name ?? "");
    setRoomNumber("");
    setTariffs([]);
    setError(null);
    setAddOpen(true);
  };

  const submitAdd = () => {
    const trimmed = roomNumber.trim();
    if (!trimmed) {
      setError("Введите номер комнаты");
      return;
    }
    if (roomNumberExists(trimmed)) {
      setError("Такой номер уже есть в отеле");
      return;
    }
    addHotelRoom(categoryName, trimmed);
    setRoomAdditionalTariffs(trimmed, tariffs);
    setAddOpen(false);
  };

  const openEditRoom = (fromCategory: string, room: string) => {
    setEditRoom({ fromCategory, room });
    setEditCategoryName(fromCategory);
    setEditRoomNumber(room);
    setEditTariffs(getRoomAdditionalTariffs(room));
    setEditError(null);
  };

  const submitEditRoom = () => {
    if (!editRoom) return;
    const trimmed = editRoomNumber.trim();
    if (!trimmed) {
      setEditError("Введите номер комнаты");
      return;
    }
    const ok = updateHotelRoom(editRoom.fromCategory, editRoom.room, editCategoryName, trimmed);
    if (!ok) {
      setEditError("Такой номер уже есть в отеле");
      return;
    }
    setRoomAdditionalTariffs(trimmed, editTariffs);
    setEditRoom(null);
  };

  const openAddCategory = () => {
    setCatEdit({
      originalName: null,
      name: "",
      price: "",
      capacity: "",
      view: "",
      bedType: "",
      roomLayout: "",
      characteristics: new Set(),
      luxury: false,
    });
    setCatError(null);
    setNewCharLabel("");
    setNewCharCategory("");
    setNewCharPrice("");
    setNewCharError(null);
  };

  const openEditCategory = (cat: HotelRoomCategory) => {
    setCatEdit({
      originalName: cat.name,
      name: cat.name,
      price: String(cat.pricePerNight),
      capacity: String(cat.capacity),
      view: cat.view,
      bedType: cat.bedType,
      roomLayout: cat.roomLayout,
      characteristics: new Set(cat.amenities),
      luxury: !!cat.luxury,
    });
    setCatError(null);
    setNewCharLabel("");
    setNewCharCategory("");
    setNewCharPrice("");
    setNewCharError(null);
  };

  const submitNewCharacteristic = () => {
    if (!catEdit) return;
    const trimmed = newCharLabel.trim();
    if (!trimmed) {
      setNewCharError("Введите название характеристики");
      return;
    }
    const def = addRoomCharacteristic(trimmed, newCharCategory, Number(newCharPrice) || 0);
    if (!def) {
      setNewCharError("Такая характеристика уже есть");
      return;
    }
    setCatEdit({ ...catEdit, characteristics: new Set([...catEdit.characteristics, def.key]) });
    setNewCharLabel("");
    setNewCharCategory("");
    setNewCharPrice("");
    setNewCharError(null);
  };

  const toggleCharacteristic = (key: string) => {
    if (!catEdit) return;
    const next = new Set(catEdit.characteristics);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCatEdit({ ...catEdit, characteristics: next });
  };

  const submitCategory = () => {
    if (!catEdit) return;
    const trimmed = catEdit.name.trim();
    if (!trimmed) {
      setCatError("Введите название категории");
      return;
    }
    const patch = {
      name: trimmed,
      pricePerNight: Number(catEdit.price) || 0,
      capacity: Number(catEdit.capacity) || 1,
      view: catEdit.view.trim(),
      bedType: catEdit.bedType.trim(),
      roomLayout: catEdit.roomLayout.trim(),
      amenities: [...catEdit.characteristics],
      luxury: catEdit.luxury || undefined,
    };
    const ok = catEdit.originalName
      ? updateHotelRoomCategory(catEdit.originalName, patch)
      : addHotelRoomCategory(patch);
    if (!ok) {
      setCatError("Такая категория уже есть");
      return;
    }
    setCatEdit(null);
  };

  // Живой предпросчёт «Итого» в диалоге категории — база из формы + наценки
  // отмеченных характеристик (из живого characteristicCatalog, а не из снимка
  // категории — чтобы правка наценки прямо здесь сразу отражалась в сумме).
  const catEditTotalPrice = catEdit
    ? (Number(catEdit.price) || 0) +
      [...catEdit.characteristics].reduce((sum, key) => sum + (characteristicCatalog.find((c) => c.key === key)?.extraPrice ?? 0), 0)
    : 0;

  return (
    <Box sx={{ height: "100%", overflow: "auto", px: theme.appLayout.page.paddingX, py: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>
          Номера
        </Typography>
        <Stack direction="row" gap={1}>
          <Button size="small" variant="outlined" startIcon={<AddOutlined />} onClick={openAddCategory}>
            Добавить категорию
          </Button>
          <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={openAdd}>
            Добавить номер
          </Button>
        </Stack>
      </Stack>

      <Alert severity="info" variant="outlined" sx={{ mb: 2.5, fontSize: "0.8rem" }}>
        Демо-справочник номеров Viva, сгруппирован по категориям (тарифам). Цена категории — это
        номер «без ничего»: каждая отмеченная характеристика добавляет свою наценку сверху, итог
        показан в карточке категории и в «Изменить». Новый номер сразу появляется в шахматке броней
        и в списке выбора при создании брони; нажмите на номер, чтобы изменить его категорию, код
        или доп. тарифы; ✕ на чипе — удаляет номер.
      </Alert>

      <Stack gap={2} sx={{ maxWidth: 640 }}>
        {categories.map((cat) => {
          const totalPrice = getCategoryTotalPrice(cat);
          return (
            <Paper key={cat.name} elevation={0} variant="outlined" sx={{ p: 1.75 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={0.5} sx={{ mb: 1 }}>
                <Stack direction="row" alignItems="baseline" gap={1} flexWrap="wrap">
                  <Typography variant="body2" fontWeight={600}>
                    {cat.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {totalPrice.toLocaleString("ru-RU")} сом/ночь
                    {totalPrice !== cat.pricePerNight && ` (база ${cat.pricePerNight.toLocaleString("ru-RU")})`} · до {cat.capacity} гостей
                  </Typography>
                </Stack>
                <Button size="small" startIcon={<EditOutlined fontSize="small" />} onClick={() => openEditCategory(cat)}>
                  Изменить
                </Button>
              </Stack>
              {cat.amenities.length > 0 && (
                <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mb: 1 }}>
                  {cat.amenities.map((a) => {
                    const def = characteristicCatalog.find((c) => c.key === a);
                    const label = def && def.extraPrice > 0 ? `${def.label} +${def.extraPrice.toLocaleString("ru-RU")}` : getRoomCharacteristicLabel(a);
                    return <Chip key={a} label={label} size="small" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />;
                  })}
                </Stack>
              )}
            <Stack direction="row" flexWrap="wrap" gap={0.75}>
              {cat.rooms.length === 0 && (
                <Typography variant="caption" color="text.disabled">
                  Номеров пока нет
                </Typography>
              )}
              {cat.rooms.map((room) => {
                const roomTariffs = getRoomAdditionalTariffs(room);
                const chip = (
                  <Chip
                    key={room}
                    label={room}
                    size="small"
                    onClick={() => openEditRoom(cat.name, room)}
                    onDelete={() => deleteHotelRoom(cat.name, room)}
                  />
                );
                const tooltipTitle =
                  roomTariffs.length === 0
                    ? "Нажмите, чтобы изменить"
                    : `Доп. тарифы: ${roomTariffs.map((t) => ADDITIONAL_TARIFF_LABELS[t]).join(", ")} · нажмите, чтобы изменить`;
                return (
                  <Tooltip key={room} title={tooltipTitle}>
                    {chip}
                  </Tooltip>
                );
              })}
            </Stack>
            </Paper>
          );
        })}
      </Stack>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Новый номер</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 0.5 }}>
            <TextField select label="Категория" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} fullWidth>
              {categories.map((cat) => (
                <MenuItem key={cat.name} value={cat.name}>
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
              fullWidth
            />
            <TextField
              select
              label="Доп. тарифы"
              value={tariffs}
              onChange={(e) => {
                const v = e.target.value;
                setTariffs((typeof v === "string" ? v.split(",") : v) as AdditionalTariff[]);
              }}
              SelectProps={{
                multiple: true,
                renderValue: (selected) => (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {(selected as AdditionalTariff[]).map((key) => (
                      <Chip key={key} label={ADDITIONAL_TARIFF_LABELS[key]} size="small" sx={{ height: 20, borderRadius: "6px" }} />
                    ))}
                  </Box>
                ),
              }}
              helperText="Необязательно — какое питание доступно в этом номере"
              fullWidth
            >
              {ADDITIONAL_TARIFF_KEYS.map((key) => (
                <MenuItem key={key} value={key}>
                  {ADDITIONAL_TARIFF_LABELS[key]}
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
          <Button onClick={() => setAddOpen(false)}>Отмена</Button>
          <Button variant="contained" disabled={!roomNumber.trim()} onClick={submitAdd}>
            Добавить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editRoom != null} onClose={() => setEditRoom(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Номер {editRoom?.room}</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 0.5 }}>
            <TextField select label="Категория" value={editCategoryName} onChange={(e) => setEditCategoryName(e.target.value)} fullWidth>
              {categories.map((cat) => (
                <MenuItem key={cat.name} value={cat.name}>
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
              fullWidth
            />
            <TextField
              select
              label="Доп. тарифы"
              value={editTariffs}
              onChange={(e) => {
                const v = e.target.value;
                setEditTariffs((typeof v === "string" ? v.split(",") : v) as AdditionalTariff[]);
              }}
              SelectProps={{
                multiple: true,
                renderValue: (selected) => (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {(selected as AdditionalTariff[]).map((key) => (
                      <Chip key={key} label={ADDITIONAL_TARIFF_LABELS[key]} size="small" sx={{ height: 20, borderRadius: "6px" }} />
                    ))}
                  </Box>
                ),
              }}
              helperText="Необязательно — какое питание доступно в этом номере"
              fullWidth
            >
              {ADDITIONAL_TARIFF_KEYS.map((key) => (
                <MenuItem key={key} value={key}>
                  {ADDITIONAL_TARIFF_LABELS[key]}
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
          <Button onClick={() => setEditRoom(null)}>Отмена</Button>
          <Button variant="contained" disabled={!editRoomNumber.trim()} onClick={submitEditRoom}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={catEdit != null} onClose={() => setCatEdit(null)} maxWidth="xs" fullWidth>
        {catEdit && (
          <>
            <DialogTitle>{catEdit.originalName ? "Изменить категорию" : "Новая категория (тариф)"}</DialogTitle>
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
                  <TextField
                    label="Вместимость, гостей"
                    type="number"
                    value={catEdit.capacity}
                    onChange={(e) => setCatEdit({ ...catEdit, capacity: e.target.value })}
                    slotProps={{ htmlInput: { min: 1 } }}
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

                <Box>
                  <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
                    Характеристики
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Что в номере отличает его от обычного и на сколько дороже делает — как права у роли. Нет нужной — заведите ниже.
                  </Typography>
                  {characteristicCategories.map((category) => (
                    <Box key={category} sx={{ mt: 1 }}>
                      <Typography variant="caption" fontWeight={600} color="text.secondary">
                        {category}
                      </Typography>
                      <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="center">
                        {characteristicCatalog.filter((c) => c.category === category).map((c) => (
                          <Stack key={c.key} direction="row" alignItems="center" gap={0.25}>
                            <FormControlLabel
                              control={
                                <Checkbox
                                  size="small"
                                  checked={catEdit.characteristics.has(c.key)}
                                  onChange={() => toggleCharacteristic(c.key)}
                                />
                              }
                              label={
                                <Typography variant="body2" color="text.secondary">
                                  {c.label}
                                </Typography>
                              }
                              sx={{ mr: 0 }}
                            />
                            <TextField
                              size="small"
                              type="number"
                              value={c.extraPrice}
                              onChange={(e) => updateRoomCharacteristicPrice(c.key, Number(e.target.value) || 0)}
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
                      fullWidth
                    />
                    <Autocomplete
                      size="small"
                      freeSolo
                      options={characteristicCategories}
                      inputValue={newCharCategory}
                      onInputChange={(_, v) => setNewCharCategory(v)}
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
                      sx={{ width: 110 }}
                    />
                    <Button variant="outlined" onClick={submitNewCharacteristic} disabled={!newCharLabel.trim()} sx={{ whiteSpace: "nowrap" }}>
                      Добавить
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
              <Button onClick={() => setCatEdit(null)}>Отмена</Button>
              <Button variant="contained" disabled={!catEdit.name.trim()} onClick={submitCategory}>
                {catEdit.originalName ? "Сохранить" : "Добавить"}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default HotelRoomsSettingsPage;
