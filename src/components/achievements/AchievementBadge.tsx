import React from "react";
import { Box, alpha } from "@mui/material";

import { subtleBg } from "../../theme/uiHelpers";
import { achievementIcon, tierColors, type TierTone } from "./meta";

export interface AchievementBadgeProps {
  code: string;
  /** Тон полученного уровня; не задан — бейдж «не получен» (серый). */
  tone?: TierTone | null;
  size?: number;
}

/**
 * Круглый бейдж достижения: иконка метрики в кольце цвета уровня.
 * Не полученный — приглушённый, с пунктирной гранью (виден как цель).
 */
export const AchievementBadge: React.FC<AchievementBadgeProps> = ({
  code,
  tone,
  size = 52,
}) => {
  const Icon = achievementIcon(code);
  return (
    <Box
      sx={(t) => {
        const colors = tone ? tierColors(t, tone) : null;
        return {
          width: size,
          height: size,
          borderRadius: "50%",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: 2,
          borderStyle: colors ? "solid" : "dashed",
          borderColor: colors ? alpha(colors.main, 0.5) : "divider",
          color: colors ? colors.fg : "text.disabled",
          bgcolor: colors
            ? alpha(colors.main, t.palette.mode === "dark" ? 0.16 : 0.1)
            : subtleBg(t),
          "& .MuiSvgIcon-root": { fontSize: Math.round(size * 0.44) },
        };
      }}
    >
      <Icon />
    </Box>
  );
};

export default AchievementBadge;
