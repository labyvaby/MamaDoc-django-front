/**
 * «События» — календарь концертов, фестивалей, праздников и форумов, из-за
 * которых растёт спрос на номера (пример заказчика: концерт звезды в Бишкеке —
 * цены на эти ночи надо поднять заранее, а не когда номера уже раскуплены).
 *
 * Слева — месяц с событиями по дням, справа — ближайшие события с
 * рекомендацией. Карточка события показывает ожидаемый спрос и предлагает
 * «Поднять цены на эти даты» — открывается обычная форма правила цены
 * (/pricing-rules/new) с уже заполненными датами, процентом и категорией
 * «Событие». Если на даты события уже действует правило-событие, это видно
 * сразу (правила — настоящие, из /hotel/pricing-rules/).
 *
 * События пока демо (useCityEvents → cityEventsMock.ts): контракт для бэка —
 * HotelCityEvent / listCityEvents в src/api/hotel.ts.
 */
import React from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Drawer,
  IconButton,
  LinearProgress,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import AddOutlined from "@mui/icons-material/AddOutlined";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import MusicNoteOutlined from "@mui/icons-material/MusicNoteOutlined";
import CelebrationOutlined from "@mui/icons-material/CelebrationOutlined";
import FlagOutlined from "@mui/icons-material/FlagOutlined";
import SportsMmaOutlined from "@mui/icons-material/SportsMmaOutlined";
import BusinessCenterOutlined from "@mui/icons-material/BusinessCenterOutlined";
import EventOutlined from "@mui/icons-material/EventOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import DriveFileRenameOutlineOutlined from "@mui/icons-material/DriveFileRenameOutlineOutlined";
import CategoryOutlined from "@mui/icons-material/CategoryOutlined";
import LocalFireDepartmentOutlined from "@mui/icons-material/LocalFireDepartmentOutlined";
import PercentOutlined from "@mui/icons-material/PercentOutlined";
import NotesOutlined from "@mui/icons-material/NotesOutlined";
import dayjs, { type Dayjs } from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink, Navigate, useNavigate } from "react-router";
import { useSnackbar } from "notistack";

import { usePageTitle } from "../hooks/usePageTitle";
import { useCan } from "../hooks/useCan";
import { CustomDatePicker } from "../components/ui";
import { listPricingRules, listRoomTypes, type HotelCityEvent, type HotelCityEventCategory, type HotelCityEventDemand, type HotelPricingRule } from "../api/hotel";
import { getErrorMessage } from "../api/client";
import { useHotelProperty } from "./useHotelProperty";
import { HotelPropertyMissing } from "./HotelPropertyMissing";
import { useIsVivaActive } from "./mockDemoData";
import { useCityEvents, useCreateCityEvent } from "./useCityEvents";
import { FormField } from "./formField";
import { focusFirstFieldError, hasFieldErrors, type FieldRules } from "./formRules";
import type { PricingRulePrefill } from "./HotelPricingRuleFormPage";
import {
  DisabledReason,
  DRAWER_WIDTH,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerSection,
  EmptyState,
  FilterChip,
  HotelPage,
  HotelPageHeader,
  MetricTile,
  plural,
  SectionLabel,
  StatusPill,
  Surface,
} from "./hotelUi";

// ── Справочники вида ────────────────────────────────────────────────────────

const CATEGORY_META: Record<HotelCityEventCategory, { label: string; icon: React.ReactElement }> = {
  concert: { label: "Концерт", icon: <MusicNoteOutlined /> },
  festival: { label: "Фестиваль", icon: <CelebrationOutlined /> },
  holiday: { label: "Праздник", icon: <FlagOutlined /> },
  sport: { label: "Спорт", icon: <SportsMmaOutlined /> },
  business: { label: "Форум", icon: <BusinessCenterOutlined /> },
  other: { label: "Другое", icon: <EventOutlined /> },
};
const CATEGORY_ORDER: HotelCityEventCategory[] = ["concert", "festival", "holiday", "sport", "business", "other"];

function categoryColor(category: HotelCityEventCategory, theme: Theme): string {
  const dark = theme.palette.mode === "dark";
  switch (category) {
    case "concert":
      return dark ? "#a78bfa" : "#7c3aed";
    case "festival":
      return theme.palette.warning.main;
    case "holiday":
      return theme.palette.success.main;
    case "sport":
      return theme.palette.info.main;
    case "business":
      return dark ? "#94a3b8" : "#475569";
    default:
      return theme.palette.text.secondary;
  }
}

const DEMAND_META: Record<HotelCityEventDemand, { label: string; level: 1 | 2 | 3 }> = {
  moderate: { label: "Заметный спрос", level: 1 },
  high: { label: "Высокий спрос", level: 2 },
  peak: { label: "Пиковый спрос", level: 3 },
};

function demandColor(demand: HotelCityEventDemand, theme: Theme): string {
  return demand === "peak" ? theme.palette.error.main : demand === "high" ? theme.palette.warning.main : theme.palette.info.main;
}

const MONTHS_NOM = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function formatEventDates(e: HotelCityEvent): string {
  const from = dayjs(e.dateFrom);
  const to = dayjs(e.dateTo);
  if (e.dateFrom === e.dateTo) return `${from.date()} ${MONTHS_GEN[from.month()]}`;
  if (from.month() === to.month()) return `${from.date()}–${to.date()} ${MONTHS_GEN[to.month()]}`;
  return `${from.date()} ${MONTHS_GEN[from.month()]} – ${to.date()} ${MONTHS_GEN[to.month()]}`;
}

function daysUntil(e: HotelCityEvent): number {
  return dayjs(e.dateFrom).startOf("day").diff(dayjs().startOf("day"), "day");
}

function untilLabel(e: HotelCityEvent): string {
  const d = daysUntil(e);
  if (d < 0) return dayjs(e.dateTo).isBefore(dayjs(), "day") ? "прошло" : "идёт сейчас";
  if (d === 0) return "сегодня";
  if (d === 1) return "завтра";
  return `через ${d} ${plural(d, "день", "дня", "дней")}`;
}

/** Действующее правило цены на даты события (любое активное с наценкой, пересекающее даты). */
function ruleForEvent(e: HotelCityEvent, rules: HotelPricingRule[]): HotelPricingRule | null {
  return (
    rules.find((r) => {
      const c = r.conditions;
      if (!r.isActive || !c.dateFrom || !c.dateTo || Number(r.adjustmentValue) <= 0) return false;
      return c.dateFrom <= e.dateTo && c.dateTo >= e.dateFrom;
    }) ?? null
  );
}

// ── Мелкие элементы ─────────────────────────────────────────────────────────

const CategoryBadge: React.FC<{ category: HotelCityEventCategory; size?: number }> = ({ category, size = 40 }) => {
  const theme = useTheme();
  const color = categoryColor(category, theme);
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: `${Math.round(size * 0.3)}px`,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color,
        bgcolor: alpha(color, theme.palette.mode === "dark" ? 0.18 : 0.1),
        "& svg": { fontSize: size * 0.52 },
      }}
    >
      {CATEGORY_META[category].icon}
    </Box>
  );
};

/** Три столбика «как сильно вырастет спрос» + подпись. */
const DemandMeter: React.FC<{ demand: HotelCityEventDemand; compact?: boolean }> = ({ demand, compact }) => {
  const theme = useTheme();
  const color = demandColor(demand, theme);
  const { level, label } = DEMAND_META[demand];
  return (
    <Stack direction="row" alignItems="center" gap={0.75}>
      <Stack direction="row" alignItems="flex-end" gap={0.25} aria-hidden>
        {[1, 2, 3].map((i) => (
          <Box
            key={i}
            sx={{
              width: 4,
              height: 4 + i * 3,
              borderRadius: 1,
              bgcolor: i <= level ? color : alpha(theme.palette.text.primary, 0.12),
            }}
          />
        ))}
      </Stack>
      {!compact && (
        <Typography variant="caption" fontWeight={600} sx={{ color }}>
          {label}
        </Typography>
      )}
    </Stack>
  );
};

// ── Месяц ───────────────────────────────────────────────────────────────────

const MonthCalendar: React.FC<{
  month: Dayjs;
  events: HotelCityEvent[];
  /** Месяц ещё подгружается — тонкая полоска под шапкой календаря. */
  loading?: boolean;
  /** Ближайшее событие — чтобы с пустого месяца был путь к нему в один клик. */
  nextEvent?: HotelCityEvent | null;
  onMonthChange: (m: Dayjs) => void;
  onOpen: (e: HotelCityEvent) => void;
}> = ({ month, events, loading, nextEvent, onMonthChange, onOpen }) => {
  const theme = useTheme();
  const today = dayjs().format("YYYY-MM-DD");
  // Сетка с понедельника: 6 недель, чтобы высота не прыгала между месяцами.
  const start = month.startOf("month").subtract((month.startOf("month").day() + 6) % 7, "day");
  const days = Array.from({ length: 42 }, (_, i) => start.add(i, "day"));
  const line = alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.1 : 0.07);
  // Календарь всегда открывается на текущем месяце. Если в нём пусто, а
  // ближайшее событие — в другом, подсказываем, куда листать.
  const monthFrom = month.startOf("month").format("YYYY-MM-DD");
  const monthTo = month.endOf("month").format("YYYY-MM-DD");
  const monthEmpty = !loading && !events.some((e) => e.dateFrom <= monthTo && e.dateTo >= monthFrom);
  const jumpTo = monthEmpty && nextEvent && (nextEvent.dateFrom > monthTo || nextEvent.dateTo < monthFrom) ? nextEvent : null;

  return (
    <Surface padded={false} sx={{ overflow: "hidden" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2.5, py: 1.75, borderBottom: `1px solid ${line}` }}>
        <Typography sx={{ fontSize: 18, fontWeight: 700 }}>
          {MONTHS_NOM[month.month()]} {month.year()}
        </Typography>
        <Stack direction="row" alignItems="center" gap={0.5}>
          <Button size="small" onClick={() => onMonthChange(dayjs().startOf("month"))} disabled={month.isSame(dayjs(), "month")}>
            Сегодня
          </Button>
          <IconButton size="small" aria-label="Предыдущий месяц" onClick={() => onMonthChange(month.subtract(1, "month"))}>
            <ChevronLeftOutlined fontSize="small" />
          </IconButton>
          <IconButton size="small" aria-label="Следующий месяц" onClick={() => onMonthChange(month.add(1, "month"))}>
            <ChevronRightOutlined fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>

      <Box sx={{ height: 2 }}>{loading && <LinearProgress sx={{ height: 2 }} />}</Box>
      {jumpTo && (
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ px: 2.5, py: 0.75, borderBottom: `1px solid ${line}` }}>
          <Typography variant="body2" color="text.secondary">
            В этом месяце событий нет. Ближайшее — {formatEventDates(jumpTo)}: {jumpTo.title}
          </Typography>
          <Button size="small" onClick={() => onMonthChange(dayjs(jumpTo.dateFrom).startOf("month"))} sx={{ flexShrink: 0 }}>
            Показать
          </Button>
        </Stack>
      )}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
        {WEEKDAYS.map((w, i) => (
          <Typography
            key={w}
            sx={{
              py: 1,
              textAlign: "center",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: i >= 5 ? "text.disabled" : "text.secondary",
              borderBottom: `1px solid ${line}`,
            }}
          >
            {w}
          </Typography>
        ))}
        {days.map((d, i) => {
          const dateStr = d.format("YYYY-MM-DD");
          const inMonth = d.month() === month.month();
          const dayEvents = events.filter((e) => e.dateFrom <= dateStr && e.dateTo >= dateStr);
          const peak = dayEvents.some((e) => e.demand === "peak");
          const isToday = dateStr === today;
          return (
            <Box
              key={dateStr}
              sx={{
                minHeight: { xs: 64, md: 96 },
                p: 0.75,
                borderRight: (i + 1) % 7 === 0 ? "none" : `1px solid ${line}`,
                borderBottom: i < 35 ? `1px solid ${line}` : "none",
                bgcolor: peak ? alpha(theme.palette.error.main, theme.palette.mode === "dark" ? 0.08 : 0.04) : "transparent",
                opacity: inMonth ? 1 : 0.45,
                display: "flex",
                flexDirection: "column",
                gap: 0.5,
                minWidth: 0,
              }}
            >
              <Box
                sx={{
                  alignSelf: "flex-start",
                  minWidth: 24,
                  height: 24,
                  px: 0.5,
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: isToday ? 700 : 500,
                  fontVariantNumeric: "tabular-nums",
                  color: isToday ? "primary.contrastText" : "text.primary",
                  bgcolor: isToday ? "primary.main" : "transparent",
                }}
              >
                {d.date()}
              </Box>
              {dayEvents.slice(0, 2).map((e) => {
                const color = categoryColor(e.category, theme);
                // Подпись — в первый день события и в первый день недели (продолжение с прошлой недели).
                const showTitle = e.dateFrom === dateStr || i % 7 === 0;
                const continuesLeft = e.dateFrom < dateStr && i % 7 !== 0;
                const continuesRight = e.dateTo > dateStr && i % 7 !== 6;
                return (
                  <Tooltip key={e.id} title={`${e.title} · ${formatEventDates(e)}`}>
                    <Box
                      component="button"
                      type="button"
                      onClick={() => onOpen(e)}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        height: 22,
                        px: showTitle ? 0.75 : 0,
                        mx: 0,
                        ml: continuesLeft ? -0.75 : 0,
                        mr: continuesRight ? -0.75 : 0,
                        border: 0,
                        borderLeft: showTitle ? `3px solid ${color}` : 0,
                        borderRadius: `${continuesLeft ? 0 : 6}px ${continuesRight ? 0 : 6}px ${continuesRight ? 0 : 6}px ${continuesLeft ? 0 : 6}px`,
                        bgcolor: alpha(color, theme.palette.mode === "dark" ? 0.22 : 0.13),
                        color: "text.primary",
                        font: "inherit",
                        fontSize: 12,
                        fontWeight: 600,
                        textAlign: "left",
                        cursor: "pointer",
                        overflow: "hidden",
                        minWidth: 0,
                        "&:hover": { bgcolor: alpha(color, theme.palette.mode === "dark" ? 0.32 : 0.22) },
                        "&:focus-visible": { outline: `2px solid ${color}`, outlineOffset: 1 },
                      }}
                    >
                      {showTitle && (
                        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: { xs: "none", md: "block" } }}>
                          {e.title}
                        </Box>
                      )}
                    </Box>
                  </Tooltip>
                );
              })}
              {dayEvents.length > 2 && (
                <Typography variant="caption" color="text.secondary" sx={{ pl: 0.5 }}>
                  ещё {dayEvents.length - 2}
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>
    </Surface>
  );
};

// ── Ближайшие ───────────────────────────────────────────────────────────────

const EventCard: React.FC<{ event: HotelCityEvent; rule: HotelPricingRule | null; onOpen: () => void }> = ({ event, rule, onOpen }) => {
  const theme = useTheme();
  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      sx={{
        display: "flex",
        gap: 1.5,
        width: "100%",
        p: 1.75,
        borderRadius: "14px",
        border: `1px solid ${alpha(theme.palette.text.primary, 0.1)}`,
        bgcolor: "background.paper",
        color: "text.primary",
        font: "inherit",
        textAlign: "left",
        cursor: "pointer",
        transition: "border-color .15s, box-shadow .15s, transform .15s",
        "&:hover": {
          borderColor: alpha(categoryColor(event.category, theme), 0.5),
          boxShadow: `0 6px 20px ${alpha(theme.palette.common.black, theme.palette.mode === "dark" ? 0.35 : 0.06)}`,
          transform: "translateY(-1px)",
        },
        "&:focus-visible": { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
      }}
    >
      <CategoryBadge category={event.category} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
          <Typography variant="caption" color="text.secondary" fontWeight={600} noWrap>
            {formatEventDates(event)} · {untilLabel(event)}
          </Typography>
          <DemandMeter demand={event.demand} compact />
        </Stack>
        <Typography sx={{ fontWeight: 700, lineHeight: 1.3, mt: 0.25 }}>{event.title}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
          {event.venue}
        </Typography>
        <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 1 }} flexWrap="wrap">
          {rule ? (
            <StatusPill color={theme.palette.success.main} label={`Цены подняты · ${rule.adjustmentType === "percent" ? `+${Number(rule.adjustmentValue)}%` : `+${Number(rule.adjustmentValue)} сом`}`} />
          ) : (
            <StatusPill color={demandColor(event.demand, theme)} label={`Рекомендуем +${event.suggestedMarkupPercent}%`} />
          )}
        </Stack>
      </Box>
    </Box>
  );
};

// ── Карточка события ────────────────────────────────────────────────────────

const EventDrawer: React.FC<{
  event: HotelCityEvent | null;
  rule: HotelPricingRule | null;
  canManageRates: boolean;
  onClose: () => void;
}> = ({ event, rule, canManageRates, onClose }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [opening, setOpening] = React.useState(false);

  const raisePrices = async () => {
    if (!event) return;
    // Сначала код формы, потом переход: иначе BrowserRouter менял адрес, а на
    // экране до загрузки формы оставалась карточка события — «ничего не
    // происходит». Обычно форма уже предзагружена и это мгновенно.
    setOpening(true);
    try {
      await import("./HotelPricingRuleFormPage");
    } catch {
      // Не загрузилось — переход всё равно, там сработает обычная загрузка.
    } finally {
      setOpening(false);
    }
    const prefill: PricingRulePrefill = {
      name: event.title,
      category: "event",
      adjustmentType: "percent",
      amount: String(event.suggestedMarkupPercent),
      dateFrom: event.dateFrom,
      dateTo: event.dateTo,
    };
    navigate("/pricing-rules/new", { state: { prefill } });
  };

  return (
    <Drawer anchor="right" open={event != null} onClose={onClose} PaperProps={{ sx: { width: DRAWER_WIDTH, maxWidth: "100vw", display: "flex", flexDirection: "column", backgroundImage: "none" } }}>
      {event && (
        <>
          <DrawerHeader title={event.title} subtitle={`${CATEGORY_META[event.category].label} · ${formatEventDates(event)} · ${untilLabel(event)}`} onClose={onClose} />
          <DrawerBody>
            <Stack direction="row" gap={2} alignItems="center" sx={{ p: 2, borderRadius: "14px", bgcolor: alpha(categoryColor(event.category, theme), theme.palette.mode === "dark" ? 0.12 : 0.06) }}>
              <CategoryBadge category={event.category} size={56} />
              <Box sx={{ minWidth: 0 }}>
                <DemandMeter demand={event.demand} />
                <Typography sx={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, mt: 0.5, fontVariantNumeric: "tabular-nums" }}>
                  +{event.suggestedMarkupPercent}%
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  рекомендованная наценка на ночи события
                </Typography>
              </Box>
            </Stack>

            <DrawerSection label="Где и сколько гостей">
              <Stack gap={1.25}>
                <Stack direction="row" gap={1.25} alignItems="center">
                  <PlaceOutlined fontSize="small" sx={{ color: "text.disabled" }} />
                  <Typography variant="body2">
                    {event.venue || "Место уточняется"}, {event.city}
                  </Typography>
                </Stack>
                <Stack direction="row" gap={1.25} alignItems="center">
                  <GroupsOutlined fontSize="small" sx={{ color: "text.disabled" }} />
                  <Typography variant="body2">
                    {event.expectedAttendance != null
                      ? `≈ ${event.expectedAttendance.toLocaleString("ru-RU")} посетителей`
                      : "Весь город — число гостей не считается"}
                  </Typography>
                </Stack>
              </Stack>
            </DrawerSection>

            {event.description && (
              <DrawerSection label="Почему растёт спрос">
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                  {event.description}
                </Typography>
              </DrawerSection>
            )}

            <DrawerSection label="Цены на эти даты">
              {rule ? (
                <Alert severity="success" variant="outlined" icon={<CheckCircleOutlined fontSize="inherit" />}>
                  Действует правило «{rule.name}»:{" "}
                  {rule.adjustmentType === "percent" ? `+${Number(rule.adjustmentValue)}%` : `+${Number(rule.adjustmentValue)} сом за ночь`}.{" "}
                  <Box component={RouterLink} to={`/pricing-rules/${rule.id}`} sx={{ color: "inherit", fontWeight: 600 }}>
                    Открыть правило
                  </Box>
                </Alert>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Правила цены на эти даты ещё нет. Кнопка ниже откроет форму правила с датами события и наценкой +
                  {event.suggestedMarkupPercent}% — проверьте и сохраните.
                </Typography>
              )}
            </DrawerSection>

            <Typography variant="caption" color="text.disabled">
              Источник: {event.source}
            </Typography>
          </DrawerBody>
          <DrawerFooter>
            <Button onClick={onClose}>Закрыть</Button>
            {!rule && (
              <DisabledReason reason={canManageRates ? null : "Менять цены может сотрудник с правом «Тарифы и цены»"}>
                <Button variant="contained" disableElevation startIcon={<TrendingUpOutlined />} disabled={!canManageRates || opening}
                  onClick={() => void raisePrices()}
                  sx={{ px: 2.5, borderRadius: "10px", fontWeight: 700 }}
                >
                  {opening ? "Открываем форму…" : "Поднять цены на эти даты"}
                </Button>
              </DisabledReason>
            )}
          </DrawerFooter>
        </>
      )}
    </Drawer>
  );
};

// ── Своё событие ────────────────────────────────────────────────────────────

const EVENT_RULES = {
  title: { required: true, maxLength: 120 },
  venue: { maxLength: 120 },
  attendance: { kind: "int", min: 1, max: 1_000_000 },
  markup: { kind: "int", required: true, min: 1, max: 300 },
  description: { maxLength: 1000 },
} satisfies Record<string, FieldRules>;

const AddEventDrawer: React.FC<{ open: boolean; propertyId: number; onClose: () => void; onCreated: (e: HotelCityEvent) => void }> = ({
  open,
  propertyId,
  onClose,
  onCreated,
}) => {
  const createMutation = useCreateCityEvent();
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState<HotelCityEventCategory>("concert");
  const [venue, setVenue] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState<Dayjs | null>(dayjs().add(7, "day"));
  const [dateTo, setDateTo] = React.useState<Dayjs | null>(dayjs().add(7, "day"));
  const [attendance, setAttendance] = React.useState("");
  const [demand, setDemand] = React.useState<HotelCityEventDemand>("high");
  const [markup, setMarkup] = React.useState("20");
  const [description, setDescription] = React.useState("");
  const [showErrors, setShowErrors] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setCategory("concert");
    setVenue("");
    setDateFrom(dayjs().add(7, "day"));
    setDateTo(dayjs().add(7, "day"));
    setAttendance("");
    setDemand("high");
    setMarkup("20");
    setDescription("");
    setShowErrors(false);
    setError(null);
  }, [open]);

  const datesError =
    !dateFrom || !dateTo ? "Укажите даты" : dateTo.isBefore(dateFrom, "day") ? "Дата окончания раньше начала" : null;

  const submit = async () => {
    const invalid = hasFieldErrors([
      [title, EVENT_RULES.title],
      [venue, EVENT_RULES.venue],
      [attendance, EVENT_RULES.attendance],
      [markup, EVENT_RULES.markup],
      [description, EVENT_RULES.description],
    ]);
    if (invalid || datesError) {
      setShowErrors(true);
      setError(datesError ?? "Проверьте поля, отмеченные красным");
      focusFirstFieldError();
      return;
    }
    setError(null);
    try {
      const created = await createMutation.mutateAsync({
        propertyId,
        title: title.trim(),
        category,
        venue: venue.trim() || undefined,
        dateFrom: dateFrom!.format("YYYY-MM-DD"),
        dateTo: dateTo!.format("YYYY-MM-DD"),
        expectedAttendance: attendance ? Number(attendance) : null,
        demand,
        suggestedMarkupPercent: Number(markup),
        description: description.trim() || undefined,
      });
      onCreated(created);
    } catch (err) {
      setError(getErrorMessage(err, "Не удалось добавить событие"));
    }
  };

  const busy = createMutation.isPending;

  return (
    <Drawer anchor="right" open={open} onClose={() => (busy ? null : onClose())} PaperProps={{ sx: { width: DRAWER_WIDTH, maxWidth: "100vw", display: "flex", flexDirection: "column", backgroundImage: "none" } }}>
      <DrawerHeader title="Новое событие" subtitle="Концерт, фестиваль или форум, из-за которого вырастет спрос" onClose={onClose} />
      <DrawerBody>
        <DrawerSection label="Событие" first>
          <Stack gap={2}>
            <FormField
              icon={<DriveFileRenameOutlineOutlined />}
              label="Название"
              placeholder="Например, концерт на стадионе"
              value={title}
              onValueChange={setTitle}
              rules={EVENT_RULES.title}
              showErrors={showErrors}
              autoFocus
              fullWidth
            />
            <Stack direction="row" gap={2}>
              <FormField
                select
                icon={<CategoryOutlined />}
                label="Тип"
                value={category}
                onValueChange={(v) => setCategory(v as HotelCityEventCategory)}
                sx={{ flex: 1 }}
              >
                {CATEGORY_ORDER.map((c) => (
                  <MenuItem key={c} value={c}>
                    {CATEGORY_META[c].label}
                  </MenuItem>
                ))}
              </FormField>
              <FormField
                icon={<GroupsOutlined />}
                label="Посетителей"
                placeholder="≈ 10 000"
                value={attendance}
                onValueChange={setAttendance}
                rules={EVENT_RULES.attendance}
                showErrors={showErrors}
                sx={{ flex: 1 }}
              />
            </Stack>
            <FormField
              icon={<PlaceOutlined />}
              label="Где проходит"
              placeholder="Стадион, площадь, зал…"
              value={venue}
              onValueChange={setVenue}
              rules={EVENT_RULES.venue}
              showErrors={showErrors}
              fullWidth
            />
            <Stack direction="row" gap={2}>
              <CustomDatePicker label="Начало" value={dateFrom} onChange={setDateFrom} sx={{ flex: 1 }} />
              <CustomDatePicker label="Окончание" value={dateTo} onChange={setDateTo} minDate={dateFrom ?? undefined} sx={{ flex: 1 }} />
            </Stack>
          </Stack>
        </DrawerSection>
        <DrawerSection label="Спрос и цена">
          <Stack gap={2}>
            {/* На телефоне спрос своей строкой — иначе «Высокий спрос» обрезался до «Высокий с…». */}
            <Stack direction="row" gap={2} sx={{ flexWrap: { xs: "wrap", md: "nowrap" } }}>
              <FormField
                select
                icon={<LocalFireDepartmentOutlined />}
                label="Ожидаемый спрос"
                value={demand}
                onValueChange={(v) => setDemand(v as HotelCityEventDemand)}
                sx={{ flex: 1, minWidth: { xs: "100%", md: "auto" } }}
              >
                {(Object.keys(DEMAND_META) as HotelCityEventDemand[]).map((d) => (
                  <MenuItem key={d} value={d}>
                    {DEMAND_META[d].label}
                  </MenuItem>
                ))}
              </FormField>
              <FormField
                icon={<PercentOutlined />}
                label="Наценка"
                unit="%"
                value={markup}
                onValueChange={setMarkup}
                rules={EVENT_RULES.markup}
                showErrors={showErrors}
                sx={{ flex: 1 }}
              />
            </Stack>
            <FormField
              icon={<NotesOutlined />}
              label="Почему вырастет спрос"
              placeholder="Кто приезжает и на сколько ночей"
              value={description}
              onValueChange={setDescription}
              rules={EVENT_RULES.description}
              showErrors={showErrors}
              multiline
              minRows={3}
              fullWidth
            />
          </Stack>
        </DrawerSection>
        {error && <Alert severity="error">{error}</Alert>}
      </DrawerBody>
      <DrawerFooter>
        <Button onClick={onClose} disabled={busy}>
          Отмена
        </Button>
        <Button variant="contained" disableElevation onClick={() => void submit()} disabled={busy} sx={{ px: 3, borderRadius: "10px", fontWeight: 700 }}>
          {busy ? "Добавляем…" : "Добавить событие"}
        </Button>
      </DrawerFooter>
    </Drawer>
  );
};

// ── Страница ────────────────────────────────────────────────────────────────

type Filter = "all" | HotelCityEventCategory;

export const HotelEventsPage: React.FC = () => {
  usePageTitle("События");
  const theme = useTheme();
  const vivaActive = useIsVivaActive();
  const { enqueueSnackbar } = useSnackbar();
  const { property, isLoading: propertyLoading } = useHotelProperty();
  const canManageRates = useCan("hotel.rates.manage");

  const [month, setMonth] = React.useState<Dayjs>(() => dayjs().startOf("month"));
  const [filter, setFilter] = React.useState<Filter>("all");
  const [openEvent, setOpenEvent] = React.useState<HotelCityEvent | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);

  // «Ближайшие» и сводка — полгода вперёд; сетка месяца — свой запрос на 42
  // дня сетки (бэк отдаёт не больше 63 дней за раз, и листать календарь можно
  // на любой месяц, а не только в пределах заранее загруженного года).
  const rangeFrom = dayjs().format("YYYY-MM-DD");
  const rangeTo = dayjs().add(6, "month").format("YYYY-MM-DD");
  const eventsQuery = useCityEvents(property?.id, rangeFrom, rangeTo);
  const gridStart = month.startOf("month").subtract((month.startOf("month").day() + 6) % 7, "day");
  const monthQuery = useCityEvents(property?.id, gridStart.format("YYYY-MM-DD"), gridStart.add(41, "day").format("YYYY-MM-DD"));
  const rulesQuery = useQuery({
    queryKey: ["hotel", "pricingRules", property?.id],
    queryFn: ({ signal }) => listPricingRules(property!.id, signal),
    enabled: property != null,
  });
  const rules = React.useMemo(() => rulesQuery.data ?? [], [rulesQuery.data]);
  // Категории номеров нужны форме правила цены («Поднять цены»): грузим заранее
  // под тем же ключом, что у формы, — она откроется с готовыми данными, а не
  // будет ждать медленный бэк после перехода.
  useQuery({
    queryKey: ["hotel", "roomTypes", property?.id],
    queryFn: ({ signal }) => listRoomTypes(property!.id, {}, signal),
    enabled: property != null,
  });

  if (!vivaActive) return <Navigate to="/" replace />;

  const all = eventsQuery.data?.events ?? [];
  const isDemo = eventsQuery.data?.isDemo ?? false;
  const filtered = filter === "all" ? all : all.filter((e) => e.category === filter);
  const today = dayjs().format("YYYY-MM-DD");
  const upcoming = filtered.filter((e) => e.dateTo >= today);
  // Сводка считает те же полгода, что и список «Ближайшие»: цифра в шапке и
  // карточки рядом не должны расходиться.
  const ahead = all.filter((e) => e.dateTo >= today);
  const nextEvent = all.find((e) => e.dateTo >= today) ?? null;
  const peakCount = ahead.filter((e) => e.demand !== "moderate").length;
  const withoutRule = ahead.filter((e) => ruleForEvent(e, rules) == null);
  const avgMarkup = ahead.length > 0 ? Math.round(ahead.reduce((s, e) => s + e.suggestedMarkupPercent, 0) / ahead.length) : 0;

  const loading = propertyLoading || eventsQuery.isPending;

  return (
    <HotelPage>
      <HotelPageHeader
        title="События"
        subtitle={
          eventsQuery.isSuccess
            ? `${ahead.length} ${plural(ahead.length, "событие", "события", "событий")} за полгода` +
              (withoutRule.length > 0 ? ` · ${withoutRule.length} без повышения цен` : " · цены подняты на все")
            : undefined
        }
        info={
          <>
            Концерты, фестивали, праздники и форумы, из-за которых растёт спрос на номера. На каждое событие — рекомендация,
            на сколько поднять цену ночи; «Поднять цены» открывает правило цены с уже заполненными датами.
            {isDemo && " Сейчас события демонстрационные: бэкенд их ещё не отдаёт. Как только отдаст, здесь появятся настоящие."}
          </>
        }
        actions={
          <>
            {isDemo && (
              <Tooltip title="Бэкенд ещё не отдаёт события — показаны примеры. Настоящие появятся здесь сами, как только он их отдаст.">
                <Box component="span">
                  <StatusPill color={theme.palette.warning.main} label="Демо-данные" />
                </Box>
              </Tooltip>
            )}
            <Button variant="contained" disableElevation startIcon={<AddOutlined />} onClick={() => setAddOpen(true)} disabled={!property}>
              Добавить событие
            </Button>
          </>
        }
      />

      {!property && !propertyLoading ? (
        <HotelPropertyMissing />
      ) : loading ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      ) : eventsQuery.isError ? (
        <Alert severity="error" variant="outlined">
          {getErrorMessage(eventsQuery.error, "Не удалось загрузить события")}
        </Alert>
      ) : (
        <>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
            <MetricTile
              label="Ближайшее"
              value={nextEvent ? untilLabel(nextEvent).replace(/^через /, "") : "—"}
              hint={nextEvent ? nextEvent.title : "событий нет"}
              accent={nextEvent ? categoryColor(nextEvent.category, theme) : undefined}
            />
            <MetricTile label="Высокий спрос" value={peakCount} hint={`${plural(peakCount, "событие", "события", "событий")} за полгода`} accent={theme.palette.warning.main} />
            <MetricTile label="Средняя наценка" value={`+${avgMarkup}%`} hint="рекомендация на ночи событий" />
            <MetricTile
              label="Цены подняты"
              value={`${ahead.length - withoutRule.length} / ${ahead.length}`}
              hint={withoutRule.length > 0 ? `${withoutRule.length} ждут решения` : "на все события"}
              accent={withoutRule.length === 0 && ahead.length > 0 ? theme.palette.success.main : undefined}
            />
          </Box>

          <Stack direction="row" gap={1} flexWrap="wrap">
            <FilterChip label="Все" active={filter === "all"} onClick={() => setFilter("all")} />
            {CATEGORY_ORDER.filter((c) => all.some((e) => e.category === c)).map((c) => (
              <FilterChip key={c} label={CATEGORY_META[c].label} active={filter === c} onClick={() => setFilter(c)} />
            ))}
          </Stack>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.65fr) minmax(320px, 1fr)" }, gap: 2.5, alignItems: "start" }}>
            <MonthCalendar
              month={month}
              events={(monthQuery.data?.events ?? []).filter((e) => filter === "all" || e.category === filter)}
              loading={monthQuery.isFetching}
              nextEvent={nextEvent}
              onMonthChange={setMonth}
              onOpen={setOpenEvent}
            />
            <Box>
              <SectionLabel>Ближайшие</SectionLabel>
              {upcoming.length === 0 ? (
                <Surface>
                  <EmptyState icon={<EventOutlined />} title="Событий нет" description="Добавьте концерт или фестиваль, о котором узнали сами." />
                </Surface>
              ) : (
                <Stack gap={1.25}>
                  {upcoming.slice(0, 6).map((e) => (
                    <EventCard key={e.id} event={e} rule={ruleForEvent(e, rules)} onOpen={() => setOpenEvent(e)} />
                  ))}
                  {upcoming.length > 6 && (
                    <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
                      Ещё {upcoming.length - 6} — листайте месяцы слева
                    </Typography>
                  )}
                </Stack>
              )}
            </Box>
          </Box>
          {rulesQuery.isFetching && <LinearProgress sx={{ height: 2, borderRadius: 1 }} />}
        </>
      )}

      <EventDrawer event={openEvent} rule={openEvent ? ruleForEvent(openEvent, rules) : null} canManageRates={canManageRates} onClose={() => setOpenEvent(null)} />
      {property && (
        <AddEventDrawer
          open={addOpen}
          propertyId={property.id}
          onClose={() => setAddOpen(false)}
          onCreated={(e) => {
            setAddOpen(false);
            setMonth(dayjs(e.dateFrom).startOf("month"));
            setOpenEvent(e);
            enqueueSnackbar(`Событие «${e.title}» добавлено`, { variant: "success" });
          }}
        />
      )}
    </HotelPage>
  );
};

export default HotelEventsPage;
