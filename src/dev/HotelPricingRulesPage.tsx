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
import { Alert, Box, Button, CircularProgress, IconButton, Stack, Switch, Tooltip, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { DisabledReason, EmptyState, HotelPage, HotelPageHeader, plural, Surface } from "./hotelUi";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";
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
  const { property, isLoading: propertyLoading } = useHotelProperty();
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

  const loading = propertyLoading || roomTypesQuery.isLoading || rulesQuery.isLoading;
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

  const activeCount = rules.filter((r) => r.isActive).length;

  return (
    <HotelPage>
        <HotelPageHeader
          title="Ценообразование"
          subtitle={
            rules.length > 0
              ? `${rules.length} ${plural(rules.length, "правило", "правила", "правил")} · ${activeCount} активно` +
                (canManageRates ? "" : " · только просмотр")
              : canManageRates
                ? undefined
                : "Только просмотр — изменение правил недоступно вашей роли"
          }
          info={
            <>
              Правило меняет цену выбранных категорий на процент или сумму за ночь при выполнении условий — даты,
              загрузка, срок до заезда, длительность, день недели, любая комбинация сразу. Переключатель выключает
              правило, не удаляя его — например, чтобы на праздники в этом году цена осталась обычной.
            </>
          }
          actions={
            canManageRates ? (
              <DisabledReason
                reason={
                  loading
                    ? "Загружаем объект и категории…"
                    : !property
                      ? "Не найден объект размещения для текущего филиала"
                      : roomTypes.length === 0
                        ? "Сначала заведите категории номеров — правило меняет их цену"
                        : null
                }
              >
                <Button
                  variant="contained"
                  disableElevation
                  startIcon={<AddOutlined />}
                  component={RouterLink}
                  to="/pricing-rules/new"
                  disabled={loading || !property || roomTypes.length === 0}
                >
                  Добавить правило
                </Button>
              </DisabledReason>
            ) : (
              <Tooltip title="Изменять правила может роль с правом «Управление тарифами»">
                <Typography variant="body2" color="text.secondary" sx={{ cursor: "help" }}>
                  Только просмотр
                </Typography>
              </Tooltip>
            )
          }
        />

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
          roomTypes.length === 0 || rules.length === 0 ? (
            <Surface>
              <EmptyState
                icon={<PriceChangeOutlined />}
                title={roomTypes.length === 0 ? "Сначала нужны категории" : "Правил пока нет"}
                description={
                  roomTypes.length === 0
                    ? "Правило меняет цену категорий номеров — заведите их в «Категориях и тарифах»."
                    : "Например: +15% на выходные, −10% при бронировании за 30 дней, +20% при загрузке выше 80%."
                }
                action={
                  roomTypes.length === 0 ? (
                    <Button variant="contained" disableElevation component={RouterLink} to="/room-categories">
                      Перейти к категориям
                    </Button>
                  ) : canManageRates ? (
                    <Button variant="contained" disableElevation startIcon={<AddOutlined />} component={RouterLink} to="/pricing-rules/new">
                      Добавить правило
                    </Button>
                  ) : undefined
                }
              />
            </Surface>
          ) : (
            <Surface padded={false} sx={{ overflow: "hidden" }}>
              {rules.map((rule, i) => {
                const amount = Number(rule.adjustmentValue);
                const isDiscount = amount < 0;
                const tone = isDiscount ? theme.palette.success.main : theme.palette.warning.main;
                // Пустой roomTypeIds — не «ни одной категории», а «все категории объекта,
                // включая заведённые позже» (см. комментарий у HotelPricingRule.roomTypeIds).
                const allCategories = rule.roomTypeIds.length === 0;
                const conditions = describeConditions(rule);
                const tags = [
                  ...(conditions.length === 0 ? ["Действует всегда"] : conditions),
                  ...(allCategories ? ["Все категории"] : rule.roomTypeIds.map(roomTypeName)),
                ];
                return (
                  <Stack
                    key={rule.id}
                    direction="row"
                    alignItems="center"
                    gap={2}
                    sx={{
                      px: { xs: 2, md: 2.5 },
                      py: 2,
                      borderTop: i === 0 ? "none" : `1px solid ${subtleBorder(theme)}`,
                      transition: "background-color .12s",
                      "&:hover": { bgcolor: subtleBg(theme) },
                    }}
                  >
                    {/* Величина правила — крупной плашкой слева: это то, ради чего правило читают. */}
                    <Box
                      sx={{
                        width: 76,
                        flexShrink: 0,
                        py: 1,
                        borderRadius: "10px",
                        textAlign: "center",
                        bgcolor: rule.isActive ? alpha(tone, theme.palette.mode === "dark" ? 0.18 : 0.12) : subtleBg(theme, true),
                        color: rule.isActive ? tone : "text.disabled",
                      }}
                    >
                      <Typography sx={{ fontSize: 18, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: "tabular-nums", color: "inherit" }}>
                        {amount > 0 ? "+" : ""}
                        {amount}
                        {rule.adjustmentType === "percent" ? "%" : ""}
                      </Typography>
                      <Typography sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", color: "inherit", opacity: 0.85 }}>
                        {rule.adjustmentType === "percent" ? (isDiscount ? "СКИДКА" : "НАЦЕНКА") : "СОМ / НОЧЬ"}
                      </Typography>
                    </Box>

                    <Box sx={{ flex: 1, minWidth: 0, opacity: rule.isActive ? 1 : 0.6 }}>
                      <Stack direction="row" alignItems="center" gap={1}>
                        <Typography sx={{ fontSize: 15.5, fontWeight: 700 }} noWrap>
                          {rule.name}
                        </Typography>
                        {!rule.isActive && (
                          <Typography variant="caption" color="text.secondary" fontWeight={600}>
                            · выключено
                          </Typography>
                        )}
                      </Stack>
                      <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 0.75 }}>
                        {tags.map((t) => (
                          <Box
                            key={t}
                            component="span"
                            sx={{ px: 1, py: 0.25, borderRadius: "6px", bgcolor: subtleBg(theme, true), fontSize: 12.5, color: "text.secondary", whiteSpace: "nowrap" }}
                          >
                            {t}
                          </Box>
                        ))}
                      </Stack>
                    </Box>

                    <Stack direction="row" alignItems="center" gap={0.5} sx={{ flexShrink: 0 }}>
                      <Switch
                        checked={rule.isActive}
                        disabled={!canManageRates || togglingId === rule.id}
                        onChange={() => void toggleActive(rule)}
                        inputProps={{ "aria-label": `${rule.isActive ? "Выключить" : "Включить"} правило «${rule.name}»` }}
                      />
                      {canManageRates && (
                        <Tooltip title="Изменить">
                          <IconButton component={RouterLink} to={`/pricing-rules/${rule.id}`} aria-label={`Изменить правило «${rule.name}»`}>
                            <EditOutlined sx={{ fontSize: 19 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </Stack>
                );
              })}
            </Surface>
          )
        )}
    </HotelPage>
  );
};

export default HotelPricingRulesPage;
