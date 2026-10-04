import React from "react";

import { type ArtColors, type ArtStatus, artSvgStyle, useArtColors } from "./artColors";
import { arc, curve, fmt, round1, tail } from "./geometry";

export interface HeelInput {
  /** Угол пятки к оси голени: плюс — вальгус, минус — варус; null — не измерен. */
  deg: number | null;
  status: ArtStatus;
}

export interface HeelsProps {
  left: HeelInput;
  right: HeelInput;
}

/** Голень с ахилловым сухожилием до пятки. */
const SHIN = `${curve([
  [25, 4],
  [20, 30],
  [24, 60],
  [31, 86],
  [33, 100],
])} L47 100 ${tail([
  [47, 100],
  [49, 86],
  [56, 60],
  [60, 30],
  [55, 4],
])} Z`;

/** Пятка; поворачивается вокруг (40, 100). */
const HEEL = curve([
  [31, 96],
  [29, 112],
  [33, 126],
  [40, 131],
  [47, 126],
  [51, 112],
  [49, 96],
]);

/** Пятка сзади: ось голени — пунктир, ось пятки — цветом оценки, дуга — угол между ними. */
function heel(x: number, side: "L" | "R", input: HeelInput, c: ArtColors): React.ReactNode {
  const tone = c.status(input.status);
  const deg = input.deg ?? 0;
  // плюс поворачивает низ пятки наружу: у левой — влево, у правой — вправо
  const rot = side === "L" ? deg : -deg;
  const sideText = side === "L" ? "Л" : "П";
  const text =
    input.deg == null ? `${sideText} —` : deg < 0 ? `${sideText} вар ${fmt(-deg)}°` : `${sideText} ${fmt(deg)}°`;
  // дуга — между осью голени (90°) и осью пятки (90 + rot); в макете знак был перепутан
  const a1 = 90 + rot;
  return (
    <g transform={`translate(${x},0)`}>
      <path d={SHIN} fill={c.tissue} stroke={c.tissueLine} strokeWidth={1.1} />
      <path d="M37 64 L38 100 M43 64 L42 100" fill="none" stroke={c.tissueLine} strokeWidth={1} />
      <g transform={`rotate(${round1(rot)} 40 100)`}>
        <path d={HEEL} fill={c.statusFill(input.status)} stroke={tone} strokeWidth={1.3} />
        <line x1={40} y1={100} x2={40} y2={138} fill="none" stroke={tone} strokeWidth={1.6} strokeLinecap="round" />
      </g>
      <line x1={40} y1={34} x2={40} y2={140} fill="none" stroke={c.inkSoft} strokeWidth={1.1} strokeDasharray="3.5 3" />
      {rot !== 0 && (
        <path d={arc(40, 100, 22, Math.min(90, a1), Math.max(90, a1))} fill="none" stroke={tone} strokeWidth={1.2} />
      )}
      <line x1={12} y1={133} x2={68} y2={133} fill="none" stroke={c.tissueLine} strokeWidth={1} />
      <text x={40} y={152} textAnchor="middle" fill={tone} fontSize={12} fontWeight={600}>
        {text}
      </text>
    </g>
  );
}

const heelText = (h: HeelInput): string =>
  h.deg == null ? "нет данных" : h.deg > 0 ? `вальгус ${fmt(h.deg)}°` : h.deg < 0 ? `варус ${fmt(-h.deg)}°` : "0°";

/** Обе пятки сзади: слева левая, справа правая. */
export const Heels: React.FC<HeelsProps> = ({ left, right }) => {
  const c = useArtColors();
  return (
    <svg
      viewBox="0 0 200 160"
      role="img"
      aria-label={`Пятки сзади: слева ${heelText(left)}, справа ${heelText(right)}`}
      style={artSvgStyle}
    >
      {heel(18, "L", left, c)}
      {heel(102, "R", right, c)}
    </svg>
  );
};
