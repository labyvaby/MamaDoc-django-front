import React from "react";

import { type ArtColors, type ArtStatus, artSvgStyle, useArtColors } from "./artColors";
import { curve, fmt, pt, round1, tail, type Point } from "./geometry";

export type LegAxis = "neutral" | "varus" | "valgus";

export interface LegLengthDiff {
  /** Какая нога короче. */
  side: "L" | "R";
  cm: number;
}

export interface LegsProps {
  /** Ось ног; null — прямые ноги серым. */
  axis: LegAxis | null;
  /** Межлодыжечное (вальгус) или межколенное (варус) расстояние. */
  distanceCm: number | null;
  status: ArtStatus;
  lengthDiff?: LegLengthDiff | null;
}

/** Абсциссы тазобедренного сустава, колена и голеностопа: [левая, правая]. */
interface LegGeometry {
  h: readonly [number, number];
  k: readonly [number, number];
  a: readonly [number, number];
}

const G: Record<LegAxis, LegGeometry> = {
  neutral: { h: [86, 134], k: [92, 128], a: [94, 126] },
  valgus: { h: [84, 136], k: [100, 120], a: [82, 138] },
  varus: { h: [86, 134], k: [78, 142], a: [98, 122] },
};

/** Доля длины сегмента, полуширина снаружи, полуширина внутри (null — внутреннего края ещё нет). */
type WidthRow = readonly [number, number, number | null];
const THIGH: ReadonlyArray<WidthRow> = [
  [0, 16, null],
  [0.18, 14.6, 10.5],
  [0.5, 12.2, 10.2],
  [0.86, 9.6, 8.6],
  [1, 10, 9],
];
const SHIN: ReadonlyArray<WidthRow> = [
  [0.22, 10.4, 9.6],
  [0.55, 7.6, 7],
  [0.88, 5.6, 5.2],
  [1, 5.4, 5],
];

const PELVIS = "M66 30 C66 12 82 6 110 6 C138 6 154 12 154 30 C146 42 128 46 110 40 C92 46 74 42 66 30 Z";

/** Контур ноги по оси бедро — колено — голеностоп; i = 0 — левая, 1 — правая. */
function legPath(g: LegGeometry, i: 0 | 1): string {
  const hip: Point = [g.h[i], 26];
  const knee: Point = [g.k[i], 124];
  const ank: Point = [g.a[i], 214];
  const outer: Point[] = [];
  const inner: Point[] = [];
  const sgn = i ? 1 : -1;
  const parts: ReadonlyArray<readonly [Point, Point, ReadonlyArray<WidthRow>]> = [
    [hip, knee, THIGH],
    [knee, ank, SHIN],
  ];
  parts.forEach(([A, B, rows]) => {
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const len = Math.hypot(dx, dy);
    let nx = -dy / len;
    let ny = dx / len;
    // нормаль смотрит наружу от середины тела
    if (nx * sgn < 0) {
      nx = -nx;
      ny = -ny;
    }
    rows.forEach(([f, out, inn]) => {
      const px = A[0] + dx * f;
      const py = A[1] + dy * f;
      outer.push([px + nx * out, py + ny * out]);
      if (inn != null) inner.push([px - nx * inn, py - ny * inn]);
    });
  });
  return `${curve(outer)} L${pt(inner[inner.length - 1])} ${tail([...inner].reverse())} Q${round1(
    g.h[i] - sgn * 6,
  )} 30 ${pt(outer[0])} Z`;
}

/** Мягкие ткани непрозрачны, как в макете: подложка цветом поверхности под полупрозрачной заливкой. */
const Tissue: React.FC<{ d: string; c: ArtColors }> = ({ d, c }) => (
  <>
    <path d={d} fill={c.surface} />
    <path d={d} fill={c.tissue} stroke={c.tissueLine} strokeWidth={1.1} />
  </>
);

/** Стрелки размерной линии на высоте y, остриями к краям x1 и x2. */
const arrows = (x1: number, x2: number, y: number): string =>
  `M${round1(x1 + 5)} ${y - 3} L${round1(x1)} ${y} L${round1(x1 + 5)} ${y + 3} ` +
  `M${round1(x2 - 5)} ${y - 3} L${round1(x2)} ${y} L${round1(x2 - 5)} ${y + 3}`;

const AXIS_TEXT: Record<LegAxis, string> = {
  neutral: "ось прямая",
  valgus: "Х-образные",
  varus: "О-образные",
};

/** Ноги спереди: силуэт по оси, колени цветом оценки, размер между лодыжками или коленями. */
export const Legs: React.FC<LegsProps> = ({ axis, distanceCm, status, lengthDiff }) => {
  const c = useArtColors();
  const g = G[axis ?? "neutral"];
  const knee = axis ? status : "unknown";
  const tone = c.status(knee);
  const kneeFill = c.statusFill(knee);
  const dimProps = { fill: "none", stroke: c.accent, strokeWidth: 1 } as const;
  const diff = lengthDiff && lengthDiff.cm > 0 ? lengthDiff : null;

  const parts = [axis ? AXIS_TEXT[axis] : "ось не оценена"];
  if (distanceCm != null && (axis === "valgus" || axis === "varus")) {
    parts.push(`${axis === "valgus" ? "между лодыжками" : "между коленями"} ${fmt(distanceCm)} см`);
  }
  if (diff) parts.push(`${diff.side === "L" ? "левая" : "правая"} короче на ${fmt(diff.cm)} см`);

  let dimension: React.ReactNode = null;
  if (distanceCm != null && axis === "valgus") {
    // между внутренними краями лодыжек, ниже стоп
    const x1 = g.a[0] + 5;
    const x2 = g.a[1] - 5;
    dimension = (
      <>
        <path
          d={`M${round1(x1)} 214 V236 M${round1(x2)} 214 V236`}
          fill="none"
          stroke={c.accent}
          strokeWidth={0.7}
          strokeDasharray="2 2"
        />
        <path d={`M${round1(x1)} 232 H${round1(x2)}`} {...dimProps} />
        <path d={arrows(x1, x2, 232)} {...dimProps} />
        {/* под строкой о разнице длины подпись чуть выше, чтобы строки не слиплись */}
        <text x={110} y={diff ? 246 : 248} textAnchor="middle" fill={c.ink} fontSize={11} fontWeight={500}>
          {`${fmt(distanceCm)} см`}
        </text>
      </>
    );
  } else if (distanceCm != null && axis === "varus") {
    // между внутренними краями коленей (полуширина бедра у колена — 9)
    const x1 = g.k[0] + 9;
    const x2 = g.k[1] - 9;
    dimension = (
      <>
        <path d={`M${round1(x1)} 124 H${round1(x2)}`} {...dimProps} />
        <path d={arrows(x1, x2, 124)} {...dimProps} />
        <text x={110} y={117} textAnchor="middle" fill={c.ink} fontSize={11} fontWeight={500}>
          {`${fmt(distanceCm)} см`}
        </text>
      </>
    );
  }

  return (
    <svg viewBox="0 0 220 262" role="img" aria-label={`Ноги спереди: ${parts.join(", ")}`} style={artSvgStyle}>
      <path d={PELVIS} fill={c.tissue} stroke={c.tissueLine} strokeWidth={1.1} />
      {([0, 1] as const).map((i) => {
        const sgn = i ? 1 : -1;
        return (
          <g key={i}>
            <Tissue d={legPath(g, i)} c={c} />
            <ellipse
              cx={round1(g.a[i] + sgn * 6)}
              cy={222}
              rx={12}
              ry={5}
              fill={c.tissue}
              stroke={c.tissueLine}
              strokeWidth={1.1}
            />
            <ellipse cx={g.k[i]} cy={124} rx={6} ry={7} fill={kneeFill} stroke={tone} strokeWidth={1.3} />
            <line
              x1={g.h[i]}
              y1={26}
              x2={g.a[i]}
              y2={214}
              fill="none"
              stroke={c.inkSoft}
              strokeWidth={1.1}
              strokeDasharray="3.5 3"
            />
          </g>
        );
      })}
      {dimension}
      {diff && (
        <text x={110} y={259.5} textAnchor="middle" fill={c.muted} fontSize={10.5}>
          {`${diff.side === "L" ? "Левая" : "Правая"} короче на ${fmt(diff.cm)} см`}
        </text>
      )}
    </svg>
  );
};
