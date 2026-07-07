import React from "react";
import { Box, CircularProgress } from "@mui/material";

import { AchievementBadge } from "./AchievementBadge";
import { tierColors, type TierTone } from "./meta";

export interface AchievementRingProps {
  code: string;
  /** Тон полученного уровня для самого бейджа (null — не получен). */
  badgeTone?: TierTone | null;
  /** Тон следующего уровня — им красится кольцо прогресса. */
  ringTone?: TierTone | null;
  /** Прогресс до следующего порога, 0–100; null — кольцо не рисуем (максимум). */
  pct?: number | null;
  /** Диаметр бейджа (кольцо чуть больше). */
  size?: number;
}

/**
 * Бейдж достижения с кольцом прогресса вокруг: наглядно видно, сколько
 * осталось до следующего уровня. Плоско, цвета — из tierColors (токены темы).
 */
export const AchievementRing: React.FC<AchievementRingProps> = ({
  code,
  badgeTone,
  ringTone,
  pct,
  size = 52,
}) => {
  const ringSize = size + 14;
  const hasRing = pct != null;

  return (
    <Box
      sx={{
        position: "relative",
        width: ringSize,
        height: ringSize,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {hasRing && (
        <>
          {/* Трек кольца — хайрлайн под цветной дугой. */}
          <CircularProgress
            variant="determinate"
            value={100}
            size={ringSize}
            thickness={2.4}
            sx={{ position: "absolute", top: 0, left: 0, color: "divider" }}
          />
          <CircularProgress
            variant="determinate"
            value={Math.min(100, Math.max(0, pct))}
            size={ringSize}
            thickness={2.4}
            sx={(t) => ({
              position: "absolute",
              top: 0,
              left: 0,
              color: ringTone ? tierColors(t, ringTone).main : t.palette.text.disabled,
              "& .MuiCircularProgress-circle": { strokeLinecap: "round" },
            })}
          />
        </>
      )}
      <AchievementBadge code={code} tone={badgeTone} size={size} />
    </Box>
  );
};

export default AchievementRing;
