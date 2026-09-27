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
  shirt: string;
  skin: string;
}

/** Дружелюбная векторная иллюстрация ребёнка без внешних растровых ассетов. */
const ChildFigure: React.FC<ChildFigureProps> = ({ sex, shirt, skin }) => {
  const isGirl = sex === "female";
  const hair = "#5A3B2E";
  const shorts = isGirl ? "#9B6BD3" : "#365A80";
  const shoes = "#303B4A";

  return (
    <svg viewBox="0 5 112 214" width="100%" height="100%" role="presentation">
      <ellipse cx="56" cy="219" rx="35" ry="4.5" fill="rgba(38, 47, 61, .12)" />
      <path d="M40 202v10c0 4-4 7-9 7h-9c-3 0-5-2-5-4 0-5 10-8 18-13z" fill={shoes} />
      <path d="M72 202v10c0 4 4 7 9 7h9c3 0 5-2 5-4 0-5-10-8-18-13z" fill={shoes} />
      <path d="M32 128l4 77c0 5 4 8 9 8s9-4 9-9l2-54 2 54c0 5 4 9 9 9s9-3 9-8l4-77z" fill={shorts} />
      <path d="M29 75c-8 8-14 24-17 42-1 5 2 9 6 10 5 1 9-2 10-7l7-25-3 42h48l-3-42 7 25c1 5 5 8 10 7 4-1 7-5 6-10-3-18-9-34-17-42-7-7-18-10-27-10s-20 3-27 10z" fill={shirt} />
      <path d="M35 95c7 6 14 9 21 9s14-3 21-9l3 42H32z" fill="rgba(255,255,255,.09)" />
      <circle cx="18" cy="126" r="7" fill={skin} />
      <circle cx="94" cy="126" r="7" fill={skin} />
      <path d="M48 58h16v16c0 5-4 9-8 9s-8-4-8-9z" fill={skin} />
      {isGirl && <path d="M26 38c-5 8-7 21-3 31 3 7 10 9 16 5l4-9h26l4 9c6 4 13 2 16-5 4-10 2-23-3-31z" fill={hair} />}
      <circle cx="56" cy="39" r="30" fill={skin} />
      <path
        d={isGirl ? "M28 39C27 18 39 5 57 5c19 0 30 13 28 34-8-3-15-9-19-17-8 9-20 14-38 17z" : "M28 37C28 17 40 5 57 5c15 0 25 8 29 22-7-4-14-6-21-5-8 1-14 6-21 8-5 2-10 3-16 3z"}
        fill={hair}
      />
      <circle cx="45" cy="42" r="2.4" fill="#30343B" />
      <circle cx="67" cy="42" r="2.4" fill="#30343B" />
      <circle cx="44.5" cy="41.3" r=".8" fill="#FFF" />
      <circle cx="66.5" cy="41.3" r=".8" fill="#FFF" />
      <path d="M49 54c4 4 10 4 14 0" fill="none" stroke="#B86464" strokeWidth="2" strokeLinecap="round" />
      <circle cx="38" cy="51" r="4" fill="rgba(238,132,132,.22)" />
      <circle cx="74" cy="51" r="4" fill="rgba(238,132,132,.22)" />
      <path d="M51 74l5 5 5-5" fill="none" stroke="rgba(255,255,255,.72)" strokeWidth="2" strokeLinecap="round" />
      {sex == null && <path d="M44 113h24" stroke="rgba(255,255,255,.7)" strokeWidth="3" strokeLinecap="round" />}
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
            <ChildFigure sex={sex} shirt={figureColor} skin="#F2BF9B" />
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
