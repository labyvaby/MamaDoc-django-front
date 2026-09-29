/**
 * Форма номера — одна страница на создание (/rooms/new) и правку (/rooms/:roomId),
 * гейт hotel.manage (PAGE_PERMISSIONS.hotelRooms, см. App.tsx, accessPermissions.ts).
 * Сюда ведут «Добавить номер» и клик по номеру в списке «Номера» (HotelRoomsPage.tsx),
 * а также кнопка «Редактировать» в карточке номера в шахматке (RoomDetailsDialog.tsx).
 * Откуда пришли — лежит в location.state.from: после «Сохранить»/«Отмена» возвращаем
 * туда (иначе — в список).
 *
 * Реальный бэкенд (src/api/hotel.ts): создание — POST /hotel/rooms/, правка — PATCH
 * /hotel/rooms/{id}/ (категория, номер, этаж, питание, примечание, status, физические
 * характеристики), состояние — PATCH /hotel/rooms/{id}/housekeeping/ (RoomStateControl,
 * только при правке — у ещё не созданного номера состояния нет). Одного номера в API
 * нет (getRoom), поэтому при правке берём его из списка GET /hotel/rooms/ — тот же
 * ключ кэша, что у списка «Номера», так что после открытия из списка данные уже есть.
 *
 * Два разных «статуса», не путать: «В продаже» (status: active / out_of_service —
 * снят ли номер с продажи; так же номер снимается при «удалении», если он уже
 * фигурировал в бронях) и «Состояние» (убрано/грязно/проверено/ремонт). Первое
 * сохраняется общей кнопкой, второе применяется сразу.
 *
 * Физические характеристики (площадь, высота потолков, санузлы и т.д., раздел «Доп.
 * характеристики» ниже) — все необязательные, добавлены поверх исходных полей номера
 * по образцу карточки квартиры в CRM продаж недвижимости. В PATCH площадь/высоту/
 * санузлы/комнаты нельзя очистить пустым значением (null там значит «не прислали») —
 * для очистки отправляется отдельный флаг (clearArea и т.п., см. HotelRoomUpdateData);
 * текстовые поля (сторона света, вид, планировка) чистятся пустой строкой как обычно.
 *
 * Перенос в другую категорию при будущих бронях бэк отклоняет (409
 * INVALID_TRANSITION) — показываем его сообщение как есть.
 *
 * Несохранённые правки формы защищены: закрытие вкладки/F5 — предупреждение браузера
 * (beforeunload), «Назад»/«Отмена» — диалог подтверждения. Переход по боковому меню
 * не перехватывается: приложение на BrowserRouter, а useBlocker требует data-router.
 * Состояние номера в защиту не входит — оно применяется сразу и не откатывается.
 */
import React from "react";
import {
  Alert,
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
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import MeetingRoomOutlined from "@mui/icons-material/MeetingRoomOutlined";
import StairsOutlined from "@mui/icons-material/StairsOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import RestaurantOutlined from "@mui/icons-material/RestaurantOutlined";
import NotesOutlined from "@mui/icons-material/NotesOutlined";
import SquareFootOutlined from "@mui/icons-material/SquareFootOutlined";
import HeightOutlined from "@mui/icons-material/HeightOutlined";
import BathtubOutlined from "@mui/icons-material/BathtubOutlined";
import BedOutlined from "@mui/icons-material/BedOutlined";
import ExploreOutlined from "@mui/icons-material/ExploreOutlined";
import LandscapeOutlined from "@mui/icons-material/LandscapeOutlined";
import DeckOutlined from "@mui/icons-material/DeckOutlined";
import ArchitectureOutlined from "@mui/icons-material/ArchitectureOutlined";
import DoorFrontOutlined from "@mui/icons-material/DoorFrontOutlined";
import StraightenOutlined from "@mui/icons-material/StraightenOutlined";
import { FormField } from "./formField";
import { focusFirstFieldError, hasFieldErrors, type FieldRules } from "./formRules";
import { FormCard, HotelPage, HotelPageHeader, StickyActions } from "./hotelUi";
import { RoomDeleteDialog } from "./RoomDeleteDialog";
import { useTheme } from "@mui/material/styles";
import { subtleBorder } from "../theme/uiHelpers";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DeleteOutlineOutlined from "@mui/icons-material/DeleteOutlineOutlined";
import AddPhotoAlternateOutlined from "@mui/icons-material/AddPhotoAlternateOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useLocation, useNavigate, useParams } from "react-router";
import { useSnackbar } from "notistack";

import { usePageTitle } from "../hooks/usePageTitle";
import { useHotelProperty } from "./useHotelProperty";
import { HotelPropertyMissing } from "./HotelPropertyMissing";
import {
  getHotelCatalogs,
  listRoomTypes,
  listRooms,
  createRoom,
  updateRoom,
  uploadRoomPhoto,
  deleteRoomPhoto,
  type HotelRoom,
  type HotelRoomType,
  type HotelRoomUpdateData,
  type HotelRoomZone,
  type HotelRoomPhoto,
} from "../api/hotel";
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
  area: string;
  ceilingHeight: string;
  windowSide: string;
  view: string;
  isCorner: boolean;
  bathrooms: string;
  roomsCount: string;
  layoutDescription: string;
  hasTerrace: boolean;
  terraceArea: string;
  /** Экспликация помещений — именованные зоны с площадью, см. HotelRoomZone. */
  zones: ZoneFormRow[];
}

/** Строка формы для одной зоны — числа как строки, как у остальных полей формы. */
interface ZoneFormRow {
  name: string;
  area: string;
  width: string;
  length: string;
}

const EMPTY_FORM: Omit<RoomFormState, "roomTypeId"> = {
  number: "",
  floor: "",
  meals: [],
  note: "",
  onSale: true,
  area: "",
  ceilingHeight: "",
  windowSide: "",
  view: "",
  isCorner: false,
  bathrooms: "",
  roomsCount: "",
  layoutDescription: "",
  hasTerrace: false,
  terraceArea: "",
  zones: [],
};

/**
 * «Доп. характеристики» по умолчанию для категории (см. HotelRoomCategoryFormPage.tsx) —
 * подставляются при выборе категории у НОВОГО номера, чтобы при заведении сразу
 * нескольких номеров одной категории не перезабивать одно и то же. У уже
 * существующего номера (правка) значения свои, дефолты категории их не трогают.
 */
function categoryDefaults(cat: HotelRoomType | undefined): Pick<RoomFormState, "meals" | "area" | "ceilingHeight" | "windowSide" | "isCorner" | "bathrooms" | "roomsCount" | "layoutDescription"> {
  return {
    meals: cat?.defaultMealOptions ?? [],
    area: cat?.defaultArea ?? "",
    ceilingHeight: cat?.defaultCeilingHeight ?? "",
    windowSide: cat?.defaultWindowSide ?? "",
    isCorner: cat?.defaultIsCorner ?? false,
    bathrooms: cat?.defaultBathrooms != null ? String(cat.defaultBathrooms) : "",
    roomsCount: cat?.defaultRoomsCount != null ? String(cat.defaultRoomsCount) : "",
    layoutDescription: cat?.defaultLayoutDescription ?? "",
  };
}

function emptyForm(roomTypes: HotelRoomType[]): RoomFormState {
  const firstType = roomTypes[0];
  return { ...EMPTY_FORM, ...categoryDefaults(firstType), roomTypeId: firstType?.id ?? "" };
}

function toForm(room: HotelRoom): RoomFormState {
  return {
    roomTypeId: room.roomTypeId,
    number: room.number,
    floor: room.floor ?? "",
    meals: room.mealOptions,
    note: room.note ?? "",
    onSale: room.status !== "out_of_service",
    area: room.area ?? "",
    ceilingHeight: room.ceilingHeight ?? "",
    windowSide: room.windowSide ?? "",
    view: room.view ?? "",
    isCorner: room.isCorner ?? false,
    bathrooms: room.bathrooms != null ? String(room.bathrooms) : "",
    roomsCount: room.roomsCount != null ? String(room.roomsCount) : "",
    layoutDescription: room.layoutDescription ?? "",
    hasTerrace: room.hasTerrace ?? false,
    terraceArea: room.terraceArea ?? "",
    zones: (room.roomZones ?? []).map((z) => ({
      name: z.name,
      area: z.area,
      width: z.width ?? "",
      length: z.length ?? "",
    })),
  };
}

/** Название обязательно на бэке (1–120 символов) — строку без него не отправляем, черновик недописанной зоны. */
function buildZonesPayload(zones: ZoneFormRow[]): HotelRoomZone[] {
  return zones
    .filter((z) => z.name.trim() !== "")
    .map((z) => ({
      name: z.name.trim().slice(0, 120),
      area: z.area.trim(),
      width: z.width.trim() || null,
      length: z.length.trim() || null,
    }));
}

/**
 * Правила полей номера: что можно набрать и какие значения разумны. Этаж —
 * целое (цокольный до −5), площади и высоты — числа с точкой, текст — с
 * ограничением длины. Те же правила проверяют «Сохранить» (hasFieldErrors).
 */
const ROOM_RULES = {
  number: {
    required: true,
    maxLength: 10,
    validate: (v: string) => (/^[\p{L}\d/-]+$/u.test(v) ? null : "Только буквы, цифры, «-» и «/»"),
  },
  floor: { kind: "int", min: -5, max: 200 },
  area: { kind: "decimal", min: 1, max: 2000 },
  ceilingHeight: { kind: "decimal", min: 1.8, max: 15 },
  bathrooms: { kind: "int", min: 0, max: 20 },
  roomsCount: { kind: "int", min: 0, max: 50 },
  windowSide: { maxLength: 60 },
  view: { maxLength: 100 },
  terraceArea: { kind: "decimal", min: 0.5, max: 1000 },
  note: { maxLength: 1000 },
  layoutDescription: { maxLength: 2000 },
  zoneName: { maxLength: 60 },
  zoneArea: { kind: "decimal", min: 0.1, max: 1000, maxDecimals: 1 },
  zoneSide: { kind: "decimal", min: 0.1, max: 100, maxDecimals: 1 },
} satisfies Record<string, FieldRules>;

interface RoomFormProps {
  propertyId: number;
  /** null — создание нового номера, иначе правящийся. */
  editing: HotelRoom | null;
  roomTypes: HotelRoomType[];
  mealChoices: { value: string; label: string }[];
  backPath: string;
  /** Форма стала «грязной»/чистой — страница держит защиту от ухода. */
  onDirtyChange: (dirty: boolean) => void;
  /** Уйти на path с подтверждением, если есть несохранённые правки. */
  onLeave: (path: string) => void;
}

/** Сама форма: монтируется, когда данные уже загружены, поэтому состояние берётся без эффекта. */
const RoomForm: React.FC<RoomFormProps> = ({ propertyId, editing, roomTypes, mealChoices, backPath, onDirtyChange, onLeave }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [form, setForm] = React.useState<RoomFormState>(() => (editing ? toForm(editing) : emptyForm(roomTypes)));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // После первой попытки сохранить показываем ошибки всех полей, даже не тронутых.
  const [showErrors, setShowErrors] = React.useState(false);
  // Удаление — только отсюда, из карточки номера (на плитке «Номеров» его нет).
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const patchForm = (patch: Partial<RoomFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  // Фото номера — независимо от остальной формы: сразу грузятся/удаляются на
  // сервер (нет черновика/кнопки «Сохранить» для них). Доступно только у уже
  // созданного номера (нужен roomId) — см. секцию «Фото номера» в разметке.
  const [photos, setPhotos] = React.useState<HotelRoomPhoto[]>(editing?.photos ?? []);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const photoInputRef = React.useRef<HTMLInputElement | null>(null);
  const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

  const handlePhotoUpload = async (file: File | undefined) => {
    if (!file || !editing) return;
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError("Файл больше 10 МБ");
      return;
    }
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const photo = await uploadRoomPhoto(editing.id, file);
      setPhotos((prev) => [...prev, photo]);
      void queryClient.invalidateQueries({ queryKey: ["hotel", "rooms", propertyId] });
    } catch (err) {
      setPhotoError(getErrorMessage(err, "Не удалось загрузить фото"));
    } finally {
      setPhotoBusy(false);
    }
  };

  const handlePhotoDelete = async (photoId: number) => {
    if (!editing) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      await deleteRoomPhoto(editing.id, photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      void queryClient.invalidateQueries({ queryKey: ["hotel", "rooms", propertyId] });
    } catch (err) {
      setPhotoError(getErrorMessage(err, "Не удалось удалить фото"));
    } finally {
      setPhotoBusy(false);
    }
  };

  // Снимок при открытии: «грязная» форма — та, что от него отличается.
  const initial = React.useRef(editing ? toForm(editing) : emptyForm(roomTypes)).current;
  const isDirty =
    form.roomTypeId !== initial.roomTypeId ||
    form.number !== initial.number ||
    form.floor !== initial.floor ||
    form.note !== initial.note ||
    form.onSale !== initial.onSale ||
    form.area !== initial.area ||
    form.ceilingHeight !== initial.ceilingHeight ||
    form.windowSide !== initial.windowSide ||
    form.view !== initial.view ||
    form.isCorner !== initial.isCorner ||
    form.bathrooms !== initial.bathrooms ||
    form.roomsCount !== initial.roomsCount ||
    form.layoutDescription !== initial.layoutDescription ||
    form.hasTerrace !== initial.hasTerrace ||
    form.terraceArea !== initial.terraceArea ||
    JSON.stringify(form.zones) !== JSON.stringify(initial.zones) ||
    form.meals.length !== initial.meals.length ||
    form.meals.some((m) => !initial.meals.includes(m));
  React.useEffect(() => {
    onDirtyChange(isDirty);
    return () => onDirtyChange(false);
  }, [isDirty, onDirtyChange]);
  // Закрытие вкладки и F5 с несохранёнными правками — предупреждение браузера.
  React.useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const invalidateAfterSave = () => {
    // Номер виден в списке «Номера», в шахматке, в карточке номера и в счётчиках категорий.
    void queryClient.invalidateQueries({ queryKey: ["hotel", "rooms", propertyId] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "roomTypes", propertyId] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "calendar"] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "room-availability"] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "dashboard"] });
  };

  const fieldsInvalid = hasFieldErrors([
    [form.number, ROOM_RULES.number],
    [form.floor, ROOM_RULES.floor],
    [form.area, ROOM_RULES.area],
    [form.ceilingHeight, ROOM_RULES.ceilingHeight],
    [form.bathrooms, ROOM_RULES.bathrooms],
    [form.roomsCount, ROOM_RULES.roomsCount],
    [form.windowSide, ROOM_RULES.windowSide],
    [form.view, ROOM_RULES.view],
    [form.hasTerrace ? form.terraceArea : "", ROOM_RULES.terraceArea],
    [form.note, ROOM_RULES.note],
    [form.layoutDescription, ROOM_RULES.layoutDescription],
    ...form.zones.flatMap((z): Array<[string, FieldRules]> => [
      [z.name, ROOM_RULES.zoneName],
      [z.area, ROOM_RULES.zoneArea],
      [z.width, ROOM_RULES.zoneSide],
      [z.length, ROOM_RULES.zoneSide],
    ]),
  ]);

  const submit = async () => {
    const number = form.number.trim();
    if (form.roomTypeId === "") {
      setError("Выберите категорию");
      return;
    }
    if (fieldsInvalid) {
      setShowErrors(true);
      setError("Проверьте поля, отмеченные красным");
      focusFirstFieldError();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const patch: HotelRoomUpdateData = {
          roomTypeId: form.roomTypeId,
          number,
          floor: form.floor.trim(),
          mealOptions: form.meals,
          note: form.note.trim(),
          status: form.onSale ? "active" : "out_of_service",
          windowSide: form.windowSide.trim(),
          view: form.view.trim(),
          isCorner: form.isCorner,
          layoutDescription: form.layoutDescription.trim(),
          hasTerrace: form.hasTerrace,
          roomZones: buildZonesPayload(form.zones),
        };
        // area/ceilingHeight/bathrooms/roomsCount/terraceArea: null в PATCH значит
        // «не прислали» — очистка идёт отдельным флагом, только если поле реально было заполнено.
        const area = form.area.trim();
        if (area) patch.area = area;
        else if (initial.area.trim()) patch.clearArea = true;
        const ceilingHeight = form.ceilingHeight.trim();
        if (ceilingHeight) patch.ceilingHeight = ceilingHeight;
        else if (initial.ceilingHeight.trim()) patch.clearCeilingHeight = true;
        const bathrooms = form.bathrooms.trim();
        if (bathrooms) patch.bathrooms = Number(bathrooms);
        else if (initial.bathrooms.trim()) patch.clearBathrooms = true;
        const roomsCount = form.roomsCount.trim();
        if (roomsCount) patch.roomsCount = Number(roomsCount);
        else if (initial.roomsCount.trim()) patch.clearRoomsCount = true;
        const terraceArea = form.terraceArea.trim();
        if (terraceArea) patch.terraceArea = terraceArea;
        else if (initial.terraceArea.trim()) patch.clearTerraceArea = true;

        await updateRoom(editing.id, patch);
        invalidateAfterSave();
        enqueueSnackbar(`Номер ${number} сохранён`, { variant: "success" });
      } else {
        await createRoom({
          propertyId,
          roomTypeId: form.roomTypeId,
          number,
          floor: form.floor.trim() || undefined,
          mealOptions: form.meals,
          note: form.note.trim() || undefined,
          area: form.area.trim() || undefined,
          ceilingHeight: form.ceilingHeight.trim() || undefined,
          windowSide: form.windowSide.trim() || undefined,
          view: form.view.trim() || undefined,
          isCorner: form.isCorner || undefined,
          bathrooms: form.bathrooms.trim() ? Number(form.bathrooms) : undefined,
          roomsCount: form.roomsCount.trim() ? Number(form.roomsCount) : undefined,
          layoutDescription: form.layoutDescription.trim() || undefined,
          hasTerrace: form.hasTerrace || undefined,
          terraceArea: form.terraceArea.trim() || undefined,
          roomZones: buildZonesPayload(form.zones),
        });
        invalidateAfterSave();
        enqueueSnackbar(`Номер ${number} добавлен`, { variant: "success" });
      }
      navigate(backPath);
    } catch (err) {
      setError(getErrorMessage(err, editing ? "Не удалось сохранить номер" : "Не удалось добавить номер"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 340px" }, gap: 3, alignItems: "start" }}>
    <Stack gap={2.5} sx={{ minWidth: 0 }}>
      <FormCard>
        <Stack gap={2}>
          <Typography variant="subtitle2" fontWeight={600}>
            Основное
          </Typography>
          <FormField
            select
            icon={<CategoryOutlined />}
            label="Категория"
            required
            value={form.roomTypeId === "" ? "" : String(form.roomTypeId)}
            showErrors={showErrors}
            onValueChange={(value) => {
              const id = Number(value);
              // Дефолты категории подставляем только у нового номера: у уже
              // существующего (правка) его «Доп. характеристики» — свои,
              // смена категории их переписывать не должна.
              if (editing) patchForm({ roomTypeId: id });
              else patchForm({ roomTypeId: id, ...categoryDefaults(roomTypes.find((rt) => rt.id === id)) });
            }}
            disabled={saving}
            fullWidth
          >
            {roomTypes.map((cat) => (
              <MenuItem key={cat.id} value={String(cat.id)}>
                {cat.name}
              </MenuItem>
            ))}
          </FormField>
          <Stack direction="row" flexWrap="wrap" gap={2}>
            <FormField
              icon={<MeetingRoomOutlined />}
              label="Номер"
              placeholder={editing ? undefined : "Например, 205"}
              value={form.number}
              rules={ROOM_RULES.number}
              showErrors={showErrors}
              onValueChange={(number) => {
                patchForm({ number });
                setError(null);
              }}
              autoFocus={!editing}
              disabled={saving}
              sx={{ flex: "1 1 200px" }}
            />
            <FormField
              icon={<StairsOutlined />}
              label="Этаж"
              placeholder="Например, 2"
              value={form.floor}
              rules={ROOM_RULES.floor}
              showErrors={showErrors}
              onValueChange={(floor) => patchForm({ floor })}
              helperText="Цифрами; цокольный — со знаком минус"
              disabled={saving}
              sx={{ flex: "1 1 160px" }}
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
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start" sx={{ color: "text.disabled", "& svg": { fontSize: 20 } }}>
                    <RestaurantOutlined />
                  </InputAdornment>
                ),
              },
            }}
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
          <FormField
            icon={<NotesOutlined />}
            label="Примечание"
            value={form.note}
            rules={ROOM_RULES.note}
            showErrors={showErrors}
            onValueChange={(note) => patchForm({ note })}
            disabled={saving}
            multiline
            minRows={2}
            fullWidth
          />
        </Stack>
      </FormCard>

      <FormCard>
        <Stack gap={2}>
          <Typography variant="subtitle2" fontWeight={600}>
            Доп. характеристики
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Необязательно — только для этого конкретного номера, поверх общих характеристик категории.
            {!editing && " Поля ниже подставлены по умолчанию для выбранной категории — поменяйте, что отличается у этого номера."}
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={2}>
            <FormField
              icon={<SquareFootOutlined />}
              label="Площадь"
              value={form.area}
              rules={ROOM_RULES.area}
              showErrors={showErrors}
              onValueChange={(area) => patchForm({ area })}
              unit="м²"
              disabled={saving}
              sx={{ flex: "1 1 170px" }}
            />
            <FormField
              icon={<HeightOutlined />}
              label="Высота потолков"
              value={form.ceilingHeight}
              rules={ROOM_RULES.ceilingHeight}
              showErrors={showErrors}
              onValueChange={(ceilingHeight) => patchForm({ ceilingHeight })}
              unit="м"
              disabled={saving}
              sx={{ flex: "1 1 190px" }}
            />
            <FormField
              icon={<BathtubOutlined />}
              label="Санузлов"
              value={form.bathrooms}
              rules={ROOM_RULES.bathrooms}
              showErrors={showErrors}
              onValueChange={(bathrooms) => patchForm({ bathrooms })}
              disabled={saving}
              sx={{ flex: "1 1 140px" }}
            />
            <FormField
              icon={<BedOutlined />}
              label="Жилых комнат"
              value={form.roomsCount}
              rules={ROOM_RULES.roomsCount}
              showErrors={showErrors}
              onValueChange={(roomsCount) => patchForm({ roomsCount })}
              disabled={saving}
              sx={{ flex: "1 1 150px" }}
            />
          </Stack>
          <Stack direction="row" flexWrap="wrap" gap={2}>
            <FormField
              icon={<ExploreOutlined />}
              label="Сторона света"
              placeholder="Юг, Северо-Восток…"
              value={form.windowSide}
              rules={ROOM_RULES.windowSide}
              showErrors={showErrors}
              onValueChange={(windowSide) => patchForm({ windowSide })}
              disabled={saving}
              sx={{ flex: "1 1 200px" }}
            />
            <FormField
              icon={<LandscapeOutlined />}
              label="Вид из окна этого номера"
              placeholder="Двор, Улица, Горы…"
              helperText="Если отличается от вида категории"
              value={form.view}
              rules={ROOM_RULES.view}
              showErrors={showErrors}
              onValueChange={(view) => patchForm({ view })}
              disabled={saving}
              sx={{ flex: "1 1 220px" }}
            />
          </Stack>
          <Stack direction="row" flexWrap="wrap" alignItems="center" gap={2}>
            <FormControlLabel
              control={<Checkbox checked={form.isCorner} onChange={(e) => patchForm({ isCorner: e.target.checked })} disabled={saving} />}
              label="Угловой номер"
            />
            <FormControlLabel
              control={<Checkbox checked={form.hasTerrace} onChange={(e) => patchForm({ hasTerrace: e.target.checked })} disabled={saving} />}
              label="Есть терраса/лоджия"
            />
            {form.hasTerrace && (
              <FormField
                icon={<DeckOutlined />}
                label="Площадь террасы"
                unit="м²"
                value={form.terraceArea}
                rules={ROOM_RULES.terraceArea}
                showErrors={showErrors}
                onValueChange={(terraceArea) => patchForm({ terraceArea })}
                disabled={saving}
                size="small"
                sx={{ flex: "1 1 200px" }}
              />
            )}
          </Stack>
          <FormField
            icon={<ArchitectureOutlined />}
            label="Описание планировки"
            placeholder="Необязательно"
            value={form.layoutDescription}
            rules={ROOM_RULES.layoutDescription}
            showErrors={showErrors}
            onValueChange={(layoutDescription) => patchForm({ layoutDescription })}
            disabled={saving}
            multiline
            minRows={2}
            fullWidth
          />
        </Stack>
      </FormCard>

      <FormCard>
        <Stack gap={1.5}>
          <Typography variant="subtitle2" fontWeight={600}>
            Экспликация помещений
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Необязательно — если у номера несколько помещений (гостиная, спальня и т.п.), распишите их по
            отдельности с площадью, как в плане БТИ.
          </Typography>
          {form.zones.length > 0 && (
            <Stack gap={1.5}>
              {form.zones.map((zone, i) => (
                <Stack key={i} direction="row" flexWrap="wrap" gap={1.5} alignItems="flex-start">
                  <FormField
                    icon={<DoorFrontOutlined />}
                    label="Помещение"
                    placeholder="Кухня-гостиная"
                    value={zone.name}
                    rules={ROOM_RULES.zoneName}
                    showErrors={showErrors}
                    onValueChange={(name) => {
                      const zones = [...form.zones];
                      zones[i] = { ...zones[i], name };
                      patchForm({ zones });
                    }}
                    error={zone.name.trim() === "" && (zone.area.trim() !== "" || zone.width.trim() !== "" || zone.length.trim() !== "")}
                    helperText={
                      zone.name.trim() === "" && (zone.area.trim() !== "" || zone.width.trim() !== "" || zone.length.trim() !== "")
                        ? "Без названия строка не сохранится"
                        : undefined
                    }
                    disabled={saving}
                    size="small"
                    sx={{ flex: "2 1 220px" }}
                  />
                  <FormField
                    icon={<SquareFootOutlined />}
                    label="Площадь"
                    unit="м²"
                    value={zone.area}
                    rules={ROOM_RULES.zoneArea}
                    showErrors={showErrors}
                    onValueChange={(area) => {
                      const zones = [...form.zones];
                      zones[i] = { ...zones[i], area };
                      patchForm({ zones });
                    }}
                    disabled={saving}
                    size="small"
                    sx={{ flex: "1 1 120px" }}
                  />
                  <FormField
                    icon={<StraightenOutlined />}
                    label="Ширина"
                    unit="м"
                    value={zone.width}
                    rules={ROOM_RULES.zoneSide}
                    showErrors={showErrors}
                    onValueChange={(width) => {
                      const zones = [...form.zones];
                      zones[i] = { ...zones[i], width };
                      patchForm({ zones });
                    }}
                    disabled={saving}
                    size="small"
                    sx={{ flex: "1 1 110px" }}
                  />
                  <FormField
                    icon={<StraightenOutlined />}
                    label="Длина"
                    unit="м"
                    value={zone.length}
                    rules={ROOM_RULES.zoneSide}
                    showErrors={showErrors}
                    onValueChange={(length) => {
                      const zones = [...form.zones];
                      zones[i] = { ...zones[i], length };
                      patchForm({ zones });
                    }}
                    disabled={saving}
                    size="small"
                    sx={{ flex: "1 1 110px" }}
                  />
                  <IconButton
                    aria-label="Удалить помещение"
                    size="small"
                    disabled={saving}
                    onClick={() => patchForm({ zones: form.zones.filter((_, j) => j !== i) })}
                    sx={{ mt: 0.5 }}
                  >
                    <DeleteOutlineOutlined fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
            </Stack>
          )}
          <Button
            size="small"
            startIcon={<AddOutlined fontSize="small" />}
            disabled={saving}
            onClick={() => patchForm({ zones: [...form.zones, { name: "", area: "", width: "", length: "" }] })}
            sx={{ alignSelf: "flex-start" }}
          >
            Добавить помещение
          </Button>
        </Stack>
      </FormCard>

      <FormCard>
        <Stack gap={1.5}>
          <Typography variant="subtitle2" fontWeight={600}>
            Фото номера
          </Typography>
          {!editing ? (
            <Typography variant="body2" color="text.secondary">
              Фото можно добавить после создания номера — сначала «Добавить», затем вернитесь сюда.
            </Typography>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary">
                Необязательно — JPG, PNG, WebP или HEIC до 10 МБ. Грузится и удаляется сразу, без кнопки «Сохранить».
              </Typography>
              {photos.length > 0 && (
                <Stack direction="row" flexWrap="wrap" gap={1.5}>
                  {photos.map((p) => (
                    <Box key={p.id} sx={{ position: "relative", width: 120, height: 90 }}>
                      <Box
                        component="img"
                        src={p.url}
                        alt=""
                        sx={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }}
                      />
                      <IconButton
                        aria-label="Удалить фото"
                        size="small"
                        disabled={photoBusy}
                        onClick={() => void handlePhotoDelete(p.id)}
                        sx={{
                          position: "absolute",
                          top: 2,
                          right: 2,
                          bgcolor: "rgba(0,0,0,0.55)",
                          color: "#fff",
                          "&:hover": { bgcolor: "rgba(0,0,0,0.75)" },
                        }}
                      >
                        <DeleteOutlineOutlined fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                </Stack>
              )}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                hidden
                onChange={(e) => {
                  void handlePhotoUpload(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button
                size="small"
                startIcon={<AddPhotoAlternateOutlined fontSize="small" />}
                disabled={photoBusy}
                onClick={() => photoInputRef.current?.click()}
                sx={{ alignSelf: "flex-start" }}
              >
                {photoBusy ? "Загружаем…" : "Добавить фото"}
              </Button>
              {photoError && (
                <Alert severity="warning" variant="outlined" sx={{ fontSize: "0.8rem" }} onClose={() => setPhotoError(null)}>
                  {photoError}
                </Alert>
              )}
            </>
          )}
        </Stack>
      </FormCard>

      {editing && (
        <FormCard>
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
              <RoomStateControl roomId={editing.id} state={editing.state} />
              <Typography variant="caption" color="text.secondary">
                Убрано, грязно, проверено или ремонт. Меняется сразу, без кнопки «Сохранить».
              </Typography>
            </Stack>
          </Stack>
        </FormCard>
      )}

      {error && (
        <Alert severity="error" variant="outlined" sx={{ fontSize: "0.8rem" }}>
          {error}
        </Alert>
      )}

      <StickyActions>
        {editing && (
          <Button
            color="error"
            startIcon={<DeleteOutlineOutlined />}
            disabled={saving}
            onClick={() => setDeleteOpen(true)}
            sx={{ mr: isDirty ? 1 : "auto" }}
          >
            Удалить номер
          </Button>
        )}
        {isDirty && (
          <Typography variant="caption" color="text.secondary" sx={{ mr: "auto" }}>
            Есть несохранённые изменения
          </Typography>
        )}
        <Button
          component={RouterLink}
          to={backPath}
          disabled={saving}
          onClick={(e: React.MouseEvent) => {
            if (isDirty) {
              e.preventDefault();
              onLeave(backPath);
            }
          }}
        >
          Отмена
        </Button>
        <Button
          variant="contained"
          disableElevation
          disabled={saving}
          onClick={() => void submit()}
          sx={{ px: 3 }}
        >
          {saving ? "Сохраняем…" : editing ? "Сохранить" : "Добавить номер"}
        </Button>
      </StickyActions>
      <RoomDeleteDialog
        room={deleteOpen ? editing : null}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          // Номера больше нет — правки сохранять некуда, уходим к списку без вопроса.
          onDirtyChange(false);
          navigate(backPath);
        }}
      />
    </Stack>
    <RoomPreview form={form} category={roomTypes.find((rt) => rt.id === form.roomTypeId)} mealChoices={mealChoices} />
    </Box>
  );
};

/**
 * Живое превью справа — как номер будет выглядеть в карточке номера на
 * шахматке: номер, категория и цена, вместимость и заполненные характеристики.
 */
const RoomPreview: React.FC<{ form: RoomFormState; category: HotelRoomType | undefined; mealChoices: { value: string; label: string }[] }> = ({
  form,
  category,
  mealChoices,
}) => {
  const theme = useTheme();
  const line = `1px solid ${subtleBorder(theme)}`;
  const rows: [string, string][] = [];
  if (form.floor.trim()) rows.push(["Этаж", form.floor.trim()]);
  if (form.area.trim()) rows.push(["Площадь", `${form.area.trim()} м²`]);
  if (form.roomsCount.trim()) rows.push(["Комнат", form.roomsCount.trim()]);
  if (form.bathrooms.trim()) rows.push(["Санузлов", form.bathrooms.trim()]);
  if (form.ceilingHeight.trim()) rows.push(["Потолки", `${form.ceilingHeight.trim()} м`]);
  const view = form.view.trim() || category?.view;
  if (view) rows.push(["Вид из окна", view]);
  if (form.windowSide.trim()) rows.push(["Окна выходят", form.windowSide.trim()]);
  if (form.hasTerrace) rows.push(["Терраса", form.terraceArea.trim() ? `${form.terraceArea.trim()} м²` : "есть"]);
  if (form.isCorner) rows.push(["Расположение", "угловой"]);
  if (form.meals.length > 0) rows.push(["Питание", form.meals.map((m) => mealChoices.find((c) => c.value === m)?.label ?? m).join(", ")]);
  return (
    <Box sx={{ position: { lg: "sticky" }, top: 24, display: { xs: "none", lg: "block" } }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary", mb: 1.25 }}>
        Карточка номера
      </Typography>
      <Box sx={{ p: 2.5, borderRadius: "14px", border: `1px solid ${theme.palette.divider}`, bgcolor: "background.paper" }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }} noWrap>
          {category?.name ?? "Категория не выбрана"}
        </Typography>
        <Stack direction="row" alignItems="flex-end" justifyContent="space-between" gap={1.5} sx={{ mt: 0.5 }}>
          <Typography sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.015em", textDecoration: form.onSale ? "none" : "line-through" }} noWrap>
            Номер {form.number.trim() || "—"}
          </Typography>
          {category && (
            <Box sx={{ textAlign: "right", flexShrink: 0 }}>
              <Typography sx={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
                {Number(category.totalPrice).toLocaleString("ru-RU")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                сом / ночь
              </Typography>
            </Box>
          )}
        </Stack>
        {category && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            до {category.adultsCapacity} взр.{category.childrenCapacity > 0 ? ` + ${category.childrenCapacity} дет.` : ""}
            {!form.onSale ? " · снят с продажи" : ""}
          </Typography>
        )}

        <Box sx={{ mt: 2, pt: 0.5, borderTop: line }}>
          {rows.length === 0 ? (
            <Typography variant="caption" color="text.disabled" sx={{ display: "block", pt: 1.5 }}>
              Характеристики появятся здесь по мере заполнения
            </Typography>
          ) : (
            rows.map(([label, value], i) => (
              <Stack key={label} direction="row" justifyContent="space-between" gap={2} sx={{ py: 0.9, borderTop: i === 0 ? "none" : line }}>
                <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
                  {label}
                </Typography>
                <Typography variant="body2" fontWeight={600} sx={{ textAlign: "right", minWidth: 0 }}>
                  {value}
                </Typography>
              </Stack>
            ))
          )}
        </Box>
      </Box>
    </Box>
  );
};

export const HotelRoomFormPage: React.FC = () => {
  const { roomId } = useParams();
  const isEdit = roomId != null;
  usePageTitle(isEdit ? "Номер" : "Новый номер");
  const location = useLocation();
  const { property, isLoading: propertyLoading } = useHotelProperty();
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
  const roomTypes = roomTypesQuery.data ?? [];
  const roomsQuery = useQuery({
    queryKey: ["hotel", "rooms", property?.id],
    queryFn: ({ signal }) => listRooms({ propertyId: property!.id }, signal),
    enabled: property != null && isEdit,
  });

  const room = isEdit ? (roomsQuery.data ?? []).find((r) => String(r.id) === roomId) ?? null : null;
  const loading = propertyLoading || catalogsQuery.isLoading || roomTypesQuery.isLoading || (isEdit && roomsQuery.isLoading);
  // Ошибку загрузки не выдаём за «Номер не найден»: при сбое сети это ввело бы в заблуждение.
  const loadError = catalogsQuery.isError || roomTypesQuery.isError || (isEdit && roomsQuery.isError);
  const retryLoad = () => {
    void catalogsQuery.refetch();
    void roomTypesQuery.refetch();
    if (isEdit) void roomsQuery.refetch();
  };

  // Защита от потери правок: форма сообщает, что она «грязная»; «Назад»/«Отмена» тогда
  // не уходят сразу, а спрашивают (leaveTo — куда человек собирался).
  const navigate = useNavigate();
  const [dirty, setDirty] = React.useState(false);
  const [leaveTo, setLeaveTo] = React.useState<string | null>(null);

  return (
    <HotelPage maxWidth={1180}>
        <HotelPageHeader
          leading={
            <Tooltip title="Назад">
              <IconButton
                component={RouterLink}
                to={backPath}
                aria-label="Назад"
                sx={{ ml: -1, mr: 0.5 }}
                onClick={(e: React.MouseEvent) => {
                  if (dirty) {
                    e.preventDefault();
                    setLeaveTo(backPath);
                  }
                }}
              >
                <ArrowBackOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          }
          title={isEdit ? (room ? `Номер ${room.number}` : "Номер") : "Новый номер"}
          subtitle={
            isEdit
              ? room
                ? [room.roomTypeName, room.floor && `${room.floor} этаж`, room.status === "out_of_service" ? "снят с продажи" : null].filter(Boolean).join(" · ")
                : undefined
              : "Номер сразу появится в шахматке и в форме брони"
          }
        />

        {loading ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : !property ? (
          <HotelPropertyMissing />
        ) : loadError ? (
          <Alert
            severity="error"
            variant="outlined"
            action={
              <Button color="inherit" size="small" onClick={retryLoad}>
                Повторить
              </Button>
            }
          >
            Не удалось загрузить номер.
          </Alert>
        ) : isEdit && !room ? (
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
        ) : !isEdit && roomTypes.length === 0 ? (
          <Alert
            severity="warning"
            variant="outlined"
            action={
              <Button color="inherit" size="small" component={RouterLink} to="/room-categories">
                К категориям
              </Button>
            }
          >
            Категорий пока нет — сначала заведите их в разделе «Категории и тарифы», затем добавляйте номера.
          </Alert>
        ) : (
          <RoomForm
            key={room?.id ?? "new"}
            propertyId={property.id}
            editing={room}
            roomTypes={roomTypes}
            mealChoices={catalogsQuery.data?.mealOptions ?? []}
            backPath={backPath}
            onDirtyChange={setDirty}
            onLeave={setLeaveTo}
          />
        )}

      <Dialog open={leaveTo != null} onClose={() => setLeaveTo(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Выйти без сохранения?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {isEdit
              ? "Изменения номера, которые вы не сохранили, будут потеряны. Состояние номера уже применено и не откатится."
              : "Новый номер не будет создан."}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button autoFocus onClick={() => setLeaveTo(null)}>
            Остаться
          </Button>
          <Button
            color="error"
            onClick={() => {
              const path = leaveTo;
              setLeaveTo(null);
              if (path) navigate(path);
            }}
          >
            Выйти без сохранения
          </Button>
        </DialogActions>
      </Dialog>
    </HotelPage>
  );
};

export default HotelRoomFormPage;
