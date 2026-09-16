/**
 * «Настройки» → «Номера» для Viva — второй раздел рядом с «Роли и права»
 * (см. HotelSettingsPage.tsx, точка подключения в SettingsRouter.tsx).
 *
 * Номера сгруппированы по категориям (тарифам) — той же форме, в которой их
 * показывают RoomBookingGrid и RoomDetailsDialog. «Добавить номер» кладёт
 * номер в выбранную категорию через общий localStorage-стор
 * (addHotelRoom/subscribeHotelRoomCategories в mockDemoData.ts) — шахматка и
 * форма создания брони подхватывают его без reload, тот же приём, что у
 * ручных броней и ролей. Категории — фиксированный список: цена, вместимость
 * и удобства принадлежат тарифу, а не отдельному номеру, заводить здесь новый
 * тариф текстовым вводом означало бы дублировать форму уровня «Люкс» без
 * реальной пользы для демо.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import { Navigate } from "react-router";

import { usePageTitle } from "../hooks/usePageTitle";
import {
  isVivaActive,
  addHotelRoom,
  deleteHotelRoom,
  roomNumberExists,
  subscribeHotelRoomCategories,
  getHotelRoomCategoriesSnapshot,
} from "./mockDemoData";

export const HotelRoomsSettingsPage: React.FC = () => {
  usePageTitle("Номера");
  const theme = useTheme();
  const categories = React.useSyncExternalStore(subscribeHotelRoomCategories, getHotelRoomCategoriesSnapshot);
  const [addOpen, setAddOpen] = React.useState(false);
  const [categoryName, setCategoryName] = React.useState("");
  const [roomNumber, setRoomNumber] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // После хуков (Rules of Hooks) — страница доступна только Viva, как HotelRolesSettingsPage.
  if (!isVivaActive()) return <Navigate to="/" replace />;

  const openAdd = () => {
    setCategoryName(categories[0]?.name ?? "");
    setRoomNumber("");
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
    setAddOpen(false);
  };

  return (
    <Box sx={{ height: "100%", overflow: "auto", px: theme.appLayout.page.paddingX, py: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>
          Номера
        </Typography>
        <Button size="small" variant="contained" startIcon={<AddOutlined />} onClick={openAdd}>
          Добавить номер
        </Button>
      </Stack>

      <Alert severity="info" variant="outlined" sx={{ mb: 2.5, fontSize: "0.8rem" }}>
        Демо-справочник номеров Viva, сгруппирован по категориям. Новый номер сразу появляется в
        шахматке броней и в списке выбора при создании брони.
      </Alert>

      <Stack gap={2} sx={{ maxWidth: 640 }}>
        {categories.map((cat) => (
          <Paper key={cat.name} elevation={0} variant="outlined" sx={{ p: 1.75 }}>
            <Stack direction="row" alignItems="baseline" justifyContent="space-between" flexWrap="wrap" gap={0.5} sx={{ mb: 1 }}>
              <Typography variant="body2" fontWeight={600}>
                {cat.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {cat.pricePerNight.toLocaleString("ru-RU")} сом/ночь · до {cat.capacity} гостей
              </Typography>
            </Stack>
            <Stack direction="row" flexWrap="wrap" gap={0.75}>
              {cat.rooms.length === 0 && (
                <Typography variant="caption" color="text.disabled">
                  Номеров пока нет
                </Typography>
              )}
              {cat.rooms.map((room) => (
                <Chip key={room} label={room} size="small" onDelete={() => deleteHotelRoom(cat.name, room)} />
              ))}
            </Stack>
          </Paper>
        ))}
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
    </Box>
  );
};

export default HotelRoomsSettingsPage;
