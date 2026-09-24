/**
 * «Ценообразование» Viva — самостоятельная страница отеля, рядом с «Категории
 * и тарифы»: пункт сайдбара во вкладке «Организация», не раздел «Настроек»
 * (рельса SettingsLayout здесь нет). Маршрут /pricing-rules гейтит hotel.view
 * (PAGE_PERMISSIONS.hotelPricingRules, см. App.tsx, accessPermissions.ts) —
 * это право на ЧТЕНИЕ; запись (кнопки ниже, переключатель) отдельно проверяет
 * useCan("hotel.rates.manage") — у «Ресепшена» его нет, страница для них
 * только читается.
 *
 * Правило меняет цену выбранных категорий номеров на процент или сумму за ночь
 * (положительное — дороже, отрицательное — скидка) при выполнении её условий:
 * даты, загрузка, срок до заезда, длительность, день недели — любая
 * комбинация одновременно, см. describeConditions ниже и комментарий в
 * HotelPricingRuleFormPage.tsx. Выключить правило можно переключателем прямо
 * в списке, не удаляя его — например, снять наценку на праздники в этом году.
 * Добавление («Добавить правило» → /pricing-rules/new) и правка («Изменить» →
 * /pricing-rules/:ruleId) — отдельная страница-форма HotelPricingRuleFormPage.tsx.
 *
 * Контракт — «Ответ бэкенда: динамическое ценообразование отеля (Viva)»,
 * 24.09.2026 (см. развёрнутый комментарий над HotelPricingRule в
 * src/api/hotel.ts) — уже на test.crm. Сама цена (totalPrice/nightPrice)
 * по-прежнему считается бэкендом — фронт проценты/суммы не пересчитывает
 * нигде, кроме живого предпросчёта в форме (simulatePricingRule).
 */
import React from "react";
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Switch, Typography, useTheme } from "@mui/material";
import AddOutlined from "@mui/icons-material/AddOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PriceChangeOutlined from "@mui/icons-material/PriceChangeOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router";
import dayjs from "dayjs";

import { usePageTitle } from "../hooks/usePageTitle";
import { useCan } from "../hooks/useCan";
import { useHotelProperty } from "./useHotelProperty";
import { formatHotelDate } from "./mockDemoData";
import { listRoomTypes, listPricingRules, updatePricingRule, type HotelPricingRule } from "../api/hotel";
import { getErrorMessage } from "../api/client";

const DAY_LABELS_RU: Record<string, string> = {
  monday: "Пн", tuesday: "Вт", wednesday: "Ср", thursday: "Чт", friday: "Пт", saturday: "Сб", sunday: "Вс",
};

/** «1 – 10 августа» / «21 марта» — dateTo здесь ВКЛЮЧИТЕЛЬНО, в отличие от formatHotelDateRange (бронь). */
function formatRuleRange(dateFrom: string, dateTo: string): string {
  if (dateFrom === dateTo) return formatHotelDate(dateFrom);
  const from = dayjs(dateFrom);
  const to = dayjs(dateTo);
  if (from.month() === to.month() && from.year() === to.year()) {
    return `${from.date()} – ${formatHotelDate(dateTo)}`;
  }
  return `${formatHotelDate(dateFrom)} – ${formatHotelDate(dateTo)}`;
}

/** Короткие подписи всех включённых условий правила — для чипов в списке. */
function describeConditions(rule: HotelPricingRule): string[] {
  const c = rule.conditions;
  const parts: string[] = [];
  if (c.dateFrom && c.dateTo) {
    parts.push(formatRuleRange(c.dateFrom, c.dateTo) + (c.recurringAnnually ? " · каждый год" : ""));
  }
  if (c.occupancyFrom != null || c.occupancyTo != null) {
    parts.push(`Загрузка ${c.occupancyFrom ?? 0}–${c.occupancyTo ?? 100}%`);
  }
  if (c.leadTimeFrom != null || c.leadTimeTo != null) {
    parts.push(`До заезда ${c.leadTimeFrom ?? 0}–${c.leadTimeTo ?? "∞"} дн.`);
  }
  if (c.nightsFrom != null || c.nightsTo != null) {
    parts.push(`${c.nightsFrom ?? 1}–${c.nightsTo ?? "∞"} ноч.`);
  }
  if (c.daysOfWeek && c.daysOfWeek.length > 0) {
    parts.push(c.daysOfWeek.map((d) => DAY_LABELS_RU[d] ?? d).join(", "));
  }
  return parts;
}

export const HotelPricingRulesPage: React.FC = () => {
  usePageTitle("Ценообразование");
  const theme = useTheme();
  const { property } = useHotelProperty();
  const queryClient = useQueryClient();
  const canManageRates = useCan("hotel.rates.manage");
  const [toggleError, setToggleError] = React.useState<string | null>(null);
  const [togglingId, setTogglingId] = React.useState<number | null>(null);

  const roomTypesQuery = useQuery({
    queryKey: ["hotel", "roomTypes", property?.id],
    queryFn: ({ signal }) => listRoomTypes(property!.id, {}, signal),
    enabled: property != null,
  });
  const roomTypes = roomTypesQuery.data ?? [];
  const roomTypeName = (id: number) => roomTypes.find((rt) => rt.id === id)?.name ?? `#${id}`;

  const rulesQuery = useQuery({
    queryKey: ["hotel", "pricingRules", property?.id],
    queryFn: ({ signal }) => listPricingRules(property!.id, signal),
    enabled: property != null,
  });
  const rules = rulesQuery.data ?? [];

  const loading = roomTypesQuery.isLoading || rulesQuery.isLoading;
  // Ошибку загрузки не выдаём за «Правил пока нет»: при сбое сети это увело бы человека заводить дубли.
  const loadError = roomTypesQuery.isError || rulesQuery.isError;
  const retryLoad = () => {
    void roomTypesQuery.refetch();
    void rulesQuery.refetch();
  };

  const toggleActive = async (rule: HotelPricingRule) => {
    setToggleError(null);
    setTogglingId(rule.id);
    try {
      await updatePricingRule(rule.id, { isActive: !rule.isActive, version: rule.version });
    } catch (err) {
      // 409 VERSION_CONFLICT — правило успели изменить где-то ещё; сообщение
      // бэка так и говорит, а инвалидация ниже (finally) подтянет актуальную
      // version, чтобы повторное нажатие уже не конфликтовало.
      setToggleError(getErrorMessage(err, "Не удалось изменить правило"));
    } finally {
      void queryClient.invalidateQueries({ queryKey: ["hotel", "pricingRules", property?.id] });
      setTogglingId(null);
    }
  };

  return (
    <Box sx={{ height: "100%", overflow: "auto", px: theme.appLayout.page.paddingX, py: 2 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
          <Stack direction="row" alignItems="center" gap={1}>
            <PriceChangeOutlined color="action" />
            <Typography variant="h6" fontWeight={600}>
              Ценообразование
            </Typography>
          </Stack>
          {canManageRates && (
            <Button
              size="small"
              variant="contained"
              startIcon={<AddOutlined />}
              component={RouterLink}
              to="/pricing-rules/new"
              disabled={!property || roomTypes.length === 0}
            >
              Добавить правило
            </Button>
          )}
        </Stack>

        <Alert severity="info" variant="outlined" sx={{ fontSize: "0.8rem" }}>
          Правило меняет цену выбранных категорий на процент или сумму за ночь при выполнении условий —
          даты, загрузка, срок до заезда, длительность, день недели, любая комбинация сразу. {canManageRates
            ? "Переключатель ниже выключает правило, не удаляя его — например, чтобы на праздники в этом году цена осталась обычной."
            : "Изменение правил недоступно вашей роли — здесь только просмотр."}
        </Alert>

        {toggleError && (
          <Alert severity="warning" variant="outlined" sx={{ fontSize: "0.8rem" }} onClose={() => setToggleError(null)}>
            {toggleError}
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
            Не удалось загрузить правила.
          </Alert>
        ) : (
          <Stack gap={2} sx={{ maxWidth: 720 }}>
            {roomTypes.length === 0 && (
              <Typography variant="body2" color="text.disabled">
                Сначала заведите категории номеров в разделе «Категории и тарифы» — правило применяется к ним.
              </Typography>
            )}
            {roomTypes.length > 0 && rules.length === 0 && (
              <Typography variant="body2" color="text.disabled">
                Правил пока нет{canManageRates ? " — начните с «Добавить правило»." : "."}
              </Typography>
            )}
            {rules.map((rule) => {
              const amount = Number(rule.adjustmentValue);
              const isDiscount = amount < 0;
              // Пустой roomTypeIds — не «ни одной категории», а «все категории объекта,
              // включая заведённые позже» (см. комментарий у HotelPricingRule.roomTypeIds).
              const allCategories = rule.roomTypeIds.length === 0;
              const conditionChips = describeConditions(rule);
              return (
                <Paper
                  key={rule.id}
                  elevation={0}
                  variant="outlined"
                  sx={{ p: 1.75, opacity: rule.isActive ? 1 : 0.6 }}
                >
                  <Stack direction="row" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                        <Typography variant="subtitle2" fontWeight={700}>
                          {rule.name}
                        </Typography>
                        {!rule.isActive && (
                          <Chip label="Выключено" size="small" color="default" sx={{ height: 20, fontSize: "0.7rem" }} />
                        )}
                      </Stack>
                      {conditionChips.length === 0 ? (
                        <Typography variant="caption" color="text.secondary">
                          Действует всегда
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          {conditionChips.join(" · ")}
                        </Typography>
                      )}
                    </Box>
                    <Stack direction="row" alignItems="center" gap={1}>
                      <Typography
                        variant="subtitle1"
                        fontWeight={700}
                        color={isDiscount ? "success.main" : "text.primary"}
                        sx={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {amount > 0 ? "+" : ""}
                        {amount}
                        {rule.adjustmentType === "percent" ? "%" : " сом"}
                      </Typography>
                      <Switch
                        size="small"
                        checked={rule.isActive}
                        disabled={!canManageRates || togglingId === rule.id}
                        onChange={() => void toggleActive(rule)}
                        inputProps={{ "aria-label": `${rule.isActive ? "Выключить" : "Включить"} правило «${rule.name}»` }}
                      />
                      {canManageRates && (
                        <Button size="small" startIcon={<EditOutlined fontSize="small" />} component={RouterLink} to={`/pricing-rules/${rule.id}`}>
                          Изменить
                        </Button>
                      )}
                    </Stack>
                  </Stack>
                  <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 1.25 }}>
                    {allCategories ? (
                      <Chip label="Все категории" size="small" variant="outlined" sx={{ height: 22, fontSize: "0.75rem" }} />
                    ) : (
                      rule.roomTypeIds.map((id) => (
                        <Chip key={id} label={roomTypeName(id)} size="small" variant="outlined" sx={{ height: 22, fontSize: "0.75rem" }} />
                      ))
                    )}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Box>
  );
};

export default HotelPricingRulesPage;
