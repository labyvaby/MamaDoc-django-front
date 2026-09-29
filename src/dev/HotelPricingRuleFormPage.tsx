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
  CircularProgress,
  Collapse,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import TrendingDownOutlined from "@mui/icons-material/TrendingDownOutlined";
import CalendarMonthOutlined from "@mui/icons-material/CalendarMonthOutlined";
import PieChartOutlineOutlined from "@mui/icons-material/PieChartOutlineOutlined";
import ScheduleOutlined from "@mui/icons-material/ScheduleOutlined";
import NightsStayOutlined from "@mui/icons-material/NightsStayOutlined";
import ViewWeekOutlined from "@mui/icons-material/ViewWeekOutlined";
import { FilterChip, FormCard, HotelPage, HotelPageHeader, SectionLabel, StickyActions, Surface } from "./hotelUi";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";
import { formatHotelDate } from "./mockDemoData";
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
  const theme = useTheme();
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


  // «Дороже / дешевле» — отдельным выбором, а не знаком минус в поле: в поле
  // всегда модуль, знак хранится в form.amount как раньше (бэк ждёт signed).
  const [direction, setDirection] = React.useState<"up" | "down">(() => (Number(editing?.adjustmentValue ?? 0) < 0 ? "down" : "up"));
  const absAmount = form.amount.replace("-", "");
  const setAbsAmount = (raw: string) => {
    const clean = raw.replace(/[^\d.,]/g, "").replace(",", ".");
    patchForm({ amount: clean === "" ? "" : direction === "down" ? `-${clean}` : clean });
  };
  const chooseDirection = (d: "up" | "down") => {
    setDirection(d);
    if (absAmount !== "") patchForm({ amount: d === "down" ? `-${absAmount}` : absAmount });
  };
  const applyPreset = (value: number) => {
    const d = value < 0 ? "down" : "up";
    setDirection(d);
    patchForm({ adjustmentType: "percent", amount: String(value) });
  };

  const unit = form.adjustmentType === "percent" ? "%" : " сом";
  const summaryParts: string[] = [];
  summaryParts.push(form.allCategories ? "все категории" : selectedRoomTypes.length > 0 ? selectedRoomTypes.map((rt) => rt.name).join(", ") : "категории не выбраны");
  if (form.datesEnabled && form.dateFrom && form.dateTo) {
    summaryParts.push(
      (form.dateFrom.isSame(form.dateTo, "day")
        ? formatHotelDate(form.dateFrom.format("YYYY-MM-DD"))
        : `${formatHotelDate(form.dateFrom.format("YYYY-MM-DD"))} – ${formatHotelDate(form.dateTo.format("YYYY-MM-DD"))}`) +
        (form.recurringYearly ? " каждый год" : ""),
    );
  }
  if (form.occupancyEnabled && (form.occupancyFrom || form.occupancyTo)) summaryParts.push(`загрузка ${form.occupancyFrom || 0}–${form.occupancyTo || 100}%`);
  if (form.leadTimeEnabled && (form.leadTimeFrom || form.leadTimeTo)) summaryParts.push(`за ${form.leadTimeFrom || 0}–${form.leadTimeTo || "∞"} дн. до заезда`);
  if (form.nightsEnabled && (form.nightsFrom || form.nightsTo)) summaryParts.push(`от ${form.nightsFrom || 1} до ${form.nightsTo || "∞"} ноч.`);
  if (form.daysOfWeekEnabled && form.daysOfWeek.length > 0)
    summaryParts.push(DAYS_OF_WEEK.filter((d) => form.daysOfWeek.includes(d.key)).map((d) => d.label).join(", "));
  if (!anyConditionEnabled) summaryParts.push("всегда");

  // Цены «было → стало» для превью: с сервера (simulate) или грубая локальная оценка.
  const pricePreview: { key: string | number; name: string; before: number; after: number; note?: string }[] =
    simResult && simResult.roomTypes.length > 0
      ? simResult.roomTypes.flatMap((rt) => {
          // Представительная ночь — та, где правило сработало (у «Сб, Вс» первая
          // ночь окна — будний день, и превью врало «не сработало»); нет таких — первая.
          const first = rt.nights.find((n) => n.ruleApplied) ?? rt.nights[0];
          if (!first) return [];
          const delta = Number(first.delta);
          let note: string | undefined;
          if (first.isManualOverride) note = delta === 0 ? "ручная цена" : "ручная цена, донастроена";
          else if (!first.ruleApplied && delta === 0) note = "не сработало";
          else if (first.ruleApplied && delta === 0) note = "упёрлось в мин/макс";
          return [{ key: rt.roomTypeId, name: rt.roomTypeName, before: Number(first.before), after: Number(first.after), note }];
        })
      : selectedRoomTypes.map((rt) => {
          const base = Number(rt.totalPrice);
          const after = form.adjustmentType === "percent" ? Math.round(base * (1 + amountValue / 100)) : Math.max(0, base + amountValue);
          return { key: rt.id, name: rt.name, before: base, after };
        });
  const previewIsEstimate = !(simResult && simResult.roomTypes.length > 0);

  const conditionTiles: {
    key: string;
    icon: React.ReactNode;
    title: string;
    description: string;
    enabled: boolean;
    toggle: (v: boolean) => void;
    body: React.ReactNode;
  }[] = [
    {
      key: "dates",
      icon: <CalendarMonthOutlined />,
      title: "Даты",
      description: "Сезон, праздник, конкретный период",
      enabled: form.datesEnabled,
      toggle: (v) => patchForm({ datesEnabled: v }),
      body: (
        <Stack gap={1.5}>
          <Stack direction="row" flexWrap="wrap" gap={2}>
            <CustomDatePicker
              label="С"
              value={form.dateFrom}
              onChange={(v) => {
                if (!form.recurringYearly && v && (!form.dateTo || form.dateTo.isBefore(v, "day"))) {
                  patchForm({ dateFrom: v, dateTo: v });
                } else {
                  patchForm({ dateFrom: v });
                }
              }}
              slotProps={{ textField: { size: "small", disabled: saving } }}
              sx={{ flex: "1 1 180px" }}
            />
            <CustomDatePicker
              label="По"
              value={form.dateTo}
              onChange={(v) => patchForm({ dateTo: v })}
              minDate={form.recurringYearly ? undefined : (form.dateFrom ?? undefined)}
              slotProps={{
                textField: {
                  size: "small",
                  disabled: saving,
                  helperText: form.recurringYearly ? "Может быть раньше «С» — через Новый год" : "Для одного дня — та же дата",
                },
              }}
              sx={{ flex: "1 1 180px" }}
            />
          </Stack>
          <FormControlLabel
            control={<Switch size="small" checked={form.recurringYearly} onChange={(e) => patchForm({ recurringYearly: e.target.checked })} disabled={saving} />}
            label={<Typography variant="body2">Каждый год в эти же числа</Typography>}
          />
        </Stack>
      ),
    },
    {
      key: "occupancy",
      icon: <PieChartOutlineOutlined />,
      title: "Загрузка отеля",
      description: "Сколько % номеров занято на эту ночь",
      enabled: form.occupancyEnabled,
      toggle: (v) => patchForm({ occupancyEnabled: v }),
      body: (
        <RangeFields
          fromLabel="От"
          toLabel="До (не включая)"
          unit="%"
          from={form.occupancyFrom}
          to={form.occupancyTo}
          min={0}
          max={100}
          disabled={saving}
          onFrom={(v) => patchForm({ occupancyFrom: v })}
          onTo={(v) => patchForm({ occupancyTo: v })}
        />
      ),
    },
    {
      key: "leadTime",
      icon: <ScheduleOutlined />,
      title: "Срок до заезда",
      description: "Горящие номера или раннее бронирование",
      enabled: form.leadTimeEnabled,
      toggle: (v) => patchForm({ leadTimeEnabled: v }),
      body: (
        <RangeFields
          fromLabel="От"
          toLabel="До"
          unit="дн."
          from={form.leadTimeFrom}
          to={form.leadTimeTo}
          min={0}
          max={730}
          disabled={saving}
          onFrom={(v) => patchForm({ leadTimeFrom: v })}
          onTo={(v) => patchForm({ leadTimeTo: v })}
        />
      ),
    },
    {
      key: "nights",
      icon: <NightsStayOutlined />,
      title: "Длительность",
      description: "Сколько ночей в брони",
      enabled: form.nightsEnabled,
      toggle: (v) => patchForm({ nightsEnabled: v }),
      body: (
        <RangeFields
          fromLabel="От"
          toLabel="До"
          unit="ноч."
          from={form.nightsFrom}
          to={form.nightsTo}
          min={1}
          max={365}
          disabled={saving}
          onFrom={(v) => patchForm({ nightsFrom: v })}
          onTo={(v) => patchForm({ nightsTo: v })}
        />
      ),
    },
    {
      key: "days",
      icon: <ViewWeekOutlined />,
      title: "Дни недели",
      description: "Например, только выходные",
      enabled: form.daysOfWeekEnabled,
      toggle: (v) => patchForm({ daysOfWeekEnabled: v }),
      body: (
        <Stack direction="row" gap={0.75} flexWrap="wrap">
          {DAYS_OF_WEEK.map((d) => (
            <FilterChip
              key={d.key}
              label={d.label}
              active={form.daysOfWeek.includes(d.key)}
              onClick={() =>
                patchForm({
                  daysOfWeek: form.daysOfWeek.includes(d.key) ? form.daysOfWeek.filter((x) => x !== d.key) : [...form.daysOfWeek, d.key],
                })
              }
            />
          ))}
        </Stack>
      ),
    },
  ];

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 360px" }, gap: 3, alignItems: "start" }}>
      <Stack gap={2.5} sx={{ minWidth: 0 }}>
        {/* ── К каким категориям ── */}
        <FormCard>
          <Stack gap={2}>
            <Typography variant="subtitle2" fontWeight={600}>
              Категории номеров
            </Typography>
            {roomTypes.length === 0 ? (
              <Typography variant="body2" color="text.disabled">
                Категорий пока нет — сначала заведите их в «Категории и тарифы».
              </Typography>
            ) : (
              <Stack direction="row" gap={0.75} flexWrap="wrap">
                <FilterChip
                  label="Все категории"
                  active={form.allCategories}
                  onClick={() => patchForm({ allCategories: !form.allCategories })}
                />
                {roomTypes.map((rt) => {
                  const active = !form.allCategories && form.roomTypeIds.includes(rt.id);
                  return (
                    <FilterChip
                      key={rt.id}
                      label={rt.name}
                      active={active}
                      onClick={() =>
                        patchForm({
                          allCategories: false,
                          roomTypeIds: active ? form.roomTypeIds.filter((id) => id !== rt.id) : [...form.roomTypeIds, rt.id],
                        })
                      }
                    />
                  );
                })}
              </Stack>
            )}
            {form.allCategories && (
              <Typography variant="caption" color="text.secondary">
                Включая категории, которые заведут позже
              </Typography>
            )}
          </Stack>
        </FormCard>

        {/* ── Что меняем ── */}
        <FormCard>
          <Stack gap={2.5}>
            <Typography variant="subtitle2" fontWeight={600}>
              Поправка к цене
            </Typography>
            <TextField
              label="Название правила"
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

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
              {(
                [
                  { d: "up", title: "Дороже", hint: "наценка", icon: <TrendingUpOutlined /> },
                  { d: "down", title: "Дешевле", hint: "скидка", icon: <TrendingDownOutlined /> },
                ] as const
              ).map((o) => {
                const active = direction === o.d;
                const tone = o.d === "up" ? theme.palette.warning.main : theme.palette.success.main;
                return (
                  <Box
                    key={o.d}
                    component="button"
                    type="button"
                    disabled={saving}
                    onClick={() => chooseDirection(o.d)}
                    aria-pressed={active}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      p: 1.75,
                      borderRadius: "12px",
                      border: `1.5px solid ${active ? tone : subtleBorder(theme)}`,
                      bgcolor: active ? alpha(tone, theme.palette.mode === "dark" ? 0.12 : 0.07) : "transparent",
                      color: "text.primary",
                      font: "inherit",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "border-color .15s, background-color .15s",
                      "&:hover": { borderColor: active ? tone : "text.secondary" },
                    }}
                  >
                    <Box sx={{ color: active ? tone : "text.secondary", display: "flex" }}>{o.icon}</Box>
                    <Box>
                      <Typography fontWeight={700}>{o.title}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {o.hint}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>

            <Stack direction={{ xs: "column", sm: "row" }} gap={1.5} alignItems={{ sm: "center" }}>
              <TextField
                label={direction === "down" ? "Размер скидки" : "Размер наценки"}
                value={absAmount}
                onChange={(e) => setAbsAmount(e.target.value)}
                disabled={saving}
                inputMode="decimal"
                slotProps={{
                  input: {
                    startAdornment: <InputAdornment position="start">{direction === "down" ? "−" : "+"}</InputAdornment>,
                    endAdornment: <InputAdornment position="end">{form.adjustmentType === "percent" ? "%" : "сом / ночь"}</InputAdornment>,
                    sx: { fontSize: 18, fontWeight: 700 },
                  },
                }}
                helperText={form.adjustmentType === "percent" ? "До 99% скидки, до 1000% наценки" : "Фиксированная сумма к цене каждой ночи"}
                sx={{ flex: 1 }}
              />
              <Stack direction="row" gap={0.75} sx={{ alignSelf: { sm: "flex-start" }, pt: { sm: 0.75 } }}>
                <FilterChip label="%" active={form.adjustmentType === "percent"} onClick={() => patchForm({ adjustmentType: "percent" })} />
                <FilterChip label="сом" active={form.adjustmentType === "amount"} onClick={() => patchForm({ adjustmentType: "amount" })} />
              </Stack>
            </Stack>

            <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap">
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                Быстро:
              </Typography>
              {[10, 20, 30, -10, -15, -20].map((v) => (
                <FilterChip
                  key={v}
                  label={`${v > 0 ? "+" : "−"}${Math.abs(v)}%`}
                  active={form.adjustmentType === "percent" && amountValue === v}
                  onClick={() => applyPreset(v)}
                />
              ))}
            </Stack>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                Тип — только подпись в списке, на расчёт не влияет
              </Typography>
              <Stack direction="row" gap={0.75} flexWrap="wrap">
                {(Object.keys(CATEGORY_LABELS) as HotelPricingRuleCategory[]).map((key) => (
                  <FilterChip key={key} label={CATEGORY_LABELS[key]} active={form.category === key} onClick={() => patchForm({ category: key })} />
                ))}
              </Stack>
            </Box>

            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              gap={2}
              sx={{ px: 2, py: 1.25, borderRadius: "12px", bgcolor: subtleBg(theme, true) }}
            >
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  Правило включено
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Выключенное хранится, но цену не меняет
                </Typography>
              </Box>
              <Switch checked={form.isActive} onChange={(e) => patchForm({ isActive: e.target.checked })} disabled={saving} />
            </Stack>
          </Stack>
        </FormCard>

        {/* ── Когда действует ── */}
        <FormCard>
          <Stack gap={1.5}>
            <Typography variant="subtitle2" fontWeight={600}>
              Когда действует
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: -0.5, mb: 0.5 }}>
              Включённые условия должны выполняться одновременно. Ничего не включено — правило действует всегда.
            </Typography>
            {conditionTiles.map((c) => (
              <Box
                key={c.key}
                sx={{
                  borderRadius: "12px",
                  border: `1px solid ${c.enabled ? theme.palette.text.secondary : subtleBorder(theme)}`,
                  transition: "border-color .15s",
                  overflow: "hidden",
                }}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  gap={1.5}
                  onClick={() => !saving && c.toggle(!c.enabled)}
                  sx={{ px: 2, py: 1.25, cursor: saving ? "default" : "pointer" }}
                >
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: "10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      bgcolor: subtleBg(theme, true),
                      color: c.enabled ? "text.primary" : "text.secondary",
                      "& svg": { fontSize: 19 },
                    }}
                  >
                    {c.icon}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {c.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {c.description}
                    </Typography>
                  </Box>
                  <Switch
                    checked={c.enabled}
                    disabled={saving}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => c.toggle(e.target.checked)}
                    inputProps={{ "aria-label": c.title }}
                  />
                </Stack>
                <Collapse in={c.enabled}>
                  <Box sx={{ px: 2, pb: 2, pt: 0.5 }}>{c.body}</Box>
                </Collapse>
              </Box>
            ))}
          </Stack>
        </FormCard>

        {/* ── Дополнительно ── */}
        <FormCard>
          <Stack direction="row" alignItems="center" gap={1} sx={{ cursor: "pointer" }} onClick={() => setAdvancedOpen((v) => !v)}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" fontWeight={700}>
                Несколько правил на одну ночь
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Приоритет и группа — нужно редко
              </Typography>
            </Box>
            <ExpandMoreOutlined sx={{ color: "text.secondary", transform: advancedOpen ? "rotate(180deg)" : "none", transition: "transform .15s ease" }} />
          </Stack>
          <Collapse in={advancedOpen}>
            <Stack gap={2} sx={{ pt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Например, ступени загрузки 0–50% / 50–80% / 80–100%: дайте им одну группу, чтобы сработала только одна
                ступень, а не все разом.
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={2}>
                <TextField
                  label="Приоритет"
                  type="number"
                  value={form.priority}
                  onChange={(e) => patchForm({ priority: e.target.value })}
                  helperText="Меньше — раньше. Пусто — 100"
                  disabled={saving}
                  size="small"
                  sx={{ flex: "1 1 180px" }}
                />
                <TextField
                  label="Группа"
                  placeholder="Например, occupancy"
                  value={form.exclusiveGroup}
                  onChange={(e) => patchForm({ exclusiveGroup: e.target.value })}
                  helperText="В группе сработает только первое по приоритету"
                  disabled={saving}
                  size="small"
                  sx={{ flex: "1 1 220px" }}
                />
              </Stack>
            </Stack>
          </Collapse>
        </FormCard>

        {error && (
          <Alert severity="warning" variant="outlined" sx={{ fontSize: "0.8rem" }}>
            {error}
          </Alert>
        )}

        <StickyActions>
          <Button component={RouterLink} to={LIST_PATH} disabled={saving}>
            Отмена
          </Button>
          <Button variant="contained" disableElevation disabled={!canSubmit || saving} onClick={() => void submit()} sx={{ px: 3 }}>
            {saving ? "Сохраняем…" : editing ? "Сохранить" : "Добавить правило"}
          </Button>
        </StickyActions>
      </Stack>

      {/* ── Живое превью ── */}
      <Box sx={{ position: { lg: "sticky" }, top: 24 }}>
        <SectionLabel>Предпросмотр</SectionLabel>
        <Surface>
          <Stack direction="row" alignItems="center" gap={1.75}>
            <Box
              sx={{
                minWidth: 84,
                px: 1,
                py: 1.1,
                borderRadius: "12px",
                textAlign: "center",
                bgcolor: amountValue === 0 ? subtleBg(theme, true) : alpha(isDiscount ? theme.palette.success.main : theme.palette.warning.main, theme.palette.mode === "dark" ? 0.18 : 0.12),
                color: amountValue === 0 ? "text.disabled" : isDiscount ? "success.main" : "warning.main",
              }}
            >
              <Typography sx={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1, color: "inherit", fontVariantNumeric: "tabular-nums" }}>
                {amountValue === 0 ? "±0" : `${amountValue > 0 ? "+" : "−"}${Math.abs(amountValue).toLocaleString("ru-RU")}${form.adjustmentType === "percent" ? "%" : ""}`}
              </Typography>
              <Typography sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", color: "inherit", opacity: 0.85 }}>
                {form.adjustmentType === "amount" ? "СОМ / НОЧЬ" : isDiscount ? "СКИДКА" : "НАЦЕНКА"}
              </Typography>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 16, fontWeight: 700 }} noWrap>
                {form.name.trim() || "Новое правило"}
              </Typography>
              <Typography variant="caption" color={form.isActive ? "success.main" : "text.disabled"} fontWeight={600}>
                {form.isActive ? "● включено" : "○ выключено"}
              </Typography>
            </Box>
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 2, lineHeight: 1.55 }}>
            {amountValue === 0
              ? "Укажите размер поправки — здесь появятся новые цены."
              : `${isDiscount ? "Скидка" : "Наценка"} ${Math.abs(amountValue).toLocaleString("ru-RU")}${unit} — ${summaryParts.join(" · ")}.`}
          </Typography>

          {amountValue !== 0 && pricePreview.length > 0 && (
            <Box sx={{ mt: 2, pt: 1, borderTop: `1px solid ${subtleBorder(theme)}` }}>
              {pricePreview.map((p, i) => {
                const delta = p.after - p.before;
                return (
                  <Stack
                    key={p.key}
                    direction="row"
                    alignItems="baseline"
                    gap={1}
                    sx={{ py: 1, borderTop: i === 0 ? "none" : `1px solid ${subtleBorder(theme)}` }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap>
                        {p.name}
                      </Typography>
                      {p.note && (
                        <Typography variant="caption" color="text.secondary">
                          {p.note}
                        </Typography>
                      )}
                    </Box>
                    <Typography variant="caption" color="text.disabled" sx={{ textDecoration: delta !== 0 ? "line-through" : "none", fontVariantNumeric: "tabular-nums" }}>
                      {p.before.toLocaleString("ru-RU")}
                    </Typography>
                    <Typography fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums", minWidth: 64, textAlign: "right" }}>
                      {p.after.toLocaleString("ru-RU")}
                    </Typography>
                  </Stack>
                );
              })}
              <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1 }}>
                {simLoading
                  ? "Пересчитываем…"
                  : previewIsEstimate
                    ? "Примерно — без учёта условий и других правил"
                    : "Цена ночи с учётом остальных правил, сом"}
              </Typography>
            </Box>
          )}
          {amountValue !== 0 && pricePreview.length === 0 && (
            <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 2 }}>
              Выберите категории — покажем новые цены.
            </Typography>
          )}
        </Surface>
      </Box>
    </Box>
  );
};

/** Пара «от — до» для условий правила. */
const RangeFields: React.FC<{
  fromLabel: string;
  toLabel: string;
  unit: string;
  from: string;
  to: string;
  min: number;
  max: number;
  disabled: boolean;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}> = ({ fromLabel, toLabel, unit, from, to, min, max, disabled, onFrom, onTo }) => (
  <Stack direction="row" gap={1.5} alignItems="center">
    <TextField
      label={fromLabel}
      type="number"
      value={from}
      onChange={(e) => onFrom(e.target.value)}
      slotProps={{ htmlInput: { min, max }, input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } }}
      disabled={disabled}
      size="small"
      sx={{ flex: 1 }}
    />
    <Typography color="text.secondary">—</Typography>
    <TextField
      label={toLabel}
      type="number"
      value={to}
      onChange={(e) => onTo(e.target.value)}
      slotProps={{ htmlInput: { min, max }, input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } }}
      disabled={disabled}
      size="small"
      sx={{ flex: 1 }}
    />
  </Stack>
);

export const HotelPricingRuleFormPage: React.FC = () => {
  const { ruleId } = useParams();
  const isEdit = ruleId != null;
  usePageTitle(isEdit ? "Правило цены" : "Новое правило");
  const { property, isLoading: propertyLoading } = useHotelProperty();
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
  const loading = propertyLoading || roomTypesQuery.isLoading || (isEdit && rulesQuery.isLoading);

  return (
    <HotelPage maxWidth={1180}>
        <HotelPageHeader
          leading={
            <Tooltip title="К списку правил">
              <IconButton component={RouterLink} to={LIST_PATH} aria-label="К списку правил" sx={{ ml: -1, mr: 0.5 }}>
                <ArrowBackOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          }
          title={isEdit ? (editing ? editing.name : "Правило") : "Новое правило"}
          subtitle="Наценка или скидка на категории номеров при заданных условиях"
        />

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
    </HotelPage>
  );
};

export default HotelPricingRuleFormPage;
