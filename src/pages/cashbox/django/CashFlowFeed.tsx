import React from "react";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Pagination,
  Select,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { motion } from "framer-motion";
import ArrowUpwardOutlined from "@mui/icons-material/ArrowUpwardOutlined";
import ArrowDownwardOutlined from "@mui/icons-material/ArrowDownwardOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import dayjs from "dayjs";
import "dayjs/locale/ru";
import { useQuery, keepPreviousData } from "@tanstack/react-query";

import { AppCard, ListEmptyState } from "../../../components/ui";
import { subtleBg } from "../../../theme/uiHelpers";
import {
  getCashboxEntries,
  type CashboxEntry,
  type CashboxEntryType,
  type CashboxFilters,
  type CashboxMethod,
} from "../../../api/cashbox";
import { djangoQueryKeys } from "../../../api/queryKeys";
import { formatSom } from "./FlowCard";

const MotionBox = motion(Box);

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

type Direction = "all" | "in" | "out";

const DIR_TABS: { key: Direction; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "in", label: "Приход" },
  { key: "out", label: "Расход" },
];

const IN_TYPES: CashboxEntryType[] = ["payment", "sale"];
const OUT_TYPES: CashboxEntryType[] = ["refund", "expense", "supply"];

const TYPE_LABELS: Record<CashboxEntryType, string> = {
  payment: "Оплата приёма",
  sale: "Продажа товара",
  refund: "Возврат",
  expense: "Расход",
  supply: "Закупка товара",
};

const TYPE_CHIP_LABELS: Record<CashboxEntryType, string> = {
  payment: "Оплаты приёмов",
  sale: "Продажи товаров",
  refund: "Возвраты",
  expense: "Расходы",
  supply: "Закупки",
};

const METHOD_LABELS: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
  mixed: "Нал + карта",
  balance: "Баланс",
  insurance: "Страховка",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function isInflow(entry: CashboxEntry): boolean {
  return entry.entryType === "payment" || entry.entryType === "sale";
}

function entryTitle(e: CashboxEntry): string {
  if (e.entryType === "sale") {
    return e.productNames?.filter(Boolean).join(", ") || "Товар не указан";
  }
  if (e.patientName) return e.patientName;
  if (e.entryType === "expense") return e.categoryName ?? TYPE_LABELS.expense;
  return TYPE_LABELS[e.entryType];
}

function entrySubtitle(e: CashboxEntry): string {
  if (e.entryType === "sale") {
    const parts = [TYPE_LABELS.sale];
    if (e.patientName) parts.push(e.patientName);
    if (e.note) parts.push(e.note);
    return parts.join(" · ");
  }

  // Если заголовок — это уже название типа (нет пациента/категории),
  // не повторяем его в подзаголовке.
  const titleIsTypeLabel = entryTitle(e) === TYPE_LABELS[e.entryType];
  const parts: string[] = titleIsTypeLabel ? [] : [TYPE_LABELS[e.entryType]];
  if (e.entryType === "payment") {
    if (e.appointmentId) parts.push(`приём №${e.appointmentId}`);
    if (e.insurerName) parts.push(e.insurerName);
  } else if (e.entryType === "refund") {
    if (e.appointmentId) parts.push(`приём №${e.appointmentId}`);
    if (e.reason) parts.push(e.reason);
  } else if (e.note) {
    parts.push(e.note);
  }
  if (parts.length === 0) {
    parts.push("без описания");
  }
  return parts.join(" · ");
}

function dayLabel(dateKey: string): string {
  const d = dayjs(dateKey).locale("ru");
  const prefix = d.isSame(dayjs(), "day")
    ? "Сегодня · "
    : d.isSame(dayjs().subtract(1, "day"), "day")
      ? "Вчера · "
      : "";
  return prefix + d.format("D MMMM YYYY · dddd");
}

// ── Sub-components ────────────────────────────────────────────────────────────

const DirTabs: React.FC<{ value: Direction; onChange: (v: Direction) => void }> = ({
  value,
  onChange,
}) => (
  <Box
    role="tablist"
    aria-label="Направление потока"
    sx={{
      display: "flex",
      gap: 0.5,
      p: 0.5,
      borderRadius: "10px",
      border: 1,
      borderColor: "divider",
      bgcolor: "background.paper",
      width: "fit-content",
    }}
  >
    {DIR_TABS.map((t) => {
      const selected = t.key === value;
      return (
        <Box
          key={t.key}
          role="tab"
          aria-selected={selected}
          onClick={() => onChange(t.key)}
          sx={{
            position: "relative",
            px: 1.75,
            py: 0.6,
            borderRadius: "7px",
            cursor: "pointer",
            whiteSpace: "nowrap",
            fontSize: "0.85rem",
            fontWeight: 500,
            userSelect: "none",
            color: selected ? "primary.contrastText" : "text.secondary",
            transition: "color .2s ease",
            "&:hover": { color: selected ? "primary.contrastText" : "text.primary" },
            zIndex: 1,
          }}
        >
          {selected && (
            <MotionBox
              layoutId="cashbox-feed-dir-pill"
              transition={{ type: "spring", stiffness: 480, damping: 38 }}
              sx={{
                position: "absolute",
                inset: 0,
                borderRadius: "7px",
                bgcolor: "primary.main",
                zIndex: -1,
              }}
            />
          )}
          {t.label}
        </Box>
      );
    })}
  </Box>
);

const EntryRow: React.FC<{ entry: CashboxEntry }> = ({ entry }) => {
  const inflow = isInflow(entry);
  // Цвет кодирует способ оплаты на всей странице: наличные — зелёный,
  // безнал — синий. Направление по-прежнему видно по стрелке и знаку.
  const methodPaletteKey =
    entry.method === "cash" ? "success" : entry.method === "card" ? "primary" : "info";

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.5}
      sx={(t) => ({
        px: 2.5,
        py: 1.25,
        borderBottom: "1px solid",
        borderColor: "divider",
        transition: "background-color .15s ease",
        "&:hover": { bgcolor: subtleBg(t) },
        "&:last-child": { borderBottom: 0 },
      })}
    >
      <Typography
        variant="caption"
        color="text.disabled"
        sx={{
          width: 40,
          flexShrink: 0,
          fontVariantNumeric: "tabular-nums",
          display: { xs: "none", md: "block" },
        }}
      >
        {dayjs(entry.createdAt).format("HH:mm")}
      </Typography>

      <Box
        sx={(t) => ({
          width: 32,
          height: 32,
          borderRadius: "10px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: `${methodPaletteKey}.main`,
          bgcolor: alpha(
            t.palette[methodPaletteKey].main,
            t.palette.mode === "dark" ? 0.16 : 0.1,
          ),
          "& .MuiSvgIcon-root": { fontSize: 16 },
        })}
      >
        {inflow ? <ArrowUpwardOutlined /> : <ArrowDownwardOutlined />}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={500} noWrap>
          {entryTitle(entry)}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap display="block">
          {entrySubtitle(entry)}
        </Typography>
      </Box>

      {entry.branchName && (
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{ width: 120, flexShrink: 0, display: { xs: "none", md: "block" } }}
        >
          {entry.branchName}
        </Typography>
      )}

      <Chip
        label={METHOD_LABELS[entry.method] ?? entry.method}
        size="small"
        sx={(t) => ({
          display: { xs: "none", md: "inline-flex" },
          height: 24,
          borderRadius: "7px",
          fontWeight: 500,
          fontSize: "0.72rem",
          color: `${methodPaletteKey}.${methodPaletteKey === "primary" ? "onSurface" : "main"}`,
          bgcolor: alpha(
            t.palette[methodPaletteKey].main,
            t.palette.mode === "dark" ? 0.18 : 0.1,
          ),
        })}
      />

      <Typography
        variant="body2"
        fontWeight={600}
        sx={{
          flexShrink: 0,
          minWidth: 96,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          color: `${methodPaletteKey}.main`,
        }}
      >
        {(inflow ? "+ " : "− ") + formatSom(parseFloat(entry.amount))}
      </Typography>
    </Stack>
  );
};

const FeedSkeleton: React.FC = () => (
  <Stack>
    {Array.from({ length: 6 }).map((_, i) => (
      <Stack key={i} direction="row" alignItems="center" spacing={1.5} sx={{ px: 2.5, py: 1.25 }}>
        <Skeleton variant="rounded" width={32} height={32} sx={{ borderRadius: "10px", flexShrink: 0 }} />
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" width="45%" height={20} />
          <Skeleton variant="text" width="65%" height={16} />
        </Box>
        <Skeleton variant="text" width={90} height={20} />
      </Stack>
    ))}
  </Stack>
);

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  /** Период / филиал / организация — задаются страницей */
  baseFilters: Omit<CashboxFilters, "method">;
  enabled: boolean;
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Лента «Движение средств»: единый журнал операций кассы с фильтрами
 * направления (все / приход / расход), типа и метода оплаты, с группировкой
 * по дням и пагинацией.
 */
const CashFlowFeed: React.FC<Props> = ({ baseFilters, enabled }) => {
  const [dir, setDir] = React.useState<Direction>("all");
  const [type, setType] = React.useState<CashboxEntryType | "">("");
  const [method, setMethod] = React.useState<CashboxMethod | "">("");
  const [page, setPage] = React.useState(1);

  // Смена периода/филиала сверху — возвращаемся на первую страницу.
  const baseKey = JSON.stringify(baseFilters);
  React.useEffect(() => {
    setPage(1);
  }, [baseKey]);

  // Чипы типов подстраиваются под выбранное направление.
  const chipTypes: CashboxEntryType[] =
    dir === "in" ? IN_TYPES : dir === "out" ? OUT_TYPES : [...IN_TYPES, ...OUT_TYPES];

  const entryType: CashboxEntryType[] | "all" = type
    ? [type]
    : dir === "in"
      ? IN_TYPES
      : dir === "out"
        ? OUT_TYPES
        : "all";

  const filters = React.useMemo(
    () => ({
      ...baseFilters,
      method: method || undefined,
      entryType,
      page,
      pageSize: PAGE_SIZE,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseFilters, method, JSON.stringify(entryType), page],
  );

  const entriesQuery = useQuery({
    queryKey: djangoQueryKeys.cashbox.entries(
      Array.isArray(entryType) ? entryType.join(",") : entryType,
      { ...baseFilters, method, page },
    ),
    queryFn: ({ signal }) => getCashboxEntries(filters, signal),
    enabled,
    placeholderData: keepPreviousData,
  });

  const resetPage = () => setPage(1);

  const handleDir = (next: Direction) => {
    setDir(next);
    setType("");
    resetPage();
  };

  const data = entriesQuery.data;
  const rows = data?.results ?? [];
  const count = data?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));
  // Итоги по дням честны, только когда весь результат помещается на страницу.
  const showDayTotals = count > 0 && count <= PAGE_SIZE;

  // Группировка загруженных строк по дням.
  const groups = React.useMemo(() => {
    const map = new Map<string, CashboxEntry[]>();
    for (const e of rows) {
      const key = dayjs(e.createdAt).format("YYYY-MM-DD");
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
    return Array.from(map.entries());
  }, [rows]);

  return (
    <AppCard variant="outlined" elevation={0} disableContentPadding sx={{ minWidth: 0 }}>
      {/* Шапка ленты: заголовок + направление + метод */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        flexWrap="wrap"
        useFlexGap
        sx={{ px: 2.5, pt: 2, pb: 1.5, rowGap: 1 }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600, letterSpacing: -0.2, mr: "auto" }}>
          Движение средств
        </Typography>
        {entriesQuery.isFetching && !entriesQuery.isLoading && <CircularProgress size={14} />}
        <DirTabs value={dir} onChange={handleDir} />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Метод</InputLabel>
          <Select
            value={method}
            label="Метод"
            onChange={(e) => {
              setMethod(e.target.value as CashboxMethod | "");
              resetPage();
            }}
          >
            <MenuItem value="">Все методы</MenuItem>
            <MenuItem value="cash">Наличные</MenuItem>
            <MenuItem value="card">Карта</MenuItem>
            <MenuItem value="balance">Баланс</MenuItem>
            <MenuItem value="insurance">Страховка</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {/* Чипы типов операций */}
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ px: 2.5, pb: 1.5 }}>
        <Chip
          label="Все типы"
          size="small"
          onClick={() => {
            setType("");
            resetPage();
          }}
          sx={(t) => ({
            height: 26,
            borderRadius: "7px",
            fontWeight: 500,
            ...(type === ""
              ? {
                  color: "primary.onSurface",
                  bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.18 : 0.1),
                }
              : { color: "text.secondary", bgcolor: "transparent", border: 1, borderColor: "divider" }),
          })}
        />
        {chipTypes.map((tKey) => (
          <Chip
            key={tKey}
            label={TYPE_CHIP_LABELS[tKey]}
            size="small"
            onClick={() => {
              setType(tKey);
              resetPage();
            }}
            sx={(t) => ({
              height: 26,
              borderRadius: "7px",
              fontWeight: 500,
              ...(type === tKey
                ? {
                    color: "primary.onSurface",
                    bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.18 : 0.1),
                  }
                : { color: "text.secondary", bgcolor: "transparent", border: 1, borderColor: "divider" }),
            })}
          />
        ))}
      </Stack>

      {/* Содержимое */}
      <Box sx={{ borderTop: "1px solid", borderColor: "divider" }}>
        {entriesQuery.isLoading ? (
          <FeedSkeleton />
        ) : entriesQuery.isError ? (
          <Alert severity="error" sx={{ m: 2 }}>
            Не удалось загрузить операции. Обновите страницу или измените фильтры.
          </Alert>
        ) : rows.length === 0 ? (
          <ListEmptyState
            icon={<ReceiptLongOutlined />}
            title="Операций нет"
            description="За выбранный период с этими фильтрами движение средств не найдено."
          />
        ) : (
          groups.map(([dayKey, dayRows]) => {
            const dayNet = dayRows.reduce(
              (acc, e) => acc + parseFloat(e.amount) * (isInflow(e) ? 1 : -1),
              0,
            );
            return (
              <Box key={dayKey}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={(t) => ({
                    px: 2.5,
                    py: 0.75,
                    bgcolor: subtleBg(t),
                    borderBottom: "1px solid",
                    borderColor: "divider",
                  })}
                >
                  <Typography variant="caption" fontWeight={600} color="text.secondary">
                    {dayLabel(dayKey)}
                  </Typography>
                  {showDayTotals && (
                    <Typography
                      variant="caption"
                      fontWeight={600}
                      sx={{
                        fontVariantNumeric: "tabular-nums",
                        color: dayNet < 0 ? "error.main" : "success.main",
                      }}
                    >
                      за день: {(dayNet < 0 ? "− " : "+ ") + formatSom(Math.abs(dayNet))}
                    </Typography>
                  )}
                </Stack>
                {dayRows.map((e) => (
                  <EntryRow key={`${e.entryType}-${e.id}`} entry={e} />
                ))}
              </Box>
            );
          })
        )}
      </Box>

      {/* Подвал: счётчик + пагинация */}
      {!entriesQuery.isLoading && rows.length > 0 && (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          useFlexGap
          sx={{ px: 2.5, py: 1.5, borderTop: "1px solid", borderColor: "divider", rowGap: 1 }}
        >
          <Typography variant="caption" color="text.secondary">
            Операций: {count}
          </Typography>
          {pageCount > 1 && (
            <Pagination
              count={pageCount}
              page={page}
              onChange={(_, p) => setPage(p)}
              size="small"
              shape="rounded"
            />
          )}
        </Stack>
      )}
    </AppCard>
  );
};

export default CashFlowFeed;
