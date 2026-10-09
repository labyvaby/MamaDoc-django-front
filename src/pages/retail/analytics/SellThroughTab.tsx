import React from "react";
import {
  Alert,
  Box,
  LinearProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import ShoppingBagOutlined from "@mui/icons-material/ShoppingBagOutlined";
import Inventory2Outlined from "@mui/icons-material/Inventory2Outlined";
import UndoOutlined from "@mui/icons-material/UndoOutlined";
import TrendingUpOutlined from "@mui/icons-material/TrendingUpOutlined";
import SearchOffOutlined from "@mui/icons-material/SearchOffOutlined";

import { getErrorMessage } from "../../../api/client";
import { getSellThrough, type RetailCollection } from "../../../api/retailAnalytics";
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
import { ALL_TIME_PRESET, HISTORY_PERIOD_PRESETS } from "../../pos/historyMeta";
import {
  filterSellThrough,
  formatPercent,
  formatQty,
  num,
  plural,
  presetRange,
  seasonLabel,
  sellThroughTotals,
  type SellThroughSort,
} from "../retailAnalyticsModel";
import { SeasonSelect } from "./filters";
import { ALL_SEASONS, seasonParam } from "../retailAnalyticsModel";
import { retailKeys } from "./keys";

const PAGE = 50;

const SORTS: Array<{ key: SellThroughSort; label: string }> = [
  { key: "sellThrough", label: "По sell-through" },
  { key: "sold", label: "По продажам" },
  { key: "stock", label: "По остатку" },
  { key: "name", label: "По названию" },
];

export const PercentBar: React.FC<{ value: number | null }> = ({ value }) => {
  if (value === null) {
    return (
      <Typography variant="body2" color="text.disabled">
        —
      </Typography>
    );
  }
  const color = value >= 70 ? "success" : value >= 30 ? "primary" : "warning";
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 120 }}>
      <LinearProgress
        variant="determinate"
        value={Math.min(Math.max(value, 0), 100)}
        color={color}
        sx={{ flex: 1, height: 6, borderRadius: 3 }}
      />
      <Typography variant="body2" sx={{ minWidth: 52, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {formatPercent(value, 0)}
      </Typography>
    </Stack>
  );
};

export const SellThroughTab: React.FC<{
  enabled: boolean;
  organizationId: number | undefined;
  collections: RetailCollection[];
}> = ({ enabled, organizationId, collections }) => {
  const [season, setSeason] = React.useState(ALL_SEASONS);
  const [periodKey, setPeriodKey] = React.useState<string | null>(ALL_TIME_PRESET);
  const [range, setRange] = React.useState<DateRange>(() => presetRange(ALL_TIME_PRESET));
  const [searchInput, setSearchInput] = React.useState("");
  const search = useDebouncedValue(searchInput);
  const [sort, setSort] = React.useState<SellThroughSort>("sellThrough");
  const [limit, setLimit] = React.useState(PAGE);

  const allTime = periodKey === ALL_TIME_PRESET;
  const filters = {
    season: seasonParam(season),
    dateFrom: allTime ? undefined : range.from.format("YYYY-MM-DD"),
    dateTo: allTime ? undefined : range.to.format("YYYY-MM-DD"),
  };
  const query = useQuery({
    queryKey: retailKeys.sellThrough(organizationId, filters),
    queryFn: ({ signal }) => getSellThrough(filters, signal),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const rows = React.useMemo(() => query.data ?? [], [query.data]);
  const totals = React.useMemo(() => sellThroughTotals(rows), [rows]);
  const visible = React.useMemo(() => filterSellThrough(rows, search, sort), [rows, search, sort]);
  React.useEffect(() => setLimit(PAGE), [search, sort, season, periodKey]);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <SeasonSelect collections={collections} value={season} onChange={setSeason} />
        <DateRangeField
          dense
          value={range}
          presets={HISTORY_PERIOD_PRESETS}
          onChange={(next, key) => {
            setRange(next);
            setPeriodKey(key);
          }}
          referenceDate={allTime ? dayjs() : undefined}
          minWidth={180}
        />
        <TextField
          size="small"
          label="Поиск модели"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          sx={{ minWidth: 220, flex: 1, maxWidth: 360 }}
        />
        <TextField select size="small" label="Порядок" value={sort} onChange={(e) => setSort(e.target.value as SellThroughSort)}>
          {SORTS.map((option) => (
            <MenuItem key={option.key} value={option.key}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(4, 1fr)" } }}>
        <InfoTile icon={<ShoppingBagOutlined />} label="Продано, шт" value={formatQty(totals.sold - totals.returned)} />
        <InfoTile icon={<UndoOutlined />} label="Возвраты, шт" value={formatQty(totals.returned)} />
        <InfoTile icon={<Inventory2Outlined />} label="Остаток, шт" value={formatQty(totals.stock)} />
        <InfoTile icon={<TrendingUpOutlined />} label={`Sell-through · ${totals.models} ${plural(totals.models, "модель", "модели", "моделей")}`} value={formatPercent(totals.sellThrough)} />
      </Box>
      <Typography variant="caption" color="text.secondary">
        Sell-through — сколько из прошедшего через полку уже продано: продано ÷ (продано + остаток). Остаток — на сегодня,
        продажи — за выбранный период.
      </Typography>

      {query.isError && <Alert severity="error">{getErrorMessage(query.error)}</Alert>}
      <AppCard variant="outlined" elevation={0} disableContentPadding>
        {query.isLoading ? (
          <ListLoadingSkeleton rows={8} />
        ) : visible.length === 0 ? (
          <ListEmptyState
            icon={<SearchOffOutlined />}
            title={rows.length ? "Ничего не найдено" : "Нет моделей с коллекцией"}
            description={rows.length ? "Измените поиск или сезон." : "Отчёт строится по моделям, у которых задана коллекция."}
          />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Модель</TableCell>
                  <TableCell>Коллекция</TableCell>
                  <TableCell align="right">Продано</TableCell>
                  <TableCell align="right">Возвраты</TableCell>
                  <TableCell align="right">Остаток</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Сколько пришло партиями в CRM. У товара, перенесённого из 1С, здесь только ввод остатков.">
                      <span>Поступило</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={{ minWidth: 160 }}>Sell-through</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.slice(0, limit).map((row) => (
                  <TableRow key={row.modelId} hover>
                    <TableCell sx={{ maxWidth: 360 }}>
                      <Typography variant="body2" noWrap title={row.modelName}>
                        {row.modelName}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap>
                        {seasonLabel(row.season) === row.collectionName
                          ? row.collectionName
                          : `${row.collectionName} · ${seasonLabel(row.season)}`}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{formatQty(num(row.sold))}</TableCell>
                    <TableCell align="right">{num(row.returned) ? formatQty(num(row.returned)) : "—"}</TableCell>
                    <TableCell align="right">{formatQty(num(row.stock))}</TableCell>
                    <TableCell align="right" sx={{ color: "text.secondary" }}>
                      {formatQty(num(row.received))}
                    </TableCell>
                    <TableCell>
                      <PercentBar value={row.sellThrough === null ? null : num(row.sellThrough)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {visible.length > limit && (
          <Box sx={{ p: 1.5, textAlign: "center", borderTop: 1, borderColor: "divider" }}>
            <AppButton size="small" variant="text" onClick={() => setLimit((n) => n + PAGE)}>
              Показать ещё ({visible.length - limit})
            </AppButton>
          </Box>
        )}
      </AppCard>
    </Stack>
  );
};
