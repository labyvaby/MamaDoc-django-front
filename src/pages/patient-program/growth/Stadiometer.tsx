import React from "react";
import { Box, Typography, alpha, keyframes, useMediaQuery, useTheme } from "@mui/material";
import AccessibilityNewRounded from "@mui/icons-material/AccessibilityNewRounded";
import BoyRounded from "@mui/icons-material/BoyRounded";
import GirlRounded from "@mui/icons-material/GirlRounded";
import dayjs from "dayjs";

import type { GrowthSex, GrowthStatus } from "./growthNorms";
import { FIGURE_BOUNDS, formatNumber, growthColor } from "./growthUi";

const WIDTH = 260;
const HEIGHT = 300;
const FLOOR = 284;
const TOP = 14;
const RULER_X = 38;
const RULER_W = 24;
const FIGURE_X = 138;

interface StadiometerProps {
  heightCm: number | null;
  previousCm: number | null;
  previousAt: string | null;
  sex: GrowthSex | null;
  status: GrowthStatus;
}

/**
 * Ростомер: шкала с делениями, готовый силуэт (Material Icons) высотой по
 * росту ребёнка, отметка роста и пунктир прошлого замера. Силуэт «подрастает»
 * от прошлого роста, отметка выезжает; при «меньше движения» — без анимации.
 */
export const Stadiometer: React.FC<StadiometerProps> = ({ heightCm, previousCm, previousAt, sex, status }) => {
  const theme = useTheme();
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const tallest = Math.max(heightCm ?? 0, previousCm ?? 0);
  const topCm = Math.max(70, Math.ceil((tallest + 15) / 10) * 10);
  const pxPerCm = (FLOOR - TOP) / topCm;
  const y = (cm: number) => FLOOR - cm * pxPerCm;
  const step = pxPerCm >= 2.4 ? 1 : 2;
  const ticks: number[] = [];
  for (let cm = 0; cm <= topCm; cm += step) ticks.push(cm);

  const Figure = sex === "male" ? BoyRounded : sex === "female" ? GirlRounded : AccessibilityNewRounded;
  const bounds = sex ? FIGURE_BOUNDS.child : FIGURE_BOUNDS.neutral;
  const figurePx = (heightCm ?? 0) * pxPerCm;
  const unit = figurePx / (bounds.bottom - bounds.top);
  const box = 24 * unit;
  const figureColor = sex === "female" ? theme.palette.secondary.main : theme.palette.info.main;
  const markColor = growthColor(theme, status);
  const from = heightCm && previousCm && previousCm < heightCm ? previousCm / heightCm : 0.55;
  const animate = !reduceMotion && heightCm != null;
  const grow = keyframes`from { transform: scaleY(${from}); } to { transform: scaleY(1); }`;
  const rise = keyframes`from { transform: translateY(${figurePx * (1 - from)}px); } to { transform: translateY(0); }`;
  const muted = alpha(theme.palette.text.primary, 0.45);
  const showPrevious = previousCm != null && heightCm != null && Math.abs(previousCm - heightCm) >= 0.5;

  return (
    <Box sx={{ position: "relative", width: WIDTH, height: HEIGHT, flexShrink: 0, mx: "auto", overflow: "hidden" }}>
      <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
        <rect
          x={RULER_X}
          y={TOP}
          width={RULER_W}
          height={FLOOR - TOP}
          rx={5}
          fill={alpha(theme.palette.text.primary, 0.03)}
          stroke={theme.palette.divider}
        />
        {ticks.map((cm) => {
          const long = cm % 10 === 0;
          const mid = cm % 5 === 0;
          const length = long ? 12 : mid ? 8 : 4;
          return (
            <g key={cm}>
              <line
                x1={RULER_X + RULER_W}
                x2={RULER_X + RULER_W - length}
                y1={y(cm)}
                y2={y(cm)}
                stroke={long ? muted : alpha(theme.palette.text.primary, 0.25)}
                strokeWidth={long ? 1.2 : 1}
              />
              {long && cm > 0 && (
                <text x={RULER_X - 6} y={y(cm) + 4} textAnchor="end" fontSize={11} fill={muted}>
                  {cm}
                </text>
              )}
            </g>
          );
        })}
        <line x1={8} x2={WIDTH - 8} y1={FLOOR} y2={FLOOR} stroke={muted} strokeWidth={1.5} />
        {showPrevious && (
          <g>
            <line
              x1={RULER_X + RULER_W}
              x2={WIDTH - 10}
              y1={y(previousCm)}
              y2={y(previousCm)}
              stroke={muted}
              strokeDasharray="4 4"
            />
            <text x={WIDTH - 10} y={y(previousCm) + 14} textAnchor="end" fontSize={10.5} fill={muted}>
              {formatNumber(previousCm, 1)} см{previousAt ? ` · ${dayjs(previousAt).format("MM.YYYY")}` : ""}
            </text>
          </g>
        )}
      </svg>
      {heightCm != null && (
        <>
          <Box
            sx={{
              position: "absolute",
              left: FIGURE_X - box / 2,
              top: FLOOR - bounds.bottom * unit,
              width: box,
              height: box,
              pointerEvents: "none",
              transformOrigin: `50% ${(bounds.bottom / 24) * 100}%`,
              animation: animate ? `${grow} 1.4s cubic-bezier(.2,.8,.2,1) both` : "none",
            }}
          >
            <Figure sx={{ width: box, height: box, display: "block", color: alpha(figureColor, 0.9) }} />
          </Box>
          <Box
            sx={{
              position: "absolute",
              left: RULER_X + RULER_W - 12,
              right: 8,
              top: y(heightCm) - 12,
              height: 24,
              display: "flex",
              alignItems: "center",
              pointerEvents: "none",
              animation: animate ? `${rise} 1.4s cubic-bezier(.2,.8,.2,1) both` : "none",
            }}
          >
            <Box sx={{ flex: 1, height: 2.5, bgcolor: markColor, borderRadius: 2 }} />
            <Typography
              component="span"
              sx={{
                ml: 0.75,
                px: 1,
                py: 0.25,
                borderRadius: "8px",
                bgcolor: markColor,
                color: theme.palette.getContrastText(markColor),
                fontSize: 13,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {formatNumber(heightCm, 1)} см
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
};
