import React from "react";
import {
  Alert,
  Box,
  ButtonBase,
  IconButton,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useNavigate } from "react-router";

import PointOfSaleOutlined from "@mui/icons-material/PointOfSaleOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import LocalOfferOutlined from "@mui/icons-material/LocalOfferOutlined";
import ChevronLeftOutlined from "@mui/icons-material/ChevronLeftOutlined";
import ChevronRightOutlined from "@mui/icons-material/ChevronRightOutlined";
import CloseOutlined from "@mui/icons-material/CloseOutlined";
import SearchOffOutlined from "@mui/icons-material/SearchOffOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";

import { ApiError, apiRequest, getErrorMessage } from "../../api/client";
import {
  getPosBootstrap,
  getPosHistory,
  getPosHistorySummary,
  POS_HISTORY_PAGE_SIZE,
  type PosHistoryFilters,
  type PosHistorySummary,
  type PosSavedReceipt,
} from "../../api/pos";
import {
  AppButton,
  DateRangeField,
  ListEmptyState,
  PageHeader,
  ReasonDialog,
  SegmentedTabs,
  TonedChip,
  type DateRange,
} from "../../components/ui";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { usePageTitle } from "../../hooks/usePageTitle";
import { usePermissions } from "../../hooks/usePermissions";
import { subtleBg, subtleBorder } from "../../theme/uiHelpers";
import { formatQuantity } from "../../utility/format";
import {
  ALL_TIME_PRESET,
  clientLabel,
  historyPreset,
  HISTORY_PERIOD_PRESETS,
  linesSummary,
  paymentsSummary,
  receiptDateLabel,
  receiptNumber,
  receiptStatusMeta,
  receiptInRange,
  receiptMatches,
  summarizeReceipts,
  unitsCount,
} from "./historyMeta";
import { ReceiptDetailDrawer } from "./ReceiptDetailDrawer";
import { ReceiptPrintForm } from "./ReceiptPrintForm";
import { PosAmount } from "./ui";

// ── Фильтры ─────────────────────────────────────────────────────────────────────

type StatusTab = "" | "completed" | "held" | "returned" | "draft";

const STATUS_TABS: Array<{ key: StatusTab; label: string; count: (summary: PosHistorySummary) => number }> = [
  { key: "", label: "Все", count: (summary) => summary.count },
  { key: "completed", label: "Завершённые", count: (summary) => summary.completed },
  { key: "held", label: "Отложенные", count: (summary) => summary.held },
  { key: "returned", label: "Возвраты", count: (summary) => summary.returned },
  { key: "draft", label: "Отменённые", count: (summary) => summary.cancelled },
];

const DEFAULT_PERIOD = "today";

/** 4xx (нет права, нет филиала, старый бэкенд без ручки) повторять бессмысленно. */
const retryServerErrorsOnly = (count: number, error: unknown) =>
  !(error instanceof ApiError && error.status < 500) && count < 2;

const presetRange = (key: string): DateRange => {
  const [from, to] = historyPreset(key).range();
  return { from: from.startOf("day"), to: to.endOf("day") };
};

/** Доля скидок от суммы до скидок: «≈ 5% от суммы продаж». */
const discountHint = (totals: PosHistorySummary) => {
  const discount = Number(totals.discountTotal);
  const gross = Number(totals.revenue) + discount;
  if (!(discount > 0) || !(gross > 0)) return "скидок не было";
  const percent = (discount / gross) * 100;
  return percent < 1 ? "менее 1% от суммы продаж" : `≈ ${Math.round(percent)}% от суммы продаж`;
};

/** Подпись под числом продаж: что ещё было за период, кроме завершённых чеков. */
const salesHint = (totals: PosHistorySummary) => {
  const parts = [
    totals.held > 0 ? `отложено ${totals.held}` : null,
    totals.returned > 0 ? `возвратов ${totals.returned}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "без отложенных и возвратов";
};

// ── Плитка показателя ────────────────────────────────────────────────────────────

type StatTone = "primary" | "success" | "info" | "warning";

const toneOf = (t: Theme, tone: StatTone) => t.palette[tone];

const StatTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode | undefined;
  hint?: string;
  tone: StatTone;
}> = ({ icon, label, value, hint, tone }) => (
  <Stack
    direction="row"
    alignItems="center"
    gap={1.5}
    sx={{
      minWidth: 0,
      p: { xs: 1.25, md: 1.5 },
      borderRadius: "12px",
      border: 1,
      borderColor: "divider",
      bgcolor: "background.paper",
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
          display: { xs: "none", md: "flex" },
          alignItems: "center",
          justifyContent: "center",
          color: tone === "primary" ? "primary.onSurface" : t.palette.mode === "dark" ? p.light : p.dark,
          bgcolor: alpha(p.main, t.palette.mode === "dark" ? 0.18 : 0.1),
          "& .MuiSvgIcon-root": { fontSize: 20 },
        };
      }}
    >
      {icon}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block" noWrap sx={{ fontSize: "0.75rem" }}>
        {label}
      </Typography>
      {value === undefined ? (
        <Skeleton width={72} height={28} />
      ) : (
        <Typography
          noWrap
          sx={{
            fontSize: { xs: "1.125rem", md: "1.3rem" },
            fontWeight: 700,
            lineHeight: 1.2,
            letterSpacing: -0.3,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </Typography>
      )}
      {hint && (
        <Typography variant="caption" color="text.secondary" display="block" noWrap>
          {hint}
        </Typography>
      )}
    </Box>
  </Stack>
);

// ── Строки списка ────────────────────────────────────────────────────────────────

/** Колонки таблицы: чек · дата · клиент · состав · сумма · стрелка. */
const GRID = "minmax(120px, 1fr) minmax(110px, .9fr) minmax(130px, 1fr) minmax(160px, 1.6fr) minmax(120px, .9fr) 24px";
/** Уже этого таблица не сжимается — дальше горизонтальная прокрутка, а не каша (сумма минимумов колонок, зазоров и отступов). */
const GRID_MIN_WIDTH = 760;

const headerCellSx = {
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.2,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: "text.secondary",
} as const;

const ReceiptRow: React.FC<{ receipt: PosSavedReceipt; selected: boolean; onClick: () => void }> = ({
  receipt,
  selected,
  onClick,
}) => {
  const status = receiptStatusMeta(receipt.status);
  return (
    <Box
      component={ButtonBase}
      focusRipple
      onClick={onClick}
      sx={(t) => ({
        display: "grid",
        gridTemplateColumns: GRID,
        gap: 1.5,
        alignItems: "center",
        // ButtonBase центрирует содержимое: сетка шире контейнера уехала бы влево.
        justifyContent: "start",
        width: "100%",
        textAlign: "left",
        px: 2,
        py: 1.25,
        borderTop: `1px solid ${subtleBorder(t)}`,
        bgcolor: selected ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.14 : 0.07) : "transparent",
        transition: "background-color .15s ease",
        "&:hover": { bgcolor: selected ? alpha(t.palette.primary.main, 0.16) : subtleBg(t, true) },
      })}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }} noWrap>
          №{receiptNumber(receipt)}
        </Typography>
        <Box sx={{ mt: 0.5 }}>
          <TonedChip label={status.label} toneName={status.tone} />
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary" noWrap>
        {receiptDateLabel(receipt.createdAt)}
      </Typography>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap color={receipt.clientId == null ? "text.secondary" : "text.primary"}>
          {clientLabel(receipt)}
        </Typography>
        {receipt.sellerName && (
          <Typography variant="caption" color="text.secondary" noWrap display="block">
            Продавец: {receipt.sellerName}
          </Typography>
        )}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap>
          {linesSummary(receipt.lines)}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap display="block">
          {receipt.lines.length} поз. · {formatQuantity(unitsCount(receipt.lines))} шт.
        </Typography>
      </Box>
      <Box sx={{ minWidth: 0, textAlign: "right" }}>
        <Typography variant="body2" fontWeight={800} noWrap sx={{ fontVariantNumeric: "tabular-nums" }}>
          <PosAmount value={Number(receipt.totalAmount)} />
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap display="block">
          {paymentsSummary(receipt.payments)}
        </Typography>
      </Box>
      <ChevronRightOutlined sx={{ fontSize: 20, color: "text.disabled" }} />
    </Box>
  );
};

const ReceiptCard: React.FC<{ receipt: PosSavedReceipt; selected: boolean; onClick: () => void }> = ({
  receipt,
  selected,
  onClick,
}) => {
  const status = receiptStatusMeta(receipt.status);
  return (
    <Box
      component={ButtonBase}
      focusRipple
      onClick={onClick}
      sx={(t) => ({
        display: "block",
        width: "100%",
        textAlign: "left",
        p: 1.5,
        borderRadius: "14px",
        border: 1,
        borderColor: selected ? alpha(t.palette.primary.main, 0.55) : "divider",
        bgcolor: selected ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.12 : 0.06) : "background.paper",
        transition: "transform .12s ease, border-color .15s ease, background-color .15s ease",
        "&:active": { transform: "scale(.99)" },
        "&:hover": { borderColor: alpha(t.palette.primary.main, 0.35) },
      })}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
            <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
              №{receiptNumber(receipt)}
            </Typography>
            <TonedChip label={status.label} toneName={status.tone} />
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
            {receiptDateLabel(receipt.createdAt)} · {clientLabel(receipt)}
          </Typography>
        </Box>
        <Typography fontWeight={800} sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
          <PosAmount value={Number(receipt.totalAmount)} />
        </Typography>
      </Stack>
      <Typography variant="body2" noWrap sx={{ mt: 1 }}>
        {linesSummary(receipt.lines)}
      </Typography>
      <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary" noWrap>
          {paymentsSummary(receipt.payments)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          {receipt.lines.length} поз. · {formatQuantity(unitsCount(receipt.lines))} шт.
        </Typography>
      </Stack>
    </Box>
  );
};

// ── Страница ─────────────────────────────────────────────────────────────────────

/**
 * История продаж магазина: показатели за период, фильтры по статусу, периоду
 * и поиску (всё — на сервере, по всем чекам, а не по загруженной странице),
 * список чеков и карточка чека с печатью и возвратом.
 *
 * Десктоп — таблица, телефон — карточки; карточка чека на десктопе живёт в
 * правом дровере, на телефоне открывается во весь экран.
 */
export default function PosSalesHistoryPage() {
  usePageTitle("История продаж");
  const theme = useTheme();
  // Телефон: кнопка кассы иконкой. До lg (планшет, узкое окно с открытым
  // сайдбаром) — карточки в две колонки: таблице там тесно, а листать её
  // вбок неудобнее, чем читать карточки.
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const compact = useMediaQuery(theme.breakpoints.down("lg"));
  const navigate = useNavigate();
  const auth = usePermissions();
  const cache = useQueryClient();

  // Тот же скоуп и префикс ключей, что у кассы: продажа на кассе
  // инвалидирует и историю.
  const scope = {
    organizationId: auth.activeOrganization?.id ?? 0,
    branchId: auth.activeBranch?.id ?? 0,
  };
  const ready = Boolean(scope.organizationId && scope.branchId && auth.hasModule("pos"));
  const canHistory = auth.canAccess("pos.history");
  const prefix = ["pos-workspace", scope.organizationId, scope.branchId];

  const [status, setStatus] = React.useState<StatusTab>("");
  const [periodKey, setPeriodKey] = React.useState<string | null>(DEFAULT_PERIOD);
  const [range, setRange] = React.useState<DateRange>(() => presetRange(DEFAULT_PERIOD));
  const [searchInput, setSearchInput] = React.useState("");
  const search = useDebouncedValue(searchInput.trim());
  const [offset, setOffset] = React.useState(0);
  const [selected, setSelected] = React.useState<PosSavedReceipt | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [returnTarget, setReturnTarget] = React.useState<PosSavedReceipt | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const allTime = periodKey === ALL_TIME_PRESET;
  const periodFilters: Pick<PosHistoryFilters, "dateFrom" | "dateTo" | "search"> = {
    dateFrom: allTime ? undefined : range.from.format("YYYY-MM-DD"),
    dateTo: allTime ? undefined : range.to.format("YYYY-MM-DD"),
    search: search || undefined,
  };
  const listFilters: PosHistoryFilters = { ...periodFilters, status: status || undefined, offset };

  // Поиск дебаунсится, поэтому страницу сбрасываем по факту смены запроса.
  React.useEffect(() => setOffset(0), [search]);

  const bootstrap = useQuery({
    queryKey: [...prefix, "bootstrap"],
    queryFn: ({ signal }) => getPosBootstrap(scope, signal),
    enabled: ready,
    staleTime: 60_000,
  });
  const list = useQuery({
    queryKey: [...prefix, "history", listFilters],
    queryFn: ({ signal }) => getPosHistory(scope, listFilters, signal),
    enabled: ready && canHistory,
    placeholderData: keepPreviousData,
    retry: retryServerErrorsOnly,
  });
  // Сводка без статуса: бейджи вкладок и показатели — за период целиком.
  const summary = useQuery({
    queryKey: [...prefix, "history-summary", periodFilters],
    queryFn: ({ signal }) => getPosHistorySummary(scope, periodFilters, signal),
    enabled: ready && canHistory,
    placeholderData: keepPreviousData,
    retry: retryServerErrorsOnly,
  });

  // Бэкенд без `history/summary/` (и без серверных dateFrom/dateTo/search) —
  // фронт выкатился раньше сервера. Тогда фильтруем и считаем загруженную
  // страницу сами, как делала прежняя версия страницы.
  const legacyBackend = summary.isError && summary.error instanceof ApiError && summary.error.status === 404;
  const pageRows = React.useMemo(() => list.data ?? [], [list.data]);
  const rows = React.useMemo(
    () =>
      legacyBackend
        ? pageRows.filter((receipt) => receiptInRange(receipt, allTime ? null : range) && receiptMatches(receipt, search))
        : pageRows,
    [legacyBackend, pageRows, allTime, range, search],
  );
  const totals = legacyBackend ? summarizeReceipts(rows) : summary.data;
  // Пока сводка грузится — скелетон; если упала — «—», а не вечный скелетон.
  const statFallback = summary.isError ? "—" : undefined;

  // Открытый чек обновляем из свежей страницы (после возврата меняется статус),
  // а если он ушёл с текущей вкладки — оставляем последнюю известную версию.
  React.useEffect(() => {
    if (!selected) return;
    const fresh = rows.find((row) => row.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [rows, selected]);

  const actions = bootstrap.data?.actions ?? {};
  const canPrint = Boolean(actions.print) && auth.canAccess("pos.print");
  const canReturn = Boolean(actions.return) && auth.canAccess("pos.return");

  const orgHeaders = { "X-Organization-Id": String(scope.organizationId) };
  const returnMutation = useMutation({
    mutationFn: async ({ receipt, reason }: { receipt: PosSavedReceipt; reason: string }) => {
      await apiRequest(`/v2/pos/receipts/${receipt.id}/return/`, {
        method: "POST",
        headers: orgHeaders,
        body: { reason, lines: [] },
      });
      // Ручка возврата отдаёт документ возврата, а карточке нужен сам чек —
      // с новым статусом и записью в журнале. Если перечитать не удалось,
      // хотя бы статус в открытой карточке не должен остаться «Завершён».
      try {
        return await apiRequest<PosSavedReceipt>(`/v2/pos/receipts/${receipt.id}/`, { headers: orgHeaders });
      } catch {
        return { ...receipt, status: "returned" };
      }
    },
    onSuccess: (fresh) => {
      setReturnTarget(null);
      setActionError(null);
      setSelected((current) => (current?.id === fresh.id ? fresh : current));
      void cache.invalidateQueries({ queryKey: prefix });
    },
    onError: (error) => setActionError(getErrorMessage(error, "Не удалось оформить возврат.")),
  });

  const openReceipt = (receipt: PosSavedReceipt) => {
    setSelected(receipt);
    setDrawerOpen(true);
  };
  const applyStatus = (next: StatusTab) => {
    setStatus(next);
    setOffset(0);
  };
  const applyPeriod = (next: DateRange, presetKey: string | null) => {
    setRange(next);
    setPeriodKey(presetKey);
    setOffset(0);
  };
  const resetFilters = () => {
    setSearchInput("");
    applyStatus("");
    applyPeriod(presetRange(DEFAULT_PERIOD), DEFAULT_PERIOD);
  };
  const printReceipt = (receipt: PosSavedReceipt) => {
    setSelected(receipt);
    // Печатная форма рендерится из `selected`; даём React дорисовать её.
    window.setTimeout(() => window.print(), 50);
  };

  const hasFilters = status !== "" || periodKey !== DEFAULT_PERIOD || search !== "";
  // Со старым бэкендом итог по вкладке неизвестен: сводка — только по странице.
  const tabTotal = totals && !legacyBackend ? STATUS_TABS.find((tab) => tab.key === status)?.count(totals) : undefined;
  const pageStart = offset + 1;
  const pageEnd = offset + (legacyBackend ? pageRows.length : rows.length);
  const hasNext = tabTotal != null ? offset + POS_HISTORY_PAGE_SIZE < tabTotal : pageRows.length >= POS_HISTORY_PAGE_SIZE;
  const averageCheck = totals && totals.completed > 0 ? Number(totals.revenue) / totals.completed : 0;
  const loading = list.isLoading || (!ready && auth.loading);

  const tabs = STATUS_TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    badge: totals && !legacyBackend ? tab.count(totals) : undefined,
  }));

  const emptyState = (() => {
    if (search) {
      return (
        <ListEmptyState
          icon={<SearchOffOutlined />}
          title="Ничего не найдено"
          description="Поиск идёт по началу номера чека, названию товара, имени и телефону клиента."
          action={<AppButton size="small" onClick={resetFilters}>Сбросить фильтры</AppButton>}
        />
      );
    }
    if (status !== "" || periodKey !== ALL_TIME_PRESET) {
      const period = periodKey === DEFAULT_PERIOD ? "Сегодня" : "За выбранный период";
      const what = status === "" ? "продаж ещё не было" : `таких чеков нет`;
      return (
        <ListEmptyState
          icon={<ReceiptLongOutlined />}
          title={`${period} ${what}`}
          description="Проведённые на кассе чеки появляются здесь сразу."
          action={
            <Stack direction="row" gap={1} flexWrap="wrap" justifyContent="center">
              {periodKey !== ALL_TIME_PRESET && (
                <AppButton size="small" variant="outlined" onClick={() => applyPeriod(presetRange("7d"), "7d")}>
                  Показать за 7 дней
                </AppButton>
              )}
              {hasFilters && (
                <AppButton size="small" onClick={resetFilters}>
                  Сбросить фильтры
                </AppButton>
              )}
            </Stack>
          }
        />
      );
    }
    return (
      <ListEmptyState
        icon={<ReceiptLongOutlined />}
        title="Продаж пока нет"
        description="Проведите первый чек на кассе — он появится здесь автоматически."
        action={
          <AppButton size="small" variant="contained" startIcon={<PointOfSaleOutlined />} onClick={() => navigate("/pos")}>
            Открыть кассу
          </AppButton>
        }
      />
    );
  })();

  const pagination = (pageRows.length > 0 || offset > 0) && (
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mt: 1.5 }}>
      <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
        {pageEnd >= pageStart ? `${pageStart}–${pageEnd}` : "0"}
        {tabTotal != null ? ` из ${tabTotal}` : ""}
      </Typography>
      <Stack direction="row" gap={0.5}>
        <AppButton
          size="small"
          variant="outlined"
          startIcon={<ChevronLeftOutlined />}
          disabled={offset === 0 || list.isFetching}
          onClick={() => setOffset(Math.max(0, offset - POS_HISTORY_PAGE_SIZE))}
        >
          Назад
        </AppButton>
        <AppButton
          size="small"
          variant="outlined"
          endIcon={<ChevronRightOutlined />}
          disabled={!hasNext || list.isFetching}
          onClick={() => setOffset(offset + POS_HISTORY_PAGE_SIZE)}
        >
          Далее
        </AppButton>
      </Stack>
    </Stack>
  );

  return (
    <Box sx={{ height: "100%", overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column" }}>
      <Box sx={{ pt: 2, width: "100%", maxWidth: 1440, mx: "auto" }}>
        <PageHeader
          title="История продаж"
          showTitle={false}
          showSearch
          searchVal={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Номер чека, товар или клиент"
          loading={list.isFetching}
          actions={
            <>
              <Tooltip title="Обновить">
                <span>
                  <IconButton
                    onClick={() => {
                      void list.refetch();
                      void summary.refetch();
                    }}
                    disabled={!ready || list.isFetching}
                    sx={{ border: 1, borderColor: "divider", borderRadius: "10px" }}
                    aria-label="Обновить"
                  >
                    <RefreshOutlined fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              {isMobile ? (
                <Tooltip title="Открыть кассу">
                  <IconButton onClick={() => navigate("/pos")} color="primary" sx={{ border: 1, borderColor: "divider", borderRadius: "10px" }} aria-label="Открыть кассу">
                    <PointOfSaleOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : (
                <AppButton variant="contained" startIcon={<PointOfSaleOutlined />} onClick={() => navigate("/pos")} sx={{ whiteSpace: "nowrap" }}>
                  Открыть кассу
                </AppButton>
              )}
            </>
          }
        />

        <Box sx={{ px: theme.appLayout.page.paddingX, pb: 3 }}>
          {!auth.loading && (!canHistory || !ready) ? (
            <Box sx={{ borderRadius: "14px", border: 1, borderColor: "divider", bgcolor: "background.paper" }}>
              {!canHistory ? (
                <ListEmptyState
                  icon={<LockOutlined />}
                  title="Нет доступа к истории покупок"
                  description="Право «История покупок» выдаёт администратор в настройках роли."
                />
              ) : (
                // История, как и касса, живёт в конкретном филиале: «все филиалы» бэк не примет.
                <ListEmptyState
                  icon={<ReceiptLongOutlined />}
                  title="Выберите филиал"
                  description="История продаж ведётся по каждому магазину отдельно — выберите филиал в меню слева."
                />
              )}
            </Box>
          ) : (
            <>
              {legacyBackend && (
                <Alert severity="info" sx={{ mb: 1.5 }}>
                  Сервер ещё не обновлён: показатели, период и поиск считаются по загруженной странице
                  ({POS_HISTORY_PAGE_SIZE} чеков). После обновления сервера — по всем чекам.
                </Alert>
              )}

              {/* ── Показатели за период ── */}
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" },
                  gap: { xs: 1, sm: 1.25 },
                }}
              >
                <StatTile
                  icon={<PaymentsOutlined />}
                  label="Выручка"
                  tone="primary"
                  value={totals ? <PosAmount value={Number(totals.revenue)} /> : statFallback}
                  hint={legacyBackend ? "по чекам на этой странице" : "по завершённым чекам"}
                />
                <StatTile
                  icon={<ReceiptLongOutlined />}
                  label="Продаж"
                  tone="success"
                  value={totals ? totals.completed : statFallback}
                  hint={totals ? salesHint(totals) : undefined}
                />
                <StatTile
                  icon={<TrendingUpOutlined />}
                  label="Средний чек"
                  tone="info"
                  value={totals ? <PosAmount value={Math.round(averageCheck)} /> : statFallback}
                />
                <StatTile
                  icon={<LocalOfferOutlined />}
                  label="Скидки"
                  tone="warning"
                  value={totals ? <PosAmount value={Number(totals.discountTotal)} /> : statFallback}
                  hint={totals ? discountHint(totals) : undefined}
                />
              </Box>

              {/* ── Одна строка управления: статус + период ── */}
              <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center" sx={{ mt: 2, mb: 1.5 }}>
                <SegmentedTabs layoutId="pos-history-status" tabs={tabs} value={status} onChange={applyStatus} />
                <DateRangeField
                  dense
                  value={range}
                  presets={HISTORY_PERIOD_PRESETS}
                  onChange={applyPeriod}
                  referenceDate={allTime ? dayjs() : undefined}
                  minWidth={168}
                />
                {hasFilters && (
                  <AppButton
                    size="small"
                    onClick={resetFilters}
                    startIcon={<CloseOutlined fontSize="small" />}
                    sx={{ height: 30, minHeight: 30 }}
                  >
                    Сбросить
                  </AppButton>
                )}
              </Stack>

              {actionError && (
                <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setActionError(null)}>
                  {actionError}
                </Alert>
              )}

              {list.isError ? (
                <Alert
                  severity="error"
                  action={
                    <AppButton
                      size="small"
                      color="inherit"
                      onClick={() => {
                        void list.refetch();
                        void summary.refetch();
                      }}
                    >
                      Повторить
                    </AppButton>
                  }
                >
                  {getErrorMessage(list.error, "Не удалось загрузить историю продаж.")}
                </Alert>
              ) : loading ? (
                <Stack spacing={1}>
                  {[0, 1, 2, 3, 4].map((index) => (
                    <Skeleton key={index} variant="rounded" height={compact ? 112 : 64} sx={{ borderRadius: "14px" }} />
                  ))}
                </Stack>
              ) : rows.length === 0 ? (
                <Box sx={{ borderRadius: "14px", border: 1, borderColor: "divider", bgcolor: "background.paper" }}>
                  {emptyState}
                </Box>
              ) : compact ? (
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
                    gap: 1,
                    opacity: list.isFetching ? 0.6 : 1,
                    transition: "opacity .15s ease",
                  }}
                >
                  {rows.map((receipt) => (
                    <ReceiptCard
                      key={receipt.id}
                      receipt={receipt}
                      selected={drawerOpen && selected?.id === receipt.id}
                      onClick={() => openReceipt(receipt)}
                    />
                  ))}
                </Box>
              ) : (
                <Box
                  sx={{
                    borderRadius: "14px",
                    border: 1,
                    borderColor: "divider",
                    bgcolor: "background.paper",
                    overflowX: "auto",
                    opacity: list.isFetching ? 0.6 : 1,
                    transition: "opacity .15s ease",
                  }}
                >
                  <Box sx={{ minWidth: GRID_MIN_WIDTH }}>
                    <Box sx={{ display: "grid", gridTemplateColumns: GRID, gap: 1.5, px: 2, py: 1.25 }}>
                      <Typography sx={headerCellSx}>Чек</Typography>
                      <Typography sx={headerCellSx}>Дата</Typography>
                      <Typography sx={headerCellSx}>Клиент</Typography>
                      <Typography sx={headerCellSx}>Состав</Typography>
                      <Typography sx={{ ...headerCellSx, textAlign: "right" }}>Сумма</Typography>
                      <Box />
                    </Box>
                    {rows.map((receipt) => (
                      <ReceiptRow
                        key={receipt.id}
                        receipt={receipt}
                        selected={drawerOpen && selected?.id === receipt.id}
                        onClick={() => openReceipt(receipt)}
                      />
                    ))}
                  </Box>
                </Box>
              )}

              {!list.isError && !loading && pagination}
            </>
          )}
        </Box>
      </Box>

      <ReceiptDetailDrawer
        receipt={selected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        cashlessMethods={bootstrap.data?.cashlessMethods}
        canPrint={canPrint}
        canReturn={canReturn}
        onPrint={printReceipt}
        onReturn={(receipt) => {
          setActionError(null);
          setReturnTarget(receipt);
        }}
      />

      <ReasonDialog
        open={returnTarget != null}
        title={`Возврат по чеку №${returnTarget ? receiptNumber(returnTarget) : ""}`}
        description="Будет создан документ возврата на все товары чека, восстановлен остаток и зафиксирован возврат денег теми же способами оплаты. Операцию по карте проведите также в терминале."
        label="Причина возврата"
        confirmText="Подтвердить возврат"
        loading={returnMutation.isPending}
        onCancel={() => setReturnTarget(null)}
        onConfirm={(reason) => {
          if (returnTarget) returnMutation.mutate({ receipt: returnTarget, reason });
        }}
      />

      <ReceiptPrintForm receipt={selected} organization={auth.activeOrganization?.name} branch={auth.activeBranch?.name} />
    </Box>
  );
}
