import React from "react";
import { alpha, useTheme } from "@mui/material";

import type { EyeStatus } from "./visionNorms";
import { statusColor } from "./visionUi";

/**
 * Глаз: радужка — настоящим цветом глаз ребёнка (выбирает врач), оценка
 * остроты — фоном и контуром глаза; левый — зеркально.
 */
export const EyeGraphic: React.FC<{ status: EyeStatus; irisColor: string; size?: number; mirrored?: boolean }> = ({
  status,
  irisColor,
  size = 92,
  mirrored = false,
}) => {
  const theme = useTheme();
  const color = statusColor(theme, status);
  return (
    <svg
      width={size}
      height={Math.round(size * 0.6)}
      viewBox="0 0 100 60"
      aria-hidden="true"
      style={{ flexShrink: 0, transform: mirrored ? "scaleX(-1)" : undefined }}
    >
      <path
        d="M4 30 C24 4 76 4 96 30 C76 56 24 56 4 30 Z"
        fill={alpha(color, 0.16)}
        stroke={alpha(color, 0.85)}
        strokeWidth={2.5}
      />
      <circle cx={50} cy={30} r={17} fill={irisColor} stroke={alpha("#000000", 0.18)} strokeWidth={1} />
      <circle cx={50} cy={30} r={12} fill="none" stroke={alpha("#ffffff", 0.35)} strokeWidth={1.5} />
      <circle cx={50} cy={30} r={7} fill="#161616" />
      <circle cx={55} cy={25} r={3} fill="#ffffff" opacity={0.9} />
    </svg>
  );
};
