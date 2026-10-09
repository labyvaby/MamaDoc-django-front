import React from "react";
import {
  Alert,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import StraightenOutlined from "@mui/icons-material/StraightenOutlined";

import { getErrorMessage } from "../../../api/client";
import { getSizeGrid, type RetailCollection } from "../../../api/retailAnalytics";
import { AppCard, ListEmptyState, ListLoadingSkeleton } from "../../../components/ui";
import { formatPercent, formatQty, sizeShares } from "../retailAnalyticsModel";
import { ModelPicker, SeasonSelect } from "./filters";
import { ALL_SEASONS, seasonParam } from "../retailAnalyticsModel";
import { retailKeys } from "./keys";
import { PercentBar } from "./SellThroughTab";

/**
 * Что вымывается первым: продажи и остаток по размерам. Порядок размеров —
 * как в сетке (по позиции), а не по алфавиту.
 */
export const SizeGridTab: React.FC<{
  enabled: boolean;
  organizationId: number | undefined;
  collections: RetailCollection[];
}> = ({ enabled, organizationId, collections }) => {
  const [season, setSeason] = React.useState(ALL_SEASONS);
  const [modelId, setModelId] = React.useState<number | null>(null);
  const filters = { season: seasonParam(season), collectionId: modelId ?? undefined };

  const query = useQuery({
    queryKey: retailKeys.sizeGrid(organizationId, filters),
    queryFn: ({ signal }) => getSizeGrid(filters, signal),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const rows = React.useMemo(() => sizeShares(query.data ?? []), [query.data]);
  const pickable = React.useMemo(
    () => (season === ALL_SEASONS ? collections : collections.filter((c) => c.season === season)),
    [collections, season],
  );

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <SeasonSelect
          collections={collections}
          value={season}
          onChange={(next) => {
            setSeason(next);
            setModelId(null);
          }}
        />
        <ModelPicker collections={pickable} value={modelId} onChange={setModelId} label="Модель (необязательно)" />
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Доля в продажах показывает, какой размер берут чаще; sell-through размера — сколько его уже ушло из прошедшего через
        полку. Размер с высоким sell-through и малым остатком — первый кандидат на дозаказ.
      </Typography>

      {query.isError && <Alert severity="error">{getErrorMessage(query.error)}</Alert>}
      <AppCard variant="outlined" elevation={0} disableContentPadding>
        {query.isLoading ? (
          <ListLoadingSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <ListEmptyState
            icon={<StraightenOutlined />}
            title="Нет размеров"
            description="В выборке нет моделей с размерной сеткой."
          />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Размер</TableCell>
                  <TableCell align="right">Продано</TableCell>
                  <TableCell align="right">Остаток</TableCell>
                  <TableCell align="right">Доля в продажах</TableCell>
                  <TableCell sx={{ minWidth: 160 }}>Sell-through</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.valueId} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {row.value}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{formatQty(row.soldQty)}</TableCell>
                    <TableCell align="right">{formatQty(row.stockQty)}</TableCell>
                    <TableCell align="right">{formatPercent(row.soldShare)}</TableCell>
                    <TableCell>
                      <PercentBar value={row.sellThrough} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </AppCard>
    </Stack>
  );
};
