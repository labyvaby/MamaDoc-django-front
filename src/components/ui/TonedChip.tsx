import React from "react";
import { Box, Chip } from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";

import { subtleBg } from "../../theme/uiHelpers";

/** Палитра-тон MUI для статусных плашек; null — нейтральный серый. */
export type ToneName = "warning" | "info" | "success" | "error" | null;

function tone(t: Theme, name: ToneName) {
  switch (name) {
    case "warning":
      return t.palette.warning;
    case "info":
      return t.palette.info;
    case "success":
      return t.palette.success;
    case "error":
      return t.palette.error;
    default:
      return null;
  }
}

export interface TonedChipProps {
  label: string;
  toneName: ToneName;
}

/**
 * Тонированный чип с точкой-индикатором — единый стиль статусов проекта
 * (образец — чипы задач). Цвета только из токенов темы: плашка обязана
 * читаться и в светлой, и в тёмной.
 */
export const TonedChip: React.FC<TonedChipProps> = ({ label, toneName }) => (
  <Chip
    size="small"
    label={label}
    icon={
      <Box
        component="span"
        sx={(t) => {
          const p = tone(t, toneName);
          return {
            width: 7,
            height: 7,
            borderRadius: "50%",
            bgcolor: p ? p.main : t.palette.grey[500],
            ml: 0.75,
          };
        }}
      />
    }
    sx={(t) => {
      const p = tone(t, toneName);
      return {
        fontWeight: 500,
        height: 24,
        borderRadius: "7px",
        "& .MuiChip-icon": { ml: 0.75, mr: -0.25 },
        color: p ? (t.palette.mode === "dark" ? p.light : p.dark) : "text.secondary",
        bgcolor: p ? alpha(p.main, t.palette.mode === "dark" ? 0.2 : 0.14) : subtleBg(t, true),
      };
    }}
  />
);

export default TonedChip;
