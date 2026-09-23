/**
 * Пастельно-тонированная карточка-метрика — по образцу референс-дизайна
 * (shadcnuikit.com/dashboard/hotel): мягкий тонированный фон, круглый
 * бейдж под иконку, крупное число, подпись. Общая для HotelOccupancyBanner
 * и HotelReportsPage — раньше каждая страница рисовала свой локальный
 * StatCard/CardShell без тонирования.
 *
 * `tint` — семантический цвет ТЕМЫ (не произвольный хекс), поэтому карточка
 * остаётся читаемой в обеих темах через alpha(palette.X.main, ...) и меняется
 * вместе с акцентом вертикали.
 */
import React from "react";
import { Box, Paper, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

export type HotelStatCardTint = "success" | "info" | "warning" | "error" | "primary";

export interface HotelStatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  /** Цвет тонировки — по умолчанию нейтральный "primary". */
  tint?: HotelStatCardTint;
  hint?: string;
}

export const HotelStatCard: React.FC<HotelStatCardProps> = ({ label, value, icon, tint = "primary", hint }) => {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  const color = theme.palette[tint].main;

  return (
    <Paper
      elevation={0}
      variant="outlined"
      sx={{
        p: 1.75,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        bgcolor: alpha(color, dark ? 0.16 : 0.1),
        borderColor: alpha(color, dark ? 0.32 : 0.18),
      }}
    >
      {icon && (
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            bgcolor: dark ? theme.palette.background.paper : theme.palette.common.white,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
      )}
      <Typography variant="h6" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Paper>
  );
};

export default HotelStatCard;
