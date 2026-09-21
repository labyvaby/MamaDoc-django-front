import React from "react";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { alpha, useTheme } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotification } from "@refinedev/core";
import dayjs, { type Dayjs } from "dayjs";
import "dayjs/locale/ru";
import { useSearchParams } from "react-router";

import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import ChevronLeftOutlinedIcon from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";

import {
  ConfirmDialog,
  DateRangeField,
  DEFAULT_RANGE_PRESETS,
  PageHeader,
  SegmentedTabs,
  UserAvatar,
} from "../../components/ui";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useCan } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import {
  getBooking,
  getBookings,
  updateBookingStatus,
  claimBooking,
  type BookingListItem,
  type BookingStatus,
  type BookingPrepaymentStatus,
  type BookingsFilters,
} from "../../api/bookings";
import { getDjangoEmployees } from "../../api/staff";
import {
  djangoQueryKeys,
  DJANGO_LIST_STALE_TIME_MS,
  DJANGO_REFERENCE_STALE_TIME_MS,
} from "../../api/queryKeys";
import { formatKGS } from "../../utility/format";
import { subtleBg } from "../../theme/uiHelpers";
import { bookingShowcaseUrl } from "../public-booking/format";
import BookingDetailDrawer from "./BookingDetailDrawer";
import BookingNotificationsBell from "./BookingNotificationsBell";
import BookingsAnalytics from "./BookingsAnalytics";
import {
  BookingRowActions,
  ClaimControl,
  useReminderText,
  useRemindedBookings,
} from "./BookingRowActions";
import { autoConfirmExtras, loadDoctorServiceIds, useBookingActions } from "./useBookingActions";
import {
  BOOKING_PREPAYMENT_META,
  BOOKING_STATUS_OPTIONS,
  PrepaymentChip,
  StatusChip,
  bookingAgeText,
  bookingTimeHint,
  hasPrepayment,
  isBookingMissed,
  sortBookingsByPriority,
  useTickingClock,
} from "./meta";
import {
  TRIAGE_FUTURE_DAYS,
  TRIAGE_PAST_DAYS,
  UPCOMING_FUTURE_DAYS,
  isBookingTab,
  needsTriage,
  type BookingTab,
} from "./bookingViews";
import { useT } from "../../i18n/VerticalProvider";
import { useNewBookings } from "../../hooks/useNewBookings";

const PAGE_SIZE = 20;
/** Серверный максимум pageSize (контракт §2.1). */
const BULK_PAGE_SIZE = 200;
/** Аналитика тянет не больше 10 страниц по 200 — дальше честное «≈». */
const ANALYTICS_MAX_PAGES = 10;
/** Заявки ждут звонка — опрашиваем чаще общего поллинга (как useNewBookings). */
const TRIAGE_POLL_MS = 45_000;

const DATE_FMT = "YYYY-MM-DD";

/**
 * Ссылка на публичную витрину онлайн-записи: регистратуре её диктуют пациентам
 * и вставляют в соцсети, поэтому рядом с открытием — копирование адреса.
 * Адрес строится по активной организации (витрина одна на весь CRM).
 */
const ShowcaseLink: React.FC<{ orgSlug: string | null }> = ({ orgSlug }) => {
  const [copied, setCopied] = React.useState(false);
  const url = bookingShowcaseUrl(orgSlug);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* буфер недоступен (нет https / отказ в правах) — адрес виден в тултипе */
    }
  };

  return (
    <Stack
      direction="row"
      alignItems="center"
      sx={(t) => ({
        borderRadius: "10px",
        border: 1,
        borderColor: "divider",
        bgcolor: subtleBg(t),
        overflow: "hidden",
        flexShrink: 0,
      })}
    >
      <Tooltip title={url}>
        <Button
          component="a"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          size="small"
          startIcon={<StorefrontOutlinedIcon fontSize="small" />}
          sx={{ textTransform: "none", color: "text.primary", fontWeight: 500, px: 1.25, borderRadius: 0 }}
        >
          Сайт записи
        </Button>
      </Tooltip>
      <Box sx={{ width: "1px", alignSelf: "stretch", bgcolor: "divider" }} />
      <Tooltip title={copied ? "Ссылка скопирована" : "Скопировать ссылку"}>
        <IconButton size="small" onClick={handleCopy} sx={{ borderRadius: 0, px: 1 }}>
          {copied ? (
            <CheckOutlinedIcon fontSize="small" color="success" />
          ) : (
            <ContentCopyOutlinedIcon fontSize="small" />
          )}
        </IconButton>
      </Tooltip>
    </Stack>
  );
};

// ── Мелкие чипы строки ────────────────────────────────────────────────────────

const TinyChip: React.FC<{ label: string; tone?: "primary" | "warning" }> = ({
  label,
  tone = "primary",
}) => (
  <Chip
    label={label}
    size="small"
    sx={(t) => {
      const main = tone === "warning" ? t.palette.warning : t.palette.primary;
      return {
        height: 18,
        fontSize: 11,
        fontWeight: 600,
        alignSelf: "flex-start",
        borderRadius: "6px",
        color: tone === "warning" ? (t.palette.mode === "dark" ? main.light : main.dark) : "primary.onSurface",
        bgcolor: alpha(main.main, t.palette.mode === "dark" ? 0.2 : 0.12),
      };
    }}
  />
);

/** Подсказка к дате визита: «сегодня»/«завтра», у разбора — ещё и просрочка. */
function visitHint(b: BookingListItem, tab: BookingTab, todayStr: string, tomorrowStr: string) {
  if (tab === "triage") {
    const h = bookingTimeHint(b.date, b.time, b.status, b.totalDurationMin);
    if (h?.tone === "warning" && b.status === "pending") return { label: h.text, tone: "warning" as const };
  }
  if (b.date === todayStr) return { label: "сегодня", tone: "primary" as const };
  if (b.date === tomorrowStr) return { label: "завтра", tone: "primary" as const };
  return null;
}

// ── Ширина таблицы ────────────────────────────────────────────────────────────

/**
 * Уже этой ширины контейнера таблица прячет второстепенные колонки («Создано»,
 * «Сумма»), чтобы не уезжать в горизонтальную прокрутку. Мерится контейнер, а
 * не окно: слева сайдбар, и на одном и том же ноутбуке таблице достаётся то
 * 900, то 1100 пикселей в зависимости от того, свёрнут ли он.
 */
const COMPACT_TABLE_WIDTH = 1040;

/**
 * Уже этого таблице не помочь никакими колонками: минимальные ширины того,
 * что обязано остаться (пациент, врач, визит, статус, «в работе», кнопки),
 * дают около 740 px. Дальше — карточки, как на телефоне: они помещаются в
 * любую ширину.
 */
const CARDS_BELOW_WIDTH = 780;

/** Текущая ширина элемента; до первого замера — Infinity, чтобы не мигать. */
function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = React.useRef<T | null>(null);
  const [width, setWidth] = React.useState(Number.POSITIVE_INFINITY);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// ── Состояние фильтров в URL ──────────────────────────────────────────────────

/**
 * Группа внутри «Разобрать»: живая очередь (подтвердить/отменить) и пропущенные
 * — заявки, чьё окно визита прошло без подтверждения (`isBookingMissed`). У
 * них другие исходы, поэтому и список отдельный: в очереди счёт на минуты,
 * пропущенным спешить некуда, а вперемешку они бы её захламляли.
 */
type TriageGroup = "queue" | "missed";

interface FiltersState {
  tab: BookingTab;
  group: TriageGroup;
  doctorId: number | "";
  status: BookingStatus | "";
  prepaymentStatus: BookingPrepaymentStatus | "";
  from: Dayjs;
  to: Dayjs;
  search: string;
  page: number;
}

const defaultFrom = () => dayjs().startOf("month");
const defaultTo = () => dayjs().endOf("month");

function readFilters(p: URLSearchParams): FiltersState {
  const tab = p.get("tab");
  const doctor = Number(p.get("doctor"));
  const status = p.get("status");
  const pay = p.get("pay");
  const from = p.get("from") ? dayjs(p.get("from")) : null;
  const to = p.get("to") ? dayjs(p.get("to")) : null;
  const page = Number(p.get("page"));
  return {
    tab: isBookingTab(tab) ? tab : "triage",
    group: p.get("group") === "missed" ? "missed" : "queue",
    doctorId: Number.isFinite(doctor) && doctor > 0 ? doctor : "",
    status: BOOKING_STATUS_OPTIONS.some((o) => o.value === status) ? (status as BookingStatus) : "",
    prepaymentStatus: pay && pay in BOOKING_PREPAYMENT_META ? (pay as BookingPrepaymentStatus) : "",
    from: from?.isValid() ? from : defaultFrom(),
    to: to?.isValid() ? to : defaultTo(),
    search: p.get("q") ?? "",
    page: Number.isFinite(page) && page > 0 ? page - 1 : 0,
  };
}

/**
 * Все фильтры одним набором: react-router не батчит два `setSearchParams`
 * подряд, поэтому URL всегда пишется целиком из состояния (см. память
 * react-router-setsearchparams-batching). Дефолты в адрес не попадают.
 */
function writeFilters(f: FiltersState): URLSearchParams {
  const p = new URLSearchParams();
  if (f.tab !== "triage") p.set("tab", f.tab);
  if (f.tab === "triage" && f.group === "missed") p.set("group", "missed");
  if (f.doctorId !== "") p.set("doctor", String(f.doctorId));
  if (f.status) p.set("status", f.status);
  if (f.prepaymentStatus) p.set("pay", f.prepaymentStatus);
  if (!f.from.isSame(defaultFrom(), "day")) p.set("from", f.from.format(DATE_FMT));
  if (!f.to.isSame(defaultTo(), "day")) p.set("to", f.to.format(DATE_FMT));
  if (f.search) p.set("q", f.search);
  if (f.page > 0) p.set("page", String(f.page + 1));
  return p;
}

/** Все страницы выдачи (до лимита) — для клиентских срезов и аналитики. */
async function fetchAllPages(
  filters: BookingsFilters,
  maxPages: number,
  signal?: AbortSignal,
): Promise<{ rows: BookingListItem[]; truncated: boolean }> {
  let rows: BookingListItem[] = [];
  for (let page = 1; ; page += 1) {
    const r = await getBookings({ ...filters, page, pageSize: BULK_PAGE_SIZE }, signal);
    rows = rows.concat(r.results);
    if (!r.next) return { rows, truncated: false };
    if (page >= maxPages) return { rows, truncated: true };
  }
}

// ── Страница ──────────────────────────────────────────────────────────────────

const BookingsPage: React.FC = () => {
  const { t } = useT("bookings");
  usePageTitle("Онлайн-запись");
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("md"));
  // Ширина меряется у корня страницы — он смонтирован при любой раскладке,
  // а таблица и карточки сменяют друг друга и замер бы терялся.
  const [pageRef, pageWidth] = useElementWidth<HTMLDivElement>();
  const isMobile = isPhone || pageWidth < CARDS_BELOW_WIDTH;
  const compactTable = pageWidth < COMPACT_TABLE_WIDTH;
  const canView = useCan("bookings.view");
  const canManage = useCan("bookings.manage");
  const queryClient = useQueryClient();
  const { open: notify } = useNotification();
  const {
    isSuperAdmin,
    activeOrganization,
    activeBranch,
    memberships,
    loading: permLoading,
  } = usePermissions();
  const isSuper = isSuperAdmin();
  const isMultiOrg = (memberships ?? []).length > 1;
  const needsOrg = (isSuper || isMultiOrg) && !activeOrganization;
  const organizationId = activeOrganization?.id ?? undefined;
  const orgKey = activeOrganization?.id ?? null;
  // Активный филиал уходит в запрос всегда: без него бэк отдаёт брони всей
  // организации (см. api/bookings.ts). В queryKey он тоже нужен.
  const branchId = activeBranch?.id ?? undefined;
  const branchKey = branchId ?? null;

  // ── Фильтры: из URL при входе, обратно в URL при каждом изменении ──
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = React.useState<FiltersState>(() => readFilters(searchParams));
  const [searchInput, setSearchInput] = React.useState(filters.search);
  const { tab, group, doctorId, status, prepaymentStatus, from, to, search, page } = filters;

  const patch = React.useCallback((p: Partial<FiltersState>) => {
    // Любая смена фильтра, кроме листания, возвращает на первую страницу.
    setFilters((prev) => ({ ...prev, page: 0, ...p }));
  }, []);

  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  // Отмеченные для массового подтверждения — только «Ожидает» (isRowSelectable).
  const [selectedIds, setSelectedIds] = React.useState<number[]>([]);

  const { isNew, markSeen } = useNewBookings();
  const { reminded, markReminded } = useRemindedBookings();
  const reminderText = useReminderText();

  /** Открытие карточки = разбор заявки: снимаем с неё пометку «новая». */
  const openBooking = React.useCallback(
    (id: number) => {
      markSeen([id]);
      setSelectedId(id);
    },
    [markSeen],
  );

  /**
   * Заявку нельзя подтвердить в один клик (нет услуг или карта не однозначна) —
   * открываем карточку сразу с диалогом подтверждения, а не с ошибкой бэка.
   */
  const [confirmOnOpenId, setConfirmOnOpenId] = React.useState<number | null>(null);
  const reviewBooking = React.useCallback(
    (id: number) => {
      setConfirmOnOpenId(id);
      openBooking(id);
    },
    [openBooking],
  );

  const actions = useBookingActions({ onNeedsReview: reviewBooking });

  // Дебаунс поиска: поле живёт локально, в фильтры (и URL) — через 400 мс.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();
      setFilters((prev) => (prev.search === next ? prev : { ...prev, search: next, page: 0 }));
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Ссылка из тоста «Новая заявка» ведёт сюда с ?open=<id>: открываем карточку.
  // Адрес переписываем целиком из фильтров — так `open` уходит, а фильтры нет.
  const openParam = searchParams.get("open");
  React.useEffect(() => {
    if (!openParam) return;
    const id = Number(openParam);
    if (Number.isFinite(id)) openBooking(id);
    setSearchParams(writeFilters(filters), { replace: true });
    // filters намеренно не в зависимостях: реагируем только на появление ?open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam, openBooking, setSearchParams]);

  React.useEffect(() => {
    const next = writeFilters(filters);
    if (next.toString() !== new URLSearchParams(window.location.search).toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [filters, setSearchParams]);

  // Выбор для массовых действий теряет смысл вместе со сменой выборки.
  React.useEffect(() => {
    setSelectedIds([]);
  }, [filters, orgKey, branchKey]);

  const enabled = !permLoading && canView && !needsOrg;
  const now = useTickingClock(30_000);
  const todayStr = now.format(DATE_FMT);
  const tomorrowStr = now.add(1, "day").format(DATE_FMT);

  const scope = { organizationId, branchId };
  const scopeKey = { orgId: orgKey, branch: branchKey };
  const doctorFilter = doctorId === "" ? undefined : doctorId;
  const searchFilter = search || undefined;

  // ── «Разобрать»: pending + отменённые/неявки с неразобранной предоплатой ──
  // Серверный фильтр умеет один статус, поэтому три выборки и срез на клиенте.
  const triageWindow = React.useMemo(
    () => ({
      dateFrom: dayjs().subtract(TRIAGE_PAST_DAYS, "day").format(DATE_FMT),
      dateTo: dayjs().add(TRIAGE_FUTURE_DAYS, "day").format(DATE_FMT),
    }),
    [],
  );
  const triageQuery = useQuery({
    queryKey: djangoQueryKeys.bookings.list({
      view: "triage",
      ...triageWindow,
      doctorId: doctorFilter,
      search: searchFilter,
      ...scopeKey,
    }),
    queryFn: async ({ signal }) => {
      const base = { ...triageWindow, ...scope, doctorId: doctorFilter, search: searchFilter };
      const [pending, cancelled, noShow] = await Promise.all(
        (["pending", "cancelled", "no_show"] as const).map((s) =>
          fetchAllPages({ ...base, status: s, ordering: "-createdAt" }, s === "pending" ? 5 : 1, signal),
        ),
      );
      return {
        rows: [...pending.rows, ...cancelled.rows, ...noShow.rows],
        truncated: pending.truncated,
      };
    },
    enabled,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    refetchInterval: TRIAGE_POLL_MS,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });
  const triageAll = React.useMemo(
    () => sortBookingsByPriority((triageQuery.data?.rows ?? []).filter((b) => needsTriage(b, now))),
    [triageQuery.data, now],
  );
  // Очередь и пропущенные — два списка одной вкладки (см. TriageGroup).
  const missedRows = React.useMemo(() => triageAll.filter((b) => isBookingMissed(b, now)), [triageAll, now]);
  const queueRows = React.useMemo(() => triageAll.filter((b) => !isBookingMissed(b, now)), [triageAll, now]);
  const triageRows = group === "missed" ? missedRows : queueRows;
  // Пропущенных нет — переключатель не показываем, а адрес с group=missed
  // ведёт в пустой список с понятной подписью.
  const showGroupSwitch = tab === "triage" && (missedRows.length > 0 || group === "missed");
  /** Режим кнопок строки: у пропущенных — свои исходы вместо «Подтвердить». */
  const rowMode: "triage" | "missed" | "upcoming" | null =
    tab === "triage" ? (group === "missed" ? "missed" : "triage") : tab === "upcoming" ? "upcoming" : null;

  // ── «Предстоящие»: подтверждённые с сегодняшнего дня, ближайшие сверху ──
  const upcomingFilters: BookingsFilters = {
    dateFrom: todayStr,
    dateTo: dayjs().add(UPCOMING_FUTURE_DAYS, "day").format(DATE_FMT),
    status: "confirmed",
    ordering: "date",
    doctorId: doctorFilter,
    search: searchFilter,
    ...scope,
  };
  const upcomingPage = tab === "upcoming" ? page : 0;
  const upcomingQuery = useQuery({
    queryKey: djangoQueryKeys.bookings.list({ view: "upcoming", ...upcomingFilters, ...scopeKey, page: upcomingPage }),
    queryFn: ({ signal }) =>
      getBookings({ ...upcomingFilters, page: upcomingPage + 1, pageSize: PAGE_SIZE }, signal),
    enabled,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  // ── «Журнал»: все брони периода по дате визита ──
  const journalFilters: BookingsFilters = {
    dateFrom: from.format(DATE_FMT),
    dateTo: to.format(DATE_FMT),
    status: status || undefined,
    prepaymentStatus: prepaymentStatus || undefined,
    ordering: "-date",
    doctorId: doctorFilter,
    search: searchFilter,
    ...scope,
  };
  const journalQuery = useQuery({
    queryKey: djangoQueryKeys.bookings.list({ view: "journal", ...journalFilters, ...scopeKey, page }),
    queryFn: ({ signal }) => getBookings({ ...journalFilters, page: page + 1, pageSize: PAGE_SIZE }, signal),
    enabled: enabled && tab === "journal",
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  // ── «Аналитика»: период по времени поступления заявки ──
  // Дата визита обязательна в запросе, поэтому окно визитов берём с запасом:
  // записываются вперёд (до полугода), а синк внешних каналов — и задним числом.
  const analyticsFilters: BookingsFilters = {
    dateFrom: from.subtract(60, "day").format(DATE_FMT),
    dateTo: to.add(UPCOMING_FUTURE_DAYS, "day").format(DATE_FMT),
    createdFrom: from.format(DATE_FMT),
    createdTo: to.format(DATE_FMT),
    doctorId: doctorFilter,
    ...scope,
  };
  const analyticsQuery = useQuery({
    queryKey: djangoQueryKeys.bookings.list({ view: "analytics", ...analyticsFilters, ...scopeKey }),
    queryFn: ({ signal }) => fetchAllPages(analyticsFilters, ANALYTICS_MAX_PAGES, signal),
    enabled: enabled && tab === "analytics",
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });

  const doctorsQuery = useQuery({
    queryKey: [...djangoQueryKeys.reference.employees, "doctors", orgKey],
    queryFn: ({ signal }) =>
      getDjangoEmployees({ status: "active", pageSize: 200, organizationId }, signal),
    enabled,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
  });
  const doctors = React.useMemo(
    () => (doctorsQuery.data?.results ?? []).filter((e) => e.clinicalRole === "doctor"),
    [doctorsQuery.data],
  );

  /**
   * Массовое подтверждение. Одним PATCH это не сделать безопасно: карточка
   * требует пациента и услуги (`ConfirmBookingDialog`), а в списке их нет —
   * подтягиваем `getBooking` по каждой брони. Подтверждаем только однозначные
   * (ровно одно совпадение по телефону); остальные — на ручной разбор.
   */
  const bulkConfirm = useMutation({
    mutationFn: async (ids: number[]) => {
      const settled = await Promise.allSettled(
        ids.map(async (id) => {
          const detail = await getBooking(id);
          const extras = autoConfirmExtras(detail, await loadDoctorServiceIds(detail));
          if (!extras) throw new Error("needs-review");
          // Время реакции: никем не взятую заявку берём на себя до подтверждения.
          if (!detail.claimedAt) await claimBooking(id).catch(() => undefined);
          await updateBookingStatus(id, "confirmed", extras);
          return id;
        }),
      );
      return settled
        .filter((r): r is PromiseFulfilledResult<number> => r.status === "fulfilled")
        .map((r) => r.value);
    },
    onSuccess: (confirmed, ids) => {
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.bookings.all });
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.appointments.all });
      setSelectedIds([]);
      const skipped = ids.filter((id) => !confirmed.includes(id));
      notify?.({
        type: confirmed.length > 0 ? "success" : "error",
        message:
          skipped.length > 0
            ? `Подтверждено ${confirmed.length} из ${ids.length}. Для остальных ${skipped.length} нужно выбрать карту или услуги.`
            : `Подтверждено: ${confirmed.length}`,
      });
      if (skipped.length > 0) reviewBooking(skipped[0]);
    },
    onError: () => notify?.({ type: "error", message: "Не удалось подтвердить онлайн-записи" }),
  });

  /**
   * Массовая неявка по пропущенным. Один PATCH на заявку; `claim` перед ним —
   * то же правило времени реакции, что у закрытия из строки.
   */
  const bulkNoShow = useMutation({
    mutationFn: async (ids: number[]) => {
      const settled = await Promise.allSettled(
        ids.map(async (id) => {
          const detail = await getBooking(id);
          if (!detail.claimedAt) await claimBooking(id).catch(() => undefined);
          await updateBookingStatus(id, "no_show");
          return id;
        }),
      );
      return settled
        .filter((r): r is PromiseFulfilledResult<number> => r.status === "fulfilled")
        .map((r) => r.value);
    },
    onSuccess: (done, ids) => {
      queryClient.invalidateQueries({ queryKey: djangoQueryKeys.bookings.all });
      setSelectedIds([]);
      notify?.({
        type: done.length > 0 ? "success" : "error",
        message:
          done.length === ids.length
            ? `Неявка отмечена: ${done.length}`
            : `Неявка отмечена у ${done.length} из ${ids.length}`,
      });
    },
    onError: () => notify?.({ type: "error", message: "Не удалось отметить неявку" }),
  });
  const [bulkNoShowOpen, setBulkNoShowOpen] = React.useState(false);

  // ── Строки текущей вкладки ──
  const allRowsOfTab: BookingListItem[] =
    tab === "triage"
      ? triageRows
      : tab === "upcoming"
        ? [...(upcomingQuery.data?.results ?? [])].sort(
            (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
          )
        : journalQuery.data?.results ?? [];
  const rows = tab === "triage" ? allRowsOfTab.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : allRowsOfTab;
  const total =
    tab === "triage"
      ? triageRows.length
      : tab === "upcoming"
        ? upcomingQuery.data?.count ?? 0
        : journalQuery.data?.count ?? 0;
  const activeQuery = tab === "triage" ? triageQuery : tab === "upcoming" ? upcomingQuery : journalQuery;
  const listLoading = activeQuery.isLoading;

  const showsPrepayment = rows.some(hasPrepayment);
  const showsReceived = tab === "triage" && rows.some((b) => b.createdAt);

  const hasActiveFilters =
    doctorId !== "" ||
    search !== "" ||
    ((tab === "journal" || tab === "analytics") &&
      (status !== "" ||
        prepaymentStatus !== "" ||
        !from.isSame(defaultFrom(), "day") ||
        !to.isSame(defaultTo(), "day")));

  const handleResetFilters = () => {
    setSearchInput("");
    patch({
      doctorId: "",
      status: "",
      prepaymentStatus: "",
      search: "",
      from: defaultFrom(),
      to: defaultTo(),
    });
  };

  const columns = React.useMemo<GridColDef<BookingListItem>[]>(() => {
    const cols: GridColDef<BookingListItem>[] = [
      {
        field: "patientName",
        headerName: t("patientLabel"),
        flex: 1.4,
        minWidth: 150,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack direction="row" alignItems="center" gap={1.25} sx={{ height: "100%", minWidth: 0 }}>
            <UserAvatar name={row.patientName} size={32} sx={{ borderRadius: "9px", flexShrink: 0 }} />
            <Box sx={{ lineHeight: 1.2, minWidth: 0 }}>
              {/* Непрочитанная заявка набрана жирнее — как непрочитанное письмо. */}
              <Stack direction="row" alignItems="center" gap={0.75} sx={{ minWidth: 0 }}>
                <Typography variant="body2" fontWeight={isNew(row) ? 700 : 500} noWrap>
                  {row.patientName}
                </Typography>
                {isNew(row) && <TinyChip label="новая" />}
              </Stack>
              {row.patientPhone && (
                <Typography variant="caption" color="text.secondary" noWrap display="block">
                  {row.patientPhone}
                </Typography>
              )}
            </Box>
          </Stack>
        ),
      },
      { field: "doctorName", headerName: t("specialistLabel"), flex: 1, minWidth: 110, sortable: false },
    ];
    // Колонки «Филиал» нет по решению заказчика (22.09.2026): филиал уже
    // выбран переключателем вверху, а в таблице он только ел ширину.
    cols.push({
      field: "date",
      headerName: "Визит",
      flex: 0.8,
      minWidth: 120,
      sortable: false,
      renderCell: ({ row }) => {
        const hint = visitHint(row, tab, todayStr, tomorrowStr);
        return (
          <Stack sx={{ height: "100%" }} justifyContent="center" gap={0.25}>
            <Typography variant="body2" noWrap>
              {dayjs(row.date).format("DD.MM.YYYY")} {row.time}
            </Typography>
            {hint && <TinyChip label={hint.label} tone={hint.tone} />}
          </Stack>
        );
      },
    });
    if (showsReceived) {
      // Возраст заявки, а не время суток (см. bookingAgeText); точная дата —
      // в тултипе.
      cols.push({
        field: "createdAt",
        headerName: "Создано",
        width: 100,
        sortable: false,
        renderCell: ({ row }) => (
          <Tooltip title={row.createdAt ? dayjs(row.createdAt).format("DD.MM.YYYY HH:mm") : ""}>
            <Typography variant="body2" color="text.secondary" noWrap>
              {bookingAgeText(row.createdAt, now) ?? "—"}
            </Typography>
          </Tooltip>
        ),
      });
    }
    cols.push({
      field: "totalPrice",
      headerName: "Сумма",
      width: 96,
      sortable: false,
      renderCell: ({ row }) => (
        <Typography variant="body2" fontWeight={600}>
          {formatKGS(row.totalPrice)}
        </Typography>
      ),
    });
    // Статус нужен там, где он разный; в «Предстоящих» все подтверждены.
    if (tab !== "upcoming" || showsPrepayment) {
      cols.push({
        field: "status",
        headerName: tab === "upcoming" ? "Оплата" : "Статус",
        // Чипы переносятся (flexWrap ниже), поэтому колонка тянется, а не
        // держит ширину под самый длинный вариант.
        flex: showsPrepayment ? 1.2 : 0.9,
        minWidth: showsPrepayment ? 170 : 130,
        sortable: false,
        renderCell: ({ row }) => (
          <Stack direction="row" alignItems="center" gap={0.5} flexWrap="wrap" sx={{ py: 0.5 }}>
            {tab !== "upcoming" && (
              <StatusChip status={row.status} expiresAt={row.prepaymentExpiresAt} now={now} />
            )}
            {row.prepaymentStatus && (
              <PrepaymentChip
                status={row.prepaymentStatus}
                amount={row.prepaymentAmount}
                needsAttention={row.prepaymentNeedsAttention}
                expiresAt={row.prepaymentExpiresAt}
                awaitingConfirmation={row.prepaymentStatus === "paid" && row.status === "pending"}
              />
            )}
          </Stack>
        ),
      });
    }
    if (tab === "triage") {
      cols.push({
        field: "claimedBy",
        headerName: "В работе",
        width: 120,
        sortable: false,
        renderCell: ({ row }) => (
          <Box onClick={(e) => e.stopPropagation()}>
            <ClaimControl booking={row} canManage={canManage} actions={actions} />
          </Box>
        ),
      });
    }
    if (rowMode != null) {
      cols.push({
        field: "actions",
        headerName: "",
        // Пропущенная: звонок, WhatsApp, перезаписать, неявка, отменить.
        width: rowMode === "missed" ? 190 : rowMode === "triage" ? 116 : 84,
        sortable: false,
        align: "right",
        renderCell: ({ row }) => (
          <BookingRowActions
            booking={row}
            mode={rowMode}
            canManage={canManage}
            actions={actions}
            reminded={reminded.has(row.id)}
            onRemind={(b) => markReminded(b.id)}
            reminderText={reminderText}
          />
        ),
      });
    }
    return cols;
  }, [
    t,
    tab,
    rowMode,
    isNew,
    showsReceived,
    showsPrepayment,
    todayStr,
    tomorrowStr,
    now,
    canManage,
    actions,
    reminded,
    markReminded,
    reminderText,
  ]);

  if (!permLoading && !canView) return <AccessDenied />;

  const emptyListText =
    tab === "triage"
      ? group === "missed"
        ? "Пропущенных заявок нет"
        : "Всё разобрано — новых заявок нет"
      : tab === "upcoming"
        ? "Подтверждённых онлайн-записей впереди нет"
        : "Онлайн-записей за выбранный период не найдено";

  const emptyState = (
    <Stack alignItems="center" justifyContent="center" sx={{ height: "100%", py: 6, opacity: 0.8 }}>
      {tab === "triage" && !hasActiveFilters ? (
        <CheckCircleOutlinedIcon sx={{ fontSize: 52, color: "text.disabled", mb: 1.5 }} />
      ) : (
        <EventBusyOutlinedIcon sx={{ fontSize: 52, color: "text.disabled", mb: 1.5 }} />
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {emptyListText}
      </Typography>
      {hasActiveFilters && (
        <Button size="small" onClick={handleResetFilters} sx={{ textTransform: "none" }}>
          Сбросить фильтры
        </Button>
      )}
    </Stack>
  );
  const NoRowsOverlay = () => emptyState;

  const tabs = [
    {
      key: "triage" as const,
      label: "Разобрать",
      icon: <InboxOutlinedIcon />,
      badge: triageQuery.data ? queueRows.length : undefined,
    },
    {
      key: "upcoming" as const,
      label: "Предстоящие",
      icon: <EventAvailableOutlinedIcon />,
      badge: upcomingQuery.data?.count,
    },
    { key: "journal" as const, label: "Журнал", icon: <HistoryOutlinedIcon /> },
    { key: "analytics" as const, label: "Аналитика", icon: <InsightsOutlinedIcon /> },
  ];

  return (
    <Box ref={pageRef} sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title="Онлайн-запись"
        showTitle={false}
        showSearch={tab !== "analytics"}
        searchVal={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Имя, телефон или код"
        loading={activeQuery.isFetching || (tab === "analytics" && analyticsQuery.isFetching)}
        actions={
          <Stack direction="row" alignItems="center" gap={1}>
            <BookingNotificationsBell onOpenBooking={openBooking} />
            <ShowcaseLink orgSlug={activeOrganization?.slug ?? null} />
          </Stack>
        }
      />

      {needsOrg ? (
        <Box sx={{ px: 3, pt: 2 }}>
          <Alert severity="info">Выберите организацию, чтобы увидеть онлайн-записи.</Alert>
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            px: theme.appLayout.page.paddingX,
            pb: 2,
          }}
        >
          {/* ── Одна строка управления: вкладки + фильтры текущей вкладки ── */}
          <Stack direction="row" flexWrap="wrap" gap={1.25} alignItems="center" sx={{ mt: 2, mb: 1.5 }}>
            <SegmentedTabs
              layoutId="bookings-tabs"
              tabs={tabs}
              value={tab}
              onChange={(key) => patch({ tab: key })}
            />

            {showGroupSwitch && (
              <SegmentedTabs<TriageGroup>
                layoutId="bookings-triage-group"
                tabs={[
                  { key: "queue", label: t("missed.queue"), badge: queueRows.length },
                  { key: "missed", label: t("missed.group"), icon: <EventBusyOutlinedIcon />, badge: missedRows.length },
                ]}
                value={group}
                onChange={(key) => {
                  setSelectedIds([]);
                  patch({ group: key });
                }}
              />
            )}

            {(tab === "journal" || tab === "analytics") && (
              <DateRangeField
                value={{ from, to }}
                onChange={(r) => patch({ from: r.from, to: r.to })}
                presets={DEFAULT_RANGE_PRESETS}
                minWidth={200}
              />
            )}

            <TextField
              select
              size="small"
              label={t("specialistLabel")}
              value={doctorId === "" ? "" : String(doctorId)}
              onChange={(e) => patch({ doctorId: e.target.value === "" ? "" : Number(e.target.value) })}
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="">{t("allSpecialists")}</MenuItem>
              {doctors.map((d) => (
                <MenuItem key={d.id} value={String(d.id)}>
                  {d.fullName}
                </MenuItem>
              ))}
            </TextField>

            {tab === "journal" && (
              <TextField
                select
                size="small"
                label="Статус"
                value={status}
                onChange={(e) => patch({ status: e.target.value as BookingStatus | "" })}
                sx={{ minWidth: 150 }}
              >
                <MenuItem value="">Любой</MenuItem>
                {BOOKING_STATUS_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
            )}

            {/* Предоплата — у клиник, где она вообще встречается. */}
            {tab === "journal" && (showsPrepayment || prepaymentStatus !== "") && (
              <TextField
                select
                size="small"
                label="Предоплата"
                value={prepaymentStatus}
                onChange={(e) =>
                  patch({ prepaymentStatus: e.target.value as BookingPrepaymentStatus | "" })
                }
                sx={{ minWidth: 150 }}
              >
                <MenuItem value="">Любая</MenuItem>
                {(Object.keys(BOOKING_PREPAYMENT_META) as BookingPrepaymentStatus[]).map((code) => (
                  <MenuItem key={code} value={code}>
                    {BOOKING_PREPAYMENT_META[code].label}
                  </MenuItem>
                ))}
              </TextField>
            )}

            {hasActiveFilters && (
              <Button
                size="small"
                onClick={handleResetFilters}
                startIcon={<CloseOutlinedIcon fontSize="small" />}
                sx={{ textTransform: "none", flexShrink: 0 }}
              >
                Сбросить
              </Button>
            )}
          </Stack>

          {tab === "analytics" ? (
            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              <BookingsAnalytics
                rows={analyticsQuery.data?.rows ?? []}
                loading={analyticsQuery.isLoading}
                error={analyticsQuery.error}
                truncated={analyticsQuery.data?.truncated ?? false}
              />
            </Box>
          ) : activeQuery.error ? (
            <Alert severity="error">
              {activeQuery.error instanceof Error ? activeQuery.error.message : "Ошибка загрузки"}
            </Alert>
          ) : isMobile ? (
            /* ── Мобильный карточный список ── */
            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pb: 1 }}>
              {listLoading ? (
                <Stack spacing={1}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} variant="rounded" height={88} />
                  ))}
                </Stack>
              ) : rows.length === 0 ? (
                emptyState
              ) : (
                <Stack spacing={1}>
                  {rows.map((b) => {
                    const hint = visitHint(b, tab, todayStr, tomorrowStr);
                    return (
                      <ButtonBase
                        key={b.id}
                        focusRipple
                        component="div"
                        onClick={() => openBooking(b.id)}
                        sx={(th) => ({
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          p: 1.25,
                          borderRadius: "14px",
                          border: 1,
                          borderColor: isNew(b) ? alpha(th.palette.primary.main, 0.45) : "divider",
                          borderLeft: isNew(b) ? 3 : 1,
                          borderLeftColor: isNew(b) ? th.palette.primary.main : "divider",
                          bgcolor: "background.paper",
                        })}
                      >
                        <Stack direction="row" alignItems="center" gap={1.25}>
                          <UserAvatar name={b.patientName} size={40} sx={{ borderRadius: "10px", flexShrink: 0 }} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={600} noWrap>
                              {b.patientName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap display="block">
                              {b.doctorName || "—"}
                            </Typography>
                            <Stack direction="row" alignItems="center" gap={0.75} sx={{ mt: 0.25 }}>
                              <Typography variant="caption" color="text.secondary">
                                {dayjs(b.date).format("DD.MM.YYYY")} {b.time}
                              </Typography>
                              {isNew(b) && <TinyChip label="новая" />}
                              {hint && <TinyChip label={hint.label} tone={hint.tone} />}
                            </Stack>
                          </Box>
                          <Stack alignItems="flex-end" gap={0.5} sx={{ flexShrink: 0 }}>
                            <Typography variant="body2" fontWeight={600} whiteSpace="nowrap">
                              {formatKGS(b.totalPrice)}
                            </Typography>
                            {tab !== "upcoming" && (
                              <StatusChip status={b.status} expiresAt={b.prepaymentExpiresAt} now={now} />
                            )}
                            {b.prepaymentStatus && (
                              <PrepaymentChip
                                status={b.prepaymentStatus}
                                amount={b.prepaymentAmount}
                                needsAttention={b.prepaymentNeedsAttention}
                                expiresAt={b.prepaymentExpiresAt}
                                awaitingConfirmation={b.prepaymentStatus === "paid" && b.status === "pending"}
                              />
                            )}
                          </Stack>
                        </Stack>
                        {rowMode != null && (
                          <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            gap={1}
                            sx={{ mt: 1 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {tab === "triage" ? (
                              <ClaimControl booking={b} canManage={canManage} actions={actions} />
                            ) : (
                              <span />
                            )}
                            <BookingRowActions
                              booking={b}
                              mode={rowMode}
                              canManage={canManage}
                              actions={actions}
                              reminded={reminded.has(b.id)}
                              onRemind={(x) => markReminded(x.id)}
                              reminderText={reminderText}
                            />
                          </Stack>
                        )}
                      </ButtonBase>
                    );
                  })}

                  {total > PAGE_SIZE && (
                    <Stack direction="row" alignItems="center" justifyContent="center" gap={1} sx={{ pt: 0.5 }}>
                      <IconButton
                        size="small"
                        disabled={page === 0}
                        onClick={() => setFilters((f) => ({ ...f, page: Math.max(0, f.page - 1) }))}
                      >
                        <ChevronLeftOutlinedIcon fontSize="small" />
                      </IconButton>
                      <Typography variant="caption" color="text.secondary">
                        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} из {total}
                      </Typography>
                      <IconButton
                        size="small"
                        disabled={(page + 1) * PAGE_SIZE >= total}
                        onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                      >
                        <ChevronRightOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  )}
                </Stack>
              )}
            </Box>
          ) : (
            <Box sx={{ flex: 1, minHeight: 360, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
              {tab === "triage" && triageQuery.data?.truncated && (
                <Alert severity="info">
                  Заявок больше 1000 — показаны самые свежие. Сузьте выборку фильтром.
                </Alert>
              )}
              {/* Массовые действия — только «Ожидает», только с bookings.manage:
                  в очереди — подтвердить, у пропущенных — неявка. */}
              {tab === "triage" && canManage && selectedIds.length > 0 && group === "missed" && (
                <Stack
                  direction="row"
                  alignItems="center"
                  gap={1}
                  sx={(th) => ({
                    px: 1.5,
                    py: 1,
                    borderRadius: "10px",
                    border: 1,
                    borderColor: "divider",
                    bgcolor: subtleBg(th),
                  })}
                >
                  <Typography variant="body2" color="text.secondary">
                    Выбрано: {selectedIds.length}
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={
                      bulkNoShow.isPending ? (
                        <CircularProgress size={14} color="inherit" />
                      ) : (
                        <PersonOffOutlinedIcon fontSize="small" />
                      )
                    }
                    disabled={bulkNoShow.isPending}
                    onClick={() => setBulkNoShowOpen(true)}
                    sx={{ textTransform: "none" }}
                  >
                    {t("missed.bulkNoShow")}
                  </Button>
                  <Button
                    size="small"
                    disabled={bulkNoShow.isPending}
                    onClick={() => setSelectedIds([])}
                    sx={{ textTransform: "none" }}
                  >
                    Снять выбор
                  </Button>
                  <ConfirmDialog
                    open={bulkNoShowOpen}
                    onClose={() => setBulkNoShowOpen(false)}
                    onConfirm={() => {
                      setBulkNoShowOpen(false);
                      bulkNoShow.mutate(selectedIds);
                    }}
                    title={t("missed.noShowConfirm.title")}
                    message={t("missed.noShowConfirm.message")}
                    confirmText={t("missed.noShowConfirm.confirm")}
                    cancelText={t("missed.noShowConfirm.cancel")}
                    variant="warning"
                  />
                </Stack>
              )}
              {tab === "triage" && canManage && selectedIds.length > 0 && group === "queue" && (
                <Stack
                  direction="row"
                  alignItems="center"
                  gap={1}
                  sx={(th) => ({
                    px: 1.5,
                    py: 1,
                    borderRadius: "10px",
                    border: 1,
                    borderColor: "divider",
                    bgcolor: subtleBg(th),
                  })}
                >
                  <Typography variant="body2" color="text.secondary">
                    Выбрано: {selectedIds.length}
                  </Typography>
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    startIcon={
                      bulkConfirm.isPending ? (
                        <CircularProgress size={14} color="inherit" />
                      ) : (
                        <CheckCircleOutlinedIcon fontSize="small" />
                      )
                    }
                    disabled={bulkConfirm.isPending}
                    onClick={() => bulkConfirm.mutate(selectedIds)}
                    sx={{ textTransform: "none" }}
                  >
                    Подтвердить выбранные
                  </Button>
                  <Button
                    size="small"
                    disabled={bulkConfirm.isPending}
                    onClick={() => setSelectedIds([])}
                    sx={{ textTransform: "none" }}
                  >
                    Снять выбор
                  </Button>
                </Stack>
              )}
              <DataGrid<BookingListItem>
                rows={rows}
                columns={columns}
                loading={listLoading}
                rowCount={total}
                paginationMode="server"
                paginationModel={{ page, pageSize: PAGE_SIZE }}
                onPaginationModelChange={(m) => setFilters((f) => ({ ...f, page: m.page }))}
                pageSizeOptions={[PAGE_SIZE]}
                disableColumnMenu
                disableRowSelectionOnClick
                // Чекбоксы массового подтверждения — только там, где им есть
                // место: на узкой таблице они выталкивали кнопки строки за край.
                checkboxSelection={canManage && tab === "triage" && !compactTable}
                isRowSelectable={(p) => p.row.status === "pending"}
                rowSelectionModel={selectedIds}
                onRowSelectionModelChange={(model) => setSelectedIds(model as number[])}
                /* Не density="comfortable": тема зажимает шапку до headerRowHeight,
                   а comfortable раздувает её ячейки и закрашивает первую строку. */
                rowHeight={64}
                columnHeaderHeight={theme.appLayout.table.headerRowHeight}
                // Узкому контейнеру — без «Создано» и «Суммы»: возраст заявки
                // и цена есть в карточке, а горизонтальная прокрутка прячет
                // статус и действия, ради которых страницу открывают.
                columnVisibilityModel={{ createdAt: !compactTable, totalPrice: !compactTable }}
                onRowClick={(p) => openBooking(p.row.id)}
                getRowClassName={(p) =>
                  [p.row.date === todayStr ? "row-today" : "", isNew(p.row) ? "row-new" : ""]
                    .filter(Boolean)
                    .join(" ")
                }
                slots={{ noRowsOverlay: NoRowsOverlay }}
                localeText={ruRU.components.MuiDataGrid.defaultProps.localeText}
                sx={(th) => ({
                  flex: 1,
                  minHeight: 0,
                  bgcolor: "background.paper",
                  borderRadius: "14px",
                  "& .MuiDataGrid-row": { cursor: "pointer" },
                  "& .MuiDataGrid-columnHeaders": { bgcolor: "background.paper" },
                  // Центрируем контент ячеек флексом: голая Typography иначе
                  // прилипает к верху строки.
                  "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" },
                  "& .row-today": {
                    bgcolor: alpha(th.palette.primary.main, th.palette.mode === "dark" ? 0.07 : 0.045),
                    "&:hover": {
                      bgcolor: alpha(th.palette.primary.main, th.palette.mode === "dark" ? 0.11 : 0.08),
                    },
                  },
                  // Непрочитанная заявка — акцентная полоса слева (тенью внутрь
                  // строки: не сдвигает содержимое).
                  "& .row-new": { boxShadow: `inset 3px 0 0 ${th.palette.primary.main}` },
                })}
              />
            </Box>
          )}
        </Box>
      )}

      <BookingDetailDrawer
        bookingId={selectedId}
        canManage={canManage}
        onClose={() => {
          setSelectedId(null);
          setConfirmOnOpenId(null);
        }}
        openConfirm={selectedId != null && confirmOnOpenId === selectedId}
        onConfirmOpened={() => setConfirmOnOpenId(null)}
        siblingIds={rows.map((r) => r.id)}
        onNavigate={openBooking}
      />
    </Box>
  );
};

export default BookingsPage;
