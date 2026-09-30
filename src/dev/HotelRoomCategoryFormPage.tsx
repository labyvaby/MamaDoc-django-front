/**
 * «Категории и тарифы» → «Новая категория» / «Изменить» — форма категории
 * (тарифа) номеров на отдельной странице, а не диалогом; к «Настройкам» страница
 * отношения не имеет (рельса SettingsLayout нет). Маршруты /room-categories/new
 * (создание) и /room-categories/:categoryId (правка) ведут на эту же страницу,
 * гейт hotel.manage (PAGE_PERMISSIONS.hotelRoomCategories, см. App.tsx,
 * accessPermissions.ts). Список категорий — HotelRoomCategoriesPage.tsx,
 * после сохранения возвращаемся на него.
 *
 * Реальный бэкенд (src/api/hotel.ts): создание/правка — POST/PATCH
 * /hotel/room-types/, характеристики — GET/POST/PATCH
 * /hotel/catalogs/amenities/ (см. hotel-viva-frontend-api.md §4.2, §6).
 * totalPrice считает бэкенд (basePrice + Σ extraPrice отмеченных
 * характеристик); здесь — только живое «Итого» до сохранения.
 *
 * Характеристики (AmenityTile, ниже) — плитки по разделам справочника ОБЪЕКТА: вся плитка —
 * область нажатия чекбокса, выбранная подсвечена, справа наценка с видимой единицей «сом».
 * Наценка общая для всех категорий объекта — на это прямо указано в подписи блока.
 *
 * Характеристики категории — чекбоксы по группам из справочника ОБЪЕКТА
 * (catalogs.amenities, не платформы, см. hotel-viva-frontend-api.md §3) —
 * тот же принцип, что роль собирает права из общего RBAC-каталога в реальной
 * RolesSettingsPage.tsx. Справочник не фиксирован: прямо в форме можно завести
 * новую характеристику со своей наценкой (createAmenity) — она появится у всех
 * категорий объекта и сразу отметится у текущей; наценка уже существующей
 * правится там же (updateAmenity, коммитится по onBlur, не на каждый символ —
 * это настоящий PATCH, а не запись в localStorage).
 *
 * «Значения по умолчанию для номеров» — просьба владельца: при массовом
 * заведении номеров одной категории неудобно каждый раз перезабивать одни и
 * те же «Доп. характеристики» (площадь, санузлы и т.п. — см. HotelRoomFormPage.tsx).
 * Задаются здесь один раз на категорию, HotelRoomFormPage подставляет их в
 * форму нового номера при выборе категории — сотрудник правит только то, что
 * отличается. КОНТРАКТ (default* поля HotelRoomType) ПРЕДЛОЖЕН, бэком ещё не
 * подтверждён — см. комментарий над HotelRoomType в src/api/hotel.ts.
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
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import DriveFileRenameOutlineOutlined from "@mui/icons-material/DriveFileRenameOutlineOutlined";
import SellOutlined from "@mui/icons-material/SellOutlined";
import LandscapeOutlined from "@mui/icons-material/LandscapeOutlined";
import BedOutlined from "@mui/icons-material/BedOutlined";
import ArchitectureOutlined from "@mui/icons-material/ArchitectureOutlined";
import NotesOutlined from "@mui/icons-material/NotesOutlined";
import SquareFootOutlined from "@mui/icons-material/SquareFootOutlined";
import HeightOutlined from "@mui/icons-material/HeightOutlined";
import BathtubOutlined from "@mui/icons-material/BathtubOutlined";
import MeetingRoomOutlined from "@mui/icons-material/MeetingRoomOutlined";
import ExploreOutlined from "@mui/icons-material/ExploreOutlined";
import RestaurantOutlined from "@mui/icons-material/RestaurantOutlined";
import { FormField } from "./formField";
import { focusFirstFieldError, hasFieldErrors, sanitizeFieldInput, type FieldRules } from "./formRules";

/** Правила полей категории — те же проверяют «Сохранить». */
const CATEGORY_RULES = {
  name: { required: true, maxLength: 60 },
  price: { kind: "decimal", min: 0, max: 10_000_000, maxDecimals: 2 },
  short: { maxLength: 100 },
  long: { maxLength: 2000 },
  area: { kind: "decimal", min: 1, max: 2000 },
  ceilingHeight: { kind: "decimal", min: 1.8, max: 15 },
  bathrooms: { kind: "int", min: 0, max: 20 },
  roomsCount: { kind: "int", min: 0, max: 50 },
} satisfies Record<string, FieldRules>;
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import { CountStepper, FormCard, HotelPage, HotelPageHeader, OptionalCard, StickyActions } from "./hotelUi";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate, useParams } from "react-router";
import { useSnackbar } from "notistack";
import { alpha, useTheme } from "@mui/material/styles";

import { usePageTitle } from "../hooks/usePageTitle";
import { useHotelProperty } from "./useHotelProperty";
import { HotelPropertyMissing } from "./HotelPropertyMissing";
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

const LIST_PATH = "/room-categories";

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
  // ── Значения по умолчанию для «Доп. характеристик» нового номера — см. шапку файла.
  defaultArea: string;
  defaultCeilingHeight: string;
  defaultBathrooms: string;
  defaultRoomsCount: string;
  defaultWindowSide: string;
  defaultIsCorner: boolean;
  defaultLayoutDescription: string;
  defaultMeals: string[];
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
  defaultArea: "",
  defaultCeilingHeight: "",
  defaultBathrooms: "",
  defaultRoomsCount: "",
  defaultWindowSide: "",
  defaultIsCorner: false,
  defaultLayoutDescription: "",
  defaultMeals: [],
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
    defaultArea: cat.defaultArea ?? "",
    defaultCeilingHeight: cat.defaultCeilingHeight ?? "",
    defaultBathrooms: cat.defaultBathrooms != null ? String(cat.defaultBathrooms) : "",
    defaultRoomsCount: cat.defaultRoomsCount != null ? String(cat.defaultRoomsCount) : "",
    defaultWindowSide: cat.defaultWindowSide ?? "",
    defaultIsCorner: cat.defaultIsCorner ?? false,
    defaultLayoutDescription: cat.defaultLayoutDescription ?? "",
    defaultMeals: cat.defaultMealOptions ?? [],
  };
}

/** Раздел для характеристик без раздела — иначе они выпадали бы из списка и их нельзя было бы отметить. */
const UNGROUPED = "Прочее";
const amenityGroupOf = (a: HotelAmenity) => a.group?.trim() || UNGROUPED;
/** Справочник больше этого — показываем поиск. */
const AMENITY_SEARCH_MIN = 12;

interface AmenityTileProps {
  amenity: HotelAmenity;
  checked: boolean;
  disabled: boolean;
  /** Значение поля наценки: черновик, пока человек печатает, иначе сохранённая наценка. */
  price: string;
  onToggle: () => void;
  onPriceChange: (value: string) => void;
  onPriceCommit: () => void;
}

/**
 * Одна характеристика: чекбокс с названием (вся левая часть — область нажатия, длинное название
 * переносится, а не обрезается) и наценка справа с видимыми «+» и «сом». Выбранная плитка —
 * в рамке и заливке цвета темы: выбор читается не только по галочке. Наценку правят по blur
 * или Enter — это настоящий PATCH справочника, не на каждый символ.
 */
const AmenityTile: React.FC<AmenityTileProps> = ({ amenity, checked, disabled, price, onToggle, onPriceChange, onPriceCommit }) => (
  <Box
    sx={(theme) => ({
      display: "flex",
      alignItems: "center",
      gap: 1,
      minHeight: 48,
      pr: 1,
      border: "1px solid",
      borderColor: checked ? "primary.main" : "divider",
      borderRadius: "10px",
      bgcolor: checked ? alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.16 : 0.06) : "transparent",
      transition: theme.transitions.create(["border-color", "background-color"], { duration: 120 }),
      "&:hover": { borderColor: checked ? "primary.main" : "text.disabled" },
    })}
  >
    <FormControlLabel
      control={<Checkbox size="small" checked={checked} onChange={onToggle} disabled={disabled} />}
      label={
        <Typography variant="body2" color="text.primary" sx={{ overflowWrap: "anywhere" }}>
          {amenity.label}
        </Typography>
      }
      sx={{ flex: 1, m: 0, pl: 0.5, py: 0.5, minWidth: 0, alignSelf: "stretch" }}
    />
    {!checked ? (
      <Typography variant="body2" color="text.disabled" sx={{ pr: 1, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        {Number(price) > 0 ? `+${Number(price).toLocaleString("ru-RU")} сом` : "без наценки"}
      </Typography>
    ) : (
    <TextField
      size="small"
      value={price}
      placeholder="0"
      onChange={(e) => onPriceChange(sanitizeFieldInput(e.target.value, { kind: "decimal", min: 0 }))}
      onBlur={onPriceCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      slotProps={{
        htmlInput: { inputMode: "decimal", "aria-label": `Наценка за «${amenity.label}», сом за ночь`, style: { textAlign: "right" } },
        input: {
          startAdornment: <InputAdornment position="start">+</InputAdornment>,
          endAdornment: <InputAdornment position="end">сом</InputAdornment>,
        },
      }}
      sx={{
        width: 132,
        flexShrink: 0,
        // Стрелки-счётчики number-поля съедают ширину и «режут» число — наценку печатают.
        "& input[type=number]": { MozAppearance: "textfield" },
        "& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button": { WebkitAppearance: "none", margin: 0 },
      }}
    />
    )}
  </Box>
);

interface CategoryFormProps {
  propertyId: number;
  /** null — создание новой категории, иначе правящаяся. */
  editing: HotelRoomType | null;
  amenitiesCatalog: HotelAmenity[];
  mealChoices: { value: string; label: string }[];
}

/**
 * Сама форма. Монтируется только когда данные уже загружены (см. страницу ниже),
 * поэтому начальное состояние берётся прямо из editing, без эффекта-заполнения.
 */
const CategoryForm: React.FC<CategoryFormProps> = ({ propertyId, editing, amenitiesCatalog, mealChoices }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  // Разделы для показа (включая «Прочее» для характеристик без раздела) и настоящие разделы
  // справочника — для подсказок поля «Раздел» при заведении своей.
  const amenityGroupNames = [...new Set(amenitiesCatalog.map(amenityGroupOf))];
  const knownGroups = [...new Set(amenitiesCatalog.map((a) => a.group?.trim()).filter((g): g is string => Boolean(g)))];
  const [amenityQuery, setAmenityQuery] = React.useState("");

  const [form, setForm] = React.useState<CategoryFormState>(() => (editing ? toForm(editing) : EMPTY_FORM));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // После первой попытки сохранить — ошибки всех полей, даже не тронутых.
  const [showErrors, setShowErrors] = React.useState(false);
  const patchForm = (patch: Partial<CategoryFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  // Новая характеристика — заводится прямо в форме (createAmenity кладёт её в
  // справочник объекта) и сразу отмечается у текущей категории.
  const [newCharLabel, setNewCharLabel] = React.useState("");
  const [newCharGroup, setNewCharGroup] = React.useState("");
  const [newCharPrice, setNewCharPrice] = React.useState("");
  const [newCharSaving, setNewCharSaving] = React.useState(false);
  const [newCharError, setNewCharError] = React.useState<string | null>(null);
  // Форма «своя характеристика» свёрнута: чаще выбирают из готовых. Пустой справочник — открыта сразу.
  const [addOpen, setAddOpen] = React.useState(amenitiesCatalog.length === 0);

  // Наценка уже существующей характеристики — черновик до onBlur, чтобы не
  // слать PATCH на каждый символ (это настоящий запрос, не localStorage).
  const [amenityPriceDrafts, setAmenityPriceDrafts] = React.useState<Record<number, string>>({});

  const invalidateRoomTypes = () => void queryClient.invalidateQueries({ queryKey: ["hotel", "roomTypes", propertyId] });
  const invalidateCatalogs = () => void queryClient.invalidateQueries({ queryKey: ["hotel", "catalogs", propertyId] });

  // Дубль по названию (без учёта регистра) бэк всё равно отклонит (400 details.fields.label) —
  // говорим об этом сразу, под полем, а не после запроса.
  const newCharDuplicate = amenitiesCatalog.some(
    (a) => a.label.trim().toLowerCase() === newCharLabel.trim().toLowerCase() && newCharLabel.trim() !== "",
  );

  const submitNewAmenity = async () => {
    const trimmed = newCharLabel.trim();
    if (!trimmed) {
      setNewCharError("Введите название характеристики");
      return;
    }
    if (newCharDuplicate) return;
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
      setAddOpen(false);
      enqueueSnackbar(`Характеристика «${created.label}» добавлена и отмечена`, { variant: "success" });
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
    const invalid = hasFieldErrors([
      [form.name, CATEGORY_RULES.name],
      [form.price, CATEGORY_RULES.price],
      [form.view, CATEGORY_RULES.short],
      [form.bedType, CATEGORY_RULES.short],
      [form.roomLayout, CATEGORY_RULES.short],
      [form.description, CATEGORY_RULES.long],
      [form.defaultArea, CATEGORY_RULES.area],
      [form.defaultCeilingHeight, CATEGORY_RULES.ceilingHeight],
      [form.defaultBathrooms, CATEGORY_RULES.bathrooms],
      [form.defaultRoomsCount, CATEGORY_RULES.roomsCount],
      [form.defaultWindowSide, CATEGORY_RULES.short],
      [form.defaultLayoutDescription, CATEGORY_RULES.long],
    ]);
    if (invalid) {
      setShowErrors(true);
      setError("Проверьте поля, отмеченные красным");
      focusFirstFieldError();
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
        defaultArea: form.defaultArea.trim() || null,
        defaultCeilingHeight: form.defaultCeilingHeight.trim() || null,
        defaultBathrooms: form.defaultBathrooms.trim() ? Number(form.defaultBathrooms) : null,
        defaultRoomsCount: form.defaultRoomsCount.trim() ? Number(form.defaultRoomsCount) : null,
        defaultWindowSide: form.defaultWindowSide.trim(),
        defaultIsCorner: form.defaultIsCorner,
        defaultLayoutDescription: form.defaultLayoutDescription.trim(),
        defaultMealOptions: form.defaultMeals,
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

  // Сводка блока «Характеристики»: сколько отмечено и на сколько это удорожает ночь.
  const selectedAmenities = amenitiesCatalog.filter((a) => form.amenities.has(a.key));
  const selectedExtra = selectedAmenities.reduce((sum, a) => sum + (Number(a.extraPrice) || 0), 0);

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
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 340px" }, gap: 3, alignItems: "start" }}>
    <Stack gap={2.5} sx={{ minWidth: 0 }}>
      <FormCard>
        <Stack gap={2}>
          <Typography variant="subtitle2" fontWeight={600}>
            Основное
          </Typography>
          <FormField
            icon={<DriveFileRenameOutlineOutlined />}
            rules={CATEGORY_RULES.name}
            showErrors={showErrors}
            label="Название"
            placeholder="Например, Полулюкс"
            value={form.name}
            onValueChange={(v) => {
              patchForm({ name: v });
              setError(null);
            }}
            autoFocus={!editing}
            disabled={saving}
            fullWidth
          />
          {/* Поля переносятся по ширине области (flex-wrap), а не по брейкпоинту окна:
              форма ограничена maxWidth и на узких экранах сжимается вместе с окном. */}
          <FormField
            icon={<SellOutlined />}
            unit="сом"
            rules={CATEGORY_RULES.price}
            showErrors={showErrors}
            label="Цена без характеристик"
            value={form.price}
            onValueChange={(v) => patchForm({ price: v })}
            helperText="Номер «без ничего» — характеристики ниже добавляются к ней"
            disabled={saving}
            fullWidth
          />
          {/* Вместимость — счётчиками, как гости в форме брони: именно эти числа
              потом ограничивают, сколько гостей можно вписать в бронь. */}
          <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}>
            <CountStepper
              label="Взрослых"
              hint="мест для взрослых"
              value={Number(form.adultsCapacity) || 1}
              min={1}
              max={20}
              onChange={(n) => patchForm({ adultsCapacity: String(n) })}
              disabled={saving}
            />
            <CountStepper
              label="Детей"
              hint="дополнительно"
              value={Number(form.childrenCapacity) || 0}
              min={0}
              max={20}
              onChange={(n) => patchForm({ childrenCapacity: String(n) })}
              disabled={saving}
            />
          </Stack>
          {/* Итог — главная цифра формы, поэтому крупно, а не строкой в инфо-плашке. */}
          <Stack
            direction="row"
            alignItems="baseline"
            justifyContent="space-between"
            gap={2}
            sx={(t) => ({ px: 2, py: 1.5, borderRadius: "10px", bgcolor: subtleBg(t, true) })}
          >
            <Typography variant="body2" color="text.secondary">
              Итого за ночь, с характеристиками
            </Typography>
            <Stack direction="row" alignItems="baseline" gap={0.75}>
              <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {totalPrice.toLocaleString("ru-RU")}
              </Typography>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                сом
              </Typography>
            </Stack>
          </Stack>
          <FormControlLabel
            control={<Checkbox checked={form.luxury} onChange={(e) => patchForm({ luxury: e.target.checked })} disabled={saving} />}
            label="Люкс-категория (акцентный бейдж в шахматке)"
          />
        </Stack>
      </FormCard>
      <OptionalCard
        title="Характеристики"
        filled={selectedAmenities.length > 0}
        summary={
          selectedAmenities.length > 0
            ? `Отмечено: ${selectedAmenities.length} · +${selectedExtra.toLocaleString("ru-RU")} сом к цене ночи`
            : "Холодильник, кондиционер, балкон… — каждая прибавляет к цене ночи"
        }
        defaultOpen={editing != null && selectedAmenities.length > 0}
      >
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
          Отметьте, что есть в номерах этой категории. Наценка прибавляется к цене за ночь и{" "}
          <strong>общая для всех категорий объекта</strong>: если изменить её здесь, она изменится везде, где
          эта характеристика отмечена.
        </Typography>

        {amenitiesCatalog.length > AMENITY_SEARCH_MIN && (
          <TextField
            size="small"
            type="search"
            value={amenityQuery}
            onChange={(e) => setAmenityQuery(e.target.value)}
            placeholder="Найти характеристику"
            slotProps={{
              htmlInput: { "aria-label": "Найти характеристику" },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ mb: 2, width: { xs: "100%", sm: 320 } }}
          />
        )}

        {amenitiesCatalog.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Справочник характеристик пока пуст — добавьте первую ниже.
          </Typography>
        ) : (
          (() => {
            const query = amenityQuery.trim().toLowerCase();
            const groups = amenityGroupNames
              .map((name) => {
                const all = amenitiesCatalog.filter((a) => amenityGroupOf(a) === name);
                return { name, all, shown: all.filter((a) => !query || a.label.toLowerCase().includes(query)) };
              })
              .filter((g) => g.shown.length > 0);
            if (groups.length === 0) {
              return (
                <Typography variant="body2" color="text.secondary">
                  Ничего не найдено по «{amenityQuery.trim()}».
                </Typography>
              );
            }
            return (
              <Stack gap={2.5}>
                {groups.map((g) => {
                  const headingId = `amenity-group-${g.name}`;
                  const checkedCount = g.all.filter((a) => form.amenities.has(a.key)).length;
                  return (
                    <Box key={g.name} component="section" role="group" aria-labelledby={headingId}>
                      <Stack direction="row" alignItems="baseline" gap={1} sx={{ mb: 1 }}>
                        <Typography id={headingId} variant="overline" color="text.secondary" fontWeight={700} sx={{ lineHeight: 1.5 }}>
                          {g.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {`отмечено ${checkedCount} из ${g.all.length}`}
                        </Typography>
                      </Stack>
                      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 1 }}>
                        {g.shown.map((a) => (
                          <AmenityTile
                            key={a.id}
                            amenity={a}
                            checked={form.amenities.has(a.key)}
                            disabled={saving}
                            price={amenityPriceDrafts[a.id] ?? (Number(a.extraPrice) ? String(Number(a.extraPrice)) : "")}
                            onToggle={() => toggleAmenity(a.key)}
                            onPriceChange={(v) => setAmenityPriceDrafts((prev) => ({ ...prev, [a.id]: v }))}
                            onPriceCommit={() => void commitAmenityPrice(a)}
                          />
                        ))}
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            );
          })()
        )}

        {/* Своя характеристика — свёрнута, пока не нужна (прогрессивное раскрытие). */}
        <Box sx={{ mt: 2.5 }}>
          {!addOpen ? (
            <Button size="small" startIcon={<AddOutlined />} onClick={() => setAddOpen(true)} aria-expanded={false}>
              Добавить свою характеристику
            </Button>
          ) : (
            <Box sx={{ border: "1px dashed", borderColor: "divider", borderRadius: "10px", p: 1.5 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
                Своя характеристика
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="flex-start">
                <TextField
                  size="small"
                  required
                  label="Название"
                  placeholder="Например, Балкон"
                  value={newCharLabel}
                  onChange={(e) => {
                    setNewCharLabel(e.target.value);
                    setNewCharError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newCharLabel.trim() && !newCharDuplicate && !newCharSaving) {
                      e.preventDefault();
                      void submitNewAmenity();
                    }
                  }}
                  error={newCharDuplicate}
                  helperText={newCharDuplicate ? "Такая характеристика уже есть в списке" : undefined}
                  autoFocus={amenitiesCatalog.length > 0}
                  disabled={newCharSaving}
                  sx={{ flex: "2 1 220px" }}
                />
                <Autocomplete
                  size="small"
                  freeSolo
                  options={knownGroups}
                  inputValue={newCharGroup}
                  onInputChange={(_, v) => setNewCharGroup(v)}
                  disabled={newCharSaving}
                  sx={{ flex: "1 1 160px" }}
                  renderInput={(params) => <TextField {...params} label="Раздел" placeholder="Техника…" helperText="Необязательно" />}
                />
                <TextField
                  size="small"
                  label="Наценка"
                  value={newCharPrice}
                  onChange={(e) => setNewCharPrice(sanitizeFieldInput(e.target.value, { kind: "decimal", min: 0 }))}
                  placeholder="0"
                  slotProps={{
                    htmlInput: { inputMode: "decimal" },
                    input: {
                      startAdornment: <InputAdornment position="start">+</InputAdornment>,
                      endAdornment: <InputAdornment position="end">сом</InputAdornment>,
                    },
                  }}
                  disabled={newCharSaving}
                  sx={{ flex: "0 1 150px" }}
                />
              </Stack>
              {newCharError && (
                <Alert severity="error" variant="outlined" sx={{ fontSize: "0.75rem", mt: 1.25 }}>
                  {newCharError}
                </Alert>
              )}
              <Stack direction="row" gap={1} sx={{ mt: 1.5 }}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => void submitNewAmenity()}
                  disabled={!newCharLabel.trim() || newCharDuplicate || newCharSaving}
                >
                  {newCharSaving ? "Добавляем…" : "Добавить"}
                </Button>
                {amenitiesCatalog.length > 0 && (
                  <Button
                    size="small"
                    disabled={newCharSaving}
                    onClick={() => {
                      setAddOpen(false);
                      setNewCharError(null);
                    }}
                  >
                    Отмена
                  </Button>
                )}
              </Stack>
            </Box>
          )}
        </Box>
      </OptionalCard>


      <OptionalCard
        title="Описание номера"
        filled={[form.view, form.bedType, form.roomLayout, form.description].some((v) => v.trim())}
        summary={[form.view, form.bedType, form.roomLayout].filter((v) => v.trim()).join(" · ") || "Вид из окна, кровать, планировка"}
        defaultOpen={editing != null && [form.view, form.bedType, form.roomLayout, form.description].some((v) => v.trim())}
        forceOpen={showErrors}
      >
        <Stack gap={2}>
          <Stack direction="row" flexWrap="wrap" gap={2}>
            <FormField
              icon={<LandscapeOutlined />}
              rules={CATEGORY_RULES.short}
              showErrors={showErrors}
              label="Вид из окна"
              placeholder="Двор, Улица, Горы…"
              value={form.view}
              onValueChange={(v) => patchForm({ view: v })}
              disabled={saving}
              sx={{ flex: "1 1 220px" }}
            />
            <FormField
              icon={<BedOutlined />}
              rules={CATEGORY_RULES.short}
              showErrors={showErrors}
              label="Тип кровати"
              placeholder="Двуспальная кровать King-size"
              value={form.bedType}
              onValueChange={(v) => patchForm({ bedType: v })}
              disabled={saving}
              sx={{ flex: "1 1 220px" }}
            />
            <FormField
              icon={<ArchitectureOutlined />}
              rules={CATEGORY_RULES.short}
              showErrors={showErrors}
              label="Планировка"
              placeholder="1 комната, Студия, Апартаменты…"
              value={form.roomLayout}
              onValueChange={(v) => patchForm({ roomLayout: v })}
              disabled={saving}
              sx={{ flex: "1 1 220px" }}
            />
          </Stack>
          <FormField
            icon={<NotesOutlined />}
            rules={CATEGORY_RULES.long}
            showErrors={showErrors}
            label="Описание"
            placeholder="Необязательно"
            value={form.description}
            onValueChange={(v) => patchForm({ description: v })}
            multiline
            minRows={2}
            disabled={saving}
            fullWidth
          />
        </Stack>
      </OptionalCard>

      <OptionalCard
        title="Значения по умолчанию для номеров"
        filled={[form.defaultArea, form.defaultRoomsCount, form.defaultBathrooms].some((v) => v.trim())}
        summary={
          [form.defaultArea && `${form.defaultArea} м²`, form.defaultRoomsCount && `комнат: ${form.defaultRoomsCount}`, form.defaultBathrooms && `санузлов: ${form.defaultBathrooms}`]
            .filter(Boolean)
            .join(" · ") || "Площадь, санузлы, питание — подставятся в новые номера"
        }
        defaultOpen={
          editing != null &&
          [form.defaultArea, form.defaultCeilingHeight, form.defaultBathrooms, form.defaultRoomsCount, form.defaultWindowSide, form.defaultLayoutDescription].some((v) => v.trim())
        }
        forceOpen={showErrors}
      >
        <Stack gap={2}>
          <Typography variant="body2" color="text.secondary">
            Подставятся в форму нового номера этой категории (раздел «Доп. характеристики») — при
            заведении сразу нескольких номеров останется поправить только то, что отличается.
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={2}>
            <FormField
              icon={<SquareFootOutlined />}
              unit="м²"
              rules={CATEGORY_RULES.area}
              showErrors={showErrors}
              label="Площадь"
              value={form.defaultArea}
              onValueChange={(v) => patchForm({ defaultArea: v })}
              disabled={saving}
              sx={{ flex: "1 1 160px" }}
            />
            <FormField
              icon={<HeightOutlined />}
              unit="м"
              rules={CATEGORY_RULES.ceilingHeight}
              showErrors={showErrors}
              label="Высота потолков"
              value={form.defaultCeilingHeight}
              onValueChange={(v) => patchForm({ defaultCeilingHeight: v })}
              disabled={saving}
              sx={{ flex: "1 1 160px" }}
            />
            <FormField
              icon={<BathtubOutlined />}
              rules={CATEGORY_RULES.bathrooms}
              showErrors={showErrors}
              label="Санузлов"
              value={form.defaultBathrooms}
              onValueChange={(v) => patchForm({ defaultBathrooms: v })}
              disabled={saving}
              sx={{ flex: "1 1 130px" }}
            />
            <FormField
              icon={<MeetingRoomOutlined />}
              rules={CATEGORY_RULES.roomsCount}
              showErrors={showErrors}
              label="Жилых комнат"
              value={form.defaultRoomsCount}
              onValueChange={(v) => patchForm({ defaultRoomsCount: v })}
              disabled={saving}
              sx={{ flex: "1 1 130px" }}
            />
          </Stack>
          <Stack direction="row" flexWrap="wrap" gap={2} alignItems="flex-start">
            <FormField
              icon={<ExploreOutlined />}
              rules={CATEGORY_RULES.short}
              showErrors={showErrors}
              label="Сторона света"
              placeholder="Юг, Северо-Восток…"
              value={form.defaultWindowSide}
              onValueChange={(v) => patchForm({ defaultWindowSide: v })}
              disabled={saving}
              sx={{ flex: "1 1 200px" }}
            />
            <TextField
              select
              label="Питание"
              value={form.defaultMeals}
              onChange={(e) => {
                const v = e.target.value as unknown;
                patchForm({ defaultMeals: typeof v === "string" ? v.split(",") : (v as string[]) });
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
              sx={{ flex: "1 1 220px" }}
            >
              {mealChoices.map((c) => (
                <MenuItem key={c.value} value={c.value}>
                  {c.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <FormControlLabel
            control={<Checkbox checked={form.defaultIsCorner} onChange={(e) => patchForm({ defaultIsCorner: e.target.checked })} disabled={saving} />}
            label="Угловой номер"
          />
          <FormField
            icon={<ArchitectureOutlined />}
            rules={CATEGORY_RULES.long}
            showErrors={showErrors}
            label="Описание планировки"
            placeholder="Необязательно"
            value={form.defaultLayoutDescription}
            onValueChange={(v) => patchForm({ defaultLayoutDescription: v })}
            disabled={saving}
            multiline
            minRows={2}
            fullWidth
          />
        </Stack>
      </OptionalCard>


      {error && (
        <Alert severity="warning" variant="outlined" sx={{ fontSize: "0.8rem" }}>
          {error}
        </Alert>
      )}

      <StickyActions>
        <Typography variant="body2" color="text.secondary" sx={{ mr: "auto" }}>
          {totalPrice.toLocaleString("ru-RU")} сом / ночь
        </Typography>
        <Button component={RouterLink} to={LIST_PATH} disabled={saving}>
          Отмена
        </Button>
        <Button variant="contained" disableElevation disabled={saving} onClick={() => void submit()} sx={{ px: 3 }}>
          {saving ? "Сохраняем…" : editing ? "Сохранить" : "Добавить категорию"}
        </Button>
      </StickyActions>
    </Stack>
    <CategoryPreview form={form} totalPrice={totalPrice} amenitiesCatalog={amenitiesCatalog} />
    </Box>
  );
};

/**
 * Живое превью справа — как категория будет выглядеть в списке «Категории и
 * тарифы» и в карточке номера: сразу видно итоговую цену и что получит гость.
 */
const CategoryPreview: React.FC<{ form: CategoryFormState; totalPrice: number; amenitiesCatalog: HotelAmenity[] }> = ({
  form,
  totalPrice,
  amenitiesCatalog,
}) => {
  const theme = useTheme();
  const base = Number(form.price) || 0;
  const adults = Number(form.adultsCapacity) || 1;
  const kids = Number(form.childrenCapacity) || 0;
  const facts = [form.bedType, form.roomLayout, form.view && `вид: ${form.view}`].filter(Boolean);
  const chosen = [...form.amenities].map((key) => amenitiesCatalog.find((a) => a.key === key)).filter((a): a is HotelAmenity => a != null);
  return (
    <Box sx={{ position: { lg: "sticky" }, top: 24, display: { xs: "none", lg: "block" } }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary", mb: 1.25 }}>
        Как увидят сотрудники
      </Typography>
      <Box sx={{ p: 2.5, borderRadius: "14px", border: `1px solid ${theme.palette.divider}`, bgcolor: "background.paper" }}>
        <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
          <Typography sx={{ fontSize: 18, fontWeight: 700, minWidth: 0 }} noWrap>
            {form.name.trim() || "Название категории"}
          </Typography>
          {form.luxury && (
            <Box
              component="span"
              sx={{
                px: 0.75,
                borderRadius: "5px",
                fontSize: 11,
                fontWeight: 700,
                bgcolor: alpha("#d4af37", 0.16),
                color: theme.palette.mode === "dark" ? "#e9c766" : "#8a6d1a",
              }}
            >
              Люкс
            </Box>
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          до {adults} взр.{kids > 0 ? ` + ${kids} дет.` : ""}
          {facts.length > 0 ? ` · ${facts.join(" · ")}` : ""}
        </Typography>

        <Stack direction="row" alignItems="baseline" gap={0.75} sx={{ mt: 2.5 }}>
          <Typography sx={{ fontSize: 30, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
            {totalPrice.toLocaleString("ru-RU")}
          </Typography>
          <Typography variant="body2" color="text.secondary" fontWeight={600}>
            сом / ночь
          </Typography>
        </Stack>

        <Stack gap={0.75} sx={{ mt: 2, pt: 2, borderTop: `1px solid ${subtleBorder(theme)}` }}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">
              Базовая цена
            </Typography>
            <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {base.toLocaleString("ru-RU")}
            </Typography>
          </Stack>
          {chosen.map((a) => (
            <Stack key={a.key} direction="row" justifyContent="space-between" gap={2}>
              <Typography variant="body2" color="text.secondary" noWrap>
                {a.label}
              </Typography>
              <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                {Number(a.extraPrice) > 0 ? `+${Number(a.extraPrice).toLocaleString("ru-RU")}` : "включено"}
              </Typography>
            </Stack>
          ))}
          {chosen.length === 0 && (
            <Typography variant="caption" color="text.disabled">
              Характеристики не отмечены
            </Typography>
          )}
        </Stack>
      </Box>
    </Box>
  );
};

export const HotelRoomCategoryFormPage: React.FC = () => {
  const { categoryId } = useParams();
  const isEdit = categoryId != null;
  usePageTitle(isEdit ? "Категория номеров" : "Новая категория");
  const { property, isLoading: propertyLoading } = useHotelProperty();

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
  const loading = propertyLoading || catalogsQuery.isLoading || roomTypesQuery.isLoading;

  return (
    <HotelPage maxWidth={1180}>
        <HotelPageHeader
          leading={
            <Tooltip title="К списку категорий">
              <IconButton component={RouterLink} to={LIST_PATH} aria-label="К списку категорий" sx={{ ml: -1, mr: 0.5 }}>
                <ArrowBackOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          }
          title={isEdit ? (editing ? editing.name : "Категория") : "Новая категория"}
          subtitle={isEdit ? "Категория номеров (тариф)" : "Тип номера с ценой за ночь и характеристиками"}
        />

        {loading ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size={28} />
          </Stack>
        ) : !property ? (
          <HotelPropertyMissing />
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
            mealChoices={catalogsQuery.data?.mealOptions ?? []}
          />
        )}
    </HotelPage>
  );
};

export default HotelRoomCategoryFormPage;
