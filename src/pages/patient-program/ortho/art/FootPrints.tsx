import React from "react";

import { type ArtColors, type ArtStatus, artSvgStyle, useArtColors } from "./artColors";
import { fmt, type Point } from "./geometry";

export type ArchType = "high" | "normal" | "flattened" | "flat";

export interface FootInput {
  /** Свод по отпечатку; null — только контур стопы. */
  arch: ArchType | null;
  status: ArtStatus;
  /** Индекс Чижина — подпись под стопой. */
  index?: number | null;
}

export interface FootPrintsProps {
  left: FootInput;
  right: FootInput;
}

/** Край отпечатка в середине стопы: чем ниже свод, тем ближе к внутреннему краю (20). */
const ARCH_EDGE: Record<ArchType, number> = { high: 66, normal: 55, flattened: 42, flat: 28 };

const ARCH_TEXT: Record<ArchType, string> = {
  high: "высокий свод",
  normal: "нормальный свод",
  flattened: "свод уплощён",
  flat: "плоская стопа",
};

/** Правая стопа, внутренний край слева; a — край отпечатка в середине стопы. */
const soleD = (a: number): string =>
  `M50 236C34 236 26 222 27 204C30 175 ${a} 165 ${a} 140C${a} 115 20 105 20 78C20 58 40 50 55 52C70 54 84 66 82 86C80 120 76 170 73 204C72 224 62 236 50 236Z`;

/** Пальцы: cx, cy, rx, ry. */
const TOES: ReadonlyArray<readonly [number, number, number, number]> = [
  [30, 30, 10.5, 13.5],
  [50, 26, 7, 9],
  [63, 32, 6, 8],
  [73, 40, 5.5, 7],
  [81, 50, 5, 6],
];

/** Головки плюсневых костей — кольца давления под пальцами. */
const BALLS: ReadonlyArray<Point> = [
  [30, 82],
  [43, 77],
  [55, 77],
  [66, 81],
  [76, 87],
];

/** Стопа как на подоскопе: тонкий контур стопы, заливка отпечатка, размер перешейка. */
function foot(id: string, x: number, mirror: boolean, input: FootInput, c: ArtColors): React.ReactNode {
  const transform = mirror ? `translate(${x + 100},6) scale(-1,1)` : `translate(${x},6)`;
  if (input.arch == null) {
    return (
      <g transform={transform}>
        <path d={soleD(20)} fill="none" stroke={c.inkSoft} strokeWidth={1.1} />
        {TOES.map(([cx, cy, rx, ry]) => (
          <ellipse key={cx} cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={c.inkSoft} strokeWidth={1} />
        ))}
      </g>
    );
  }
  const a = ARCH_EDGE[input.arch];
  const tone = c.status(input.status);
  const fill = c.statusFill(input.status);
  return (
    <>
      <defs>
        <clipPath id={`${id}c`}>
          <path d={soleD(a)} />
        </clipPath>
        <radialGradient id={`${id}h`} cx={50} cy={212} r={30} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor={tone} stopOpacity={0.55} />
          <stop offset={1} stopColor={tone} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${id}f`} cx={48} cy={78} r={36} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor={tone} stopOpacity={0.48} />
          <stop offset={1} stopColor={tone} stopOpacity={0} />
        </radialGradient>
      </defs>
      <g transform={transform}>
        <path d={soleD(20)} fill="none" stroke={c.inkSoft} strokeWidth={1.1} />
        <path d={soleD(a)} fill={fill} stroke={tone} strokeWidth={1.1} />
        <g clipPath={`url(#${id}c)`}>
          <rect x={0} y={40} width={100} height={200} fill={`url(#${id}h)`} />
          <rect x={0} y={40} width={100} height={200} fill={`url(#${id}f)`} />
          <ellipse cx={50} cy={214} rx={15} ry={17} fill="none" stroke={tone} strokeOpacity={0.45} strokeWidth={0.8} />
          <ellipse cx={50} cy={216} rx={8} ry={9} fill="none" stroke={tone} strokeOpacity={0.6} strokeWidth={0.8} />
          {BALLS.map(([mx, my]) => (
            <circle key={mx} cx={mx} cy={my} r={5.5} fill="none" stroke={tone} strokeOpacity={0.5} strokeWidth={0.8} />
          ))}
        </g>
        {TOES.map(([cx, cy, rx, ry]) => (
          <ellipse key={cx} cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} stroke={tone} strokeWidth={1} />
        ))}
        <path d={`M20 140 L${a} 140`} fill="none" stroke={c.accent} strokeWidth={1} strokeDasharray="2 2" />
        <path d={`M${a} 140 L78 140`} fill="none" stroke={c.accent} strokeWidth={1} />
        <path d={`M78 135 v10 M${a} 135 v10 M20 135 v10`} fill="none" stroke={c.accent} strokeWidth={1} />
      </g>
    </>
  );
}

const footText = (f: FootInput): string => (f.arch ? ARCH_TEXT[f.arch] : "нет данных");

/** Отпечатки обеих стоп стоя; левая — зеркально. Подписи сторон и индекса — под стопами. */
export const FootPrints: React.FC<FootPrintsProps> = ({ left, right }) => {
  const c = useArtColors();
  const id = React.useId().replace(/:/g, "");
  const label =
    left.arch === right.arch
      ? `Отпечатки стоп: ${footText(left)} с обеих сторон`
      : `Отпечатки стоп: левая — ${footText(left)}, правая — ${footText(right)}`;
  const caption = (x: number, side: string, f: FootInput) => (
    <>
      <text x={x} y={262} textAnchor="middle" fill={c.muted} fontSize={10.5}>
        {side}
      </text>
      {f.index != null && (
        <text x={x} y={273} textAnchor="middle" fill={c.muted} fontSize={10.5}>
          индекс{" "}
          <tspan fill={c.ink} fontWeight={500}>
            {fmt(f.index)}
          </tspan>
        </text>
      )}
    </>
  );

  return (
    <svg viewBox="0 0 236 276" role="img" aria-label={label} style={artSvgStyle}>
      {foot(`${id}L`, 8, true, left, c)}
      {foot(`${id}R`, 126, false, right, c)}
      {caption(58, "Левая", left)}
      {caption(176, "Правая", right)}
    </svg>
  );
};
