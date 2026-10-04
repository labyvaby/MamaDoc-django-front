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

/** Середина тела и высоты суставов. */
const MID = 110;
const HIP_Y = 46;
const KNEE_Y = 140;
const ANKLE_Y = 228;
const FLOOR = 248;
/** Пикселей на сантиметр между коленями или лодыжками: рисунок слегка утрирует, чтобы мягкое отклонение было видно. */
const PX_PER_CM = 5;
/** Полуширина ноги у колена и до внутренней лодыжки. */
const KNEE_HALF = 10.6;
const ANKLE_INNER = 7.2;

/** Расстояния от середины тела до центров суставов. */
interface Frame {
  hip: number;
  knee: number;
  ankle: number;
}

const gapPx = (cm: number | null, fallback: number): number => Math.min(50, Math.max(8, (cm ?? fallback) * PX_PER_CM));

/**
 * Вальгус — колени сомкнуты, лодыжки врозь на измеренное расстояние; варус —
 * лодыжки сомкнуты, колени врозь; прямые ноги — ось бедро — колено — лодыжка
 * одной линией.
 */
function frameFor(axis: LegAxis | null, cm: number | null): Frame {
  const hip = 22;
  if (axis === "valgus")
    return {
      hip,
      knee: KNEE_HALF + 0.4,
      ankle: ANKLE_INNER + gapPx(cm, 6) / 2,
    };
  if (axis === "varus")
    return {
      hip,
      knee: KNEE_HALF + gapPx(cm, 4) / 2,
      ankle: ANKLE_INNER + 0.3,
    };
  const ankle = ANKLE_INNER + 0.6;
  return {
    hip,
    knee: hip - ((hip - ankle) * (KNEE_Y - HIP_Y)) / (ANKLE_Y - HIP_Y),
    ankle,
  };
}

/** Доля длины сегмента, полуширина снаружи, полуширина внутри (null — внутренний край ещё под бельём). */
type WidthRow = readonly [number, number, number | null];
const THIGH: ReadonlyArray<WidthRow> = [
  // чуть выше сустава — край прячется под бельём и при наклоне таза
  [-0.12, 14.2, null],
  [0, 18, null],
  [0.22, 16.6, 13],
  [0.5, 14.2, 11.8],
  [0.8, 11.4, 10.4],
  [1, 10.8, KNEE_HALF],
];
const SHIN: ReadonlyArray<WidthRow> = [
  [0.07, 10.4, 10.4],
  [0.2, 10, 10.7],
  [0.36, 10.3, 10.6],
  [0.62, 8.2, 8],
  [0.84, 6, 5.8],
  // внутренняя лодыжка выше наружной
  [0.91, 6.3, ANKLE_INNER],
  [0.98, 7.1, 6.4],
  [1.04, 6.4, 6.2],
];

/** Пальцы спереди: сдвиг от центра лодыжки к середине тела, полуоси. */
const TOES: ReadonlyArray<readonly [number, number, number]> = [
  [5.6, 4.4, 3.6],
  [0.6, 2.8, 2.9],
  [-3.7, 2.6, 2.7],
  [-7.6, 2.4, 2.5],
  [-11, 2.1, 2.2],
];

/** Эллипс подпутём того же обхода, что и контур ноги, — при слиянии не даёт дыр. */
const ellipse = (cx: number, cy: number, rx: number, ry: number): string =>
  `M${round1(cx - rx)} ${round1(cy)} A${rx} ${ry} 0 1 0 ${round1(cx + rx)} ${round1(cy)} A${rx} ${ry} 0 1 0 ${round1(
    cx - rx
  )} ${round1(cy)} Z`;

interface LegShape {
  d: string;
  hip: Point;
  knee: Point;
  ankle: Point;
}

/**
 * Левая на рисунке нога (правая у пациента: вид спереди) одним путём — бедро,
 * голень с лодыжками, стопа носком к зрителю; вторая нога — её зеркало.
 * hipDrop опускает тазобедренный сустав укороченной ноги.
 */
function legShape(f: Frame, hipDrop: number): LegShape {
  const hip: Point = [MID - f.hip, HIP_Y + hipDrop];
  const knee: Point = [MID - f.knee, KNEE_Y];
  const ankle: Point = [MID - f.ankle, ANKLE_Y];
  const outer: Point[] = [];
  const inner: Point[] = [];
  const parts: ReadonlyArray<readonly [Point, Point, ReadonlyArray<WidthRow>]> = [
    [hip, knee, THIGH],
    [knee, ankle, SHIN],
  ];
  parts.forEach(([A, B, rows]) => {
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const len = Math.hypot(dx, dy);
    // сегмент идёт вниз, нормаль (-dy, dx) смотрит наружу — влево
    const nx = -dy / len;
    const ny = dx / len;
    rows.forEach(([t, out, inn]) => {
      const px = A[0] + dx * t;
      const py = A[1] + dy * t;
      outer.push([px + nx * out, py + ny * out]);
      if (inn != null) inner.push([px - nx * inn, py - ny * inn]);
    });
  });
  const ax = ankle[0];
  // стопа: наружный край от лодыжки вниз, по полу к большому пальцу, внутренний край вверх
  const foot =
    `M${round1(ax - 6.6)} ${ANKLE_Y} C${round1(ax - 9)} ${ANKLE_Y + 6} ${round1(ax - 12)} ${FLOOR - 9} ${round1(ax - 12.6)} ${
      FLOOR - 3.4
    } ` +
    `L${round1(ax + 9.8)} ${FLOOR - 3.4} C${round1(ax + 9.6)} ${FLOOR - 9} ${round1(ax + 7.6)} ${ANKLE_Y + 6} ${round1(ax + 6)} ${
      ANKLE_Y - 2
    } Z`;
  const toes = TOES.map(([dx, rx, ry]) => ellipse(ax + dx, FLOOR - ry, rx, ry)).join(" ");
  const d = `${curve(outer)} L${pt(inner[inner.length - 1])} ${tail([...inner].reverse())} Z ${foot} ${toes}`;
  return { d, hip, knee, ankle };
}

/** Трусики: пояс, бока, вырезы для ног. */
const BRIEFS =
  "M74 20 Q110 15.5 146 20 C148 30 150.5 39 152 46 C140.5 50 126 58 117.5 68 Q110 70.5 102.5 68 C94 58 79.5 50 68 46 C69.5 39 72 30 74 20 Z";
const WAISTBAND = "M74.8 25.5 Q110 21 145.2 25.5";

/** Нога одним силуэтом: контур снаружи, внутренние швы не видны, мягкая тень по краю — объём. */
const Limb: React.FC<{
  d: string;
  c: ArtColors;
  clip: string;
  blur: string;
}> = ({ d, c, clip, blur }) => (
  <>
    <path d={d} fill="none" stroke={c.tissueLine} strokeWidth={2.2} strokeLinejoin="round" />
    <path d={d} fill={c.surface} />
    <path d={d} fill={c.tissue} />
    <g clipPath={`url(#${clip})`}>
      <path d={d} fill="none" stroke={c.shade} strokeWidth={10} filter={`url(#${blur})`} />
    </g>
  </>
);

/** Стрелки размерной линии на высоте y, остриями к краям x1 и x2. */
const arrows = (x1: number, x2: number, y: number): string => {
  const head = Math.min(4.5, (x2 - x1) / 3);
  return (
    `M${round1(x1 + head)} ${y - 2.6} L${round1(x1)} ${y} L${round1(x1 + head)} ${y + 2.6} ` +
    `M${round1(x2 - head)} ${y - 2.6} L${round1(x2)} ${y} L${round1(x2 - head)} ${y + 2.6}`
  );
};

const AXIS_TEXT: Record<LegAxis, string> = {
  neutral: "ось прямая",
  valgus: "Х-образные",
  varus: "О-образные",
};

/**
 * Ноги спереди (правая нога пациента — слева): силуэт по оси, цветная линия —
 * ось бедро — колено — лодыжка, пунктир — прямая от бедра к лодыжке; размер
 * между лодыжками (Х) или коленями (О) — цветом акцента.
 */
export const Legs: React.FC<LegsProps> = ({ axis, distanceCm, status, lengthDiff }) => {
  const c = useArtColors();
  const id = React.useId().replace(/:/g, "");
  const f = frameFor(axis, distanceCm);
  const known = axis ? status : "unknown";
  const tone = c.status(known);
  const diff = lengthDiff && lengthDiff.cm > 0 ? lengthDiff : null;
  // укороченная нога: таз наклонён в её сторону — её сустав ниже на drop
  const drop = diff ? Math.min(8, 3 + diff.cm * 2.5) : 0;
  const dropRight = diff ? (diff.side === "R" ? drop / 2 : -drop / 2) : 0;
  const dropLeft = -dropRight;
  // на рисунке слева — правая нога пациента
  const viewerLeft = legShape(f, dropRight);
  const viewerRight = legShape(f, dropLeft);
  const mirror = (p: Point): Point => [2 * MID - p[0], p[1]];
  const joints: ReadonlyArray<readonly [Point, Point, Point]> = [
    [viewerLeft.hip, viewerLeft.knee, viewerLeft.ankle],
    [mirror(viewerRight.hip), mirror(viewerRight.knee), mirror(viewerRight.ankle)],
  ];
  // бельё поворачивается вместе с тазом вокруг середины между суставами
  const tilt = round1((Math.atan2(dropLeft - dropRight, 2 * f.hip) * 180) / Math.PI);
  const briefsTransform = tilt ? `rotate(${tilt} ${MID} ${HIP_Y})` : undefined;

  const parts = [axis ? AXIS_TEXT[axis] : "ось не оценена"];
  if (distanceCm != null && (axis === "valgus" || axis === "varus")) {
    parts.push(`${axis === "valgus" ? "между лодыжками" : "между коленями"} ${fmt(distanceCm)} см`);
  }
  if (diff) parts.push(`${diff.side === "L" ? "левая" : "правая"} короче на ${fmt(diff.cm)} см`);

  let y = FLOOR + 4;
  const dimY = distanceCm != null && (axis === "valgus" || axis === "varus") ? (y += 16) : 0;
  const diffY = diff ? (y += 15) : 0;
  const height = y + 6;

  let dimension: React.ReactNode = null;
  if (dimY) {
    // между внутренними лодыжками или внутренними мыщелками бёдер — там, где меряют
    const atKnee = axis === "varus";
    const reach = atKnee ? f.knee - KNEE_HALF : f.ankle - ANKLE_INNER;
    const at = atKnee ? KNEE_Y : round1(KNEE_Y + (ANKLE_Y - KNEE_Y) * 0.91);
    const x1 = MID - reach;
    const x2 = MID + reach;
    dimension = (
      <>
        <path d={`M${round1(x1)} ${at} H${round1(x2)} ${arrows(x1, x2, at)}`} fill="none" stroke={c.accent} strokeWidth={1.1} />
        <text x={MID} y={dimY} textAnchor="middle" fontSize={11}>
          <tspan fill={c.accent} fontWeight={700}>{`${fmt(distanceCm ?? 0)} см`}</tspan>
          <tspan fill={c.muted}>{atKnee ? " между коленями" : " между лодыжками"}</tspan>
        </text>
      </>
    );
  }

  return (
    <svg viewBox={`0 0 220 ${height}`} role="img" aria-label={`Ноги спереди: ${parts.join(", ")}`} style={artSvgStyle}>
      <line x1={46} y1={FLOOR} x2={174} y2={FLOOR} stroke={c.tissueLine} strokeWidth={1.1} />
      <defs>
        <clipPath id={`${id}l`}>
          <path d={viewerLeft.d} />
        </clipPath>
        <clipPath id={`${id}r`}>
          <path d={viewerRight.d} />
        </clipPath>
        <filter id={`${id}b`} x="-30%" y="-10%" width="160%" height="120%">
          <feGaussianBlur stdDeviation={2.6} />
        </filter>
      </defs>
      <Limb d={viewerLeft.d} c={c} clip={`${id}l`} blur={`${id}b`} />
      <g transform={`translate(${2 * MID},0) scale(-1,1)`}>
        <Limb d={viewerRight.d} c={c} clip={`${id}r`} blur={`${id}b`} />
      </g>
      <g transform={briefsTransform}>
        <path d={BRIEFS} fill={c.surface} />
        <path d={BRIEFS} fill={c.tissue} stroke={c.tissueLine} strokeWidth={1.1} strokeLinejoin="round" />
        <path d={BRIEFS} fill={c.tissue} />
        <path d={WAISTBAND} fill="none" stroke={c.tissueLine} strokeWidth={1} />
      </g>
      {joints.map(([hip, knee, ankle], i) => (
        <g key={i}>
          {axis && axis !== "neutral" && (
            <line
              x1={round1(hip[0])}
              y1={round1(hip[1])}
              x2={round1(ankle[0])}
              y2={ankle[1]}
              stroke={c.inkSoft}
              strokeWidth={1}
              strokeDasharray="3.5 3"
            />
          )}
          <ellipse
            cx={round1(knee[0])}
            cy={knee[1] - 1}
            rx={5.6}
            ry={6.8}
            fill={c.statusFill(known)}
            stroke={tone}
            strokeWidth={1.2}
          />
          {axis && (
            <>
              <path
                d={`M${pt(hip)} L${pt(knee)} L${pt(ankle)}`}
                fill="none"
                stroke={tone}
                strokeWidth={1.4}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {[hip, knee, ankle].map((p, j) => (
                <circle key={j} cx={round1(p[0])} cy={round1(p[1])} r={1.9} fill={tone} />
              ))}
            </>
          )}
        </g>
      ))}
      {dimension}
      {diff && (
        <>
          {/* вид спереди: правая нога пациента слева — подписи сторон у бёдер, как метки на снимке */}
          <text x={MID - f.hip - 22} y={HIP_Y + 26} textAnchor="end" fontSize={10} fill={diff.side === "R" ? c.ink : c.muted}>
            правая
          </text>
          <text x={MID + f.hip + 22} y={HIP_Y + 26} textAnchor="start" fontSize={10} fill={diff.side === "L" ? c.ink : c.muted}>
            левая
          </text>
          <text x={MID} y={diffY} textAnchor="middle" fill={c.muted} fontSize={10.5}>
            {`${diff.side === "L" ? "Левая" : "Правая"} короче на ${fmt(diff.cm)} см`}
          </text>
        </>
      )}
    </svg>
  );
};
