import React from "react";

import { type ArtColors, type ArtStatus, artSvgStyle, useArtColors } from "./artColors";
import { along, curve, fmt, pt, round1, tail, type Point } from "./geometry";

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

// Вид сзади: левая сторона ребёнка — слева на рисунке. Середина тела — x = 110.
const MID = 110;
/** Подъём надплечья. */
const LIFT = 5;
/** Отклонение линии остистых отростков. */
const AMP = 6;
/** Низ рисунка: ягодицы уходят в прозрачность. */
const BOTTOM = 254;

/** Сторона: −1 — левая (на рисунке слева), +1 — правая. */
type Sign = -1 | 1;
const sideSign = (side: BackSide): Sign => (side === "L" ? -1 : 1);

/**
 * Контур туловища с шеей и руками одним путём (обход у всех подпутей один —
 * при слиянии нет дыр): левый край сверху вниз, затем правый снизу вверх.
 * lift — подъём надплечья по сторонам, waist — углубление талии.
 */
function torsoPath(liftL: number, liftR: number, waistL: number, waistR: number): string {
  const edge = (s: Sign, lift: number, waist: number): Point[] => {
    const x = (dx: number) => MID + s * dx;
    const up = (y: number, k = 1) => y - lift * k;
    return [
      [x(8.5), 50],
      [x(9.5), up(60, 0.3)],
      [x(22), up(68, 0.75)],
      [x(37), up(76)],
      [x(44), up(84)],
      [x(46.5), up(96, 0.8)],
      // подмышка: рука отходит от туловища
      [x(38.5), up(110, 0.4)],
      [x(36), 132],
      [x(31 - waist), 164],
      [x(33.5), 190],
      [x(37), 210],
      [x(36), 232],
      [x(33), BOTTOM],
    ];
  };
  const left = edge(-1, liftL, waistL);
  const right = edge(1, liftR, waistR);
  return `${curve(left)} L${pt(right[right.length - 1])} ${tail([...right].reverse())} Z`;
}

/** Рука от плеча до кисти; s — сторона. Подпуть того же обхода: сначала левый край вниз. */
function armPath(s: Sign, lift: number): string {
  const x = (dx: number) => MID + s * dx;
  const up = (y: number, k: number) => y - lift * k;
  const outer: Point[] = [
    [x(44), up(84, 1)],
    [x(48.5), up(100, 0.7)],
    [x(49.5), 128],
    [x(49), 152],
    [x(48), 182],
    [x(47.5), 206],
    [x(47.5), 222],
    [x(45), 232],
  ];
  const inner: Point[] = [
    [x(38), up(106, 0.4)],
    [x(39.5), 130],
    [x(40), 152],
    [x(40.5), 182],
    [x(40.5), 206],
    [x(40), 222],
    [x(42), 231],
  ];
  // левый край на рисунке — тот, у которого x меньше
  const [leftEdge, rightEdge] = s < 0 ? [outer, inner] : [inner, outer];
  return `${curve(leftEdge)} L${pt(rightEdge[rightEdge.length - 1])} ${tail([...rightEdge].reverse())} Z`;
}

/** Лопатка (Th2–Th7): медиальный край у позвоночника, нижний угол, наружный край. raise — выше и заметнее на стороне горба. */
function scapulaPath(s: Sign, dy: number, raise: number): string {
  const x = (dx: number) => round1(MID + s * dx);
  const y = (v: number) => round1(v + dy - raise);
  return `M${x(14.5)} ${y(91)} C${x(13.5)} ${y(104)} ${x(14.5)} ${y(118)} ${x(19)} ${y(131)} C${x(21)} ${y(134)} ${x(23.5)} ${y(
    132,
  )} ${x(25)} ${y(128)} C${x(29)} ${y(118)} ${x(33)} ${y(108)} ${x(35)} ${y(98)} C${x(35.5)} ${y(94)} ${x(33)} ${y(92)} ${x(
    29,
  )} ${y(91)} C${x(24)} ${y(90)} ${x(19)} ${y(90)} ${x(14.5)} ${y(91)} Z`;
}

/** Спина в наклоне вперёд (тест Адамса), вид со стороны головы: горб на стороне hump поднимает купол. */
function bentPath(x0: number, y0: number, hump: Sign | 0): string {
  const hi = (s: Sign) => (hump === s ? 9 : hump === 0 ? 0 : -2);
  const pts: Point[] = [
    [x0 + 8, y0 + 70],
    [x0 + 22, y0 + 50 - hi(-1) * 0.4],
    [x0 + 50, y0 + 34 - hi(-1)],
    [x0 + 86, y0 + 28],
    [x0 + 122, y0 + 34 - hi(1)],
    [x0 + 150, y0 + 50 - hi(1) * 0.4],
    [x0 + 164, y0 + 70],
  ];
  return `${curve(pts)} Z`;
}

/** Мягкие ткани: подложка, заливка, мягкая тень по краю — объём. */
const Tissue: React.FC<{ d: string; c: ArtColors; clip: string; blur: string; width?: number }> = ({ d, c, clip, blur, width = 10 }) => (
  <>
    <path d={d} fill="none" stroke={c.tissueLine} strokeWidth={2.2} strokeLinejoin="round" />
    <path d={d} fill={c.surface} />
    <path d={d} fill={c.tissue} />
    <g clipPath={`url(#${clip})`}>
      <path d={d} fill="none" stroke={c.shade} strokeWidth={width} filter={`url(#${blur})`} />
    </g>
  </>
);

const SHOULDER_TEXT: Record<BackSide, string> = { L: "левое надплечье выше", R: "правое надплечье выше" };
const CURVE_TEXT: Record<BackSide, string> = { L: "дуга позвоночника влево", R: "дуга позвоночника вправо" };
const HUMP_TEXT: Record<BackSide, string> = { L: "горб слева", R: "горб справа" };

/** Врезка теста Адамса: левый верхний угол и размер. */
const IX = 12;
const IY = 270;
const IW = 196;
const IH = 92;

/**
 * Спина сзади: надплечья, линия остистых отростков с отвесом от C7, лопатки,
 * треугольники талии, рёберный горб цветом оценки; при showAdams — врезка
 * «тест Адамса» со сколиометром.
 */
export const BackView: React.FC<BackViewProps> = ({ shoulderHigher, curve: curveSide, humpSide, atr, status, showAdams }) => {
  const c = useArtColors();
  const id = React.useId().replace(/:/g, "");
  const tone = c.status(status);
  const liftL = shoulderHigher === "L" ? LIFT : 0;
  const liftR = shoulderHigher === "R" ? LIFT : 0;
  // талия глубже на вогнутой стороне поясничной дуги — той же, что выпуклость грудной
  const waistL = curveSide === "L" ? 3 : 0;
  const waistR = curveSide === "R" ? 3 : 0;
  const amp = curveSide === "R" ? AMP : curveSide === "L" ? -AMP : 0;
  const body = `${torsoPath(liftL, liftR, waistL, waistR)} ${armPath(-1, liftL)} ${armPath(1, liftR)}`;

  // линия остистых отростков C7 — L5: S-образно при дуге
  const spine: Point[] = Array.from({ length: 9 }, (_, i) => {
    const u = i / 8;
    return [MID + amp * Math.sin(2 * Math.PI * u), 70 + 146 * u];
  });
  const processes = along(spine, 17);
  const hump = humpSide ? sideSign(humpSide) : 0;
  const shoulderY = (s: Sign) => 80 - (s < 0 ? liftL : liftR);

  const shoulderText = shoulderHigher ? SHOULDER_TEXT[shoulderHigher] : "надплечья на одном уровне";
  const curveText = curveSide ? CURVE_TEXT[curveSide] : "позвоночник без дуги";
  const humpText = humpSide ? HUMP_TEXT[humpSide] : "без горба";
  const atrText = atr != null ? `ротация ${fmt(Math.abs(atr))}°` : "угол не измерен";
  const adamsText = showAdams ? `; наклон вперёд: ${humpText}, ${atrText}` : "";
  const label = `Спина сзади: ${shoulderText}, ${curveText}${adamsText}`;

  let adams: React.ReactNode = null;
  if (showAdams) {
    const bx = IX + 12;
    const by = IY + 14;
    const bent = bentPath(bx, by, hump);
    // сколиометр лежит на спине поперёк позвоночника и опускается к стороне без горба
    const tilt = atr != null && hump ? -hump * Math.abs(atr) : 0;
    const sx = bx + 86 + hump * 8;
    const sy = by + 24 - (hump ? 3.5 : 0);
    const bubble = atr != null ? Math.max(-22, Math.min(22, (hump || 1) * Math.abs(atr) * 2.4)) : 0;
    adams = (
      <>
        <rect x={IX} y={IY} width={IW} height={IH} rx={10} fill={c.sunk} stroke={c.rule} />
        <clipPath id={`${id}a`}>
          <path d={bent} />
        </clipPath>
        {hump !== 0 && (
          <radialGradient id={`${id}q`} cx={round1(bx + 86 + hump * 40)} cy={by + 30} r={34} gradientUnits="userSpaceOnUse">
            <stop offset={0} stopColor={tone} stopOpacity={0.4} />
            <stop offset={1} stopColor={tone} stopOpacity={0} />
          </radialGradient>
        )}
        <Tissue d={bent} c={c} clip={`${id}a`} blur={`${id}b`} width={12} />
        {hump !== 0 && (
          <g clipPath={`url(#${id}a)`}>
            <ellipse cx={round1(bx + 86 + hump * 40)} cy={by + 30} rx={34} ry={22} fill={`url(#${id}q)`} />
          </g>
        )}
        <line x1={round1(sx - 44)} y1={round1(sy)} x2={round1(sx + 44)} y2={round1(sy)} stroke={c.inkSoft} strokeWidth={1} strokeDasharray="3 3" />
        <g transform={`rotate(${round1(tilt)} ${round1(sx)} ${round1(sy)})`}>
          <rect x={round1(sx - 34)} y={round1(sy - 7)} width={68} height={12} rx={6} fill={c.surface} stroke={tone} strokeWidth={1.3} />
          <line x1={round1(sx - 14)} y1={round1(sy - 1)} x2={round1(sx + 14)} y2={round1(sy - 1)} stroke={c.inkSoft} strokeWidth={0.8} />
          <circle cx={round1(sx + bubble * 0.5)} cy={round1(sy - 1)} r={3.2} fill={tone} />
          <path d={`M${round1(sx - 4)} ${round1(sy + 5)} L${round1(sx)} ${round1(sy + 1.5)} L${round1(sx + 4)} ${round1(sy + 5)}`} fill="none" stroke={tone} strokeWidth={1} />
        </g>
        <text x={IX + 10} y={IY + 16} fill={c.muted} fontSize={10.5}>
          тест Адамса
        </text>
        <text x={IX + IW - 10} y={IY + 16} textAnchor="end" fill={hump ? tone : c.muted} fontSize={10.5} fontWeight={hump ? 600 : undefined}>
          {humpText}
        </text>
        <text
          x={round1(sx + (hump || 1) * 46)}
          y={round1(sy + 4)}
          textAnchor={hump < 0 ? "end" : "start"}
          fill={atr != null ? tone : c.muted}
          fontSize={atr != null ? 13 : 10.5}
          fontWeight={atr != null ? 700 : undefined}
        >
          {atr != null ? `${fmt(Math.abs(atr))}°` : "угол не измерен"}
        </text>
      </>
    );
  }

  const hy = 30;
  return (
    <svg viewBox={showAdams ? `0 0 220 ${IY + IH + 6}` : `0 0 220 ${BOTTOM + 6}`} role="img" aria-label={label} style={artSvgStyle}>
      <defs>
        <linearGradient id={`${id}g`} x1={0} y1={BOTTOM - 26} x2={0} y2={BOTTOM} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor="#fff" stopOpacity={1} />
          <stop offset={1} stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x={0} y={0} width={220} height={BOTTOM + 6}>
          <rect x={0} y={0} width={220} height={BOTTOM + 6} fill={`url(#${id}g)`} />
        </mask>
        <clipPath id={`${id}c`}>
          <path d={body} />
        </clipPath>
        <clipPath id={`${id}h`}>
          <ellipse cx={MID} cy={hy} rx={17.5} ry={21} />
        </clipPath>
        <filter id={`${id}b`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation={2.6} />
        </filter>
        {hump !== 0 && (
          <radialGradient id={`${id}r`} cx={MID + hump * 25} cy={128} r={27} gradientUnits="userSpaceOnUse">
            <stop offset={0} stopColor={tone} stopOpacity={0.42} />
            <stop offset={1} stopColor={tone} stopOpacity={0} />
          </radialGradient>
        )}
      </defs>
      <g mask={`url(#${id}m)`}>
        <Tissue d={body} c={c} clip={`${id}c`} blur={`${id}b`} />
        {/* треугольники талии и ягодичная складка */}
        <path d={`M${MID} 222 L${MID} ${BOTTOM}`} stroke={c.tissueLine} strokeWidth={1.1} />
        {hump !== 0 && <ellipse cx={MID + hump * 25} cy={128} rx={22} ry={30} fill={`url(#${id}r)`} />}
        {([-1, 1] as const).map((s) => {
          const onHump = hump === s;
          const d = scapulaPath(s, -(s < 0 ? liftL : liftR) * 0.5, onHump ? 3 : 0);
          return (
            <path
              key={s}
              d={d}
              fill={c.shade}
              fillOpacity={0.5}
              stroke={c.tissueLine}
              strokeWidth={onHump ? 1.3 : 1}
              strokeLinejoin="round"
            />
          );
        })}
        {hump !== 0 && (
          <path
            d={`M${MID + hump * 27} 134 C${MID + hump * 36} 138 ${MID + hump * 37} 150 ${MID + hump * 30} 160`}
            fill="none"
            stroke={tone}
            strokeWidth={1.7}
            strokeLinecap="round"
          />
        )}
        <line x1={MID} y1={66} x2={MID} y2={BOTTOM - 2} stroke={c.accent} strokeWidth={1} strokeDasharray="2 3" />
        <path d={curve(spine)} fill="none" stroke={c.tissueLine} strokeWidth={1.2} />
        {processes.map((q, i) => (
          <circle key={i} cx={round1(q.p[0])} cy={round1(q.p[1])} r={i < 12 ? 1.9 : 2.2} fill={amp ? tone : c.inkSoft} />
        ))}
        <line x1={58} y1={198} x2={162} y2={198} stroke={c.inkSoft} strokeWidth={1.1} strokeDasharray="3.5 3" />
      </g>
      {/* голова и уши поверх шеи */}
      <ellipse cx={MID - 17.6} cy={hy + 3} rx={3} ry={5.5} fill={c.surface} stroke={c.tissueLine} strokeWidth={1} />
      <ellipse cx={MID + 17.6} cy={hy + 3} rx={3} ry={5.5} fill={c.surface} stroke={c.tissueLine} strokeWidth={1} />
      <ellipse cx={MID} cy={hy} rx={17.5} ry={21} fill={c.surface} />
      <ellipse cx={MID} cy={hy} rx={17.5} ry={21} fill={c.tissue} stroke={c.tissueLine} strokeWidth={1.1} />
      <g clipPath={`url(#${id}h)`}>
        <ellipse cx={MID} cy={hy} rx={17.5} ry={21} fill="none" stroke={c.shade} strokeWidth={9} filter={`url(#${id}b)`} />
      </g>
      <line
        x1={MID - 52}
        y1={shoulderY(-1)}
        x2={MID + 52}
        y2={shoulderY(1)}
        stroke={c.inkSoft}
        strokeWidth={1.1}
        strokeDasharray="3.5 3"
      />
      {shoulderHigher && (
        <text
          x={shoulderHigher === "R" ? MID + 56 : MID - 56}
          y={80 - LIFT - 4}
          textAnchor={shoulderHigher === "R" ? "start" : "end"}
          fill={tone}
          fontSize={10.5}
          fontWeight={600}
        >
          выше
        </text>
      )}
      {adams}
    </svg>
  );
};
