import React from "react";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import { subtleBg } from "../../theme/uiHelpers";
import { formatKGS } from "../../utility/format";

/** Строка рейтинга сводки: сотрудники, услуги. */
export interface RankRowData {
  id: number;
  name: string;
  /** Длина полосы и сортировка. */
  weight: number;
  /** Основная колонка. */
  main: string;
  mainTitle: string;
  /** Вторая колонка, приглушённая. */
  side: string;
  sideTitle: string;
}

/** Одна строка рейтинга: место, имя с полосой от лидера, две колонки. */
export const RankRow: React.FC<{ row: RankRowData; index: number; best: number }> = ({
  row,
  index,
  best,
}) => (
  <Stack
    direction="row"
    alignItems="center"
    spacing={1.25}
    sx={(t) => ({
      px: 1,
      py: 0.75,
      borderRadius: "8px",
      "&:hover": { bgcolor: subtleBg(t) },
    })}
  >
    <Typography
      sx={{
        width: 16,
        flexShrink: 0,
        fontSize: "0.75rem",
        fontWeight: 700,
        color: "text.disabled",
        textAlign: "center",
      }}
    >
      {index + 1}
    </Typography>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }} noWrap>
        {row.name}
      </Typography>
      <Box
        sx={(t) => ({
          mt: 0.5,
          height: 4,
          borderRadius: "4px",
          bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.14 : 0.08),
          overflow: "hidden",
        })}
      >
        <Box
          sx={(t) => ({
            width: `${best > 0 ? Math.round((row.weight / best) * 100) : 0}%`,
            height: "100%",
            borderRadius: "4px",
            bgcolor: alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.75 : 0.55),
            transition: "width .3s ease",
          })}
        />
      </Box>
    </Box>
    <Tooltip title={row.sideTitle} arrow>
      <Typography
        variant="caption"
        sx={{
          width: 44,
          textAlign: "right",
          color: "text.secondary",
          fontVariantNumeric: "tabular-nums",
        }}
        noWrap
      >
        {row.side}
      </Typography>
    </Tooltip>
    <Tooltip title={row.mainTitle} arrow>
      <Typography
        sx={{
          width: 100,
          textAlign: "right",
          fontWeight: 700,
          fontSize: "0.875rem",
          fontVariantNumeric: "tabular-nums",
        }}
        noWrap
      >
        {row.main}
      </Typography>
    </Tooltip>
  </Stack>
);


/**
 * «Прочие» под топом: сколько выручки пришлось на всё, что в топ не попало.
 * Считается от знаменателя бэка (`topServicesTotal` / `topByRevenueTotal`);
 * пока его нет в ответе, строка не рисуется.
 */
export const RankOthers: React.FC<{ amount: number; share: number; label: string }> = ({
  amount,
  share,
  label,
}) =>
  amount > 0 ? (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.25}
      sx={{ px: 1, pt: 0.75, fontSize: "0.75rem", color: "text.secondary" }}
    >
      <Box sx={{ width: 16 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>{label}</Box>
      <Box sx={{ width: 44, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {Math.round(share)}%
      </Box>
      <Box sx={{ width: 100, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {formatKGS(amount)}
      </Box>
    </Stack>
  ) : null;
