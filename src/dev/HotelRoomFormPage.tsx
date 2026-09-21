/**
 * Страница редактирования одного номера — /rooms/:roomId, гейт hotel.manage
 * (PAGE_PERMISSIONS.hotelRooms, см. App.tsx, accessPermissions.ts). Сюда ведут
 * клик по номеру в списке «Номера» (HotelRoomsPage.tsx) и кнопка «Редактировать»
 * в карточке номера в шахматке (RoomDetailsDialog.tsx). Откуда пришли — лежит в
 * location.state.from: после «Сохранить»/«Отмена» возвращаем туда (иначе — в список).
 *
 * Реальный бэкенд (src/api/hotel.ts): правка — PATCH /hotel/rooms/{id}/
 * (категория, номер, этаж, питание, примечание, status), состояние — PATCH
 * /hotel/rooms/{id}/housekeeping/ (RoomStateControl). Одного номера в API нет
 * (getRoom), поэтому берём его из списка GET /hotel/rooms/ — тот же ключ кэша,
 * что у списка «Номера», так что после открытия из списка данные уже есть.
 *
 * Два разных «статуса», не путать: «В продаже» (status: active / out_of_service —
 * снят ли номер с продажи; так же номер снимается при «удалении», если он уже
 * фигурировал в бронях) и «Состояние» (убрано/грязно/проверено/ремонт). Первое
 * сохраняется общей кнопкой, второе применяется сразу.
 *
 * Перенос в другую категорию при будущих бронях бэк отклоняет (409
 * INVALID_TRANSITION) — показываем его сообщение как есть.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import HotelOutlined from "@mui/icons-material/HotelOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useLocation, useNavigate, useParams } from "react-router";

import { usePageTitle } from "../hooks/usePageTitle";
import { useHotelProperty } from "./useHotelProperty";
import { getHotelCatalogs, listRoomTypes, listRooms, updateRoom, type HotelRoom, type HotelRoomType } from "../api/hotel";
import { getErrorMessage } from "../api/client";
import { RoomStateControl } from "./RoomStateControl";

const LIST_PATH = "/rooms";

/** Куда вернуться: страница, с которой пришли (только внутренний путь), иначе список номеров. */
function backPathFrom(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : LIST_PATH;
}

interface RoomFormState {
  roomTypeId: number | "";
  number: string;
  floor: string;
  meals: string[];
  note: string;
  /** false — номер снят с продажи (status: out_of_service). */
  onSale: boolean;
}

function toForm(room: HotelRoom): RoomFormState {
  return {
    roomTypeId: room.roomTypeId,
    number: room.number,
    floor: room.floor ?? "",
    meals: room.mealOptions,
    note: room.note ?? "",
    onSale: room.status !== "out_of_service",
  };
}

interface RoomFormProps {
  propertyId: number;
  room: HotelRoom;
  roomTypes: HotelRoomType[];
  mealChoices: { value: string; label: string }[];
  backPath: string;
}

/** Сама форма: монтируется, когда номер уже загружен, поэтому состояние берётся из него без эффекта. */
const RoomForm: React.FC<RoomFormProps> = ({ propertyId, room, roomTypes, mealChoices, backPath }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<RoomFormState>(() => toForm(room));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const patchForm = (patch: Partial<RoomFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    const number = form.number.trim();
    if (!number) {
      setError("Введите номер комнаты");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateRoom(room.id, {
        roomTypeId: form.roomTypeId || undefined,
        number,
        floor: form.floor.trim(),
        mealOptions: form.meals,
        note: form.note.trim(),
        status: form.onSale ? "active" : "out_of_service",
      });
      // Номер виден в списке «Номера», в шахматке, в карточке номера и в счётчиках категорий.
      void queryClient.invalidateQueries({ queryKey: ["hotel", "rooms", propertyId] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "roomTypes", propertyId] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "calendar"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "room-availability"] });
      void queryClient.invalidateQueries({ queryKey: ["hotel", "dashboard"] });
      navigate(backPath);
    } catch (err) {
      setError(getErrorMessage(err, "Не удалось сохранить номер"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap={2} sx={{ maxWidth: 640 }}>
      <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
        <Stack gap={2}>
          <Typography variant="subtitle2" fontWeight={600}>
            Основное
          </Typography>
          <TextField
            select
            label="Категория"
            value={form.roomTypeId}
            onChange={(e) => patchForm({ roomTypeId: Number(e.target.value) })}
            disabled={saving}
            fullWidth
          >
            {roomTypes.map((cat) => (
              <MenuItem key={cat.id} value={cat.id}>
                {cat.name}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" flexWrap="wrap" gap={2}>
            <TextField
              label="Номер"
              value={form.number}
              onChange={(e) => {
                patchForm({ number: e.target.value });
                setError(null);
              }}
              disabled={saving}
              sx={{ flex: "1 1 200px" }}
            />
            <TextField
              label="Этаж"
              value={form.floor}
              onChange={(e) => patchForm({ floor: e.target.value })}
              disabled={saving}
              sx={{ flex: "1 1 120px" }}
            />
          </Stack>
          <TextField
            select
            label="Питание"
            value={form.meals}
            onChange={(e) => {
              const v = e.target.value as unknown;
              patchForm({ meals: typeof v === "string" ? v.split(",") : (v as string[]) });
            }}
            disabled={saving}
            SelectProps={{
              multiple: true,
              renderValue: (selected) => (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {(selected as string[]).map((key) => (
                    <Chip key={key} label={mealChoices.find((c) => c.value === key)?.label ?? key} size="small" sx={{ height: 20, borderRadius: "6px" }} />
                  ))}
                </Box>
              ),
            }}
            helperText="Необязательно — какое питание доступно в этом номере"
            fullWidth
          >
            {mealChoices.map((c) => (
              <MenuItem key={c.value} value={c.value}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Примечание"
            value={form.note}
            onChange={(e) => patchForm({ note: e.target.value })}
            disabled={saving}
            multiline
            minRows={2}
            fullWidth
          />
        </Stack>
      </Paper>

      <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
        <Stack gap={1.5}>
          <Typography variant="subtitle2" fontWeight={600}>
            Продажа и состояние
          </Typography>
          <Box>
            <FormControlLabel
              control={<Switch checked={form.onSale} onChange={(e) => patchForm({ onSale: e.target.checked })} disabled={saving} />}
              label="Номер в продаже"
            />
            <Typography variant="caption" color="text.secondary" display="block">
              Выключите, чтобы снять номер с продажи. Сохраняется кнопкой «Сохранить».
            </Typography>
          </Box>
          <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
            <Typography variant="body2">Состояние:</Typography>
            <RoomStateControl roomId={room.id} state={room.state} />
            <Typography variant="caption" color="text.secondary">
              Убрано, грязно, проверено или ремонт. Меняется сразу, без кнопки «Сохранить».
            </Typography>
          </Stack>
        </Stack>
      </Paper>

      {error && (
        <Alert severity="warning" variant="outlined" sx={{ fontSize: "0.8rem" }}>
          {error}
        </Alert>
      )}

      <Stack direction="row" gap={1} justifyContent="flex-end">
        <Button component={RouterLink} to={backPath} disabled={saving}>
          Отмена
        </Button>
        <Button variant="contained" disabled={!form.number.trim() || saving} onClick={() => void submit()}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </Button>
      </Stack>
    </Stack>
  );
};

export const HotelRoomFormPage: React.FC = () => {
  const { roomId } = useParams();
  usePageTitle("Номер");
  const theme = useTheme();
  const location = useLocation();
  const { property } = useHotelProperty();
  const backPath = backPathFrom(location.state);

  const catalogsQuery = useQuery({
    queryKey: ["hotel", "catalogs", property?.id],
    queryFn: ({ signal }) => getHotelCatalogs(property!.id, signal),
    enabled: property != null,
  });
  const roomTypesQuery = useQuery({
    queryKey: ["hotel", "roomTypes", property?.id],
    queryFn: ({ signal }) => listRoomTypes(property!.id, {}, signal),
    enabled: property != null,
  });
  const roomsQuery = useQuery({
    queryKey: ["hotel", "rooms", property?.id],
    queryFn: ({ signal }) => listRooms({ propertyId: property!.id }, signal),
    enabled: property != null,
  });

  const room = (roomsQuery.data ?? []).find((r) => String(r.id) === roomId) ?? null;
  const loading = catalogsQuery.isLoading || roomTypesQuery.isLoading || roomsQuery.isLoading;

  return (
    <Box sx={{ height: "100%", overflow: "auto", px: theme.appLayout.page.paddingX, py: 2 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" gap={1}>
          <Tooltip title="Назад">
            <IconButton size="small" component={RouterLink} to={backPath} aria-label="Назад">
              <ArrowBackOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
          <HotelOutlined color="action" />
          <Typography variant="h6" fontWeight={600}>
            {room ? `Номер ${room.number}` : "Номер"}
          </Typography>
        </Stack>

        {loading ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : !property ? (
          <Alert severity="warning" variant="outlined">
            Не найден объект размещения для текущего филиала.
          </Alert>
        ) : !room ? (
          <Alert
            severity="warning"
            variant="outlined"
            action={
              <Button color="inherit" size="small" component={RouterLink} to={backPath}>
                Назад
              </Button>
            }
          >
            Номер не найден — возможно, его уже удалили.
          </Alert>
        ) : (
          <RoomForm
            key={room.id}
            propertyId={property.id}
            room={room}
            roomTypes={roomTypesQuery.data ?? []}
            mealChoices={catalogsQuery.data?.mealOptions ?? []}
            backPath={backPath}
          />
        )}
      </Stack>
    </Box>
  );
};

export default HotelRoomFormPage;
