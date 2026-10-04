import React from "react";

import { type ArtColors, type ArtStatus, artSvgStyle, useArtColors } from "./artColors";
import { arc, curve, fmt, round1, tail, type Point } from "./geometry";

export interface HeelInput {
  /** Угол пятки к оси голени: плюс — вальгус, минус — варус; null — не измерен. */
  deg: number | null;
  status: ArtStatus;
}

export interface HeelsProps {
  left: HeelInput;
  right: HeelInput;
}

// Нога рисуется в своих координатах: x = 0 — ось голени, наружный край — минус x,
// верх уходит за край рисунка. Правая нога — зеркало левой, поэтому вальгус
// (низ пятки наружу) у обеих — поворот на +угол.

/** Наружный край голени: икра, ахиллова область, наружная лодыжка ниже внутренней. */
const SHIN_OUTER: ReadonlyArray<Point> = [
  [-20, -52],
  [-23, -30],
  [-22.6, -12],
  [-19.6, 6],
  [-16, 26],
  [-13.4, 46],
  [-12.1, 62],
  [-12.4, 74],
  [-15.2, 84],
  [-13.4, 92],
  [-11.2, 100],
];
/** Внутренний край: икра полнее и ниже, внутренняя лодыжка выше. */
const SHIN_INNER: ReadonlyArray<Point> = [
  [20.5, -52],
  [24, -26],
  [23.6, -8],
  [20.4, 10],
  [16.4, 30],
  [13.4, 46],
  [12.3, 58],
  [14.4, 69],
  [14.3, 77],
  [12, 88],
  [10.8, 100],
];
const SHIN_FILL = `${curve(SHIN_OUTER)} C-7 104 7 104 ${SHIN_INNER[SHIN_INNER.length - 1].join(" ")} ${tail(
  [...SHIN_INNER].reverse()
)} Z`;

/** Ахиллово сухожилие: сходится к пятке. */
const TENDON = "M-5.6 38 C-4.8 62 -4.2 82 -3.9 99 M5.8 44 C4.9 66 4.3 84 4 99";

/** Пятка; поворачивается вокруг подтаранного сустава PIVOT. */
const PIVOT: Point = [0, 90];
const HEEL = `${curve([
  [-10.6, 92],
  [-12.6, 101],
  [-16, 110.5],
  [-16.8, 118.5],
  [-14.4, 126],
  [-7.6, 130.4],
  [0, 131],
  [7.6, 130.4],
  [14.4, 126],
  [16.8, 118.5],
  [16, 110.5],
  [12.6, 101],
  [10.4, 92],
])} Z`;
const FLOOR = 131;

/** Передний отдел стопы за пяткой: наружный край низкий, внутренний — свод выше. */
function forefoot(deg: number): string {
  const valgus = Math.max(0, Math.min(deg, 25));
  // при вальгусе свод проседает, а передний отдел уходит наружу
  const outer = round1(-24.4 - valgus * 0.22);
  const arch = round1(117 + valgus * 0.25);
  return `M${outer} ${FLOOR} C${outer} 127.5 ${round1(outer + 3)} 123.5 -14 121.5 L13 ${arch} C18 ${round1(
    arch + 2.5
  )} 21.4 126 21.6 ${FLOOR} Z`;
}

const rotate = (p: Point, deg: number): Point => {
  const a = (deg * Math.PI) / 180;
  const dx = p[0] - PIVOT[0];
  const dy = p[1] - PIVOT[1];
  return [PIVOT[0] + dx * Math.cos(a) - dy * Math.sin(a), PIVOT[1] + dx * Math.sin(a) + dy * Math.cos(a)];
};

/** Сектор угла между осью голени и осью пятки — видно и угол в 4°. */
const WEDGE_R = 34;
function wedge(deg: number): string {
  const end = rotate([0, PIVOT[1] + WEDGE_R], deg);
  return `M${PIVOT[0]} ${PIVOT[1]} L${PIVOT[0]} ${PIVOT[1] + WEDGE_R} A${WEDGE_R} ${WEDGE_R} 0 0 ${deg > 0 ? 1 : 0} ${round1(
    end[0]
  )} ${round1(end[1])} Z`;
}

/** Мягкие ткани непрозрачны: подложка цветом поверхности под полупрозрачной заливкой. */
const Solid: React.FC<{
  d: string;
  fill: string;
  c: ArtColors;
  stroke?: string;
  width?: number;
}> = ({ d, fill, c, stroke, width = 1.1 }) => (
  <>
    <path d={d} fill={c.surface} />
    <path d={d} fill={fill} stroke={stroke ?? "none"} strokeWidth={stroke ? width : undefined} strokeLinejoin="round" />
  </>
);

/** Одна нога сзади в своих координатах; маска — плавный обрыв икры сверху. */
function leg(input: HeelInput, id: string, c: ArtColors): React.ReactNode {
  const tone = c.status(input.status);
  const deg = input.deg ?? 0;
  const top = rotate([0, 84], deg);
  const end = rotate([0, FLOOR + 3], deg);
  return (
    <>
      <Solid d={forefoot(deg)} fill={c.tissue} stroke={c.tissueLine} c={c} />
      <g transform={deg ? `rotate(${round1(deg)} ${PIVOT[0]} ${PIVOT[1]})` : undefined}>
        <Solid d={HEEL} fill={c.statusFill(input.status)} c={c} />
        <g clipPath={`url(#${id}h)`}>
          <path d={HEEL} fill="none" stroke={tone} strokeOpacity={0.35} strokeWidth={9} filter={`url(#${id}b)`} />
        </g>
        <path d={HEEL} fill="none" stroke={tone} strokeWidth={1.4} strokeLinejoin="round" />
      </g>
      <g mask={`url(#${id}m)`}>
        <Solid d={SHIN_FILL} fill={c.tissue} c={c} />
        <g clipPath={`url(#${id}s)`}>
          <path d={SHIN_FILL} fill="none" stroke={c.shade} strokeWidth={11} filter={`url(#${id}b)`} />
        </g>
        <path d={curve(SHIN_OUTER)} fill="none" stroke={c.tissueLine} strokeWidth={1.1} />
        <path d={curve(SHIN_INNER)} fill="none" stroke={c.tissueLine} strokeWidth={1.1} />
        <path d={TENDON} fill="none" stroke={c.tissueLine} strokeOpacity={0.7} strokeWidth={0.9} strokeLinecap="round" />
        <line x1={0} y1={-40} x2={0} y2={FLOOR + 5} stroke={c.inkSoft} strokeWidth={1.1} strokeDasharray="3.5 3" />
      </g>
      {input.deg != null && (
        <>
          <line
            x1={round1(top[0])}
            y1={round1(top[1])}
            x2={round1(end[0])}
            y2={round1(end[1])}
            stroke={tone}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          {deg !== 0 && (
            <>
              <path d={wedge(deg)} fill={tone} fillOpacity={0.3} />
              <path
                d={arc(PIVOT[0], PIVOT[1], WEDGE_R, Math.min(90, 90 + deg), Math.max(90, 90 + deg))}
                fill="none"
                stroke={tone}
                strokeWidth={1.3}
              />
            </>
          )}
          <circle cx={PIVOT[0]} cy={PIVOT[1]} r={1.9} fill={tone} />
        </>
      )}
    </>
  );
}

/** Слово под углом: норма, вальгус или варус. */
const heelWord = (input: HeelInput): string => {
  if (input.deg == null) return "не измерена";
  if (input.status === "ok" || input.deg === 0) return "норма";
  return input.deg > 0 ? "вальгус" : "варус";
};

const heelText = (input: HeelInput): string =>
  input.deg == null ? "не измерена" : `${fmt(Math.abs(input.deg))}°, ${heelWord(input)}`;

/** Центры ног на рисунке и сдвиг вниз: верх икры (y = -52) у края рисунка. */
const LEFT_X = 50;
const RIGHT_X = 150;
const TOP = 58;
const VALUE_Y = TOP + FLOOR + 24;

/**
 * Обе пятки сзади (слева левая, справа правая): голень с лодыжками и ахилловым
 * сухожилием, пятка цветом оценки повёрнута на измеренный угол. Пунктир — ось
 * голени, цветная линия — ось пятки, дуга — угол между ними.
 */
export const Heels: React.FC<HeelsProps> = ({ left, right }) => {
  const c = useArtColors();
  const id = React.useId().replace(/:/g, "");
  const label = (x: number, side: string, input: HeelInput) => {
    const tone = c.status(input.status);
    return (
      <>
        <text x={x} y={VALUE_Y} textAnchor="middle" fill={input.deg == null ? c.muted : tone} fontSize={15} fontWeight={700}>
          {input.deg == null ? "—" : `${fmt(Math.abs(input.deg))}°`}
        </text>
        {/* без угла под прочерком только сторона — «не измерена» не влезает рядом с соседней подписью */}
        <text x={x} y={VALUE_Y + 15} textAnchor="middle" fontSize={10.5}>
          <tspan fill={c.muted}>{input.deg == null ? side : `${side} · `}</tspan>
          {input.deg != null && (
            <tspan fill={tone} fontWeight={600}>
              {heelWord(input)}
            </tspan>
          )}
        </text>
      </>
    );
  };
  return (
    <svg
      viewBox={`0 0 200 ${VALUE_Y + 21}`}
      role="img"
      aria-label={`Пятки сзади: левая — ${heelText(left)}; правая — ${heelText(right)}`}
      style={artSvgStyle}
    >
      <defs>
        <linearGradient id={`${id}g`} x1={0} y1={-54} x2={0} y2={-20} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor="#fff" stopOpacity={0} />
          <stop offset={1} stopColor="#fff" stopOpacity={1} />
        </linearGradient>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x={-40} y={-60} width={80} height={210}>
          <rect x={-40} y={-60} width={80} height={210} fill={`url(#${id}g)`} />
        </mask>
        <clipPath id={`${id}s`}>
          <path d={SHIN_FILL} />
        </clipPath>
        <clipPath id={`${id}h`}>
          <path d={HEEL} />
        </clipPath>
        <filter id={`${id}b`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation={2.6} />
        </filter>
      </defs>
      <line x1={10} y1={TOP + FLOOR} x2={190} y2={TOP + FLOOR} stroke={c.tissueLine} strokeWidth={1.1} />
      <g transform={`translate(${LEFT_X},${TOP})`}>{leg(left, id, c)}</g>
      <g transform={`translate(${RIGHT_X},${TOP}) scale(-1,1)`}>{leg(right, id, c)}</g>
      {label(LEFT_X, "левая", left)}
      {label(RIGHT_X, "правая", right)}
    </svg>
  );
};
