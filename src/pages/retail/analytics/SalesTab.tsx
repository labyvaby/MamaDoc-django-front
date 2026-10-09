import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  ButtonBase,
  Collapse,
  IconButton,
  InputAdornment,
  MenuItem,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import ShoppingBagOutlined from "@mui/icons-material/ShoppingBagOutlined";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import LocalOfferOutlined from "@mui/icons-material/LocalOfferOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import KeyboardReturnOutlined from "@mui/icons-material/KeyboardReturnOutlined";
import FunctionsOutlined from "@mui/icons-material/FunctionsOutlined";
import SearchOutlined from "@mui/icons-material/SearchOutlined";
import SearchOffOutlined from "@mui/icons-material/SearchOffOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import KeyboardArrowDownOutlined from "@mui/icons-material/KeyboardArrowDownOutlined";
import OpenInNewOutlined from "@mui/icons-material/OpenInNewOutlined";

import { getErrorMessage } from "../../../api/client";
import {
  getSalesReport,
  type RetailCollection,
  type SalesFilters,
  type SalesMoney,
  type SalesPaymentFilter,
  type SalesRow,
  type SalesVariant,
} from "../../../api/retailAnalytics";
import {
  AppButton,
  AppCard,
  DateRangeField,
  InfoTile,
  ListEmptyState,
  ListLoadingSkeleton,
  type DateRange,
} from "../../../components/ui";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { usePermissions } from "../../../hooks/usePermissions";
import { subtleBg } from "../../../theme/uiHelpers";
import { formatKGS } from "../../../utility/format";
import { HISTORY_PERIOD_PRESETS } from "../../pos/historyMeta";
import {
  ALL_SEASONS,
  NO_SEASON,
  formatPercent,
  formatQty,
  num,
  plural,
  presetRange,
  seasonLabel,
  seasonOptions,
} from "../retailAnalyticsModel";
import { exportSalesXlsx } from "./exportSalesXlsx";
import { retailKeys } from "./keys";
import { SalesItemDrawer, type SalesItemTarget } from "./SalesItemDrawer";
import {
  SALES_NO_SEASON,
  SALES_SORTS,
  discountPercent,
  hasOtherMoney,
  sortSalesRows,
  variantLabel,
  type SalesSort,
} from "./salesModel";

const PAGE = 50;
const ALL = "";

const PAYMENTS: Array<{ key: SalesPaymentFilter | typeof ALL; label: string }> =
  [
    { key: ALL, label: "Любая оплата" },
    { key: "cash", label: "Наличные" },
    { key: "card", label: "Карта и безнал" },
    { key: "other", label: "Бонусы, сертификат, долг" },
  ];

const money = (value: string) => formatKGS(num(value));
const tabular = {
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
} as const;

/**
 * «Продажи» — отчёт о розничных продажах, как в 1С: количество, выручка со
 * скидкой и без, наличные и карта, средний чек, возвраты. Модели раскрываются
 * до размеров, «Детальнее» открывает чеки, возвраты и дни позиции.
 */
export const SalesTab: React.FC<{
  enabled: boolean;
  organizationId: number | undefined;
  collections: RetailCollection[];
}> = ({ enabled, organizationId, collections }) => {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down("md"));
  const { hasPermission } = usePermissions();
  const canOpenReceipts = hasPermission(["pos.view", "pos.sell"]);

  const [range, setRange] = React.useState<DateRange>(() =>
    presetRange("month")
  );
  const [searchInput, setSearchInput] = React.useState("");
  const search = useDebouncedValue(searchInput.trim());
  const [sellerId, setSellerId] = React.useState<number | "">("");
  const [categoryId, setCategoryId] = React.useState<number | null>(null);
  const [season, setSeason] = React.useState(ALL_SEASONS);
  const [payment, setPayment] = React.useState<SalesPaymentFilter | typeof ALL>(
    ALL
  );
  const [sort, setSort] = React.useState<SalesSort>("revenue");
  const [limit, setLimit] = React.useState(PAGE);
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(
    new Set()
  );
  const [target, setTarget] = React.useState<SalesItemTarget | null>(null);
  const [exporting, setExporting] = React.useState(false);

  const filters: SalesFilters = {
    dateFrom: range.from.format("YYYY-MM-DD"),
    dateTo: range.to.format("YYYY-MM-DD"),
    sellerId: sellerId === "" ? undefined : sellerId,
    categoryId: categoryId ?? undefined,
    season:
      season === ALL_SEASONS
        ? undefined
        : season === NO_SEASON
        ? SALES_NO_SEASON
        : season,
    search: search || undefined,
    payment: payment || undefined,
  };
  const report = useQuery({
    queryKey: retailKeys.sales(organizationId, filters),
    queryFn: ({ signal }) => getSalesReport(filters, signal),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  React.useEffect(
    () => setLimit(PAGE),
    [
      filters.dateFrom,
      filters.dateTo,
      sellerId,
      categoryId,
      season,
      payment,
      search,
      sort,
    ]
  );

  const data = report.data;
  const rows = React.useMemo(
    () => sortSalesRows(data?.rows ?? [], sort),
    [data, sort]
  );
  const total = data?.total;
  const withOther = total ? hasOtherMoney(total) : false;
  const seasons = React.useMemo(
    () => seasonOptions(collections),
    [collections]
  );
  const category =
    data?.categories.find((option) => option.id === categoryId) ?? null;

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const rowKey = (row: SalesRow) =>
    row.modelId != null ? `m${row.modelId}` : `p${row.productId}`;
  const openRow = (row: SalesRow) =>
    setTarget({
      title: row.name,
      subtitle:
        [row.category, row.season].filter(Boolean).join(" · ") || undefined,
      modelId: row.modelId ?? undefined,
      productId: row.modelId == null ? row.productId ?? undefined : undefined,
      money: row.money,
    });
  const openVariant = (row: SalesRow, variant: SalesVariant) =>
    setTarget({
      title: row.name,
      subtitle: variantLabel(variant),
      productId: variant.productId,
      money: variant.money,
    });

  const filtersLabel = [
    sellerId !== "" &&
      `Продавец: ${data?.sellers.find((s) => s.id === sellerId)?.name ?? ""}`,
    category && `Категория: ${category.name}`,
    season !== ALL_SEASONS && `Сезон: ${seasonLabel(season)}`,
    payment && `Оплата: ${PAYMENTS.find((p) => p.key === payment)?.label}`,
    search && `Поиск: «${search}»`,
  ]
    .filter(Boolean)
    .join(" · ");

  const exportXlsx = async () => {
    if (!data) return;
    setExporting(true);
    try {
      await exportSalesXlsx(data, rows, filtersLabel);
    } finally {
      setExporting(false);
    }
  };

  const gross = total ? num(total.gross) : 0;
  const discountShare = total ? discountPercent(total) : null;
  const tiles = total
    ? [
        {
          icon: <ShoppingBagOutlined />,
          label: `Продано · ${total.receipts} ${plural(
            total.receipts,
            "чек",
            "чека",
            "чеков"
          )}`,
          value: `${formatQty(num(total.quantity))} шт`,
        },
        {
          icon: <PaymentsOutlined />,
          label: `Выручка · без скидки ${formatKGS(gross)}`,
          value: money(total.revenue),
        },
        {
          icon: <LocalOfferOutlined />,
          label:
            discountShare === null
              ? "Скидки"
              : `Скидки · ${formatPercent(discountShare)}`,
          value: money(total.discount),
        },
        {
          icon: <ReceiptLongOutlined />,
          label: "Средний чек",
          value: data?.averageReceipt ? money(data.averageReceipt) : "—",
        },
        {
          icon: <AccountBalanceWalletOutlined />,
          label: "Наличными",
          value: money(total.cash),
        },
        {
          icon: <CreditCardOutlined />,
          label: withOther
            ? `Картой · прочее ${money(total.other)}`
            : "Картой и безналом",
          value: money(total.card),
        },
        {
          icon: <KeyboardReturnOutlined />,
          label: `Возвраты · ${formatQty(num(total.returnedQuantity))} шт, ${
            total.returns
          } ${plural(total.returns, "документ", "документа", "документов")}`,
          value: num(total.returnedAmount)
            ? `−${money(total.returnedAmount)}`
            : "—",
        },
        {
          icon: <FunctionsOutlined />,
          label: "Итого за вычетом возвратов",
          value: money(total.netRevenue),
        },
      ]
    : [];

  return (
    <Stack spacing={2}>
      {/* ── Фильтры: период и поиск, под ними — разрезы ── */}
      <Stack spacing={1}>
        <Box
          sx={{
            display: "grid",
            gap: 1,
            gridTemplateColumns: {
              xs: "minmax(0, 1fr) auto",
              md: "minmax(0, 1fr) minmax(0, 1.4fr) auto",
            },
            alignItems: "center",
          }}
        >
          <DateRangeField
            dense
            value={range}
            presets={HISTORY_PERIOD_PRESETS}
            onChange={(next) => setRange(next)}
            minWidth={0}
          />
          <TextField
            size="small"
            placeholder="Название или артикул"
            sx={{
              gridColumn: { xs: "1 / -1", md: "auto" },
              gridRow: { xs: 2, md: "auto" },
            }}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <AppButton
            variant="outlined"
            startIcon={<FileDownloadOutlined />}
            onClick={() => void exportXlsx()}
            disabled={!data || exporting}
            sx={{ whiteSpace: "nowrap", height: 40, justifySelf: "end" }}
          >
            {exporting ? "Готовлю…" : "В Excel"}
          </AppButton>
        </Box>
        <Box
          sx={{
            display: "grid",
            gap: 1,
            gridTemplateColumns: {
              xs: "repeat(2, minmax(0, 1fr))",
              lg: "repeat(4, minmax(0, 1fr))",
            },
            "& .MuiInputBase-input": { textOverflow: "ellipsis" },
          }}
        >
          <Autocomplete
            size="small"
            options={data?.categories ?? []}
            value={category}
            onChange={(_event, next) => setCategoryId(next ? next.id : null)}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            renderInput={(params) => (
              <TextField {...params} placeholder="Все категории" />
            )}
            noOptionsText="Нет категорий"
          />
          <TextField
            select
            size="small"
            value={season}
            onChange={(event) => setSeason(event.target.value)}
          >
            <MenuItem value={ALL_SEASONS}>Все сезоны</MenuItem>
            {seasons.map((value) => (
              <MenuItem key={value || "none"} value={value}>
                {seasonLabel(value)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            value={sellerId}
            onChange={(event) =>
              setSellerId(
                event.target.value === "" ? "" : Number(event.target.value)
              )
            }
            SelectProps={{ displayEmpty: true }}
          >
            <MenuItem value="">Все продавцы</MenuItem>
            {(data?.sellers ?? []).map((seller) => (
              <MenuItem key={seller.id} value={seller.id}>
                {seller.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            value={payment}
            onChange={(event) =>
              setPayment(event.target.value as SalesPaymentFilter | typeof ALL)
            }
            SelectProps={{ displayEmpty: true }}
          >
            {PAYMENTS.map((option) => (
              <MenuItem key={option.key || "all"} value={option.key}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      </Stack>

      {report.isError && (
        <Alert severity="error">{getErrorMessage(report.error)}</Alert>
      )}

      {/* ── Итоги ── */}
      {isPhone ? (
        <PhoneSummary
          total={total}
          averageReceipt={data?.averageReceipt ?? null}
          withOther={withOther}
          dim={report.isFetching && !!data}
        />
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: {
              xs: "repeat(2, minmax(0, 1fr))",
              lg: "repeat(4, minmax(0, 1fr))",
            },
            opacity: report.isFetching && data ? 0.6 : 1,
            transition: "opacity .2s",
          }}
        >
          {total
            ? tiles.map((tile) => (
                <InfoTile
                  key={tile.label}
                  icon={tile.icon}
                  label={tile.label}
                  value={tile.value}
                />
              ))
            : Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} variant="rounded" height={64} />
              ))}
        </Box>
      )}
      <Typography variant="caption" color="text.secondary">
        Наличные и карта по позициям — доля оплат чека пропорционально сумме
        позиции. Возвраты — в периоде, когда их оформили.
      </Typography>

      {/* ── Позиции ── */}
      <AppCard
        variant="outlined"
        elevation={0}
        disableContentPadding
        title={data ? `Позиции · ${rows.length}` : "Позиции"}
        headerActions={
          isPhone ? (
            <TextField
              select
              size="small"
              value={sort}
              onChange={(event) => setSort(event.target.value as SalesSort)}
            >
              {SALES_SORTS.map((option) => (
                <MenuItem key={option.key} value={option.key}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          ) : undefined
        }
      >
        {report.isLoading ? (
          <ListLoadingSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <ListEmptyState
            icon={<SearchOffOutlined />}
            title={filtersLabel ? "Ничего не найдено" : "Продаж за период нет"}
            description={
              filtersLabel
                ? "Измените фильтры или период."
                : "Выберите другой период."
            }
          />
        ) : isPhone ? (
          <Stack sx={{ p: 1.5 }} spacing={1}>
            {rows.slice(0, limit).map((row) => (
              <PhoneRow
                key={rowKey(row)}
                row={row}
                withOther={withOther}
                expanded={expanded.has(rowKey(row))}
                onToggle={() => toggle(rowKey(row))}
                onOpen={() => openRow(row)}
                onOpenVariant={(variant) => openVariant(row, variant)}
              />
            ))}
          </Stack>
        ) : (
          <TableContainer>
            <Table size="small" sx={{ "& td, & th": { px: 1.25 } }}>
              <TableHead>
                <TableRow>
                  <SortHeader
                    label="Позиция"
                    sortKey="name"
                    sort={sort}
                    onSort={setSort}
                    align="left"
                  />
                  <SortHeader
                    label="Шт"
                    sortKey="quantity"
                    sort={sort}
                    onSort={setSort}
                  />
                  <TableCell align="right">Без скидки</TableCell>
                  <SortHeader
                    label="Скидка"
                    sortKey="discount"
                    sort={sort}
                    onSort={setSort}
                  />
                  <SortHeader
                    label="Выручка"
                    sortKey="revenue"
                    sort={sort}
                    onSort={setSort}
                  />
                  <TableCell align="right">Наличные</TableCell>
                  <TableCell align="right">Карта</TableCell>
                  {withOther && <TableCell align="right">Прочее</TableCell>}
                  <TableCell align="right">Чеков</TableCell>
                  <SortHeader
                    label="Возвраты"
                    sortKey="returned"
                    sort={sort}
                    onSort={setSort}
                  />
                  <TableCell padding="checkbox" />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.slice(0, limit).map((row) => {
                  const key = rowKey(row);
                  const open = expanded.has(key);
                  const expandable = row.variants.length > 0;
                  return (
                    <React.Fragment key={key}>
                      <TableRow
                        hover
                        onClick={() =>
                          expandable ? toggle(key) : openRow(row)
                        }
                        sx={{
                          cursor: "pointer",
                          "& > td": { borderBottom: open ? 0 : undefined },
                        }}
                      >
                        <TableCell sx={{ maxWidth: 360 }}>
                          <Stack direction="row" alignItems="center" gap={0.75}>
                            <KeyboardArrowDownOutlined
                              fontSize="small"
                              sx={{
                                color: "text.secondary",
                                visibility: expandable ? "visible" : "hidden",
                                transform: open ? "rotate(180deg)" : "none",
                                transition: "transform .2s",
                                flexShrink: 0,
                              }}
                            />
                            <Box sx={{ minWidth: 0 }}>
                              <Typography
                                variant="body2"
                                fontWeight={600}
                                noWrap
                                title={row.name}
                              >
                                {row.name}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                noWrap
                                display="block"
                              >
                                {[
                                  row.sku,
                                  row.category,
                                  row.season,
                                  expandable &&
                                    `${row.variants.length} ${plural(
                                      row.variants.length,
                                      "вариант",
                                      "варианта",
                                      "вариантов"
                                    )}`,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || " "}
                              </Typography>
                            </Box>
                          </Stack>
                        </TableCell>
                        <MoneyCells
                          money={row.money}
                          withOther={withOther}
                          strong
                        />
                        <TableCell padding="checkbox">
                          <Tooltip title="Детальнее: чеки, возвраты, дни">
                            <IconButton
                              size="small"
                              onClick={(event) => {
                                event.stopPropagation();
                                openRow(row);
                              }}
                            >
                              <OpenInNewOutlined fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                      {open &&
                        row.variants.map((variant) => (
                          <TableRow
                            key={variant.productId}
                            hover
                            onClick={() => openVariant(row, variant)}
                            sx={{ cursor: "pointer", bgcolor: subtleBg(theme) }}
                          >
                            <TableCell sx={{ pl: "44px !important" }}>
                              <Typography variant="body2" noWrap>
                                {variantLabel(variant)}
                              </Typography>
                              {variant.sku && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  noWrap
                                  display="block"
                                >
                                  {variant.sku}
                                </Typography>
                              )}
                            </TableCell>
                            <MoneyCells
                              money={variant.money}
                              withOther={withOther}
                            />
                            <TableCell padding="checkbox" />
                          </TableRow>
                        ))}
                    </React.Fragment>
                  );
                })}
              </TableBody>
              {total && (
                <TableFooter>
                  <TableRow
                    sx={{
                      "& td": {
                        borderTop: 2,
                        borderColor: "divider",
                        color: "text.primary",
                      },
                    }}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>
                        Итого
                      </Typography>
                    </TableCell>
                    <MoneyCells money={total} withOther={withOther} strong />
                    <TableCell padding="checkbox" />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </TableContainer>
        )}
        {rows.length > limit && (
          <Box
            sx={{
              p: 1.5,
              textAlign: "center",
              borderTop: 1,
              borderColor: "divider",
            }}
          >
            <AppButton
              size="small"
              variant="text"
              onClick={() => setLimit((n) => n + PAGE)}
            >
              Показать ещё ({rows.length - limit})
            </AppButton>
          </Box>
        )}
      </AppCard>

      <SalesItemDrawer
        target={target}
        filters={filters}
        organizationId={organizationId}
        canOpenReceipts={canOpenReceipts}
        onClose={() => setTarget(null)}
      />
    </Stack>
  );
};

const SortHeader: React.FC<{
  label: string;
  sortKey: SalesSort;
  sort: SalesSort;
  onSort: (sort: SalesSort) => void;
  align?: "left" | "right";
}> = ({ label, sortKey, sort, onSort, align = "right" }) => (
  <TableCell
    align={align}
    sortDirection={
      sort === sortKey ? (sortKey === "name" ? "asc" : "desc") : false
    }
  >
    <TableSortLabel
      active={sort === sortKey}
      direction={sortKey === "name" ? "asc" : "desc"}
      onClick={() => onSort(sortKey)}
    >
      {label}
    </TableSortLabel>
  </TableCell>
);

const MoneyCells: React.FC<{
  money: SalesMoney;
  withOther: boolean;
  strong?: boolean;
}> = ({ money: m, withOther, strong }) => {
  const discount = num(m.discount);
  const returned = num(m.returnedAmount);
  return (
    <>
      <TableCell align="right" sx={tabular}>
        {formatQty(num(m.quantity))}
      </TableCell>
      <TableCell align="right" sx={{ ...tabular, color: "text.secondary" }}>
        {money(m.gross)}
      </TableCell>
      <TableCell
        align="right"
        sx={{ ...tabular, color: discount ? "warning.main" : "text.disabled" }}
      >
        {discount ? money(m.discount) : "—"}
      </TableCell>
      <TableCell
        align="right"
        sx={{ ...tabular, fontWeight: strong ? 700 : 500 }}
      >
        {money(m.revenue)}
      </TableCell>
      <TableCell align="right" sx={tabular}>
        {money(m.cash)}
      </TableCell>
      <TableCell align="right" sx={tabular}>
        {money(m.card)}
      </TableCell>
      {withOther && (
        <TableCell align="right" sx={tabular}>
          {money(m.other)}
        </TableCell>
      )}
      <TableCell align="right" sx={tabular}>
        {m.receipts}
      </TableCell>
      <TableCell
        align="right"
        sx={{ ...tabular, color: returned ? "error.main" : "text.disabled" }}
      >
        {returned
          ? `${formatQty(num(m.returnedQuantity))} шт · −${money(
              m.returnedAmount
            )}`
          : "—"}
      </TableCell>
    </>
  );
};

/** Карточка позиции на телефоне: таблица в 10 колонок там не читается. */
const PhoneRow: React.FC<{
  row: SalesRow;
  withOther: boolean;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onOpenVariant: (variant: SalesVariant) => void;
}> = ({ row, withOther, expanded, onToggle, onOpen, onOpenVariant }) => {
  const theme = useTheme();
  const m = row.money;
  const returned = num(m.returnedAmount);
  const discount = num(m.discount);
  const facts = [
    `${formatQty(num(m.quantity))} шт`,
    `${m.receipts} ${plural(m.receipts, "чек", "чека", "чеков")}`,
    discount ? `скидка ${money(m.discount)}` : null,
  ].filter(Boolean);
  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: "14px",
        overflow: "hidden",
      }}
    >
      <ButtonBase
        onClick={onOpen}
        sx={{ display: "block", width: "100%", textAlign: "left", p: 1.5 }}
      >
        <Stack direction="row" gap={1.5} alignItems="flex-start">
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              fontWeight={600}
              sx={{ lineHeight: 1.3 }}
            >
              {row.name}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
              noWrap
            >
              {[row.category, row.season].filter(Boolean).join(" · ") ||
                facts.join(" · ")}
            </Typography>
          </Box>
          <Box sx={{ textAlign: "right", flexShrink: 0 }}>
            <Typography variant="body2" fontWeight={700} sx={tabular}>
              {money(m.revenue)}
            </Typography>
            {returned > 0 && (
              <Typography variant="caption" color="error.main" sx={tabular}>
                −{money(m.returnedAmount)}
              </Typography>
            )}
          </Box>
        </Stack>
        <Box
          sx={{
            mt: 1,
            display: "grid",
            gridTemplateColumns: withOther
              ? "repeat(3, minmax(0, 1fr))"
              : "repeat(2, minmax(0, 1fr))",
            gap: 0.75,
          }}
        >
          <MiniStat label="Наличные" value={money(m.cash)} />
          <MiniStat label="Карта" value={money(m.card)} />
          {withOther && <MiniStat label="Прочее" value={money(m.other)} />}
        </Box>
        {row.category || row.season ? (
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mt: 0.75 }}
          >
            {facts.join(" · ")}
          </Typography>
        ) : null}
      </ButtonBase>
      {row.variants.length > 0 && (
        <>
          <ButtonBase
            onClick={onToggle}
            sx={{
              width: "100%",
              justifyContent: "space-between",
              px: 1.5,
              py: 1,
              borderTop: 1,
              borderColor: "divider",
              color: "text.secondary",
              typography: "caption",
              fontWeight: 600,
            }}
          >
            {expanded
              ? "Скрыть размеры"
              : `Размеры и цвета · ${row.variants.length}`}
            <KeyboardArrowDownOutlined
              fontSize="small"
              sx={{
                transform: expanded ? "rotate(180deg)" : "none",
                transition: "transform .2s",
              }}
            />
          </ButtonBase>
          <Collapse in={expanded} unmountOnExit>
            <Box sx={{ bgcolor: subtleBg(theme) }}>
              {row.variants.map((variant) => (
                <ButtonBase
                  key={variant.productId}
                  onClick={() => onOpenVariant(variant)}
                  sx={{
                    display: "flex",
                    width: "100%",
                    justifyContent: "space-between",
                    gap: 1,
                    px: 1.5,
                    py: 1,
                    borderTop: 1,
                    borderColor: alpha(theme.palette.divider, 0.6),
                    textAlign: "left",
                  }}
                >
                  <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
                    {variantLabel(variant)}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ ...tabular, color: "text.secondary" }}
                  >
                    {formatQty(num(variant.money.quantity))} шт ·{" "}
                    <Box
                      component="span"
                      sx={{ color: "text.primary", fontWeight: 600 }}
                    >
                      {money(variant.money.revenue)}
                    </Box>
                  </Typography>
                </ButtonBase>
              ))}
            </Box>
          </Collapse>
        </>
      )}
    </Box>
  );
};

const MiniStat: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        px: 1,
        py: 0.75,
        borderRadius: "10px",
        bgcolor: subtleBg(theme),
        minWidth: 0,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        display="block"
        noWrap
      >
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600} noWrap sx={tabular}>
        {value}
      </Typography>
    </Box>
  );
};

/** Сводка на телефоне: плитки с иконками в две колонки обрезают суммы. */
const PhoneSummary: React.FC<{
  total: SalesMoney | undefined;
  averageReceipt: string | null;
  withOther: boolean;
  dim: boolean;
}> = ({ total, averageReceipt, withOther, dim }) => {
  const theme = useTheme();
  if (!total) return <Skeleton variant="rounded" height={260} />;
  const share = discountPercent(total);
  const returned = num(total.returnedAmount);
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: "16px",
        border: 1,
        borderColor: "divider",
        background: `linear-gradient(160deg, ${alpha(
          theme.palette.primary.main,
          0.14
        )}, ${alpha(theme.palette.primary.main, 0.02)} 60%)`,
        opacity: dim ? 0.6 : 1,
        transition: "opacity .2s",
      }}
    >
      <Typography variant="caption" color="text.secondary">
        Выручка · {total.receipts}{" "}
        {plural(total.receipts, "чек", "чека", "чеков")},{" "}
        {formatQty(num(total.quantity))} шт
      </Typography>
      <Typography
        sx={{
          fontSize: "1.9rem",
          fontWeight: 800,
          letterSpacing: -0.6,
          lineHeight: 1.15,
          ...tabular,
        }}
      >
        {money(total.revenue)}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block">
        без скидки {money(total.gross)}
        {returned ? ` · за вычетом возвратов ${money(total.netRevenue)}` : ""}
      </Typography>
      <Box
        sx={{
          mt: 1.5,
          display: "grid",
          gap: 0.75,
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        }}
      >
        <MiniStat label="Наличными" value={money(total.cash)} />
        <MiniStat label="Картой и безналом" value={money(total.card)} />
        <MiniStat
          label={share === null ? "Скидки" : `Скидки · ${formatPercent(share)}`}
          value={money(total.discount)}
        />
        <MiniStat
          label="Средний чек"
          value={averageReceipt ? money(averageReceipt) : "—"}
        />
        <MiniStat
          label={`Возвраты · ${formatQty(num(total.returnedQuantity))} шт`}
          value={returned ? `−${money(total.returnedAmount)}` : "—"}
        />
        {withOther ? (
          <MiniStat label="Прочее" value={money(total.other)} />
        ) : (
          <MiniStat label="Документов возврата" value={String(total.returns)} />
        )}
      </Box>
    </Box>
  );
};
