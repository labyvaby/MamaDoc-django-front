import React from "react";
import { Box, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";

export interface SparkPoint {
  /** Подпись точки во всплывающей подсказке. */
  label: string;
  value: number;
}

export type SparklineProps = {
  points: SparkPoint[];
  height?: number;
  /** Подпись значения в подсказке (форматирование денег и штук разное). */
  format?: (value: number) => string;
};

/**
 * Линия по дням: собственный SVG вместо графической библиотеки.
 *
 * Библиотек графиков в проекте нет, и тянуть их ради одной кривой на 30 точек
 * незачем — вместе с ними приезжает свой рантайм тем, который придётся мирить
 * с нашей (light/dark, подменяемый primaryColor).
 *
 * `viewBox` в условных единицах + `preserveAspectRatio="none"` — кривая
 * растягивается под ширину карточки без пересчёта на ресайзе.
 */
export const Sparkline: React.FC<SparklineProps> = ({ points, height = 56, format }) => {
  const theme = useTheme();

  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const W = 100;
  const H = 30;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / span) * H;

  const line = points.map((p, i) => `${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(" ");
  const area = `0,${H} ${line} ${W},${H}`;

  const stroke = theme.palette.primary.main;
  const peakIndex = values.indexOf(max);

  return (
    <Box sx={{ position: "relative", height }}>
      <Box
        component="svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        sx={{ width: "100%", height: "100%", display: "block", overflow: "visible" }}
      >
        <polygon points={area} fill={alpha(stroke, theme.palette.mode === "dark" ? 0.18 : 0.1)} />
        <polyline
          points={line}
          fill="none"
          stroke={stroke}
          strokeWidth={1.2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Точка пика — единственный акцент: подписывать каждую точку на
            тридцати днях нечитаемо. */}
        <circle
          cx={x(peakIndex)}
          cy={y(max)}
          r={2}
          fill={stroke}
          vectorEffect="non-scaling-stroke"
        />
        {/* Прозрачные полосы поверх кривой дают нативную подсказку по дню:
            обработчики на самой линии попасть мышью почти невозможно. */}
        {points.map((p, i) => (
          <rect
            key={p.label}
            x={x(i) - W / points.length / 2}
            y={0}
            width={W / points.length}
            height={H}
            fill="transparent"
          >
            <title>{`${p.label} — ${format ? format(p.value) : p.value}`}</title>
          </rect>
        ))}
      </Box>
    </Box>
  );
};

export default Sparkline;
