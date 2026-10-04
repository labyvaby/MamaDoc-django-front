import React from "react";

import { type ArtColors, type ArtStatus, artSvgStyle, useArtColors } from "./artColors";
import { curve as spline, fmt, round1, type Point } from "./geometry";

export type BackSide = "L" | "R";

export interface BackViewProps {
  /** Какое надплечье выше; null — на одном уровне. */
  shoulderHigher: BackSide | null;
  /** Сторона выпуклости грудной дуги позвоночника; null — дуги нет. */
  curve: BackSide | null;
  /** Сторона рёберного горба; null — горба нет. */
  humpSide: BackSide | null;
  /** Угол ротации туловища по сколиометру, градусы. */
  atr: number | null;
  status: ArtStatus;
  /** Врезка «тест Адамса» под спиной. */
  showAdams: boolean;
}

/** Подъём надплечья. */
const LIFT = 5;
/** Амплитуда дуги линии остистых отростков. */
const AMP = 6;

/** Левый край туловища от шеи до середины низа; правый строится зеркально. */
const HALF: ReadonlyArray<Point> = [
  [100, 56],
  [96, 70],
  [82, 76],
  [64, 84],
  [56, 96],
  [58, 118],
  [64, 146],
  [72, 174],
  [68, 204],
  [70, 232],
  [80, 250],
  [110, 254],
];

/** Левая рука; правая — зеркально. */
const ARM: ReadonlyArray<Point> = [
  [56, 90],
  [46, 110],
  [42, 150],
  [40, 196],
  [44, 226],
  [52, 228],
  [56, 196],
  [58, 150],
  [62, 116],
];

/** Дуга рёберного горба справа; слева — зеркально. */
const HUMP: ReadonlyArray<Point> = [
  [124, 100],
  [140, 108],
  [143, 124],
  [132, 136],
];

const mirror = (p: Point): Point => [220 - p[0], p[1]];

/** Подъём края туловища на высоте y: полный до плеча, к y = 120 сходит на нет. */
const lift = (y: number, t: number): number => (y < 120 ? t * Math.max(0, 1 - Math.max(0, y - 84) / 36) : 0);

/** Врезка: левый верхний угол. */
const IX = 12;
const IY = 264;
/** Точка врезки относительно её угла. */
const ip = (dx: number, dy: number): string => `${IX + dx} ${IY + dy}`;

/** Спина в наклоне: горб справа, как в макете. */
const BENT_HUMP = [
  `M${ip(16, 74)}`,
  `C${ip(40, 40)} ${ip(80, 36)} ${ip(98, 36)}`,
  `C${ip(120, 35)} ${ip(150, 28)} ${ip(180, 72)} Z`,
].join(" ");
/** Спина в наклоне без горба: левая половина, отражённая направо. */
const BENT_EVEN = [
  `M${ip(16, 74)}`,
  `C${ip(40, 40)} ${ip(80, 36)} ${ip(98, 36)}`,
  `C${ip(116, 36)} ${ip(156, 40)} ${ip(180, 74)} Z`,
].join(" ");

const SHOULDER_TEXT: Record<BackSide, string> = { L: "левое надплечье выше", R: "правое надплечье выше" };
const CURVE_TEXT: Record<BackSide, string> = { L: "дуга позвоночника влево", R: "дуга позвоночника вправо" };
const HUMP_TEXT: Record<BackSide, string> = { L: "горб слева", R: "горб справа" };

/** Мягкие ткани непрозрачны, как в макете: подложка цветом поверхности под полупрозрачной заливкой. */
const Tissue: React.FC<{ d: string; c: ArtColors }> = ({ d, c }) => (
  <>
    <path d={d} fill={c.surface} />
    <path d={d} fill={c.tissue} stroke={c.tissueLine} strokeWidth={1.1} />
  </>
);

/**
 * Спина сзади: надплечья, линия остистых отростков, рёберный горб; при
 * showAdams — врезка «тест Адамса» со сколиометром. Отвес — цветом акцента.
 */
export const BackView: React.FC<BackViewProps> = ({
  shoulderHigher,
  curve: curveSide,
  humpSide,
  atr,
  status,
  showAdams,
}) => {
  const c = useArtColors();
  const tone = c.status(status);
  const tL = shoulderHigher === "L" ? LIFT : 0;
  const tR = shoulderHigher === "R" ? LIFT : 0;
  // талия глубже на вогнутой стороне поясничной дуги — той же, что выпуклость грудной
  const waistL = curveSide === "L" ? 3 : 0;
  const waistR = curveSide === "R" ? -3 : 0;

  const leftEdge: Point[] = HALF.map((p) => [p[0] + (p[1] === 174 ? waistL : 0), p[1] - lift(p[1], tL)]);
  const rightEdge: Point[] = HALF.slice(0, -1)
    .map((p): Point => [220 - p[0] + (p[1] === 174 ? waistR : 0), p[1] - lift(p[1], tR)])
    .reverse();
  const arm = (side: BackSide): string => {
    const dy = shoulderHigher === side ? LIFT : 0;
    const pts = ARM.map(
      (p): Point => [
        side === "L" ? p[0] : 220 - p[0],
        p[1] - (p[1] < 120 ? dy * (1 - Math.max(0, p[1] - 90) / 30) : 0),
      ],
    );
    return `${spline(pts)} Z`;
  };
  const sL = round1(tL * 0.6);
  const sR = round1(tR * 0.6);

  const amp = curveSide === "R" ? AMP : curveSide === "L" ? -AMP : 0;
  const n = 17;
  const y0 = 72;
  const y1 = 226;
  const vertebrae = Array.from({ length: n }, (_, i) => {
    const u = (i + 0.5) / n;
    const y = y0 + (y1 - y0) * u;
    const x = 110 + amp * Math.sin(2 * Math.PI * u);
    const ang = (-Math.atan2(amp * 2 * Math.PI * Math.cos(2 * Math.PI * u), y1 - y0) * 180) / Math.PI;
    const w = i < 12 ? 7 : 9;
    const h = 4.6;
    return (
      <rect
        key={i}
        x={round1(x - w / 2)}
        y={round1(y - h / 2)}
        width={w}
        height={h}
        rx={2.3}
        transform={`rotate(${round1(ang)} ${round1(x)} ${round1(y)})`}
        fill={c.bone}
        stroke={c.ink}
        strokeWidth={0.9}
      />
    );
  });

  const shoulderText = shoulderHigher ? SHOULDER_TEXT[shoulderHigher] : "надплечья на одном уровне";
  const curveText = curveSide ? CURVE_TEXT[curveSide] : "позвоночник без дуги";
  const humpText = humpSide ? HUMP_TEXT[humpSide] : "без горба";
  const atrText = atr != null ? `ротация ${fmt(Math.abs(atr))}°` : "угол не измерен";
  const adamsText = showAdams ? `; наклон вперёд: ${humpText}, ${atrText}` : "";
  const label = `Спина сзади: ${shoulderText}, ${curveText}${adamsText}`;

  let adams: React.ReactNode = null;
  if (showAdams) {
    // сколиометр опускается к стороне без горба; горб слева — врезка зеркально
    const tilt = atr != null && humpSide ? -Math.abs(atr) : 0;
    const scoliometer = (
      <g transform={`rotate(${round1(tilt)} ${IX + 110} ${IY + 32})`}>
        <rect x={IX + 80} y={IY + 24} width={62} height={10} rx={5} fill={c.surface} stroke={tone} strokeWidth={1.2} />
        <circle cx={IX + 111} cy={IY + 29} r={2.6} fill={tone} />
      </g>
    );
    const bent = (d: string) => <path d={d} fill={c.tissue} stroke={c.tissueLine} strokeWidth={1.1} />;
    const angle = (x: number, anchor: "start" | "end") =>
      atr != null ? (
        <text x={x} y={IY + 30} textAnchor={anchor} fill={tone} fontSize={12} fontWeight={600}>
          {`${fmt(Math.abs(atr))}°`}
        </text>
      ) : (
        <text x={IX + 186} y={IY + 16} textAnchor="end" fill={c.muted} fontSize={10.5}>
          угол не измерен
        </text>
      );
    adams = (
      <>
        <rect x={IX} y={IY} width={196} height={82} rx={8} fill={c.sunk} stroke={c.rule} />
        <text x={IX + 10} y={IY + 16} fill={c.muted} fontSize={10.5}>
          тест Адамса
        </text>
        {humpSide === "R" && (
          <>
            {bent(BENT_HUMP)}
            {scoliometer}
            {angle(IX + 150, "start")}
          </>
        )}
        {humpSide === "L" && (
          <>
            <g transform="translate(220,0) scale(-1,1)">
              {bent(BENT_HUMP)}
              {scoliometer}
            </g>
            {angle(220 - (IX + 150), "end")}
          </>
        )}
        {humpSide == null && (
          <>
            {bent(BENT_EVEN)}
            {/* без горба сколиометр по центру спины */}
            <g transform="translate(-13,0)">{scoliometer}</g>
            {angle(IX + 150 - 13, "start")}
          </>
        )}
        <text
          x={humpSide === "L" ? 220 - (IX + 10) : IX + 10}
          y={IY + 30}
          textAnchor={humpSide === "L" ? "end" : "start"}
          fill={c.muted}
          fontSize={10.5}
        >
          {humpText}
        </text>
      </>
    );
  }

  return (
    <svg viewBox={showAdams ? "0 0 220 352" : "0 0 220 262"} role="img" aria-label={label} style={artSvgStyle}>
      <path d={`${spline([...leftEdge, ...rightEdge])} Z`} fill={c.tissue} stroke={c.tissueLine} strokeWidth={1.1} />
      <ellipse cx={110} cy={32} rx={18} ry={22} fill={c.surface} />
      <ellipse cx={110} cy={32} rx={18} ry={22} fill={c.tissue} stroke={c.tissueLine} strokeWidth={1.1} />
      <Tissue d={arm("L")} c={c} />
      <Tissue d={arm("R")} c={c} />
      <path
        d={`M80 ${96 - sL} L100 ${98 - sL} L92 ${134 - sL} Z`}
        fill="none"
        stroke={c.tissueLine}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      <path
        d={`M140 ${96 - sR} L120 ${98 - sR} L128 ${134 - sR} Z`}
        fill="none"
        stroke={c.tissueLine}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      <line
        x1={40}
        y1={84 - tL}
        x2={180}
        y2={84 - tR}
        fill="none"
        stroke={c.inkSoft}
        strokeWidth={1.1}
        strokeDasharray="3.5 3"
      />
      <line
        x1={58}
        y1={206}
        x2={162}
        y2={206}
        fill="none"
        stroke={c.inkSoft}
        strokeWidth={1.1}
        strokeDasharray="3.5 3"
      />
      <line x1={110} y1={66} x2={110} y2={246} fill="none" stroke={c.accent} strokeWidth={1} strokeDasharray="2 3" />
      {vertebrae}
      {humpSide && (
        <path
          d={spline(humpSide === "R" ? HUMP : HUMP.map(mirror))}
          fill="none"
          stroke={tone}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      )}
      {shoulderHigher === "R" && (
        <text x={184} y={80 - LIFT} fill={c.muted} fontSize={10.5}>
          выше
        </text>
      )}
      {shoulderHigher === "L" && (
        <text x={220 - 184} y={80 - LIFT} textAnchor="end" fill={c.muted} fontSize={10.5}>
          выше
        </text>
      )}
      {adams}
    </svg>
  );
};
