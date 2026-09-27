import React from "react";
import { Box, Typography, alpha, keyframes, useMediaQuery, useTheme } from "@mui/material";
import dayjs from "dayjs";

import type { GrowthSex, GrowthStatus } from "./growthNorms";
import { formatNumber, growthColor } from "./growthUi";

const WIDTH = 260;
const HEIGHT = 300;
const FLOOR = 284;
const TOP = 14;
const RULER_X = 38;
const RULER_W = 24;
const FIGURE_X = 138;

interface ChildFigureProps {
  sex: GrowthSex | null;
  accent: string;
}

/** Контурный медицинский скан: антропометрический чертёж вместо персонажа. */
const ChildFigure: React.FC<ChildFigureProps> = ({ sex, accent }) => {
  const isGirl = sex === "female";
  const id = React.useId().replace(/:/g, "");
  const glowId = `scan-glow-${id}`;
  const gradientId = `scan-gradient-${id}`;
  const anatomy = isGirl
    ? "M36 75Q56 65 76 75L86 119M76 76L72 128 82 207M36 76L40 128 30 207M40 128Q56 137 72 128M26 119L36 75"
    : "M34 74Q56 66 78 74L88 119M77 75L72 128 82 207M35 75L40 128 30 207M40 128H72M24 119L35 75";

  return (
    <svg viewBox="0 0 112 214" width="100%" height="100%" role="presentation">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={accent} />
          <stop offset="1" stopColor="#7B61FF" />
        </linearGradient>
        <filter id={glowId} x="-60%" y="-30%" width="220%" height="170%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g fill="none" stroke={`url(#${gradientId})`} strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="56" cy="31" rx="23" ry="27" strokeWidth="2.2" filter={`url(#${glowId})`} />
        <path d={isGirl ? "M34 31Q35 4 56 4t22 27M35 24Q47 22 56 13q8 9 21 11" : "M34 28Q37 4 57 4q18 0 21 22M38 18q18-10 35 0"} strokeWidth="1.6" />
        <path d={anatomy} strokeWidth="2.2" filter={`url(#${glowId})`} />
        <path d="M56 59v73M49 45q7 5 14 0M48 31h1M63 31h1" strokeWidth="1.2" opacity=".76" />
        <path d="M43 88h26M40 105h32M36 157h40M33 183h46" strokeWidth=".8" strokeDasharray="3 4" opacity=".46" />
        <path d="M15 31H4m104 0H97M18 119H7m98 0H94M18 207H7m98 0H94" strokeWidth="1" opacity=".6" />
        {[{ x: 35, y: 75 }, { x: 77, y: 75 }, { x: 24, y: 119 }, { x: 88, y: 119 }, { x: 40, y: 128 }, { x: 72, y: 128 }, { x: 30, y: 207 }, { x: 82, y: 207 }].map((point) => (
          <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="3.2" strokeWidth="1" fill="rgba(255,255,255,.86)" />
        ))}
        <circle cx="56" cy="96" r="5" strokeWidth="1" opacity=".7" />
        <circle cx="56" cy="96" r="1.5" fill={accent} stroke="none" />
      </g>
    </svg>
  );
};

interface StadiometerProps {
  heightCm: number | null;
  previousCm: number | null;
  previousAt: string | null;
  sex: GrowthSex | null;
  status: GrowthStatus;
}

/**
 * Ростомер: шкала с делениями, векторная иллюстрация ребёнка высотой по
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

  const figurePx = (heightCm ?? 0) * pxPerCm;
  const figureWidth = figurePx * 0.5;
  const figureColor = sex === "female" ? theme.palette.secondary.main : "#2496CF";
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
              left: FIGURE_X - figureWidth / 2,
              top: FLOOR - figurePx,
              width: figureWidth,
              height: figurePx,
              pointerEvents: "none",
              transformOrigin: "50% 100%",
              animation: animate ? `${grow} 1.4s cubic-bezier(.2,.8,.2,1) both` : "none",
            }}
          >
            <ChildFigure sex={sex} accent={figureColor} />
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
