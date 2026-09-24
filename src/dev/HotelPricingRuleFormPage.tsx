/**
 * «Ценообразование» → «Новое правило» / «Изменить» — форма правила динамической
 * цены на отдельной странице, а не диалогом; к «Настройкам» страница отношения
 * не имеет (рельса SettingsLayout нет). Маршруты /pricing-rules/new (создание)
 * и /pricing-rules/:ruleId (правка) ведут на эту же страницу. Гейт страницы —
 * hotel.view (PAGE_PERMISSIONS.hotelPricingRules), но саму форму видят только
 * с hotel.rates.manage (см. useCan ниже) — у «Ресепшена» этого права нет.
 * Список правил — HotelPricingRulesPage.tsx, после сохранения возвращаемся на него.
 *
 * Контракт подтверждён бек-разработчиком 24.09.2026 (см. развёрнутый комментарий
 * над HotelPricingRule в src/api/hotel.ts) — уже на test.crm.
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
 * Живой предпросчёт («было → стало») берётся с бэка (simulatePricingRule), не
 * считается на фронте — при пересечении с другими правилами процент не
 * перемножается линейно (см. комментарий в src/api/hotel.ts), локальная
 * арифметика показала бы неверную цифру.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  IconButton,
  InputAdornment,
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
  type HotelPricingRuleSimulateResult,
} from "../api/hotel";
import { getErrorMessage, isAbortError } from "../api/client";

const LIST_PATH = "/pricing-rules";
/** Пауза перед запросом предпросчёта — не дёргаем бэк на каждый символ/клик. */
const SIMULATE_DEBOUNCE_MS = 450;

interface RuleFormState {
  name: string;
  dateFrom: Dayjs | null;
  dateTo: Dayjs | null;
  percent: string;
  /** true — все категории объекта, включая будущие (roomTypeIds: [] на бэке). */
  allCategories: boolean;
  /** Имеет смысл только когда allCategories === false. */
  roomTypeIds: number[];
  recurringYearly: boolean;
  isActive: boolean;
}

const EMPTY_FORM: RuleFormState = {
  name: "",
  dateFrom: null,
  dateTo: null,
  percent: "",
  allCategories: false,
  roomTypeIds: [],
  recurringYearly: false,
  isActive: true,
};

function toForm(rule: HotelPricingRule): RuleFormState {
  return {
    name: rule.name,
    dateFrom: dayjs(rule.conditions.dateFrom),
    dateTo: dayjs(rule.conditions.dateTo),
    percent: String(Number(rule.adjustmentValue)),
    allCategories: rule.roomTypeIds.length === 0,
    roomTypeIds: [...rule.roomTypeIds],
    recurringYearly: rule.conditions.recurringAnnually,
    isActive: rule.isActive,
  };
}

/** «Событие» для одного дня, «Сезон» для диапазона — только подпись, на расчёт не влияет (см. hotel.ts). */
function deriveCategory(dateFrom: Dayjs, dateTo: Dayjs): HotelPricingRuleCategory {
  return dateFrom.isSame(dateTo, "day") ? "event" : "season";
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

  const [form, setForm] = React.useState<RuleFormState>(() => (editing ? toForm(editing) : EMPTY_FORM));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const patchForm = (patch: Partial<RuleFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const invalidateRules = () => void queryClient.invalidateQueries({ queryKey: ["hotel", "pricingRules", propertyId] });

  const percentValue = Number(form.percent) || 0;
  const canSubmit =
    form.name.trim() !== "" &&
    form.dateFrom != null &&
    form.dateTo != null &&
    form.percent.trim() !== "" &&
    (form.allCategories || form.roomTypeIds.length > 0);

  const submit = async () => {
    if (!canSubmit || !form.dateFrom || !form.dateTo) {
      setError("Заполните название, период, процент и категории");
      return;
    }
    if (!form.recurringYearly && form.dateTo.isBefore(form.dateFrom, "day")) {
      setError("«Дата по» раньше «Дата с»");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const conditions = {
        dateFrom: form.dateFrom.format("YYYY-MM-DD"),
        dateTo: form.dateTo.format("YYYY-MM-DD"),
        recurringAnnually: form.recurringYearly,
      };
      const roomTypeIds = form.allCategories ? [] : form.roomTypeIds;
      const category = deriveCategory(form.dateFrom, form.dateTo);
      if (editing) {
        await updatePricingRule(editing.id, {
          name: form.name.trim(),
          adjustmentValue: String(percentValue),
          conditions,
          roomTypeIds,
          category,
          isActive: form.isActive,
          version: editing.version,
        });
      } else {
        await createPricingRule({
          propertyId,
          name: form.name.trim(),
          adjustmentType: "percent",
          adjustmentValue: String(percentValue),
          conditions,
          roomTypeIds,
          category,
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

  const isDiscount = percentValue < 0;
  const selectedRoomTypes = form.allCategories ? roomTypes : roomTypes.filter((rt) => form.roomTypeIds.includes(rt.id));

  // ── Живой предпросчёт с бэка (simulatePricingRule) — см. комментарий в шапке файла.
  const [simResult, setSimResult] = React.useState<HotelPricingRuleSimulateResult | null>(null);
  const [simLoading, setSimLoading] = React.useState(false);
  React.useEffect(() => {
    if (!canSubmit || !form.dateFrom || !form.dateTo || percentValue === 0) {
      setSimResult(null);
      return;
    }
    const dateFrom = form.dateFrom;
    const dateTo = form.dateTo;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSimLoading(true);
      simulatePricingRule(
        {
          propertyId,
          adjustmentType: "percent",
          adjustmentValue: String(percentValue),
          conditions: {
            dateFrom: dateFrom.format("YYYY-MM-DD"),
            dateTo: dateTo.format("YYYY-MM-DD"),
            recurringAnnually: form.recurringYearly,
          },
          roomTypeIds: form.allCategories ? [] : form.roomTypeIds,
          category: deriveCategory(dateFrom, dateTo),
        },
        controller.signal,
      )
        .then((res) => setSimResult(res))
        // Форма предпросчёта — необязательное удобство: не смогли получить (сеть, ещё не
        // подтверждённая форма ответа бэка) — просто прячем блок, не мешаем сохранению.
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
  }, [propertyId, form.dateFrom, form.dateTo, form.percent, form.roomTypeIds, form.allCategories, form.recurringYearly, canSubmit]);

  return (
    <Stack gap={2} sx={{ maxWidth: 720 }}>
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

          <Stack direction="row" flexWrap="wrap" gap={2}>
            <CustomDatePicker
              label="Дата с"
              value={form.dateFrom}
              onChange={(v) => {
                // «Дата по» раньше новой «Дата с» — переносим следом, чтобы не остался
                // обратный диапазон; для правила на один день так они и совпадают.
                // Не трогаем при «Каждый год»: там «раньше» — легитимный переход через
                // Новый год (31.12 → 02.01), а не ошибка.
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
              // При «Каждый год» «Дата по» может быть раньше «Дата с» по числу месяца —
              // это переход через Новый год, а не ошибка, поэтому не ограничиваем minDate.
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
            control={
              <Checkbox
                checked={form.recurringYearly}
                onChange={(e) => patchForm({ recurringYearly: e.target.checked })}
                disabled={saving}
              />
            }
            label="Каждый год — действует в эти же числа, без привязки к году"
          />

          <TextField
            label="Процент"
            type="number"
            value={form.percent}
            onChange={(e) => patchForm({ percent: e.target.value })}
            helperText="Положительный — дороже (20), отрицательный — скидка (-15); от −99 до 1000"
            disabled={saving}
            slotProps={{
              htmlInput: { step: "0.01", min: -99, max: 1000 },
              input: { endAdornment: <InputAdornment position="end">%</InputAdornment> },
            }}
            sx={{ maxWidth: 260 }}
          />

          <FormControlLabel
            control={<Checkbox checked={form.isActive} onChange={(e) => patchForm({ isActive: e.target.checked })} disabled={saving} />}
            label="Активно — если выключить, цена в этот период останется обычной"
          />
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

        {percentValue !== 0 && selectedRoomTypes.length > 0 && (
          <Alert severity="info" variant="outlined" sx={{ fontSize: "0.8rem", mt: 2 }}>
            {simLoading && !simResult ? (
              <Typography variant="body2">Считаем…</Typography>
            ) : simResult && simResult.nights.length > 0 ? (
              <Stack gap={0.25}>
                {(() => {
                  // Группируем по категории — по ночам может быть несколько строк на одну
                  // категорию (несовпадающие цены внутри периода), берём первую/последнюю ночь.
                  const byType = new Map<number, { name: string; before: number; after: number }>();
                  for (const n of simResult.nights) {
                    if (!byType.has(n.roomTypeId)) {
                      byType.set(n.roomTypeId, { name: n.roomTypeName, before: Number(n.before), after: Number(n.after) });
                    }
                  }
                  return [...byType.values()].map((rt) => (
                    <Typography key={rt.name} variant="body2" component="span">
                      {rt.name}: {rt.before.toLocaleString("ru-RU")} → <strong>{rt.after.toLocaleString("ru-RU")} сом</strong>
                      {rt.after < rt.before ? " (скидка)" : " (дороже)"}
                    </Typography>
                  ));
                })()}
              </Stack>
            ) : (
              // Предпросчёт недоступен (сеть, форма ответа бэка ещё не подтверждена) — грубая
              // локальная оценка БЕЗ учёта других правил, чтобы блок не пустовал молча.
              <Stack gap={0.25}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                  Предпросчёт с сервера недоступен — грубая оценка без учёта других правил:
                </Typography>
                {selectedRoomTypes.map((rt) => {
                  const base = Number(rt.totalPrice);
                  const adjusted = Math.round(base * (1 + percentValue / 100));
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
