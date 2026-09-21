/**
 * «Настройки» → «Категории и тарифы» → «Новая категория» / «Изменить» — форма
 * категории (тарифа) номеров на отдельной странице, а не диалогом. Маршруты
 * /settings/room-categories/new (создание) и /settings/room-categories/:categoryId
 * (правка) ведут на эту же страницу, гейт hotel.manage (см. App.tsx,
 * accessPermissions.ts). Список категорий — HotelRoomCategoriesSettingsPage.tsx,
 * после сохранения возвращаемся на него.
 *
 * Реальный бэкенд (src/api/hotel.ts): создание/правка — POST/PATCH
 * /hotel/room-types/, характеристики — GET/POST/PATCH
 * /hotel/catalogs/amenities/ (см. hotel-viva-frontend-api.md §4.2, §6).
 * totalPrice считает бэкенд (basePrice + Σ extraPrice отмеченных
 * характеристик); здесь — только живое «Итого» до сохранения.
 *
 * Характеристики категории — чекбоксы по группам из справочника ОБЪЕКТА
 * (catalogs.amenities, не платформы, см. hotel-viva-frontend-api.md §3) —
 * тот же принцип, что роль собирает права из общего RBAC-каталога в реальной
 * RolesSettingsPage.tsx. Справочник не фиксирован: прямо в форме можно завести
 * новую характеристику со своей наценкой (createAmenity) — она появится у всех
 * категорий объекта и сразу отметится у текущей; наценка уже существующей
 * правится там же (updateAmenity, коммитится по onBlur, не на каждый символ —
 * это настоящий PATCH, а не запись в localStorage).
 */
import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate, useParams } from "react-router";

import { usePageTitle } from "../hooks/usePageTitle";
import { SettingsLayout } from "../pages/settings/SettingsLayout";
import { useHotelProperty } from "./useHotelProperty";
import {
  getHotelCatalogs,
  listRoomTypes,
  createRoomType,
  updateRoomType,
  createAmenity,
  updateAmenity,
  type HotelAmenity,
  type HotelRoomType,
} from "../api/hotel";
import { getErrorMessage } from "../api/client";

const LIST_PATH = "/settings/room-categories";

interface CategoryFormState {
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

const EMPTY_FORM: CategoryFormState = {
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
};

function toForm(cat: HotelRoomType): CategoryFormState {
  return {
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
  };
}

interface CategoryFormProps {
  propertyId: number;
  /** null — создание новой категории, иначе правящаяся. */
  editing: HotelRoomType | null;
  amenitiesCatalog: HotelAmenity[];
}

/**
 * Сама форма. Монтируется только когда данные уже загружены (см. страницу ниже),
 * поэтому начальное состояние берётся прямо из editing, без эффекта-заполнения.
 */
const CategoryForm: React.FC<CategoryFormProps> = ({ propertyId, editing, amenitiesCatalog }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const amenityGroups = [...new Set(amenitiesCatalog.map((a) => a.group).filter(Boolean))];

  const [form, setForm] = React.useState<CategoryFormState>(() => (editing ? toForm(editing) : EMPTY_FORM));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const patchForm = (patch: Partial<CategoryFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  // Новая характеристика — заводится прямо в форме (createAmenity кладёт её в
  // справочник объекта) и сразу отмечается у текущей категории.
  const [newCharLabel, setNewCharLabel] = React.useState("");
  const [newCharGroup, setNewCharGroup] = React.useState("");
  const [newCharPrice, setNewCharPrice] = React.useState("");
  const [newCharSaving, setNewCharSaving] = React.useState(false);
  const [newCharError, setNewCharError] = React.useState<string | null>(null);

  // Наценка уже существующей характеристики — черновик до onBlur, чтобы не
  // слать PATCH на каждый символ (это настоящий запрос, не localStorage).
  const [amenityPriceDrafts, setAmenityPriceDrafts] = React.useState<Record<number, string>>({});

  const invalidateRoomTypes = () => void queryClient.invalidateQueries({ queryKey: ["hotel", "roomTypes", propertyId] });
  const invalidateCatalogs = () => void queryClient.invalidateQueries({ queryKey: ["hotel", "catalogs", propertyId] });

  const submitNewAmenity = async () => {
    const trimmed = newCharLabel.trim();
    if (!trimmed) {
      setNewCharError("Введите название характеристики");
      return;
    }
    setNewCharSaving(true);
    setNewCharError(null);
    try {
      const created = await createAmenity({
        propertyId,
        label: trimmed,
        group: newCharGroup.trim() || undefined,
        extraPrice: newCharPrice ? String(Number(newCharPrice) || 0) : undefined,
      });
      invalidateCatalogs();
      setForm((prev) => ({ ...prev, amenities: new Set([...prev.amenities, created.key]) }));
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
      setError(getErrorMessage(err, "Не удалось изменить наценку"));
    }
  };

  const toggleAmenity = (key: string) => {
    setForm((prev) => {
      const next = new Set(prev.amenities);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...prev, amenities: next };
    });
  };

  const submit = async () => {
    const trimmed = form.name.trim();
    if (!trimmed) {
      setError("Введите название категории");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const patch = {
        name: trimmed,
        basePrice: String(Number(form.price) || 0),
        adultsCapacity: Number(form.adultsCapacity) || 1,
        childrenCapacity: Number(form.childrenCapacity) || 0,
        view: form.view.trim(),
        bedType: form.bedType.trim(),
        roomLayout: form.roomLayout.trim(),
        description: form.description.trim(),
        amenities: [...form.amenities],
        isLuxury: form.luxury,
      };
      if (editing) await updateRoomType(editing.id, patch);
      else await createRoomType({ propertyId, ...patch });
      invalidateRoomTypes();
      navigate(LIST_PATH);
    } catch (err) {
      setError(getErrorMessage(err, "Не удалось сохранить категорию"));
    } finally {
      setSaving(false);
    }
  };

  // Живой предпросчёт «Итого» — база из формы + наценки отмеченных характеристик
  // (из живого справочника, а не из cat.totalPrice — чтобы правка наценки прямо
  // здесь сразу отражалась в сумме до сохранения).
  const totalPrice =
    (Number(form.price) || 0) +
    [...form.amenities].reduce((sum, key) => {
      const a = amenitiesCatalog.find((c) => c.key === key);
      return sum + (a ? Number(a.extraPrice) : 0);
    }, 0);

  return (
    <Stack gap={2} sx={{ maxWidth: 760 }}>
      <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
        <Stack gap={2}>
          <Typography variant="subtitle2" fontWeight={600}>
            Основное
          </Typography>
          <TextField
            label="Название"
            placeholder="Например, Полулюкс"
            value={form.name}
            onChange={(e) => {
              patchForm({ name: e.target.value });
              setError(null);
            }}
            autoFocus={!editing}
            disabled={saving}
            fullWidth
          />
          {/* Поля переносятся по ширине области (flex-wrap), а не по брейкпоинту окна:
              страница живёт внутри SettingsLayout с рельсом слева, области заметно уже окна. */}
          <Stack direction="row" flexWrap="wrap" gap={2}>
            <TextField
              label="Цена без характеристик, сом"
              type="number"
              value={form.price}
              onChange={(e) => patchForm({ price: e.target.value })}
              slotProps={{ htmlInput: { min: 0 } }}
              helperText="Номер «без ничего» — характеристики ниже добавляются к ней"
              disabled={saving}
              sx={{ flex: "2 1 300px" }}
            />
            <TextField
              label="Взрослых"
              type="number"
              value={form.adultsCapacity}
              onChange={(e) => patchForm({ adultsCapacity: e.target.value })}
              slotProps={{ htmlInput: { min: 1 } }}
              disabled={saving}
              sx={{ flex: "1 1 130px" }}
            />
            <TextField
              label="Детей"
              type="number"
              value={form.childrenCapacity}
              onChange={(e) => patchForm({ childrenCapacity: e.target.value })}
              slotProps={{ htmlInput: { min: 0 } }}
              disabled={saving}
              sx={{ flex: "1 1 130px" }}
            />
          </Stack>
          <Alert severity="info" variant="outlined" sx={{ fontSize: "0.8rem", py: 0.5 }}>
            Итого за ночь: <strong>{totalPrice.toLocaleString("ru-RU")} сом</strong>
          </Alert>
          <FormControlLabel
            control={<Checkbox checked={form.luxury} onChange={(e) => patchForm({ luxury: e.target.checked })} disabled={saving} />}
            label="Люкс-категория (акцентный бейдж в шахматке)"
          />
        </Stack>
      </Paper>

      <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
        <Stack gap={2}>
          <Typography variant="subtitle2" fontWeight={600}>
            Описание номера
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={2}>
            <TextField
              label="Вид из окна"
              placeholder="Двор, Улица, Горы…"
              value={form.view}
              onChange={(e) => patchForm({ view: e.target.value })}
              disabled={saving}
              sx={{ flex: "1 1 220px" }}
            />
            <TextField
              label="Тип кровати"
              placeholder="Двуспальная кровать King-size"
              value={form.bedType}
              onChange={(e) => patchForm({ bedType: e.target.value })}
              disabled={saving}
              sx={{ flex: "1 1 220px" }}
            />
            <TextField
              label="Планировка"
              placeholder="1 комната, Студия, Апартаменты…"
              value={form.roomLayout}
              onChange={(e) => patchForm({ roomLayout: e.target.value })}
              disabled={saving}
              sx={{ flex: "1 1 220px" }}
            />
          </Stack>
          <TextField
            label="Описание"
            placeholder="Необязательно"
            value={form.description}
            onChange={(e) => patchForm({ description: e.target.value })}
            multiline
            minRows={2}
            disabled={saving}
            fullWidth
          />
        </Stack>
      </Paper>

      <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
          Характеристики
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Что в номере отличает его от обычного и на сколько дороже делает — как права у роли. Нет нужной — заведите ниже.
        </Typography>
        {amenityGroups.map((group) => (
          <Box key={group} sx={{ mt: 1.5 }}>
            <Typography variant="caption" fontWeight={600} color="text.secondary">
              {group}
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="center">
              {amenitiesCatalog
                .filter((a) => a.group === group)
                .map((a) => (
                  <Stack key={a.id} direction="row" alignItems="center" gap={0.25}>
                    <FormControlLabel
                      control={<Checkbox size="small" checked={form.amenities.has(a.key)} onChange={() => toggleAmenity(a.key)} disabled={saving} />}
                      label={
                        <Typography variant="body2" color="text.secondary">
                          {a.label}
                        </Typography>
                      }
                      sx={{ mr: 0 }}
                    />
                    <Tooltip title="Наценка к цене за ночь, сом">
                      <TextField
                        size="small"
                        type="number"
                        value={amenityPriceDrafts[a.id] ?? String(Number(a.extraPrice))}
                        onChange={(e) => setAmenityPriceDrafts((prev) => ({ ...prev, [a.id]: e.target.value }))}
                        onBlur={() => void commitAmenityPrice(a)}
                        slotProps={{ htmlInput: { min: 0, style: { textAlign: "right" } } }}
                        sx={{ width: 76 }}
                      />
                    </Tooltip>
                  </Stack>
                ))}
            </Stack>
          </Box>
        ))}

        <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}>
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
            sx={{ flex: "2 1 200px" }}
          />
          <Autocomplete
            size="small"
            freeSolo
            options={amenityGroups}
            inputValue={newCharGroup}
            onInputChange={(_, v) => setNewCharGroup(v)}
            disabled={newCharSaving}
            sx={{ flex: "1 1 150px" }}
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
            sx={{ flex: "0 1 120px" }}
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
      </Paper>

      {error && (
        <Alert severity="warning" variant="outlined" sx={{ fontSize: "0.8rem" }}>
          {error}
        </Alert>
      )}

      <Stack direction="row" gap={1} justifyContent="flex-end" sx={{ pb: 2 }}>
        <Button component={RouterLink} to={LIST_PATH} disabled={saving}>
          Отмена
        </Button>
        <Button variant="contained" disabled={!form.name.trim() || saving} onClick={() => void submit()}>
          {saving ? "Сохраняем…" : editing ? "Сохранить" : "Добавить"}
        </Button>
      </Stack>
    </Stack>
  );
};

export const HotelRoomCategoryFormPage: React.FC = () => {
  const { categoryId } = useParams();
  const isEdit = categoryId != null;
  usePageTitle(isEdit ? "Категория номеров" : "Новая категория");
  const { property } = useHotelProperty();

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

  const editing = isEdit ? (roomTypesQuery.data ?? []).find((rt) => String(rt.id) === categoryId) ?? null : null;
  const loading = catalogsQuery.isLoading || roomTypesQuery.isLoading;

  return (
    <SettingsLayout>
      <Stack spacing={2} sx={{ height: "100%" }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <Tooltip title="К списку категорий">
            <IconButton size="small" component={RouterLink} to={LIST_PATH} aria-label="К списку категорий">
              <ArrowBackOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
          <CategoryOutlined color="action" />
          <Typography variant="h6" fontWeight={600}>
            {isEdit ? (editing ? `Категория «${editing.name}»` : "Категория") : "Новая категория (тариф)"}
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
        ) : isEdit && !editing ? (
          <Alert
            severity="warning"
            variant="outlined"
            action={
              <Button color="inherit" size="small" component={RouterLink} to={LIST_PATH}>
                К списку
              </Button>
            }
          >
            Категория не найдена — возможно, её уже нет в этом объекте.
          </Alert>
        ) : (
          <CategoryForm
            key={categoryId ?? "new"}
            propertyId={property.id}
            editing={editing}
            amenitiesCatalog={catalogsQuery.data?.amenities ?? []}
          />
        )}
      </Stack>
    </SettingsLayout>
  );
};

export default HotelRoomCategoryFormPage;
