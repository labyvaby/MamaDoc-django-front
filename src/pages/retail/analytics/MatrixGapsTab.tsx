import React from "react";
import { Alert, Box, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useQuery } from "@tanstack/react-query";
import GridViewOutlined from "@mui/icons-material/GridViewOutlined";

import { getErrorMessage } from "../../../api/client";
import { getMatrixGaps, type RetailCollection } from "../../../api/retailAnalytics";
import { AppCard, ListEmptyState, ListLoadingSkeleton } from "../../../components/ui";
import { matrixGrid, type MatrixCellState } from "../retailAnalyticsModel";
import { ModelPicker, SeasonSelect } from "./filters";
import { ALL_SEASONS } from "../retailAnalyticsModel";
import { retailKeys } from "./keys";

const CELL: Record<MatrixCellState, { label: string; tone: "success" | "error" | null }> = {
  ok: { label: "есть", tone: "success" },
  empty: { label: "0", tone: "error" },
  missing: { label: "—", tone: null },
};

const Legend: React.FC = () => (
  <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
    {(
      [
        ["ok", "в наличии"],
        ["empty", "кончился — дозаказать"],
        ["missing", "такой клетки нет в каталоге"],
      ] as Array<[MatrixCellState, string]>
    ).map(([state, text]) => (
      <Stack key={state} direction="row" spacing={0.75} alignItems="center">
        <Cell state={state} small />
        <Typography variant="caption" color="text.secondary">
          {text}
        </Typography>
      </Stack>
    ))}
  </Stack>
);

const Cell: React.FC<{ state: MatrixCellState; small?: boolean }> = ({ state, small }) => {
  const meta = CELL[state];
  return (
    <Box
      sx={(t) => ({
        width: small ? 22 : "100%",
        minWidth: small ? 22 : 44,
        height: small ? 18 : 30,
        borderRadius: "6px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: small ? 10 : 12,
        fontWeight: 600,
        color: meta.tone ? t.palette[meta.tone].main : t.palette.text.disabled,
        bgcolor: meta.tone ? alpha(t.palette[meta.tone].main, 0.12) : "transparent",
        border: meta.tone ? "none" : `1px dashed ${t.palette.divider}`,
      })}
    >
      {small ? "" : meta.label}
    </Box>
  );
};

/** Дыры в матрице одной модели: каких цвет × размер нет совсем, а какие кончились. */
export const MatrixGapsTab: React.FC<{
  enabled: boolean;
  organizationId: number | undefined;
  collections: RetailCollection[];
  collectionsLoading: boolean;
}> = ({ enabled, organizationId, collections, collectionsLoading }) => {
  const [season, setSeason] = React.useState(ALL_SEASONS);
  const [modelId, setModelId] = React.useState<number | null>(null);
  // Сетка имеет смысл только у модели с несколькими клетками.
  const pickable = React.useMemo(
    () => collections.filter((c) => c.skuTotal > 1 && (season === ALL_SEASONS || c.season === season)),
    [collections, season],
  );

  const query = useQuery({
    queryKey: retailKeys.matrix(organizationId, modelId),
    queryFn: ({ signal }) => getMatrixGaps(modelId as number, signal),
    enabled: enabled && modelId !== null,
    staleTime: 30_000,
  });
  const gaps = query.data;
  const grid = React.useMemo(() => (gaps ? matrixGrid(gaps) : []), [gaps]);

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
        <ModelPicker collections={pickable} value={modelId} onChange={setModelId} loading={collectionsLoading} />
      </Stack>
      <Legend />

      {query.isError && <Alert severity="error">{getErrorMessage(query.error)}</Alert>}
      <AppCard variant="outlined" elevation={0} disableContentPadding>
        {modelId === null ? (
          <ListEmptyState
            icon={<GridViewOutlined />}
            title="Выберите модель"
            description={`Сетка цвет × размер: что есть, что кончилось и каких клеток нет. Моделей с сеткой: ${pickable.length}.`}
          />
        ) : query.isLoading || !gaps ? (
          <ListLoadingSkeleton rows={4} />
        ) : gaps.colors.length === 0 || gaps.sizes.length === 0 ? (
          <ListEmptyState icon={<GridViewOutlined />} title="У модели нет сетки цвет × размер" />
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Цвет \ размер</TableCell>
                    {gaps.sizes.map((size) => (
                      <TableCell key={size} align="center">
                        {size}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {gaps.colors.map((color, i) => (
                    <TableRow key={color}>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{color}</TableCell>
                      {grid[i].map((state, j) => (
                        <TableCell key={gaps.sizes[j]} align="center" sx={{ px: 0.5 }}>
                          <Cell state={state} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 2, py: 1.5 }}>
              Кончилось: {gaps.empty.length}. Нет в каталоге: {gaps.missing.length}.
            </Typography>
          </>
        )}
      </AppCard>
    </Stack>
  );
};
