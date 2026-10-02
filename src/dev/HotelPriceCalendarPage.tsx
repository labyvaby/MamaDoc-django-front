/**
 * «Календарь цен» — сколько стоит ночь каждой категории на каждую дату и
 * почему. Бэк считает цену сам (GET /hotel/pricing/calendar/): база
 * категории → правила ценообразования → ручная цена → границы и округление.
 * Здесь это видно одной сеткой, а по клику на ночь — вся цепочка расчёта.
 *
 * Правка (право hotel.rates.manage) — PUT /rate-plans/{id}/daily-rates/:
 * своя цена на диапазон ночей с причиной, «вернуть к авторасчёту»,
 * стоп-продажа, минимум ночей. Уже созданные брони держат свои цены — бэк
 * их не пересчитывает.
 *
 * «История изменений» — /hotel/pricing/history/: кто, когда и почему менял
 * цены и правила. Одна строка на действие, а не на ночь.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Drawer,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import NorthOutlined from "@mui/icons-material/NorthOutlined";
import SouthOutlined from "@mui/icons-material/SouthOutlined";
import SellOutlined from "@mui/icons-material/SellOutlined";
import NotesOutlined from "@mui/icons-material/NotesOutlined";
import NightsStayOutlined from "@mui/icons-material/NightsStayOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import { Navigate } from "react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import dayjs, { type Dayjs } from "dayjs";

import { CustomDatePicker } from "../components/ui";
import { usePageTitle } from "../hooks/usePageTitle";
import { useCan } from "../hooks/useCan";
import { subtleBg, subtleBorder } from "../theme/uiHelpers";
import {
  getPriceCalendar,
  listPricingHistory,
  listPricingRules,
  listRatePlans,
  setDailyRates,
  type HotelPriceCalendar,
  type HotelPriceCalendarRoomType,
  type HotelPriceNight,
  type HotelPricingChange,
} from "../api/hotel";
import { getErrorMessage } from "../api/client";
import { FormField } from "./formField";
import { fieldError, type FieldRules } from "./formRules";
import { DRAWER_WIDTH, DrawerFooter, DrawerHeader, DrawerSection, EmptyState, HotelPage, HotelPageHeader, Surface } from "./hotelUi";
import { formatHotelDate, formatHotelDateTime, formatHotelNightsRange, useIsVivaActive } from "./mockDemoData";
import { useHotelProperty } from "./useHotelProperty";
import { HotelPropertyMissing } from "./HotelPropertyMissing";
import { PriceYearView } from "./PriceYearView";

const DAYS = 14;
const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const money = (v: string | number) => Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 0 });

const PRICE_RULES: FieldRules = { kind: "decimal", min: 1, max: 10_000_000, maxDecimals: 2 };
const MIN_NIGHTS_RULES: FieldRules = { kind: "int", min: 1, max: 90, maxLength: 2 };

const STEP_LABELS: Record<string, string> = {
  rule: "Правило",
  manual: "Своя цена",
  rate_plan: "Тариф",
  floor: "Не ниже минимума категории",
  ceiling: "Не выше максимума категории",
  rounding: "Округление",
};

const KIND_LABELS: Record<string, string> = {
  daily_rate: "Цены на даты",
  daily_rate_batch: "Массовое изменение цен",
  rule_created: "Правило создано",
  rule_updated: "Правило изменено",
  rule_deleted: "Правило удалено",
  rate_plan: "Тариф изменён",
  room_type: "Границы цены категории",
};

export const HotelPriceCalendarPage: React.FC = () => {
  usePageTitle("Календарь цен");
  const vivaActive = useIsVivaActive();
  const { property, isLoading: propertyLoading } = useHotelProperty();
  const canManage = useCan("hotel.rates.manage");
  const [tab, setTab] = React.useState<"calendar" | "history">("calendar");
  // «Год» — месяцы слева и все категории одной сеткой, с массовой правкой (PriceYearView);
  // «2 недели» — прежняя подробная сетка ночей.
  const [view, setView] = React.useState<"year" | "days">("year");
  const [start, setStart] = React.useState<Dayjs>(() => dayjs().startOf("day"));
  const [selected, setSelected] = React.useState<{ roomType: HotelPriceCalendarRoomType; night: HotelPriceNight } | null>(null);
  // Тарифный план: "" — основной. Выбор виден, когда планов больше одного.
  const [ratePlanId, setRatePlanId] = React.useState<number | "">("");
  const plansQuery = useQuery({
    queryKey: ["hotel", "ratePlans", property?.id, "active"],
    queryFn: ({ signal }) => listRatePlans(property!.id, signal),
    enabled: property != null,
    staleTime: 5 * 60_000,
  });
  const plans = plansQuery.data ?? [];

  const from = start.format("YYYY-MM-DD");
  const to = start.add(DAYS, "day").format("YYYY-MM-DD");
  const calendarQuery = useQuery({
    queryKey: ["hotel", "priceCalendar", property?.id, from, ratePlanId],
    queryFn: ({ signal }) => getPriceCalendar({ propertyId: property!.id, from, to, ratePlanId: ratePlanId === "" ? undefined : ratePlanId }, signal),
    enabled: property != null && view === "days",
  });
  const calendar = calendarQuery.data;
  // Двойной клик по ночи в годовом виде открывает ту же панель ночи — тарифный план берём из выбранного.
  const yearPlanId = ratePlanId !== "" ? ratePlanId : (plans.find((p) => p.isBase)?.id ?? null);

  if (!vivaActive) return <Navigate to="/" replace />;

  const isCurrent = start.isSame(dayjs(), "day");
  const rangeLabel = formatHotelNightsRange(from, to);

  return (
    <HotelPage maxWidth={1600}>
      <HotelPageHeader
        title="Календарь цен"
        subtitle={
          tab === "calendar"
            ? view === "year"
              ? "Год вперёд: месяцы, все категории и массовое изменение цен"
              : calendar
                ? `${calendar.ratePlanName} · ${rangeLabel}`
                : rangeLabel
            : "Кто, когда и почему менял цены"
        }
        info={
          <>
            Цена ночи для каждой категории: база категории, затем правила из «Ценообразования», затем своя цена, если её
            задали вручную. Клик по ночи — из чего сложилась цена{canManage ? " и правка: своя цена на даты, стоп-продажа, минимум ночей" : ""}.
            Уже созданные брони держат свои цены.
          </>
        }
        actions={
          tab === "calendar" ? (
            <Stack direction="row" alignItems="center" gap={0.5}>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={view}
                onChange={(_, v: "year" | "days" | null) => v && setView(v)}
                sx={{ mr: 1, "& .MuiToggleButton-root": { textTransform: "none", fontWeight: 600, py: 0.4 } }}
              >
                <ToggleButton value="year">Год</ToggleButton>
                <ToggleButton value="days">2 недели</ToggleButton>
              </ToggleButtonGroup>
              {plans.length > 1 && (
                <TextField
                  select
                  size="small"
                  value={ratePlanId}
                  onChange={(e) => setRatePlanId(e.target.value === "" ? "" : Number(e.target.value))}
                  aria-label="Тарифный план"
                  sx={{ minWidth: 200, mr: 1 }}
                >
                  <MenuItem value="">{plans.find((p) => p.isBase)?.name ?? "Основной тариф"}</MenuItem>
                  {plans
                    .filter((p) => !p.isBase)
                    .map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.name}
                      </MenuItem>
                    ))}
                </TextField>
              )}
              {view === "days" && (
                <>
                  <Button size="small" onClick={() => setStart(dayjs().startOf("day"))} disabled={isCurrent}>
                    Сегодня
                  </Button>
                  <IconButton size="small" aria-label="Раньше" onClick={() => setStart(start.subtract(DAYS, "day"))}>
                    <ChevronLeftOutlined fontSize="small" />
                  </IconButton>
                  <IconButton size="small" aria-label="Позже" onClick={() => setStart(start.add(DAYS, "day"))}>
                    <ChevronRightOutlined fontSize="small" />
                  </IconButton>
                </>
              )}
            </Stack>
          ) : undefined
        }
      />

      {canManage && (
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 40, mt: -1, "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600 } }}>
          <Tab value="calendar" label="Календарь" />
          <Tab value="history" label="История изменений" />
        </Tabs>
      )}

      {!property && !propertyLoading ? (
        <HotelPropertyMissing />
      ) : tab === "history" && property ? (
        <PricingHistoryPanel propertyId={property.id} roomTypeNames={new Map((calendar?.roomTypes ?? []).map((r) => [r.roomTypeId, r.roomTypeName]))} />
      ) : view === "year" && property ? (
        <PriceYearView propertyId={property.id} ratePlanId={ratePlanId} canManage={canManage} onOpenNight={(roomType, night) => setSelected({ roomType, night })} />
      ) : calendarQuery.isError ? (
        <Alert severity="error" variant="outlined">
          {getErrorMessage(calendarQuery.error, "Не удалось загрузить цены")}
        </Alert>
      ) : !calendar ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : calendar.roomTypes.length === 0 ? (
        <Surface>
          <EmptyState icon={<SellOutlined />} title="Категорий нет" description="Цены появятся, когда в «Категориях и тарифах» будет хоть одна категория." />
        </Surface>
      ) : (
        <PriceGrid calendar={calendar} loading={calendarQuery.isFetching} onOpen={(roomType, night) => setSelected({ roomType, night })} />
      )}

      <NightDrawer
        target={selected}
        ratePlanId={calendar?.ratePlanId ?? yearPlanId}
        canManage={canManage}
        onClose={() => setSelected(null)}
      />
    </HotelPage>
  );
};

// ── Сетка ───────────────────────────────────────────────────────────────────

const PriceGrid: React.FC<{
  calendar: HotelPriceCalendar;
  loading: boolean;
  onOpen: (roomType: HotelPriceCalendarRoomType, night: HotelPriceNight) => void;
}> = ({ calendar, loading, onOpen }) => {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  const line = subtleBorder(theme);
  const today = dayjs().format("YYYY-MM-DD");
  const nights = calendar.roomTypes[0]?.nights.map((n) => n.date) ?? [];
  const COL = 92;
  const FIRST = 190;

  return (
    <Surface padded={false} sx={{ overflow: "hidden" }}>
      <Box sx={{ height: 2 }}>{loading && <Box sx={{ height: 2, bgcolor: "primary.main", opacity: 0.4 }} />}</Box>
      <Box sx={{ overflowX: "auto" }}>
        <Box
          role="grid"
          aria-label="Цены по категориям и ночам"
          sx={{ display: "grid", gridTemplateColumns: `${FIRST}px repeat(${nights.length}, minmax(${COL}px, 1fr))`, minWidth: FIRST + nights.length * COL }}
        >
          {/* Шапка: даты */}
          <Box sx={{ position: "sticky", left: 0, zIndex: 2, bgcolor: "background.paper", borderBottom: `1px solid ${line}`, px: 2, py: 1.25 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Категория
            </Typography>
          </Box>
          {nights.map((d) => {
            const day = dayjs(d);
            const weekend = day.day() === 0 || day.day() === 6;
            const occ = Number(calendar.propertyOccupancy[d] ?? 0);
            return (
              <Box
                key={d}
                sx={{
                  borderBottom: `1px solid ${line}`,
                  borderLeft: `1px solid ${line}`,
                  py: 1,
                  textAlign: "center",
                  bgcolor: d === today ? alpha(theme.palette.primary.main, 0.08) : weekend ? subtleBg(theme) : undefined,
                }}
              >
                <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {day.date()} {formatHotelDate(d).split(" ")[1]?.slice(0, 3)}
                </Typography>
                <Typography variant="caption" color={weekend ? "text.primary" : "text.secondary"} fontWeight={weekend ? 700 : 400} component="div">
                  {WEEKDAYS[day.day()]} · {Math.round(occ)}%
                </Typography>
              </Box>
            );
          })}

          {/* Строки категорий */}
          {calendar.roomTypes.map((rt) => (
            <React.Fragment key={rt.roomTypeId}>
              <Box sx={{ position: "sticky", left: 0, zIndex: 1, bgcolor: "background.paper", borderBottom: `1px solid ${line}`, px: 2, py: 1.25 }}>
                <Typography variant="body2" fontWeight={700} noWrap title={rt.roomTypeName}>
                  {rt.roomTypeName}
                </Typography>
                <Typography variant="caption" color="text.secondary" component="div" noWrap>
                  база {money(rt.basePrice)} сом
                  {rt.minPrice || rt.maxPrice ? ` · ${rt.minPrice ? `от ${money(rt.minPrice)}` : ""}${rt.minPrice && rt.maxPrice ? " " : ""}${rt.maxPrice ? `до ${money(rt.maxPrice)}` : ""}` : ""}
                </Typography>
              </Box>
              {rt.nights.map((n) => {
                const price = Number(n.price);
                const base = Number(rt.basePrice);
                const up = !n.isManualOverride && price > base;
                const down = !n.isManualOverride && price < base;
                const occ = Math.min(100, Number(n.occupancy));
                const description = [
                  `${rt.roomTypeName}, ${formatHotelDate(n.date)}: ${money(price)} сом`,
                  n.isManualOverride ? "своя цена" : up ? "выше базы" : down ? "ниже базы" : "",
                  n.stopSell ? "стоп-продажа" : `свободно ${n.available} из ${n.capacity}`,
                  n.minNights ? `минимум ${n.minNights} ноч.` : "",
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <Box
                    key={n.date}
                    component="button"
                    type="button"
                    onClick={() => onOpen(rt, n)}
                    aria-label={description}
                    title={description}
                    sx={{
                      position: "relative",
                      border: 0,
                      borderBottom: `1px solid ${line}`,
                      borderLeft: `1px solid ${line}`,
                      boxShadow: n.isManualOverride ? `inset 3px 0 0 ${theme.palette.primary.main}` : "none",
                      bgcolor: occ > 0 ? alpha(theme.palette.info.main, (dark ? 0.08 : 0.05) + (occ / 100) * (dark ? 0.22 : 0.16)) : "transparent",
                      font: "inherit",
                      color: "inherit",
                      textAlign: "center",
                      py: 1,
                      px: 0.5,
                      cursor: "pointer",
                      "&:hover": { outline: `2px solid ${alpha(theme.palette.primary.main, 0.5)}`, outlineOffset: "-2px" },
                    }}
                  >
                    <Stack direction="row" alignItems="center" justifyContent="center" gap={0.25}>
                      {n.isManualOverride && <EditOutlined sx={{ fontSize: 12, color: "primary.main" }} />}
                      {up && <NorthOutlined sx={{ fontSize: 12, color: "warning.main" }} />}
                      {down && <SouthOutlined sx={{ fontSize: 12, color: "success.main" }} />}
                      <Typography
                        variant="body2"
                        fontWeight={700}
                        sx={{
                          fontVariantNumeric: "tabular-nums",
                          textDecoration: n.stopSell ? "line-through" : "none",
                          color: n.stopSell ? "text.disabled" : "text.primary",
                        }}
                      >
                        {money(price)}
                      </Typography>
                    </Stack>
                    <Typography variant="caption" component="div" sx={{ color: n.stopSell ? "error.main" : "text.secondary", fontWeight: n.stopSell ? 700 : 400 }}>
                      {n.stopSell ? "стоп" : `${n.available}/${n.capacity}`}
                      {n.minNights ? ` · от ${n.minNights}н` : ""}
                    </Typography>
                  </Box>
                );
              })}
            </React.Fragment>
          ))}
        </Box>
      </Box>
      <Stack direction="row" gap={2.5} rowGap={0.5} flexWrap="wrap" sx={{ px: 2, py: 1.25, borderTop: `1px solid ${line}` }}>
        <Legend icon={<EditOutlined sx={{ fontSize: 13, color: "primary.main" }} />} text="своя цена" />
        <Legend icon={<NorthOutlined sx={{ fontSize: 13, color: "warning.main" }} />} text="правило подняло цену" />
        <Legend icon={<SouthOutlined sx={{ fontSize: 13, color: "success.main" }} />} text="правило снизило цену" />
        <Legend icon={<Typography variant="caption" fontWeight={700}>2/4</Typography>} text="свободно из всего" />
        <Legend icon={<Box sx={{ width: 14, height: 10, borderRadius: "3px", bgcolor: alpha(theme.palette.info.main, 0.2) }} />} text="темнее — больше продано" />
      </Stack>
    </Surface>
  );
};

const Legend: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <Stack direction="row" alignItems="center" gap={0.5}>
    {icon}
    <Typography variant="caption" color="text.secondary">
      {text}
    </Typography>
  </Stack>
);

// ── Ночь: расчёт и правка ───────────────────────────────────────────────────

const NightDrawer: React.FC<{
  target: { roomType: HotelPriceCalendarRoomType; night: HotelPriceNight } | null;
  ratePlanId: number | null;
  canManage: boolean;
  onClose: () => void;
}> = ({ target, ratePlanId, canManage, onClose }) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [firstNight, setFirstNight] = React.useState<Dayjs | null>(null);
  const [lastNight, setLastNight] = React.useState<Dayjs | null>(null);
  const [price, setPrice] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [stopSell, setStopSell] = React.useState(false);
  const [minNights, setMinNights] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const night = target?.night;
  React.useEffect(() => {
    if (!target) return;
    const d = dayjs(target.night.date);
    setFirstNight(d);
    setLastNight(d);
    setPrice(target.night.manualPrice ? String(Number(target.night.manualPrice)) : "");
    setReason(target.night.overrideReason ?? "");
    setStopSell(target.night.stopSell);
    setMinNights(target.night.minNights ? String(target.night.minNights) : "");
    setError(null);
  }, [target]);

  if (!target || !night) return <Drawer anchor="right" open={false} onClose={onClose} />;

  const datesError =
    !firstNight || !lastNight || !firstNight.isValid() || !lastNight.isValid()
      ? "Укажите обе даты"
      : lastNight.isBefore(firstNight, "day")
        ? "Последняя ночь раньше первой"
        : lastNight.diff(firstNight, "day") > 365
          ? "Не больше года за раз"
          : null;
  const nightsCount = !datesError && firstNight && lastNight ? lastNight.diff(firstNight, "day") + 1 : 0;
  const priceError = fieldError(price, PRICE_RULES);
  const minError = fieldError(minNights, MIN_NIGHTS_RULES);
  const priceChanged = price.trim() !== "" && Number(price) !== Number(night.manualPrice ?? NaN);
  const stopChanged = stopSell !== night.stopSell;
  const minChanged = minNights.trim() !== (night.minNights ? String(night.minNights) : "");
  // На диапазон — применяем то, что человек задал, даже если на первой ночи
  // значение совпадает: на остальных ночах оно могло быть другим.
  const multi = nightsCount > 1;
  const hasChange = multi ? price.trim() !== "" || stopChanged || minChanged || stopSell : priceChanged || stopChanged || minChanged;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["hotel", "priceCalendar"] });
    void queryClient.invalidateQueries({ queryKey: ["hotel", "pricingHistory"] });
  };

  const put = async (change: Omit<Parameters<typeof setDailyRates>[1], "roomTypeId" | "dateFrom" | "dateTo">, done: string) => {
    if (ratePlanId == null || !firstNight || !lastNight || datesError) return;
    setSaving(true);
    setError(null);
    try {
      const res = await setDailyRates(ratePlanId, {
        roomTypeId: target.roomType.roomTypeId,
        dateFrom: firstNight.format("YYYY-MM-DD"),
        dateTo: lastNight.add(1, "day").format("YYYY-MM-DD"),
        ...change,
      });
      invalidate();
      enqueueSnackbar(`${done}: ${res.nights} ${res.nights === 1 ? "ночь" : res.nights < 5 ? "ночи" : "ночей"}`, { variant: "success" });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Не удалось сохранить цены"));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (priceError || minError || datesError) return;
    void put(
      {
        price: price.trim() !== "" && (multi || priceChanged) ? String(Number(price)) : undefined,
        reason: reason.trim() || undefined,
        stopSell: multi || stopChanged ? stopSell : undefined,
        minNights: minNights.trim() !== "" && (multi || minChanged) ? Number(minNights) : undefined,
        clearMinNights: minNights.trim() === "" && minChanged ? true : undefined,
      },
      "Сохранено",
    );
  };

  const base = Number(target.roomType.basePrice);
  const steps = night.appliedRules;

  return (
    <Drawer
      anchor="right"
      open
      onClose={() => !saving && onClose()}
      PaperProps={{ sx: { width: DRAWER_WIDTH, maxWidth: "100vw", display: "flex", flexDirection: "column", backgroundImage: "none" } }}
    >
      <DrawerHeader
        title={target.roomType.roomTypeName}
        subtitle={`${formatHotelDate(night.date)}, ${WEEKDAYS[dayjs(night.date).day()].toLowerCase()} · свободно ${night.available} из ${night.capacity}`}
        onClose={() => !saving && onClose()}
      />
      <Box sx={{ px: 3, py: 3, flex: 1, overflowY: "auto" }}>
        <Stack spacing={3}>
          {error && <Alert severity="error">{error}</Alert>}

          <DrawerSection label="Из чего сложилась цена" first>
            <Box sx={{ borderRadius: "12px", bgcolor: subtleBg(theme), px: 2, py: 1.25 }}>
              <StepRow label="База категории" value={`${money(base)} сом`} />
              {steps.map((s, i) => (
                <StepRow
                  key={i}
                  label={s.kind === "rule" ? s.name || STEP_LABELS.rule : STEP_LABELS[s.kind] ?? s.name}
                  hint={s.kind === "rule" && s.adjustmentValue ? `${Number(s.adjustmentValue) > 0 ? "+" : ""}${Number(s.adjustmentValue)}${s.adjustmentType === "percent" ? "%" : " сом"}` : undefined}
                  value={`${money(s.amountBefore)} → ${money(s.amountAfter)}`}
                />
              ))}
              {steps.length === 0 && (
                <Typography variant="caption" color="text.secondary" component="div" sx={{ py: 0.5 }}>
                  Правила на эту ночь не действуют
                </Typography>
              )}
              <Box sx={{ borderTop: `1px solid ${subtleBorder(theme)}`, mt: 0.75, pt: 0.75 }}>
                <StepRow label="Цена ночи" value={`${money(night.price)} сом`} strong />
              </Box>
            </Box>
            {night.isManualOverride && (
              <Alert severity="info" variant="outlined" icon={<EditOutlined fontSize="small" />}>
                Своя цена {night.manualPrice ? `${money(night.manualPrice)} сом` : ""}
                {night.overrideByName ? ` · ${night.overrideByName}` : ""}
                {night.overrideAt ? `, ${formatHotelDateTime(night.overrideAt)}` : ""}
                {night.overrideReason ? ` · «${night.overrideReason}»` : ""}
              </Alert>
            )}
          </DrawerSection>

          {canManage && ratePlanId != null && (
            <DrawerSection label="Изменить на даты">
              <Stack direction={{ xs: "column", sm: "row" }} gap={1.5}>
                <CustomDatePicker
                  label="Первая ночь"
                  value={firstNight}
                  onChange={(d) => {
                    const next = d as Dayjs | null;
                    setFirstNight(next);
                    if (next && lastNight && lastNight.isBefore(next, "day")) setLastNight(next);
                  }}
                  disabled={saving}
                  sx={{ flex: 1 }}
                />
                <CustomDatePicker
                  label="Последняя ночь"
                  value={lastNight}
                  minDate={firstNight ?? undefined}
                  onChange={(d) => setLastNight(d as Dayjs | null)}
                  disabled={saving}
                  sx={{ flex: 1 }}
                />
              </Stack>
              <Typography variant="caption" color={datesError ? "error" : "text.secondary"}>
                {datesError ?? `${nightsCount} ${nightsCount === 1 ? "ночь" : nightsCount < 5 ? "ночи" : "ночей"} · ${target.roomType.roomTypeName}`}
              </Typography>
              <FormField
                icon={<SellOutlined />}
                label="Своя цена за ночь"
                unit="сом"
                value={price}
                onValueChange={setPrice}
                rules={PRICE_RULES}
                disabled={saving}
                placeholder={money(night.price)}
                helperText="Пусто — цену считают правила"
                fullWidth
              />
              <FormField
                icon={<NotesOutlined />}
                label="Причина"
                value={reason}
                onValueChange={(v) => setReason(v.slice(0, 255))}
                disabled={saving}
                placeholder="Свадебная группа, договорились с агентом…"
                fullWidth
              />
              <Stack direction="row" gap={2} alignItems="flex-start" flexWrap="wrap">
                <FormField
                  icon={<NightsStayOutlined />}
                  label="Минимум ночей"
                  value={minNights}
                  onValueChange={setMinNights}
                  rules={MIN_NIGHTS_RULES}
                  disabled={saving}
                  helperText="Пусто — без ограничения"
                  sx={{ flex: 1, minWidth: 160 }}
                />
                <FormControlLabel
                  sx={{ mt: 1 }}
                  control={<Switch checked={stopSell} onChange={(e) => setStopSell(e.target.checked)} color="error" disabled={saving} />}
                  label={
                    <Typography variant="body2" fontWeight={600}>
                      Стоп-продажа
                    </Typography>
                  }
                />
              </Stack>
            </DrawerSection>
          )}
          {!canManage && (
            <Typography variant="body2" color="text.secondary">
              Менять цены может сотрудник с правом «Тарифы: управление».
            </Typography>
          )}
        </Stack>
      </Box>
      {canManage && ratePlanId != null && (
        <DrawerFooter
          summary={
            night.isManualOverride && (
              <Tooltip title="Убрать свою цену на выбранные даты — цену снова посчитают правила">
                <span>
                  <Button onClick={() => void put({ clearPrice: true }, "Цена снова по правилам")} disabled={saving || datesError != null}>
                    Вернуть к авторасчёту
                  </Button>
                </span>
              </Tooltip>
            )
          }
        >
          <Button onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button
            variant="contained"
            disableElevation
            onClick={handleSave}
            disabled={saving || !hasChange || priceError != null || minError != null || datesError != null}
            sx={{ px: 3, borderRadius: "10px", fontWeight: 700 }}
          >
            {saving ? "Сохраняем…" : "Сохранить"}
          </Button>
        </DrawerFooter>
      )}
    </Drawer>
  );
};

const StepRow: React.FC<{ label: string; value: string; hint?: string; strong?: boolean }> = ({ label, value, hint, strong }) => (
  <Stack direction="row" alignItems="baseline" justifyContent="space-between" gap={1.5} sx={{ py: 0.4 }}>
    <Typography variant="body2" fontWeight={strong ? 700 : 400} sx={{ minWidth: 0 }}>
      {label}
      {hint && (
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
          {hint}
        </Typography>
      )}
    </Typography>
    <Typography variant="body2" fontWeight={strong ? 700 : 600} sx={{ fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
      {value}
    </Typography>
  </Stack>
);

// ── История ────────────────────────────────────────────────────────────────

const PAGE = 30;

function describeChange(c: HotelPricingChange, ruleNames: Map<number, string>, roomTypeNames: Map<number, string>): { title: string; details: string[] } {
  const ch = c.changes ?? {};
  if (c.kind === "daily_rate") {
    const who = c.roomTypeId != null ? (roomTypeNames.get(c.roomTypeId) ?? `Категория №${c.roomTypeId}`) : "Все категории";
    const dates = c.dateFrom && c.dateTo ? formatHotelNightsRange(c.dateFrom, c.dateTo) : "";
    const details: string[] = [];
    if (ch.price != null) details.push(`своя цена ${money(String(ch.price))} сом`);
    if (ch.clearPrice) details.push("цена снова по правилам");
    if (ch.stopSell === true) details.push("стоп-продажа");
    if (ch.stopSell === false) details.push("продажа открыта");
    if (ch.minNights != null) details.push(`минимум ${ch.minNights} ноч.`);
    if (ch.clearMinNights) details.push("без минимума ночей");
    if (ch.maxNights != null) details.push(`максимум ${ch.maxNights} ноч.`);
    if (ch.closedToArrival === true) details.push("закрыто на заезд");
    if (ch.closedToDeparture === true) details.push("закрыто на выезд");
    return { title: [who, dates].filter(Boolean).join(" · "), details };
  }
  if (c.kind === "daily_rate_batch") {
    const items = Array.isArray(ch.items) ? (ch.items as Record<string, unknown>[]) : [];
    const types = [...new Set(items.map((i) => Number(i.roomTypeId)).filter((id) => Number.isFinite(id)))];
    const who =
      types.length === 1
        ? (roomTypeNames.get(types[0]) ?? `Категория №${types[0]}`)
        : types.length > 1
          ? types.map((id) => roomTypeNames.get(id) ?? `№${id}`).join(", ")
          : "Массовое изменение";
    const dates = c.dateFrom && c.dateTo ? formatHotelNightsRange(c.dateFrom, c.dateTo) : "";
    const details: string[] = [];
    if (typeof ch.nights === "number") details.push(`${ch.nights} ноч.`);
    if (items.length) details.push(`${items.length} диапазон(ов)`);
    if (items.some((i) => i.price != null)) details.push("своя цена");
    if (items.some((i) => i.clearPrice)) details.push("цена снова по правилам");
    if (items.some((i) => i.stopSell === true)) details.push("стоп-продажа");
    if (items.some((i) => i.stopSell === false)) details.push("продажа открыта");
    if (items.some((i) => i.minNights != null)) details.push("минимум ночей");
    if (items.some((i) => i.clearMinNights)) details.push("без минимума ночей");
    return { title: [who, dates].filter(Boolean).join(" · "), details };
  }
  if (c.kind.startsWith("rule_")) {
    const name = (typeof ch.name === "string" ? ch.name : undefined) ?? (c.ruleId != null ? ruleNames.get(c.ruleId) : undefined);
    const title = name ? `«${name}»` : c.ruleId != null ? `Правило №${c.ruleId}` : "Правило";
    const details: string[] = [];
    if (c.kind === "rule_created") {
      if (ch.adjustmentValue != null) details.push(`${Number(ch.adjustmentValue) > 0 ? "+" : ""}${Number(ch.adjustmentValue)}${ch.adjustmentType === "percent" ? "%" : " сом"}`);
    } else if (c.kind === "rule_updated") {
      for (const [key, value] of Object.entries(ch)) {
        if (key === "version" || value == null || typeof value !== "object" || !("new" in (value as object))) continue;
        const v = value as { old: unknown; new: unknown };
        if (key === "isActive") details.push(v.new ? "включено" : "выключено");
        else if (key === "adjustmentValue") details.push(`изменение ${Number(v.old)} → ${Number(v.new)}`);
        else if (key === "name") details.push(`название «${String(v.old)}» → «${String(v.new)}»`);
        else if (key === "priority") details.push(`приоритет ${String(v.old)} → ${String(v.new)}`);
        else if (key === "conditions") details.push("условия изменены");
        else details.push(`${key} изменено`);
      }
    }
    return { title, details };
  }
  return { title: KIND_LABELS[c.kind] ?? c.kind, details: [] };
}

const PricingHistoryPanel: React.FC<{ propertyId: number; roomTypeNames: Map<number, string> }> = ({ propertyId, roomTypeNames }) => {
  const theme = useTheme();
  const historyQuery = useInfiniteQuery({
    queryKey: ["hotel", "pricingHistory", propertyId],
    queryFn: ({ pageParam, signal }) => listPricingHistory({ propertyId, limit: PAGE, offset: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((s, p) => s + p.results.length, 0);
      return loaded < last.count ? loaded : undefined;
    },
  });
  const rulesQuery = useQuery({
    queryKey: ["hotel", "pricingRules", propertyId],
    queryFn: ({ signal }) => listPricingRules(propertyId, signal),
  });
  const ruleNames = React.useMemo(() => new Map((rulesQuery.data ?? []).map((r) => [r.id, r.name])), [rulesQuery.data]);
  const rows = historyQuery.data?.pages.flatMap((p) => p.results) ?? [];
  const total = historyQuery.data?.pages[0]?.count ?? 0;

  if (historyQuery.isError) {
    return (
      <Alert severity="error" variant="outlined">
        {getErrorMessage(historyQuery.error, "Не удалось загрузить историю цен")}
      </Alert>
    );
  }
  if (historyQuery.isPending) {
    return (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress size={28} />
      </Stack>
    );
  }
  if (rows.length === 0) {
    return (
      <Surface>
        <EmptyState icon={<HistoryOutlined />} title="Изменений пока нет" description="Здесь появятся правки цен на даты и правил ценообразования — кто, когда и зачем." />
      </Surface>
    );
  }
  return (
    <Surface padded={false} sx={{ overflow: "hidden" }}>
      {rows.map((c, i) => {
        const { title, details } = describeChange(c, ruleNames, roomTypeNames);
        return (
          <Stack
            key={c.id}
            direction={{ xs: "column", sm: "row" }}
            gap={{ xs: 0.5, sm: 2 }}
            sx={{ px: 2.5, py: 1.5, borderTop: i === 0 ? "none" : `1px solid ${subtleBorder(theme)}` }}
          >
            <Box sx={{ width: { sm: 190 }, flexShrink: 0 }}>
              <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {formatHotelDateTime(c.createdAt)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {c.userName || "система"}
              </Typography>
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ letterSpacing: "0.04em", textTransform: "uppercase" }}>
                {KIND_LABELS[c.kind] ?? c.kind}
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {title}
              </Typography>
              {details.length > 0 && (
                <Typography variant="body2" color="text.secondary">
                  {details.join(" · ")}
                </Typography>
              )}
              {c.reason && (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                  «{c.reason}»
                </Typography>
              )}
            </Box>
          </Stack>
        );
      })}
      {historyQuery.hasNextPage && (
        <Box sx={{ px: 2.5, py: 1.5, borderTop: `1px solid ${subtleBorder(theme)}` }}>
          <Button size="small" onClick={() => void historyQuery.fetchNextPage()} disabled={historyQuery.isFetchingNextPage}>
            {historyQuery.isFetchingNextPage ? "Загружаем…" : `Показать ещё (${total - rows.length})`}
          </Button>
        </Box>
      )}
    </Surface>
  );
};

export default HotelPriceCalendarPage;
