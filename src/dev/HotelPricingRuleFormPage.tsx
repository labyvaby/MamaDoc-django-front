/**
 * «Ценообразование» → «Новое правило» / «Изменить» — форма правила динамической
 * цены на отдельной странице, а не диалогом; к «Настройкам» страница отношения
 * не имеет (рельса SettingsLayout нет). Маршруты /pricing-rules/new (создание)
 * и /pricing-rules/:ruleId (правка) ведут на эту же страницу. Гейт страницы —
 * hotel.view (PAGE_PERMISSIONS.hotelPricingRules), но саму форму видят только
 * с hotel.rates.manage (см. useCan ниже) — у «Ресепшена» этого права нет.
 * Список правил — HotelPricingRulesPage.tsx, после сохранения возвращаемся на него.
 *
 * Контракт — «Ответ бэкенда: динамическое ценообразование отеля (Viva)»,
 * 24.09.2026 (см. развёрнутый комментарий над HotelPricingRule в src/api/hotel.ts).
 *
 * Условия правила (conditions) — НЕЗАВИСИМЫЕ переключаемые блоки: «Даты»,
 * «Загрузка», «Срок до заезда», «Длительность», «Дни недели». Все заданные
 * блоки действуют одновременно (И, не ИЛИ) — так на бэке устроено composite-
 * условие «горящие номера» = срок до заезда 0–2 дня И загрузка < 50%. Пустые
 * conditions (ни один блок не включён) — валидны и значат «действует всегда»
 * (например, «+5% на все категории объекта»).
 *
 * dateTo здесь ВКЛЮЧИТЕЛЬНО (в отличие от checkOut у брони): при выборе «Дата с»
 * позже уже стоявшей «Дата по» — вторая подтягивается следом, чтобы не собрать
 * пустой/обратный диапазон; для правила на один день оставляют как есть (равны).
 * Исключение — «Каждый год»: там валидный диапазон может переходить через Новый
 * год (31.12–02.01), бэк это понимает сам, поэтому при recurringYearly проверку
 * «по раньше с» не делаем и не ограничиваем «Дата по» через minDate.
 *
 * Категории номеров: пустой roomTypeIds на бэке значит «все категории, включая
 * заведённые позже» — поэтому это ОТДЕЛЬНЫЙ чекбокс (allCategories), а не просто
 * «отметить все текущие пункты»: иначе новая категория, заведённая после
 * сохранения правила, молча осталась бы без него.
 *
 * «Дополнительно» (приоритет, эксклюзивная группа) — свёрнуто по умолчанию:
 * нужно только когда несколько правил могут сработать на одну ночь одновременно
 * (например, ступени загрузки 0–50/50–80/80–100% — им даём одну exclusiveGroup,
 * чтобы сработала только одна ступень, а не все разом).
 *
 * Живой предпросчёт («было → стало») берётся с бэка (simulatePricingRule), не
 * считается на фронте — при пересечении с другими правилами процент не
 * перемножается линейно, локальная арифметика показала бы неверную цифру.
 * Окно предпросчёта: если включены «Даты» — сам период правила; иначе (правило
 * без дат — только загрузка/срок/длительность/день недели) — ближайшие 14 дней
 * от сегодня, представительное окно для оценки.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Collapse,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import PriceChangeOutlined from "@mui/icons-material/PriceChangeOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink, useNavigate, useParams } from "react-router";
import dayjs, { type Dayjs } from "dayjs";

import { CustomDatePicker } from "../components/ui";
import { usePageTitle } from "../hooks/usePageTitle";
import { useCan } from "../hooks/useCan";
import { useHotelProperty } from "./useHotelProperty";
import {
  listRoomTypes,
  listPricingRules,
  createPricingRule,
  updatePricingRule,
  simulatePricingRule,
  type HotelRoomType,
  type HotelPricingRule,
  type HotelPricingRuleCategory,
  type HotelPricingRuleConditions,
  type HotelPricingRuleSimulateResult,
} from "../api/hotel";
import { getErrorMessage, isAbortError } from "../api/client";

const LIST_PATH = "/pricing-rules";
/** Пауза перед запросом предпросчёта — не дёргаем бэк на каждый символ/клик. */
const SIMULATE_DEBOUNCE_MS = 450;
/** Окно предпросчёта для правила без дат (загрузка/срок/длительность/день недели). */
const NO_DATES_PREVIEW_DAYS = 14;

const CATEGORY_LABELS: Record<HotelPricingRuleCategory, string> = {
  occupancy: "Загрузка",
  last_minute: "Горящие номера",
  early_bird: "Раннее бронирование",
  weekday: "День недели",
  season: "Сезон",
  event: "Событие",
  length_of_stay: "Длительность проживания",
  custom: "Другое",
};

const DAYS_OF_WEEK: Array<{ key: NonNullable<HotelPricingRuleConditions["daysOfWeek"]>[number]; label: string }> = [
  { key: "monday", label: "Пн" },
  { key: "tuesday", label: "Вт" },
  { key: "wednesday", label: "Ср" },
  { key: "thursday", label: "Чт" },
  { key: "friday", label: "Пт" },
  { key: "saturday", label: "Сб" },
  { key: "sunday", label: "Вс" },
];

interface RuleFormState {
  name: string;
  adjustmentType: "percent" | "amount";
  /** Значение поправки — проценты либо сом за ночь, в зависимости от adjustmentType. */
  amount: string;
  category: HotelPricingRuleCategory;
  /** true — все категории объекта, включая будущие (roomTypeIds: [] на бэке). */
  allCategories: boolean;
  /** Имеет смысл только когда allCategories === false. */
  roomTypeIds: number[];
  isActive: boolean;

  datesEnabled: boolean;
  dateFrom: Dayjs | null;
  dateTo: Dayjs | null;
  recurringYearly: boolean;

  occupancyEnabled: boolean;
  occupancyFrom: string;
  occupancyTo: string;

  leadTimeEnabled: boolean;
  leadTimeFrom: string;
  leadTimeTo: string;

  nightsEnabled: boolean;
  nightsFrom: string;
  nightsTo: string;

  daysOfWeekEnabled: boolean;
  daysOfWeek: string[];

  /** «Дополнительно» — приоритет и эксклюзивная группа, см. комментарий в шапке файла. */
  priority: string;
  exclusiveGroup: string;
}

function emptyForm(): RuleFormState {
  return {
    name: "",
    adjustmentType: "percent",
    amount: "",
    category: "custom",
    allCategories: false,
    roomTypeIds: [],
    isActive: true,
    datesEnabled: false,
    dateFrom: null,
    dateTo: null,
    recurringYearly: false,
    occupancyEnabled: false,
    occupancyFrom: "",
    occupancyTo: "",
    leadTimeEnabled: false,
    leadTimeFrom: "",
    leadTimeTo: "",
    nightsEnabled: false,
    nightsFrom: "",
    nightsTo: "",
    daysOfWeekEnabled: false,
    daysOfWeek: [],
    priority: "",
    exclusiveGroup: "",
  };
}

function toForm(rule: HotelPricingRule): RuleFormState {
  const c = rule.conditions;
  return {
    name: rule.name,
    adjustmentType: rule.adjustmentType,
    amount: String(Number(rule.adjustmentValue)),
    category: rule.category,
    allCategories: rule.roomTypeIds.length === 0,
    roomTypeIds: [...rule.roomTypeIds],
    isActive: rule.isActive,
    datesEnabled: c.dateFrom != null && c.dateTo != null,
    dateFrom: c.dateFrom ? dayjs(c.dateFrom) : null,
    dateTo: c.dateTo ? dayjs(c.dateTo) : null,
    recurringYearly: c.recurringAnnually ?? false,
    occupancyEnabled: c.occupancyFrom != null || c.occupancyTo != null,
    occupancyFrom: c.occupancyFrom != null ? String(c.occupancyFrom) : "",
    occupancyTo: c.occupancyTo != null ? String(c.occupancyTo) : "",
    leadTimeEnabled: c.leadTimeFrom != null || c.leadTimeTo != null,
    leadTimeFrom: c.leadTimeFrom != null ? String(c.leadTimeFrom) : "",
    leadTimeTo: c.leadTimeTo != null ? String(c.leadTimeTo) : "",
    nightsEnabled: c.nightsFrom != null || c.nightsTo != null,
    nightsFrom: c.nightsFrom != null ? String(c.nightsFrom) : "",
    nightsTo: c.nightsTo != null ? String(c.nightsTo) : "",
    daysOfWeekEnabled: (c.daysOfWeek?.length ?? 0) > 0,
    daysOfWeek: c.daysOfWeek ? [...c.daysOfWeek] : [],
    priority: String(rule.priority),
    exclusiveGroup: rule.exclusiveGroup,
  };
}

/** Собирает conditions из включённых блоков формы — выключенный блок в объект не попадает вовсе. */
function buildConditions(form: RuleFormState): HotelPricingRuleConditions {
  const conditions: HotelPricingRuleConditions = {};
  if (form.datesEnabled && form.dateFrom && form.dateTo) {
    conditions.dateFrom = form.dateFrom.format("YYYY-MM-DD");
    conditions.dateTo = form.dateTo.format("YYYY-MM-DD");
    conditions.recurringAnnually = form.recurringYearly;
  }
  if (form.occupancyEnabled) {
    if (form.occupancyFrom.trim() !== "") conditions.occupancyFrom = Number(form.occupancyFrom);
    if (form.occupancyTo.trim() !== "") conditions.occupancyTo = Number(form.occupancyTo);
  }
  if (form.leadTimeEnabled) {
    if (form.leadTimeFrom.trim() !== "") conditions.leadTimeFrom = Number(form.leadTimeFrom);
    if (form.leadTimeTo.trim() !== "") conditions.leadTimeTo = Number(form.leadTimeTo);
  }
  if (form.nightsEnabled) {
    if (form.nightsFrom.trim() !== "") conditions.nightsFrom = Number(form.nightsFrom);
    if (form.nightsTo.trim() !== "") conditions.nightsTo = Number(form.nightsTo);
  }
  if (form.daysOfWeekEnabled && form.daysOfWeek.length > 0) {
    conditions.daysOfWeek = form.daysOfWeek as HotelPricingRuleConditions["daysOfWeek"];
  }
  return conditions;
}

interface RuleFormProps {
  propertyId: number;
  /** null — создание нового правила, иначе правящееся. */
  editing: HotelPricingRule | null;
  roomTypes: HotelRoomType[];
}

const RuleForm: React.FC<RuleFormProps> = ({ propertyId, editing, roomTypes }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = React.useState<RuleFormState>(() => (editing ? toForm(editing) : emptyForm()));
  const [advancedOpen, setAdvancedOpen] = React.useState(() => Boolean(editing?.exclusiveGroup));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const patchForm = (patch: Partial<RuleFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const invalidateRules = () => void queryClient.invalidateQueries({ queryKey: ["hotel", "pricingRules", propertyId] });

  const amountValue = Number(form.amount) || 0;
  const canSubmit =
    form.name.trim() !== "" &&
    form.amount.trim() !== "" &&
    (form.allCategories || form.roomTypeIds.length > 0) &&
    (!form.datesEnabled || (form.dateFrom != null && form.dateTo != null));

  const submit = async () => {
    if (!canSubmit) {
      setError("Заполните название, поправку и категории");
      return;
    }
    if (form.datesEnabled && form.dateFrom && form.dateTo && !form.recurringYearly && form.dateTo.isBefore(form.dateFrom, "day")) {
      setError("«Дата по» раньше «Дата с»");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const conditions = buildConditions(form);
      const roomTypeIds = form.allCategories ? [] : form.roomTypeIds;
      const priority = form.priority.trim() !== "" ? Number(form.priority) : undefined;
      if (editing) {
        await updatePricingRule(editing.id, {
          name: form.name.trim(),
          adjustmentType: form.adjustmentType,
          adjustmentValue: String(amountValue),
          conditions,
          roomTypeIds,
          priority,
          exclusiveGroup: form.exclusiveGroup.trim(),
          category: form.category,
          isActive: form.isActive,
          version: editing.version,
        });
      } else {
        await createPricingRule({
          propertyId,
          name: form.name.trim(),
          adjustmentType: form.adjustmentType,
          adjustmentValue: String(amountValue),
          conditions,
          roomTypeIds,
          priority,
          exclusiveGroup: form.exclusiveGroup.trim() || undefined,
          category: form.category,
          isActive: form.isActive,
        });
      }
      invalidateRules();
      navigate(LIST_PATH);
    } catch (err) {
      // 409 VERSION_CONFLICT — правило успели изменить где-то ещё, пока форма была открыта.
      setError(getErrorMessage(err, "Не удалось сохранить правило"));
    } finally {
      setSaving(false);
    }
  };

  const isDiscount = amountValue < 0;
  const selectedRoomTypes = form.allCategories ? roomTypes : roomTypes.filter((rt) => form.roomTypeIds.includes(rt.id));
  const anyConditionEnabled = form.datesEnabled || form.occupancyEnabled || form.leadTimeEnabled || form.nightsEnabled || form.daysOfWeekEnabled;

  // ── Живой предпросчёт с бэка (simulatePricingRule) — см. комментарий в шапке файла
  // и у HotelPricingRuleSimulateRequest в api/hotel.ts.
  const [simResult, setSimResult] = React.useState<HotelPricingRuleSimulateResult | null>(null);
  const [simLoading, setSimLoading] = React.useState(false);
  React.useEffect(() => {
    if (!canSubmit || amountValue === 0) {
      setSimResult(null);
      return;
    }
    // Окно расчёта: если включены «Даты» — период самого правила (с поправкой
    // на «Каждый год» через Новый год и на невключительный dateTo окна, см.
    // комментарии ниже); иначе — ближайшие NO_DATES_PREVIEW_DAYS дней, просто
    // представительный отрезок для оценки правила без дат.
    let windowFrom: Dayjs;
    let windowTo: Dayjs;
    if (form.datesEnabled && form.dateFrom && form.dateTo) {
      windowFrom = form.dateFrom;
      let conditionsTo = form.dateTo;
      // «Каждый год» с переходом через Новый год (31.12→02.01): conditions.dateTo
      // легитимно раньше conditions.dateFrom по числу месяца — само правило это
      // хранит как есть, но ОКНО РАСЧЁТА simulate/ обязано быть положительным
      // (dateTo > dateFrom, иначе 400), поэтому здесь (и только здесь) сдвигаем
      // на год вперёд.
      if (form.recurringYearly && conditionsTo.isBefore(windowFrom, "day")) {
        conditionsTo = conditionsTo.add(1, "year");
      }
      // Верхнеуровневый dateTo окна — НЕ включительно (ночи [dateFrom, dateTo)),
      // а conditions.dateTo у самого правила — включительно: отсюда +1 день.
      windowTo = conditionsTo.add(1, "day");
    } else {
      windowFrom = dayjs();
      windowTo = windowFrom.add(NO_DATES_PREVIEW_DAYS, "day");
    }
    const roomTypeIds = form.allCategories ? [] : form.roomTypeIds;
    const conditions = buildConditions(form);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSimLoading(true);
      simulatePricingRule(
        {
          propertyId,
          dateFrom: windowFrom.format("YYYY-MM-DD"),
          dateTo: windowTo.format("YYYY-MM-DD"),
          rule: {
            adjustmentType: form.adjustmentType,
            adjustmentValue: String(amountValue),
            conditions,
            roomTypeIds,
          },
          ruleId: editing ? editing.id : null,
          roomTypeIds,
        },
        controller.signal,
      )
        .then((res) => setSimResult(res))
        // Предпросчёт — необязательное удобство: сбой сети/запроса не должен мешать
        // сохранению правила, просто прячем блок.
        .catch((err) => {
          if (!isAbortError(err)) setSimResult(null);
        })
        .finally(() => setSimLoading(false));
    }, SIMULATE_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    propertyId, editing, canSubmit, amountValue, form.adjustmentType,
    form.datesEnabled, form.dateFrom, form.dateTo, form.recurringYearly,
    form.occupancyEnabled, form.occupancyFrom, form.occupancyTo,
    form.leadTimeEnabled, form.leadTimeFrom, form.leadTimeTo,
    form.nightsEnabled, form.nightsFrom, form.nightsTo,
    form.daysOfWeekEnabled, form.daysOfWeek,
    form.roomTypeIds, form.allCategories,
  ]);

  return (
    <Stack gap={2} sx={{ maxWidth: 760 }}>
      <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
        <Stack gap={2}>
          <Typography variant="subtitle2" fontWeight={600}>
            Основное
          </Typography>
          <TextField
            label="Название"
            placeholder="Например, Новогодние праздники"
            value={form.name}
            onChange={(e) => {
              patchForm({ name: e.target.value });
              setError(null);
            }}
            autoFocus={!editing}
            disabled={saving}
            fullWidth
          />

          <Stack direction="row" flexWrap="wrap" gap={2} alignItems="flex-start">
            <ToggleButtonGroup
              value={form.adjustmentType}
              exclusive
              size="small"
              disabled={saving}
              onChange={(_, value: "percent" | "amount" | null) => value && patchForm({ adjustmentType: value })}
            >
              <ToggleButton value="percent">Процент</ToggleButton>
              <ToggleButton value="amount">Сумма за ночь</ToggleButton>
            </ToggleButtonGroup>
            <TextField
              label={form.adjustmentType === "percent" ? "Процент" : "Сумма"}
              type="number"
              value={form.amount}
              onChange={(e) => patchForm({ amount: e.target.value })}
              helperText={
                form.adjustmentType === "percent"
                  ? "Положительный — дороже (20), отрицательный — скидка (-15); от −99 до 1000"
                  : "Сом за ночь; положительный — дороже, отрицательный — скидка"
              }
              disabled={saving}
              slotProps={{
                htmlInput: form.adjustmentType === "percent" ? { step: "0.01", min: -99, max: 1000 } : { step: "1" },
                input: { endAdornment: <InputAdornment position="end">{form.adjustmentType === "percent" ? "%" : "сом"}</InputAdornment> },
              }}
              sx={{ maxWidth: 260 }}
            />
          </Stack>

          <TextField
            select
            label="Тип (для списка)"
            value={form.category}
            onChange={(e) => patchForm({ category: e.target.value as HotelPricingRuleCategory })}
            disabled={saving}
            helperText="Только подпись в списке правил — на расчёт цены не влияет, влияют условия ниже"
            sx={{ maxWidth: 320 }}
          >
            {(Object.keys(CATEGORY_LABELS) as HotelPricingRuleCategory[]).map((key) => (
              <MenuItem key={key} value={key}>
                {CATEGORY_LABELS[key]}
              </MenuItem>
            ))}
          </TextField>

          <FormControlLabel
            control={<Checkbox checked={form.isActive} onChange={(e) => patchForm({ isActive: e.target.checked })} disabled={saving} />}
            label="Активно — если выключить, цена в эти условия останется обычной"
          />
        </Stack>
      </Paper>

      <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
          Условия
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Включённые условия действуют одновременно (И). Ничего не включено — правило действует всегда.
        </Typography>

        <Stack gap={2}>
          {/* ── Даты ── */}
          <Box>
            <FormControlLabel
              control={<Checkbox checked={form.datesEnabled} onChange={(e) => patchForm({ datesEnabled: e.target.checked })} disabled={saving} />}
              label="Даты — конкретный период (сезон, праздник)"
            />
            <Collapse in={form.datesEnabled}>
              <Stack gap={1.5} sx={{ pl: 4, pt: 1 }}>
                <Stack direction="row" flexWrap="wrap" gap={2}>
                  <CustomDatePicker
                    label="Дата с"
                    value={form.dateFrom}
                    onChange={(v) => {
                      if (!form.recurringYearly && v && (!form.dateTo || form.dateTo.isBefore(v, "day"))) {
                        patchForm({ dateFrom: v, dateTo: v });
                      } else {
                        patchForm({ dateFrom: v });
                      }
                    }}
                    slotProps={{ textField: { size: "small", disabled: saving } }}
                    sx={{ flex: "1 1 200px" }}
                  />
                  <CustomDatePicker
                    label="Дата по"
                    value={form.dateTo}
                    onChange={(v) => patchForm({ dateTo: v })}
                    minDate={form.recurringYearly ? undefined : (form.dateFrom ?? undefined)}
                    slotProps={{
                      textField: {
                        size: "small",
                        disabled: saving,
                        helperText: form.recurringYearly ? "Может быть раньше «с» — переход через Новый год" : "Для одного дня — та же дата",
                      },
                    }}
                    sx={{ flex: "1 1 200px" }}
                  />
                </Stack>
                <FormControlLabel
                  control={<Checkbox checked={form.recurringYearly} onChange={(e) => patchForm({ recurringYearly: e.target.checked })} disabled={saving} />}
                  label="Каждый год — действует в эти же числа, без привязки к году"
                />
              </Stack>
            </Collapse>
          </Box>

          {/* ── Загрузка ── */}
          <Box>
            <FormControlLabel
              control={<Checkbox checked={form.occupancyEnabled} onChange={(e) => patchForm({ occupancyEnabled: e.target.checked })} disabled={saving} />}
              label="Загрузка — % занятых номеров на эту ночь"
            />
            <Collapse in={form.occupancyEnabled}>
              <Stack direction="row" gap={2} sx={{ pl: 4, pt: 1 }}>
                <TextField
                  label="От, %"
                  type="number"
                  value={form.occupancyFrom}
                  onChange={(e) => patchForm({ occupancyFrom: e.target.value })}
                  slotProps={{ htmlInput: { min: 0, max: 100 } }}
                  disabled={saving}
                  size="small"
                  sx={{ flex: "1 1 140px" }}
                />
                <TextField
                  label="До (не включая), %"
                  type="number"
                  value={form.occupancyTo}
                  onChange={(e) => patchForm({ occupancyTo: e.target.value })}
                  slotProps={{ htmlInput: { min: 0, max: 100 } }}
                  disabled={saving}
                  size="small"
                  sx={{ flex: "1 1 140px" }}
                />
              </Stack>
            </Collapse>
          </Box>

          {/* ── Срок до заезда ── */}
          <Box>
            <FormControlLabel
              control={<Checkbox checked={form.leadTimeEnabled} onChange={(e) => patchForm({ leadTimeEnabled: e.target.checked })} disabled={saving} />}
              label="Срок до заезда — дней от сегодня (горящие / раннее бронирование)"
            />
            <Collapse in={form.leadTimeEnabled}>
              <Stack direction="row" gap={2} sx={{ pl: 4, pt: 1 }}>
                <TextField
                  label="От, дней"
                  type="number"
                  value={form.leadTimeFrom}
                  onChange={(e) => patchForm({ leadTimeFrom: e.target.value })}
                  slotProps={{ htmlInput: { min: 0, max: 730 } }}
                  disabled={saving}
                  size="small"
                  sx={{ flex: "1 1 140px" }}
                />
                <TextField
                  label="До, дней"
                  type="number"
                  value={form.leadTimeTo}
                  onChange={(e) => patchForm({ leadTimeTo: e.target.value })}
                  slotProps={{ htmlInput: { min: 0, max: 730 } }}
                  disabled={saving}
                  size="small"
                  sx={{ flex: "1 1 140px" }}
                />
              </Stack>
            </Collapse>
          </Box>

          {/* ── Длительность ── */}
          <Box>
            <FormControlLabel
              control={<Checkbox checked={form.nightsEnabled} onChange={(e) => patchForm({ nightsEnabled: e.target.checked })} disabled={saving} />}
              label="Длительность — ночей в брони"
            />
            <Collapse in={form.nightsEnabled}>
              <Stack direction="row" gap={2} sx={{ pl: 4, pt: 1 }}>
                <TextField
                  label="От, ночей"
                  type="number"
                  value={form.nightsFrom}
                  onChange={(e) => patchForm({ nightsFrom: e.target.value })}
                  slotProps={{ htmlInput: { min: 1, max: 365 } }}
                  disabled={saving}
                  size="small"
                  sx={{ flex: "1 1 140px" }}
                />
                <TextField
                  label="До, ночей"
                  type="number"
                  value={form.nightsTo}
                  onChange={(e) => patchForm({ nightsTo: e.target.value })}
                  slotProps={{ htmlInput: { min: 1, max: 365 } }}
                  disabled={saving}
                  size="small"
                  sx={{ flex: "1 1 140px" }}
                />
              </Stack>
            </Collapse>
          </Box>

          {/* ── Дни недели ── */}
          <Box>
            <FormControlLabel
              control={<Checkbox checked={form.daysOfWeekEnabled} onChange={(e) => patchForm({ daysOfWeekEnabled: e.target.checked })} disabled={saving} />}
              label="Дни недели"
            />
            <Collapse in={form.daysOfWeekEnabled}>
              <Box sx={{ pl: 4, pt: 1 }}>
                <ToggleButtonGroup
                  value={form.daysOfWeek}
                  onChange={(_, value: string[]) => patchForm({ daysOfWeek: value })}
                  disabled={saving}
                  sx={{ flexWrap: "wrap", gap: 0.75, "& .MuiToggleButtonGroup-grouped": { border: "1px solid", borderColor: "divider !important", borderRadius: "8px !important", m: 0 } }}
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <ToggleButton key={d.key} value={d.key} size="small">
                      {d.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Box>
            </Collapse>
          </Box>
        </Stack>
      </Paper>

      <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
          Категории номеров
        </Typography>

        <FormControlLabel
          control={
            <Checkbox
              checked={form.allCategories}
              onChange={(e) => patchForm({ allCategories: e.target.checked })}
              disabled={saving || roomTypes.length === 0}
            />
          }
          label="Все категории, включая те, что заведут позже"
        />

        {!form.allCategories && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 1.5 }}>
              Или выберите конкретные:
            </Typography>
            {roomTypes.length === 0 ? (
              <Typography variant="body2" color="text.disabled">
                Категорий пока нет — сначала заведите их в «Категории и тарифы».
              </Typography>
            ) : (
              <ToggleButtonGroup
                value={form.roomTypeIds}
                onChange={(_, value: number[]) => patchForm({ roomTypeIds: value })}
                disabled={saving}
                sx={{ flexWrap: "wrap", gap: 0.75, "& .MuiToggleButtonGroup-grouped": { border: "1px solid", borderColor: "divider !important", borderRadius: "8px !important", m: 0 } }}
              >
                {roomTypes.map((rt) => (
                  <ToggleButton key={rt.id} value={rt.id} size="small">
                    {rt.name}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            )}
          </>
        )}

        {amountValue !== 0 && selectedRoomTypes.length > 0 && (
          <Alert severity="info" variant="outlined" sx={{ fontSize: "0.8rem", mt: 2 }}>
            {!anyConditionEnabled && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Ни одно условие не включено — правило действует на каждую ночь.
              </Typography>
            )}
            {simLoading && !simResult ? (
              <Typography variant="body2">Считаем…</Typography>
            ) : simResult && simResult.roomTypes.length > 0 ? (
              <Stack gap={0.25}>
                {simResult.roomTypes.map((rt) => {
                  // Одному правилу без других пересечений цена обычно одна на все ночи —
                  // берём первую как представительную, а не считаем среднее/диапазон.
                  const first = rt.nights[0];
                  if (!first) return null;
                  const before = Number(first.before);
                  const after = Number(first.after);
                  const delta = Number(first.delta);
                  // См. комментарий у HotelPricingRuleSimulateNight в api/hotel.ts —
                  // isManualOverride и ruleApplied вместе различают 4 случая.
                  let note = "";
                  if (first.isManualOverride) {
                    note = delta === 0 ? " (здесь стоит ручная цена)" : " (ручная цена, донастроена условиями брони)";
                  } else if (!first.ruleApplied && delta === 0) {
                    note = " (не сработало — не подошли условия или проиграло другому правилу в группе)";
                  } else if (first.ruleApplied && delta === 0) {
                    note = " (упёрлось в мин/макс цену категории)";
                  } else if (after < before) {
                    note = " (скидка)";
                  } else if (after > before) {
                    note = " (дороже)";
                  }
                  return (
                    <Typography key={rt.roomTypeId} variant="body2" component="span">
                      {rt.roomTypeName}: {before.toLocaleString("ru-RU")} → <strong>{after.toLocaleString("ru-RU")} сом</strong>
                      {note}
                    </Typography>
                  );
                })}
              </Stack>
            ) : (
              // Предпросчёт недоступен (сеть, условия не покрывают окно) — грубая
              // локальная оценка БЕЗ учёта других правил и БЕЗ учёта условий загрузки/
              // срока/длительности/дня недели, чтобы блок не пустовал молча.
              <Stack gap={0.25}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                  Предпросчёт с сервера недоступен — грубая оценка без учёта условий и других правил:
                </Typography>
                {selectedRoomTypes.map((rt) => {
                  const base = Number(rt.totalPrice);
                  const adjusted =
                    form.adjustmentType === "percent"
                      ? Math.round(base * (1 + amountValue / 100))
                      : Math.max(0, base + amountValue);
                  return (
                    <Typography key={rt.id} variant="body2" component="span">
                      {rt.name}: {base.toLocaleString("ru-RU")} → <strong>{adjusted.toLocaleString("ru-RU")} сом</strong>
                      {isDiscount ? " (скидка)" : " (дороже)"}
                    </Typography>
                  );
                })}
              </Stack>
            )}
          </Alert>
        )}
      </Paper>

      <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
        <Stack
          direction="row"
          alignItems="center"
          gap={1}
          sx={{ cursor: "pointer" }}
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          <ExpandMoreOutlined fontSize="small" sx={{ transform: advancedOpen ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
          <Typography variant="subtitle2" fontWeight={600}>
            Дополнительно
          </Typography>
        </Stack>
        <Collapse in={advancedOpen}>
          <Stack gap={2} sx={{ pt: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Нужно, только если несколько правил могут сработать на одну ночь одновременно —
              например, ступени загрузки 0–50% / 50–80% / 80–100%: дайте им одну «Группу»,
              чтобы сработала только одна ступень, а не все разом.
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={2}>
              <TextField
                label="Приоритет"
                type="number"
                value={form.priority}
                onChange={(e) => patchForm({ priority: e.target.value })}
                helperText="Меньше — раньше. Пусто — по умолчанию (100)"
                disabled={saving}
                size="small"
                sx={{ flex: "1 1 180px" }}
              />
              <TextField
                label="Группа (exclusiveGroup)"
                placeholder="Например, occupancy"
                value={form.exclusiveGroup}
                onChange={(e) => patchForm({ exclusiveGroup: e.target.value })}
                helperText="Правила одной группы — сработает только первое по приоритету"
                disabled={saving}
                size="small"
                sx={{ flex: "1 1 220px" }}
              />
            </Stack>
          </Stack>
        </Collapse>
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
        <Button variant="contained" disabled={!canSubmit || saving} onClick={() => void submit()}>
          {saving ? "Сохраняем…" : editing ? "Сохранить" : "Добавить"}
        </Button>
      </Stack>
    </Stack>
  );
};

export const HotelPricingRuleFormPage: React.FC = () => {
  const { ruleId } = useParams();
  const isEdit = ruleId != null;
  usePageTitle(isEdit ? "Правило цены" : "Новое правило");
  const theme = useTheme();
  const { property } = useHotelProperty();
  const canManageRates = useCan("hotel.rates.manage");

  const roomTypesQuery = useQuery({
    queryKey: ["hotel", "roomTypes", property?.id],
    queryFn: ({ signal }) => listRoomTypes(property!.id, {}, signal),
    enabled: property != null,
  });
  const rulesQuery = useQuery({
    queryKey: ["hotel", "pricingRules", property?.id],
    queryFn: ({ signal }) => listPricingRules(property!.id, signal),
    enabled: property != null && isEdit,
  });

  const editing = isEdit ? (rulesQuery.data ?? []).find((r) => String(r.id) === ruleId) ?? null : null;
  const loading = roomTypesQuery.isLoading || (isEdit && rulesQuery.isLoading);

  return (
    <Box sx={{ height: "100%", overflow: "auto", px: theme.appLayout.page.paddingX, py: 2 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" gap={1}>
          <Tooltip title="К списку правил">
            <IconButton size="small" component={RouterLink} to={LIST_PATH} aria-label="К списку правил">
              <ArrowBackOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
          <PriceChangeOutlined color="action" />
          <Typography variant="h6" fontWeight={600}>
            {isEdit ? (editing ? `Правило «${editing.name}»` : "Правило") : "Новое правило"}
          </Typography>
        </Stack>

        {!canManageRates ? (
          <Alert
            severity="warning"
            variant="outlined"
            action={
              <Button color="inherit" size="small" component={RouterLink} to={LIST_PATH}>
                К списку
              </Button>
            }
          >
            Изменение правил недоступно вашей роли.
          </Alert>
        ) : loading ? (
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
            Правило не найдено — возможно, его уже нет в этом объекте.
          </Alert>
        ) : (
          <RuleForm key={ruleId ?? "new"} propertyId={property.id} editing={editing} roomTypes={roomTypesQuery.data ?? []} />
        )}
      </Stack>
    </Box>
  );
};

export default HotelPricingRuleFormPage;
