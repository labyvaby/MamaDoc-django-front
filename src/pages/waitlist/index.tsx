import React from "react";
import {
  Alert,
  Box,
  ButtonBase,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Skeleton,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { ruRU } from "@mui/x-data-grid/locales";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import dayjs from "dayjs";

import AddOutlined from "@mui/icons-material/AddOutlined";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import EventAvailableOutlined from "@mui/icons-material/EventAvailableOutlined";
import EventBusyOutlined from "@mui/icons-material/EventBusyOutlined";
import HistoryOutlined from "@mui/icons-material/HistoryOutlined";
import HourglassBottomOutlined from "@mui/icons-material/HourglassBottomOutlined";
import HourglassEmptyOutlined from "@mui/icons-material/HourglassEmptyOutlined";
import LanguageOutlined from "@mui/icons-material/LanguageOutlined";
import MoreVertOutlined from "@mui/icons-material/MoreVertOutlined";
import NotificationsActiveOutlined from "@mui/icons-material/NotificationsActiveOutlined";
import PersonOutlineOutlined from "@mui/icons-material/PersonOutlineOutlined";
import PhoneCallbackOutlined from "@mui/icons-material/PhoneCallbackOutlined";
import PhoneInTalkOutlined from "@mui/icons-material/PhoneInTalkOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import PlaylistAddOutlined from "@mui/icons-material/PlaylistAddOutlined";
import PriorityHighOutlined from "@mui/icons-material/PriorityHighOutlined";
import QueryBuilderOutlined from "@mui/icons-material/QueryBuilderOutlined";

import {
  AppButton,
  FilterPill,
  PageHeader,
  SegmentedTabs,
  TonedChip,
  UserAvatar,
  pillSx,
} from "../../components/ui";
import { AccessDenied } from "../../components/rbac/AccessDenied";
import { subtleBg } from "../../theme/uiHelpers";
import { useT } from "../../i18n/VerticalProvider";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useCanChecker } from "../../hooks/useCan";
import { useActiveScope } from "../../hooks/useActiveScope";
import { doctorEmployeesOnly, useAllActiveEmployees } from "../../hooks/useAllActiveEmployees";
import { djangoQueryKeys, DJANGO_LIST_STALE_TIME_MS } from "../../api/queryKeys";
import { formatPhoneDisplay } from "../../utility/phone";
import {
  cancelWaitlistEntry,
  contactWaitlistEntry,
  getWaitlist,
  getWaitlistSummary,
  reopenWaitlistEntry,
  WAITLIST_ACTIVE_STATUSES,
  WAITLIST_CLOSED_STATUSES,
  WAITLIST_USE_MOCKS,
  type WaitlistContactResult,
  type WaitlistEntry,
  type WaitlistFilters,
} from "../../api/waitlist";
import WaitlistDrawer from "../../components/waitlist/WaitlistDrawer";
import WaitlistDetailDrawer from "../../components/waitlist/WaitlistDetailDrawer";
import {
  WaitlistPriorityChip,
  WaitlistSourceChip,
  WaitlistStatusChip,
} from "../../components/waitlist/WaitlistChips";
import {
  displayName,
  isExpiringSoon,
  periodLabel,
  timeRangeLabel,
  waitingDays,
  waitingForLabel,
  weekdaysLabel,
  WAITING_LONG_DAYS,
  WAITLIST_CONTACT_RESULT_META,
  WAITLIST_REFRESH_MS,
  waitlistErrorMessage,
} from "./meta";

const PAGE_SIZE = 20;

/** «В очереди» — все активные; «Ждём ответа» — только offered; «Закрытые». */
type WaitlistTab = "active" | "offered" | "closed";

const isWaitlistTab = (v: string | null): v is WaitlistTab =>
  v === "active" || v === "offered" || v === "closed";

// ── Состояние фильтров в URL ──────────────────────────────────────────────────

interface FiltersState {
  tab: WaitlistTab;
  employeeId: number | "";
  urgent: boolean;
  fromSite: boolean;
  search: string;
  page: number;
}

function readFilters(p: URLSearchParams): FiltersState {
  const employee = Number(p.get("employee"));
  const page = Number(p.get("page"));
  const tab = p.get("tab");
  return {
    tab: isWaitlistTab(tab) ? tab : "active",
    employeeId: Number.isFinite(employee) && employee > 0 ? employee : "",
    urgent: p.get("urgent") === "1",
    fromSite: p.get("source") === "public",
    search: p.get("q") ?? "",
    page: Number.isFinite(page) && page > 0 ? page - 1 : 0,
  };
}

/**
 * URL пишется целиком из состояния: `setSearchParams` не батчится, и две
 * записи подряд теряют одну из них. Дефолты в адрес не попадают.
 */
function writeFilters(f: FiltersState): URLSearchParams {
  const p = new URLSearchParams();
  if (f.tab !== "active") p.set("tab", f.tab);
  if (f.employeeId !== "") p.set("employee", String(f.employeeId));
  if (f.urgent) p.set("urgent", "1");
  if (f.fromSite) p.set("source", "public");
  if (f.search) p.set("q", f.search);
  if (f.page > 0) p.set("page", String(f.page + 1));
  return p;
}

// ── Мелкие элементы ───────────────────────────────────────────────────────────

type KpiTone = "primary" | "warning" | "error";

const toneOf = (t: Theme, tone: KpiTone) =>
  tone === "warning" ? t.palette.warning : tone === "error" ? t.palette.error : t.palette.primary;

/**
 * Показатель очереди. Кликабельный — фильтрует список; активный подсвечен
 * гранью. Число — главное: регистратор смотрит «сколько звонить», а не читает.
 */
const KpiTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  tone: KpiTone;
  active?: boolean;
  hint?: string;
  onClick?: () => void;
}> = ({ icon, label, value, tone, active = false, hint, onClick }) => {
  const dim = value === 0;
  const tile = (
    <Stack
      direction="row"
      alignItems="center"
      gap={1.5}
      component={onClick ? ButtonBase : "div"}
      {...(onClick ? { onClick, focusRipple: true } : {})}
      sx={(t) => {
        const p = toneOf(t, tone);
        return {
          width: "100%",
          p: 1.5,
          borderRadius: "12px",
          border: 1,
          textAlign: "left",
          justifyContent: "flex-start",
          borderColor: active ? alpha(p.main, 0.55) : "divider",
          bgcolor: active ? alpha(p.main, t.palette.mode === "dark" ? 0.12 : 0.06) : "background.paper",
          transition: "background-color .15s ease, border-color .15s ease",
          ...(onClick && {
            cursor: "pointer",
            "&:hover": {
              borderColor: alpha(p.main, 0.4),
              bgcolor: active ? alpha(p.main, t.palette.mode === "dark" ? 0.16 : 0.09) : subtleBg(t, true),
            },
          }),
        };
      }}
    >
      <Box
        sx={(t) => {
          const p = toneOf(t, tone);
          return {
            width: 40,
            height: 40,
            borderRadius: "10px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: dim
              ? "text.disabled"
              : tone === "primary"
                ? "primary.onSurface"
                : t.palette.mode === "dark"
                  ? p.light
                  : p.dark,
            bgcolor: dim ? subtleBg(t, true) : alpha(p.main, t.palette.mode === "dark" ? 0.18 : 0.1),
            "& .MuiSvgIcon-root": { fontSize: 20 },
          };
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        {value == null ? (
          <Skeleton width={28} height={30} />
        ) : (
          <Typography
            sx={{
              fontSize: "1.375rem",
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: -0.3,
              fontVariantNumeric: "tabular-nums",
              color: dim ? "text.secondary" : "text.primary",
            }}
          >
            {value}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" noWrap display="block">
          {label}
        </Typography>
      </Box>
    </Stack>
  );
  return hint ? (
    <Tooltip title={hint}>
      <Box sx={{ display: "flex" }}>{tile}</Box>
    </Tooltip>
  ) : (
    tile
  );
};

/** Квадратная иконка-кнопка строки (гайд §5.3, уменьшенная под строку таблицы). */
const RowIconButton: React.FC<{
  title: string;
  onClick?: () => void;
  href?: string;
  children: React.ReactNode;
}> = ({ title, onClick, href, children }) => (
  <Tooltip title={title}>
    <IconButton
      size="small"
      onClick={onClick}
      {...(href ? { href } : {})}
      sx={(t) => ({
        width: 32,
        height: 32,
        borderRadius: "9px",
        border: 1,
        borderColor: "divider",
        color: "text.secondary",
        "& .MuiSvgIcon-root": { fontSize: 17 },
        "&:hover": {
          color: "text.primary",
          bgcolor: subtleBg(t, true),
          borderColor: alpha(t.palette.primary.main, 0.35),
        },
      })}
    >
      {children}
    </IconButton>
  </Tooltip>
);

/** Пустая очередь без фильтров — объясняем, как пользоваться модулем. */
const HowItWorks: React.FC<{ onAdd?: () => void }> = ({ onAdd }) => {
  const { t } = useT("waitlist");
  const steps = [
    { icon: <PlaylistAddOutlined />, title: t("howItWorks.step1Title"), text: t("howItWorks.step1Text") },
    { icon: <NotificationsActiveOutlined />, title: t("howItWorks.step2Title"), text: t("howItWorks.step2Text") },
    { icon: <PhoneInTalkOutlined />, title: t("howItWorks.step3Title"), text: t("howItWorks.step3Text") },
  ];
  return (
    <Box
      sx={{
        borderRadius: "14px",
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        px: { xs: 2, md: 4 },
        py: { xs: 3, md: 5 },
      }}
    >
      <Stack alignItems="center" textAlign="center" sx={{ maxWidth: 520, mx: "auto" }}>
        <Box
          sx={(th) => ({
            width: 56,
            height: 56,
            borderRadius: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "primary.onSurface",
            bgcolor: alpha(th.palette.primary.main, th.palette.mode === "dark" ? 0.16 : 0.1),
            mb: 1.5,
          })}
        >
          <HourglassEmptyOutlined sx={{ fontSize: 28 }} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: -0.2 }}>
          {t("empty")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {t("emptyHint")}
        </Typography>
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
          gap: 1.25,
          mt: 3.5,
          maxWidth: 960,
          mx: "auto",
        }}
      >
        {steps.map((s, i) => (
          <Stack
            key={s.title}
            gap={1}
            sx={(th) => ({
              p: 2,
              borderRadius: "12px",
              border: 1,
              borderColor: "divider",
              bgcolor: subtleBg(th),
            })}
          >
            <Stack direction="row" alignItems="center" gap={1}>
              <Box
                sx={(th) => ({
                  width: 32,
                  height: 32,
                  borderRadius: "9px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "primary.onSurface",
                  bgcolor: alpha(th.palette.primary.main, th.palette.mode === "dark" ? 0.16 : 0.1),
                  "& .MuiSvgIcon-root": { fontSize: 18 },
                })}
              >
                {s.icon}
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                {i + 1}
              </Typography>
            </Stack>
            <Typography variant="body2" fontWeight={600}>
              {s.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {s.text}
            </Typography>
          </Stack>
        ))}
      </Box>

      {onAdd && (
        <Stack alignItems="center" sx={{ mt: 3 }}>
          {/* Основная кнопка уже в шапке — здесь контурная (гайд §5.4). */}
          <AppButton variant="outlined" startIcon={<AddOutlined />} onClick={onAdd}>
            {t("add")}
          </AppButton>
        </Stack>
      )}
    </Box>
  );
};

/** «5 дней» + «с 02.09»; долгое ожидание и близкий конец срока — тоном. */
const WaitingCell: React.FC<{ entry: WaitlistEntry; closed: boolean }> = ({ entry, closed }) => {
  const { t } = useT("waitlist");
  if (closed) {
    return (
      <Stack gap={0.25} sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap>
          {entry.closedAt ? dayjs(entry.closedAt).format("DD.MM.YYYY") : "—"}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {t("waitingDays", { count: waitingDays(entry) })}
        </Typography>
      </Stack>
    );
  }
  const days = waitingDays(entry);
  const long = days >= WAITING_LONG_DAYS;
  const expiring = isExpiringSoon(entry);
  return (
    <Stack gap={0.25} sx={{ minWidth: 0 }}>
      <Typography
        variant="body2"
        noWrap
        sx={(th) => ({
          fontWeight: long ? 600 : 400,
          color: long ? (th.palette.mode === "dark" ? th.palette.warning.light : th.palette.warning.dark) : "text.primary",
        })}
      >
        {t("waitingDays", { count: days })}
      </Typography>
      <Typography
        variant="caption"
        noWrap
        sx={(th) => ({
          color: expiring
            ? th.palette.mode === "dark"
              ? th.palette.error.light
              : th.palette.error.dark
            : "text.secondary",
        })}
      >
        {expiring && entry.activeUntil
          ? t("expiresOn", { date: dayjs(entry.activeUntil).format("DD.MM") })
          : dayjs(entry.createdAt).format("с DD.MM")}
      </Typography>
    </Stack>
  );
};

const LastContactCell: React.FC<{ entry: WaitlistEntry }> = ({ entry }) => {
  const { t } = useT("waitlist");
  if (!entry.lastContactAt || !entry.lastContactResult) {
    return (
      <Typography variant="caption" color="text.disabled" noWrap>
        {t("neverContacted")}
      </Typography>
    );
  }
  const meta = WAITLIST_CONTACT_RESULT_META[entry.lastContactResult];
  return (
    <Stack gap={0.35} sx={{ minWidth: 0, alignItems: "flex-start" }}>
      <TonedChip label={meta.label} toneName={meta.color} />
      <Typography variant="caption" color="text.secondary" noWrap>
        {dayjs(entry.lastContactAt).format("DD.MM HH:mm")}
        {entry.contactsCount > 1 ? ` · ${t("calls", { count: entry.contactsCount })}` : ""}
      </Typography>
    </Stack>
  );
};

// ── Страница ──────────────────────────────────────────────────────────────────

const WaitlistPage: React.FC = () => {
  const { t } = useT("waitlist");
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scope = useActiveScope();
  const orgId = scope.organizationId;
  const { can, loading: permLoading } = useCanChecker();

  usePageTitle(t("title"));

  const canView = can("waitlist.view") || can("waitlist.manage");
  const canCreate = can("waitlist.create") || can("waitlist.manage");
  const canManage = can("waitlist.manage");

  // ── Фильтры: из URL при входе, обратно в URL при каждом изменении ──
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = React.useState<FiltersState>(() => readFilters(searchParams));
  const [searchInput, setSearchInput] = React.useState(filters.search);
  const { tab, employeeId, urgent, fromSite, search, page } = filters;

  const patch = React.useCallback((p: Partial<FiltersState>) => {
    // Любая смена фильтра, кроме листания, возвращает на первую страницу.
    setFilters((prev) => ({ ...prev, page: 0, ...p }));
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();
      setFilters((prev) => (prev.search === next ? prev : { ...prev, search: next, page: 0 }));
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  React.useEffect(() => {
    const next = writeFilters(filters);
    if (next.toString() !== new URLSearchParams(window.location.search).toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [filters, setSearchParams]);

  // Смена филиала — другая очередь: страница пагинации сбрасывается, иначе
  // после переключения можно попасть на пустую вторую страницу.
  React.useEffect(() => {
    setFilters((prev) => (prev.page === 0 ? prev : { ...prev, page: 0 }));
  }, [scope.branchId]);

  const { employees: allEmployees } = useAllActiveEmployees(true);
  // Фильтр очереди — по тем же людям, что и в форме: только врачи.
  const employees = React.useMemo(() => doctorEmployeesOnly(allEmployees), [allEmployees]);

  // Филиал режем сами: бэк по филиалу сессии на проде не скоупит (10.09.2026),
  // но параметр branchId поддерживает. У суперадмина без филиала branchId
  // пуст — это осознанный режим «все филиалы».
  const listFilters: WaitlistFilters = React.useMemo(
    () => ({
      status:
        tab === "active" ? WAITLIST_ACTIVE_STATUSES : tab === "offered" ? "offered" : WAITLIST_CLOSED_STATUSES,
      search: search || undefined,
      employeeId: employeeId === "" ? undefined : employeeId,
      priority: urgent ? "urgent" : undefined,
      source: fromSite ? "public" : undefined,
      page: page + 1,
      pageSize: PAGE_SIZE,
      organizationId: orgId,
      branchId: scope.branchId,
    }),
    [tab, search, employeeId, urgent, fromSite, page, orgId, scope.branchId],
  );

  const enabled = canView && scope.orgReady;

  const query = useQuery({
    queryKey: djangoQueryKeys.waitlist.list(listFilters as Record<string, unknown>),
    queryFn: ({ signal }) => getWaitlist(listFilters, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    refetchInterval: WAITLIST_REFRESH_MS,
    placeholderData: keepPreviousData,
    enabled,
  });

  const summaryQuery = useQuery({
    queryKey: djangoQueryKeys.waitlist.summary(orgId, scope.branchId),
    queryFn: ({ signal }) => getWaitlistSummary(orgId, scope.branchId, signal),
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    refetchInterval: WAITLIST_REFRESH_MS,
    enabled,
  });
  const summary = summaryQuery.data;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: djangoQueryKeys.waitlist.all });
  };

  const [toast, setToast] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<WaitlistEntry | null>(null);
  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (entry: WaitlistEntry) => {
    setEditing(entry);
    setDrawerOpen(true);
  };

  const [detailEntry, setDetailEntry] = React.useState<WaitlistEntry | null>(null);

  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [menuEntry, setMenuEntry] = React.useState<WaitlistEntry | null>(null);
  const openMenu = (anchor: HTMLElement, entry: WaitlistEntry) => {
    setMenuAnchor(anchor);
    setMenuEntry(entry);
  };

  const [cancelTarget, setCancelTarget] = React.useState<WaitlistEntry | null>(null);
  const [cancelReason, setCancelReason] = React.useState("");

  const cancelMutation = useMutation({
    mutationFn: (entry: WaitlistEntry) =>
      cancelWaitlistEntry(entry.id, { reason: cancelReason.trim() }, orgId),
    onSuccess: () => {
      setCancelTarget(null);
      setCancelReason("");
      setDetailEntry(null);
      setToast(t("actions.cancelled"));
      invalidate();
    },
    onError: (e) => setError(waitlistErrorMessage(e, "Не удалось снять запись")),
  });

  const reopenMutation = useMutation({
    mutationFn: (entry: WaitlistEntry) => reopenWaitlistEntry(entry.id, orgId),
    onSuccess: () => {
      setToast(t("actions.reopened"));
      invalidate();
    },
    onError: (e) => setError(waitlistErrorMessage(e, "Не удалось вернуть запись в очередь")),
  });

  const [contactTarget, setContactTarget] = React.useState<WaitlistEntry | null>(null);
  const [contactResult, setContactResult] = React.useState<WaitlistContactResult | null>(null);
  const [contactNote, setContactNote] = React.useState("");

  const openContactDialog = (entry: WaitlistEntry) => {
    setContactTarget(entry);
    setContactResult(null);
    setContactNote("");
  };

  const contactMutation = useMutation({
    mutationFn: ({ entry, result }: { entry: WaitlistEntry; result: WaitlistContactResult }) =>
      contactWaitlistEntry(entry.id, { result, note: contactNote.trim() || undefined }, orgId),
    onSuccess: () => {
      setContactTarget(null);
      setToast(t("actions.contactSaved"));
      invalidate();
    },
    onError: (e) => setError(waitlistErrorMessage(e, "Не удалось отметить контакт")),
  });

  /**
   * «Записать» — уводим в приёмы с предзаполнением. Запись листа закрывается
   * не здесь, а после того, как приём действительно создан (см. §6.4 ТЗ):
   * пока приёма нет, человек по-прежнему ждёт.
   */
  const handleBook = (entry: WaitlistEntry) => {
    const params = new URLSearchParams({ new: "1", waitlistId: String(entry.id) });
    if (entry.employeeId != null) params.set("employee", String(entry.employeeId));
    if (entry.patientId != null) params.set("patient", String(entry.patientId));
    if (entry.services[0]) params.set("service", String(entry.services[0].id));
    navigate(`/appointments?${params.toString()}`);
  };

  const rows = query.data?.results ?? [];
  const total = query.data?.count ?? 0;
  const closed = tab === "closed";

  // Открытая карточка берёт свежую строку из списка после фонового обновления.
  const detailRow = detailEntry ? (rows.find((r) => r.id === detailEntry.id) ?? detailEntry) : null;

  const hasActiveFilters = employeeId !== "" || urgent || fromSite || search !== "";
  const resetFilters = () => {
    setSearchInput("");
    patch({ employeeId: "", urgent: false, fromSite: false, search: "" });
  };

  const columns: GridColDef<WaitlistEntry>[] = [
    {
      field: "name",
      headerName: t("columns.patient"),
      flex: 1.3,
      minWidth: 220,
      sortable: false,
      renderCell: ({ row }) => (
        <Stack direction="row" alignItems="center" gap={1.25} sx={{ minWidth: 0 }}>
          <UserAvatar name={displayName(row)} size={34} sx={{ borderRadius: "10px", flexShrink: 0 }} />
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" alignItems="center" gap={0.75} sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                {displayName(row)}
              </Typography>
              <WaitlistPriorityChip priority={row.priority} />
              <WaitlistSourceChip source={row.source} />
            </Stack>
            <Typography variant="caption" color="text.secondary" noWrap display="block">
              {formatPhoneDisplay(row.phone)}
            </Typography>
          </Box>
        </Stack>
      ),
    },
    {
      field: "waitingFor",
      headerName: t("columns.waitingFor"),
      flex: 1,
      minWidth: 170,
      sortable: false,
      renderCell: ({ row }) => (
        <Stack gap={0.25} sx={{ minWidth: 0 }}>
          <Typography variant="body2" noWrap>
            {waitingForLabel(row)}
          </Typography>
          {row.services.length > 0 && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {row.services.map((s) => s.name).join(", ")}
            </Typography>
          )}
        </Stack>
      ),
    },
    {
      field: "period",
      headerName: t("columns.period"),
      flex: 1,
      minWidth: 160,
      sortable: false,
      renderCell: ({ row }) => {
        const extra = [weekdaysLabel(row), timeRangeLabel(row)].filter(Boolean).join(" · ");
        return (
          <Stack gap={0.25} sx={{ minWidth: 0 }}>
            <Typography variant="body2" noWrap>
              {periodLabel(row)}
            </Typography>
            {extra && (
              <Typography variant="caption" color="text.secondary" noWrap>
                {extra}
              </Typography>
            )}
          </Stack>
        );
      },
    },
    {
      field: "waitingDays",
      headerName: closed ? t("columns.closed") : t("columns.waitingDays"),
      width: 120,
      sortable: false,
      renderCell: ({ row }) => <WaitingCell entry={row} closed={closed} />,
    },
    {
      field: "lastContact",
      headerName: t("columns.lastContact"),
      width: 190,
      sortable: false,
      renderCell: ({ row }) => <LastContactCell entry={row} />,
    },
  ];
  // «В очереди» смешивает ждущих и тех, кому уже предложили окно, — там статус
  // различает строки. На остальных вкладках он у всех один (кроме закрытых).
  if (tab !== "offered") {
    columns.push({
      field: "status",
      headerName: t("columns.status"),
      width: 175,
      sortable: false,
      renderCell: ({ row }) => (
        <Stack gap={0.35} sx={{ minWidth: 0, alignItems: "flex-start" }}>
          <WaitlistStatusChip status={row.status} />
          {row.closeReason && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 140 }}>
              {row.closeReason}
            </Typography>
          )}
        </Stack>
      ),
    });
  }
  columns.push({
    field: "actions",
    headerName: "",
    width: closed ? 64 : canCreate ? 214 : 116,
    sortable: false,
    align: "right",
    renderCell: ({ row }) => (
      // Клик по кнопкам не должен всплывать до строки: onRowClick открыл бы карточку.
      <Stack direction="row" alignItems="center" gap={0.75} onClick={(e) => e.stopPropagation()}>
        {!closed && (
          <>
            <RowIconButton title={t("actions.call")} href={`tel:${row.phone}`}>
              <PhoneOutlined />
            </RowIconButton>
            <RowIconButton title={t("actions.contact")} onClick={() => openContactDialog(row)}>
              <PhoneCallbackOutlined />
            </RowIconButton>
            {canCreate && (
              <AppButton
                size="small"
                variant="contained"
                onClick={() => handleBook(row)}
                sx={{ height: 32, minHeight: 32, px: 1.5 }}
              >
                {t("actions.book")}
              </AppButton>
            )}
          </>
        )}
        <IconButton size="small" onClick={(e) => openMenu(e.currentTarget, row)}>
          <MoreVertOutlined fontSize="small" />
        </IconButton>
      </Stack>
    ),
  });

  if (!permLoading && !canView) return <AccessDenied />;

  const tabs = [
    { key: "active" as const, label: t("tabs.active"), icon: <HourglassEmptyOutlined /> },
    { key: "offered" as const, label: t("tabs.offered"), icon: <QueryBuilderOutlined /> },
    { key: "closed" as const, label: t("tabs.closed"), icon: <HistoryOutlined /> },
  ];

  const loading = query.isLoading;
  // Совсем пустая очередь (не результат фильтра) — вместо пустой таблицы
  // объясняем, как работает модуль.
  const showHowItWorks = !loading && !query.isError && tab === "active" && !hasActiveFilters && total === 0;

  const emptyText = hasActiveFilters
    ? t("emptyFiltered")
    : tab === "offered"
      ? t("emptyOffered")
      : tab === "closed"
        ? t("emptyClosed")
        : t("empty");

  const emptyState = (
    <Stack alignItems="center" justifyContent="center" sx={{ height: "100%", py: 6 }}>
      <EventBusyOutlined sx={{ fontSize: 48, color: "text.disabled", mb: 1.5 }} />
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {emptyText}
      </Typography>
      {hasActiveFilters && (
        <AppButton size="small" onClick={resetFilters}>
          {t("filters.reset")}
        </AppButton>
      )}
    </Stack>
  );
  const NoRowsOverlay = () => emptyState;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHeader
        title={t("title")}
        showTitle={false}
        showSearch
        searchVal={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder={t("filters.search")}
        onAdd={canCreate ? openCreate : undefined}
        addButtonText={t("add")}
        loading={query.isFetching}
      />

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
        {WAITLIST_USE_MOCKS && (
          <Alert severity="info" sx={{ mt: 2 }}>
            {t("mockNotice")}
          </Alert>
        )}

        {/* ── Показатели очереди: клик фильтрует список ── */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" },
            gap: 1.25,
            mt: 2,
          }}
        >
          <KpiTile
            icon={<PersonOutlineOutlined />}
            label={t("kpi.waiting")}
            value={summary?.waiting}
            tone="primary"
            active={tab === "active" && !urgent}
            onClick={() => patch({ tab: "active", urgent: false })}
          />
          <KpiTile
            icon={<QueryBuilderOutlined />}
            label={t("kpi.offered")}
            value={summary?.offered}
            tone="warning"
            active={tab === "offered"}
            onClick={() => patch({ tab: "offered" })}
          />
          <KpiTile
            icon={<PriorityHighOutlined />}
            label={t("kpi.urgent")}
            value={summary?.urgent}
            tone="error"
            active={tab === "active" && urgent}
            onClick={() => patch({ tab: "active", urgent: !(tab === "active" && urgent) })}
          />
          {/* Фильтра «истекает» у списка нет — плитка только информирует. */}
          <KpiTile
            icon={<HourglassBottomOutlined />}
            label={t("kpi.expiringSoon")}
            value={summary?.expiringSoon}
            tone="warning"
            hint={t("kpi.expiringHint")}
          />
        </Box>

        {/* ── Одна строка управления: вкладки + фильтры ── */}
        <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center" sx={{ mt: 2, mb: 1.5 }}>
          <SegmentedTabs layoutId="waitlist-tabs" tabs={tabs} value={tab} onChange={(key) => patch({ tab: key })} />
          <FilterPill
            label={t("filters.employee")}
            icon={<PersonOutlineOutlined />}
            value={employeeId === "" ? "" : String(employeeId)}
            options={employees.map((e) => ({ value: String(e.id), label: e.fullName }))}
            allLabel={t("filters.allEmployees")}
            onChange={(v) => patch({ employeeId: v === "" ? "" : Number(v) })}
          />
          <Chip
            label={t("priority.urgent")}
            icon={<PriorityHighOutlined />}
            onClick={() => patch({ urgent: !urgent })}
            sx={(th) => ({ ...pillSx(th, urgent, "error"), "& .MuiChip-icon": { fontSize: 15, color: "inherit", ml: 0 } })}
          />
          <Chip
            label={t("filters.fromSite")}
            icon={<LanguageOutlined />}
            onClick={() => patch({ fromSite: !fromSite })}
            sx={(th) => ({ ...pillSx(th, fromSite), "& .MuiChip-icon": { fontSize: 15, color: "inherit", ml: 0 } })}
          />
          {hasActiveFilters && (
            <AppButton
              size="small"
              onClick={resetFilters}
              startIcon={<CloseOutlined fontSize="small" />}
              sx={{ height: 30, minHeight: 30 }}
            >
              {t("filters.reset")}
            </AppButton>
          )}
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {query.isError ? (
          <Alert severity="error">{t("loadError")}</Alert>
        ) : showHowItWorks ? (
          <HowItWorks onAdd={canCreate ? openCreate : undefined} />
        ) : isMobile ? (
          /* ── Телефон: карточки ── */
          <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pb: 1 }}>
            {loading ? (
              <Stack spacing={1}>
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} variant="rounded" height={112} sx={{ borderRadius: "14px" }} />
                ))}
              </Stack>
            ) : rows.length === 0 ? (
              emptyState
            ) : (
              <Stack spacing={1}>
                {rows.map((row) => {
                  const active = WAITLIST_ACTIVE_STATUSES.includes(row.status);
                  return (
                    <ButtonBase
                      key={row.id}
                      component="div"
                      focusRipple
                      onClick={() => setDetailEntry(row)}
                      sx={(th) => ({
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        p: 1.5,
                        borderRadius: "14px",
                        border: 1,
                        borderColor: "divider",
                        bgcolor: "background.paper",
                        ...(row.priority === "urgent" && active
                          ? { boxShadow: `inset 3px 0 0 ${th.palette.error.main}` }
                          : null),
                      })}
                    >
                      <Stack direction="row" alignItems="center" gap={1.25}>
                        <UserAvatar name={displayName(row)} size={40} sx={{ borderRadius: "10px", flexShrink: 0 }} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {displayName(row)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap display="block">
                            {waitingForLabel(row)} · {periodLabel(row)}
                          </Typography>
                        </Box>
                        <WaitlistStatusChip status={row.status} />
                      </Stack>
                      <Stack direction="row" alignItems="center" gap={0.75} flexWrap="wrap" sx={{ mt: 1 }}>
                        <WaitlistPriorityChip priority={row.priority} />
                        <WaitlistSourceChip source={row.source} />
                        <Typography variant="caption" color="text.secondary">
                          {t("waitingDays", { count: waitingDays(row) })}
                          {row.lastContactResult
                            ? ` · ${WAITLIST_CONTACT_RESULT_META[row.lastContactResult].label}`
                            : ` · ${t("neverContacted")}`}
                        </Typography>
                      </Stack>
                      {active && (
                        <Stack
                          direction="row"
                          gap={1}
                          sx={{ mt: 1.25 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <AppButton
                            size="small"
                            variant="outlined"
                            href={`tel:${row.phone}`}
                            startIcon={<PhoneOutlined fontSize="small" />}
                            sx={{ flex: 1 }}
                          >
                            {t("actions.call")}
                          </AppButton>
                          {canCreate && (
                            <AppButton
                              size="small"
                              variant="contained"
                              onClick={() => handleBook(row)}
                              startIcon={<EventAvailableOutlined fontSize="small" />}
                              sx={{ flex: 1 }}
                            >
                              {t("actions.book")}
                            </AppButton>
                          )}
                          <IconButton size="small" onClick={(e) => openMenu(e.currentTarget, row)}>
                            <MoreVertOutlined fontSize="small" />
                          </IconButton>
                        </Stack>
                      )}
                    </ButtonBase>
                  );
                })}

                {total > PAGE_SIZE && (
                  <Stack direction="row" alignItems="center" justifyContent="center" gap={1} sx={{ pt: 0.5 }}>
                    <IconButton size="small" disabled={page === 0} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>
                      <ChevronLeftOutlined fontSize="small" />
                    </IconButton>
                    <Typography variant="caption" color="text.secondary">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} из {total}
                    </Typography>
                    <IconButton
                      size="small"
                      disabled={(page + 1) * PAGE_SIZE >= total}
                      onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                    >
                      <ChevronRightOutlined fontSize="small" />
                    </IconButton>
                  </Stack>
                )}
              </Stack>
            )}
          </Box>
        ) : (
          <DataGrid<WaitlistEntry>
            rows={rows}
            columns={columns}
            getRowId={(row) => row.id}
            loading={loading}
            rowHeight={64}
            columnHeaderHeight={theme.appLayout.table.headerRowHeight}
            disableColumnMenu
            disableRowSelectionOnClick
            localeText={ruRU.components.MuiDataGrid.defaultProps.localeText}
            paginationMode="server"
            rowCount={total}
            paginationModel={{ page, pageSize: PAGE_SIZE }}
            onPaginationModelChange={(m) => setFilters((f) => ({ ...f, page: m.page }))}
            pageSizeOptions={[PAGE_SIZE]}
            onRowClick={({ row }) => setDetailEntry(row)}
            getRowClassName={({ row }) =>
              row.priority === "urgent" && WAITLIST_ACTIVE_STATUSES.includes(row.status) ? "row-urgent" : ""
            }
            slots={{ noRowsOverlay: NoRowsOverlay }}
            sx={(th) => ({
              flex: 1,
              minHeight: 360,
              bgcolor: "background.paper",
              borderRadius: "14px",
              "& .MuiDataGrid-row": { cursor: "pointer" },
              "& .MuiDataGrid-columnHeaders": { bgcolor: "background.paper" },
              // Центрируем контент ячеек флексом: голая Typography иначе
              // прилипает к верху строки.
              "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" },
              "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within": { outline: "none" },
              // Срочная запись — полоса слева тенью внутрь: не сдвигает содержимое.
              "& .row-urgent": { boxShadow: `inset 3px 0 0 ${th.palette.error.main}` },
            })}
          />
        )}
      </Box>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        slotProps={{ paper: { sx: { borderRadius: "12px", minWidth: 200 } } }}
      >
        {menuEntry && (
          <MenuItem
            onClick={() => {
              setDetailEntry(menuEntry);
              setMenuAnchor(null);
            }}
          >
            {t("detail.title")}
          </MenuItem>
        )}
        {menuEntry && WAITLIST_ACTIVE_STATUSES.includes(menuEntry.status) && (
          <MenuItem
            onClick={() => {
              openContactDialog(menuEntry);
              setMenuAnchor(null);
            }}
          >
            {t("actions.contact")}
          </MenuItem>
        )}
        {menuEntry && canCreate && (
          <MenuItem
            onClick={() => {
              openEdit(menuEntry);
              setMenuAnchor(null);
            }}
          >
            {t("actions.edit")}
          </MenuItem>
        )}
        {menuEntry && WAITLIST_ACTIVE_STATUSES.includes(menuEntry.status) && (
          <MenuItem
            sx={{ color: "error.main" }}
            onClick={() => {
              setCancelTarget(menuEntry);
              setMenuAnchor(null);
            }}
          >
            {t("actions.cancel")}
          </MenuItem>
        )}
        {menuEntry && canManage && WAITLIST_CLOSED_STATUSES.includes(menuEntry.status) && (
          <MenuItem
            onClick={() => {
              reopenMutation.mutate(menuEntry);
              setMenuAnchor(null);
            }}
          >
            {t("actions.reopen")}
          </MenuItem>
        )}
      </Menu>

      <WaitlistDetailDrawer
        entry={detailRow}
        organizationId={orgId}
        canCreate={canCreate}
        canManage={canManage}
        onClose={() => setDetailEntry(null)}
        onContact={openContactDialog}
        onBook={handleBook}
        onEdit={openEdit}
        onCancel={setCancelTarget}
        onReopen={(entry) => reopenMutation.mutate(entry)}
      />

      <Dialog open={cancelTarget != null} onClose={() => setCancelTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>{t("actions.cancelTitle")}</DialogTitle>
        <DialogContent>
          {cancelTarget && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {displayName(cancelTarget)} · {formatPhoneDisplay(cancelTarget.phone)}
            </Typography>
          )}
          <TextField
            autoFocus
            fullWidth
            size="small"
            label={t("actions.cancelReason")}
            placeholder={t("actions.cancelReasonPlaceholder")}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            sx={{ mt: 0.5 }}
          />
        </DialogContent>
        <DialogActions>
          <AppButton color="inherit" onClick={() => setCancelTarget(null)}>
            Отмена
          </AppButton>
          <AppButton
            variant="contained"
            color="error"
            disabled={cancelMutation.isPending}
            onClick={() => cancelTarget && cancelMutation.mutate(cancelTarget)}
          >
            {t("actions.cancelConfirm")}
          </AppButton>
        </DialogActions>
      </Dialog>

      <Dialog open={contactTarget != null} onClose={() => setContactTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>{t("actions.contactTitle")}</DialogTitle>
        <DialogContent>
          {contactTarget && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {displayName(contactTarget)} · {formatPhoneDisplay(contactTarget.phone)}
            </Typography>
          )}
          <Stack direction="row" gap={1} flexWrap="wrap">
            {(Object.keys(WAITLIST_CONTACT_RESULT_META) as WaitlistContactResult[]).map((result) => {
              const meta = WAITLIST_CONTACT_RESULT_META[result];
              const selected = contactResult === result;
              return (
                <Chip
                  key={result}
                  label={meta.label}
                  color={selected ? (meta.color ?? "primary") : "default"}
                  variant={selected ? "filled" : "outlined"}
                  onClick={() => setContactResult(result)}
                />
              );
            })}
          </Stack>
          <TextField
            fullWidth
            multiline
            minRows={2}
            size="small"
            label={t("actions.contactNote")}
            value={contactNote}
            onChange={(e) => setContactNote(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <AppButton color="inherit" onClick={() => setContactTarget(null)}>
            Отмена
          </AppButton>
          <AppButton
            variant="contained"
            disabled={contactResult == null || contactMutation.isPending}
            onClick={() =>
              contactTarget &&
              contactResult &&
              contactMutation.mutate({ entry: contactTarget, result: contactResult })
            }
          >
            {t("actions.contactConfirm")}
          </AppButton>
        </DialogActions>
      </Dialog>

      <WaitlistDrawer
        open={drawerOpen}
        entry={editing}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => {
          setToast(editing ? t("form.updated") : t("form.created"));
          invalidate();
        }}
      />

      <Snackbar
        open={toast != null}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        message={toast ?? ""}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
};

export default WaitlistPage;
