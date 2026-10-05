import React from "react";

import { type ArtColors, type ArtStatus, artSvgStyle, useArtColors } from "./artColors";
import { curve, round1, type Point } from "./geometry";

export type PostureType = "normal" | "stooped" | "round" | "roundConcave" | "flat" | "flatConcave";

export interface PostureStripProps {
  /** Выбранный тип осанки; null — все шесть без выделения. */
  selected: PostureType | null;
  /** Оценка выбранного типа: цвет рамки и позвоночника. */
  status: ArtStatus;
}

/**
 * Тип осанки как смещения нормальной фигуры: h — голова вперёд, k — грудной
 * кифоз (плюс — круглее, минус — площе) с вершиной ky и длиной sk, l —
 * поясничный лордоз (плюс — глубже: живот вперёд, ягодицы назад).
 */
interface PostureShape {
  type: PostureType;
  name: string;
  h: number;
  k: number;
  ky: number;
  sk: number;
  l: number;
}

const POSTURES: ReadonlyArray<PostureShape> = [
  { type: "normal", name: "Норма", h: 0, k: 0, ky: 78, sk: 14, l: 0 },
  { type: "stooped", name: "Сутулая", h: 6, k: 5, ky: 71, sk: 12, l: -2 },
  { type: "round", name: "Круглая", h: 7, k: 6, ky: 86, sk: 22, l: -4 },
  { type: "roundConcave", name: "Кругло-вогнутая", h: 4, k: 5, ky: 76, sk: 13, l: 6 },
  { type: "flat", name: "Плоская", h: 0, k: -4, ky: 80, sk: 16, l: -3 },
  { type: "flatConcave", name: "Плоско-вогнутая", h: 1, k: -3, ky: 80, sk: 16, l: 6 },
];

/** Ширина ячейки, пол, подпись, высота рисунка. */
const W = 120;
const FLOOR = 212;
const LABEL_Y = 234;
const HEIGHT = 244;

/** Часть тела точки контура — от неё зависит, как её сдвигает тип осанки. */
type Region = "head" | "front" | "back" | "leg";
type Mark = readonly [number, number, Region];

/**
 * Ребёнок лет шести в профиль, лицом вправо; x — от линии отвеса.
 * Контур по часовой: от подбородка вниз по груди и животу, ноги, стопа,
 * вверх по спине, затылок, лицо.
 */
const OUTLINE: ReadonlyArray<Mark> = [
  [11, 41, "head"],
  [6.5, 46, "head"],
  [7, 52, "head"],
  [11, 58, "front"],
  [19.5, 70, "front"],
  [19, 86, "front"],
  [19.5, 104, "front"],
  [17, 116, "front"],
  [13, 124, "front"],
  [13.5, 136, "leg"],
  [9.5, 158, "leg"],
  [8, 174, "leg"],
  [5.5, 196, "leg"],
  [14, 203, "leg"],
  [27, 207.5, "leg"],
  [28, 211, "leg"],
  [18, FLOOR, "leg"],
  [-5, FLOOR, "leg"],
  [-7.5, 207, "leg"],
  [-3.5, 196, "leg"],
  [-9.5, 172, "leg"],
  [-6.5, 158, "leg"],
  [-11, 142, "leg"],
  [-14, 132, "back"],
  [-15.5, 124, "back"],
  [-11.5, 115, "back"],
  [-8.5, 106, "back"],
  [-11.5, 92, "back"],
  [-13, 77, "back"],
  [-11, 62, "back"],
  [-7, 52, "head"],
  [-7.5, 44, "head"],
  [-13, 32, "head"],
  [-12, 18, "head"],
  [-1, 9, "head"],
  [10, 12, "head"],
  [14, 20, "head"],
  [14.5, 25, "head"],
  [18.5, 30.5, "head"],
  [15, 32.5, "head"],
  [16, 35.5, "head"],
  [14, 39.5, "head"],
];

/** Рука опущена вдоль тела: от плеча к кисти и обратно. */
const ARM: ReadonlyArray<Mark> = [
  [5, 59, "front"],
  [9.5, 66, "front"],
  [9.5, 82, "front"],
  [9, 96, "front"],
  [11, 112, "front"],
  [12, 126, "front"],
  [13, 135, "front"],
  [10, 142, "front"],
  [6.5, 138, "front"],
  [5, 128, "front"],
  [3, 113, "front"],
  [0.5, 97, "front"],
  [-2, 82, "front"],
  [-3, 66, "front"],
  [0, 58.5, "front"],
];

/** Позвоночник внутри тела: C1 — крестец. */
const SPINE: ReadonlyArray<Mark> = [
  [-3.5, 38, "head"],
  [-2.5, 47, "head"],
  [-5, 57, "back"],
  [-7.5, 67, "back"],
  [-8, 80, "back"],
  [-5.5, 94, "back"],
  [-2, 106, "back"],
  [-4.5, 116, "back"],
  [-8, 122, "back"],
  [-11, 132, "back"],
];

const bell = (y: number, center: number, width: number): number => Math.exp(-(((y - center) / width) ** 2));

/** Сдвиг точки по x для типа осанки. */
function shift(t: PostureShape, [x, y, region]: Mark, inner = false): Point {
  // голова и шея уходят вперёд целиком, к плечам — на нет
  let dx = t.h * Math.min(1, Math.max(0, (60 - y) / 15));
  if (region === "back") {
    // кифоз выталкивает спину назад, лордоз прогибает поясницу вперёд, ягодицы — назад
    dx += -t.k * bell(y, t.ky, t.sk) + t.l * 0.6 * bell(y, 106, 11) - t.l * 0.42 * bell(y, 127, 10);
    if (inner) dx += t.l * 0.2 * bell(y, 106, 11);
  } else if (region === "front") {
    // круглая спина — плечи вперёд, грудь западает; лордоз — живот вперёд
    dx += t.k * 0.45 * bell(y, 66, 10) - t.k * 0.3 * bell(y, 78, 10) + t.l * 0.65 * bell(y, 108, 10);
  }
  return [x + dx, y];
}

const at = (x0: number, p: Point): Point => [x0 + p[0], p[1]];

/** Замкнутый гладкий контур: кривая по точкам с повтором начала, последний лишний сегмент отрезан. */
function closedPath(points: ReadonlyArray<Point>): string {
  return `${curve([...points, points[0], points[1]]).replace(/ C[^C]*$/, "")} Z`;
}

/** Силуэт: подложка, заливка тканей, мягкая тень по краю — объём. */
const Body: React.FC<{ d: string; c: ArtColors; clip: string; blur: string }> = ({ d, c, clip, blur }) => (
  <>
    <path d={d} fill={c.surface} />
    <path d={d} fill={c.tissue} stroke={c.tissueLine} strokeWidth={1.1} strokeLinejoin="round" />
    <g clipPath={`url(#${clip})`}>
      <path d={d} fill="none" stroke={c.shade} strokeWidth={8} filter={`url(#${blur})`} />
    </g>
  </>
);

/**
 * Шесть типов осанки сбоку: ребёнок в профиль, внутри — позвоночник. Отвес
 * идёт от пола перед лодыжкой: в норме через ухо, плечо и тазобедренный
 * сустав. Выбранный тип — в рамке цвета оценки, позвоночник того же цвета; у
 * остальных пунктир — нормальные изгибы для сравнения.
 */
export const PostureStrip: React.FC<PostureStripProps> = ({ selected, status }) => {
  const c = useArtColors();
  const id = React.useId().replace(/:/g, "");
  const tone = c.status(status);
  const fill = c.statusFill(status);
  const chosen = POSTURES.find((t) => t.type === selected);
  const label = chosen ? `Шесть типов осанки, выбрана ${chosen.name.toLowerCase()}` : "Шесть типов осанки";
  const figures = POSTURES.map((t, i) => {
    const x0 = i * W + 52;
    return {
      t,
      i,
      x0,
      body: closedPath(OUTLINE.map((m) => at(x0, shift(t, m)))),
      arm: closedPath(ARM.map((m) => at(x0, shift(t, m)))),
      spine: curve(SPINE.map((m) => at(x0, shift(t, m, true)))),
      ghost: curve(SPINE.map((m) => at(x0, shift(POSTURES[0], m, true)))),
      ear: at(x0, shift(t, [1, 28.5, "head"])),
    };
  });

  return (
    <svg viewBox={`0 0 ${W * 6} ${HEIGHT}`} role="img" aria-label={label} style={artSvgStyle}>
      <defs>
        <filter id={`${id}b`} x="-30%" y="-10%" width="160%" height="120%">
          <feGaussianBlur stdDeviation={2.2} />
        </filter>
        {figures.map((f) => (
          <React.Fragment key={f.t.type}>
            <clipPath id={`${id}c${f.i}`}>
              <path d={f.body} />
            </clipPath>
            <clipPath id={`${id}a${f.i}`}>
              <path d={f.arm} />
            </clipPath>
          </React.Fragment>
        ))}
      </defs>
      {figures.map(({ t, i, x0, body, arm, spine, ghost, ear }) => {
        const on = t.type === selected;
        const spineTone = on ? tone : c.inkSoft;
        return (
          <g key={t.type}>
            {on && <rect x={i * W + 4} y={2} width={W - 8} height={HEIGHT - 4} rx={10} fill={fill} stroke={tone} strokeWidth={1} />}
            <line x1={x0 - 16} y1={FLOOR} x2={x0 + 34} y2={FLOOR} stroke={c.tissueLine} strokeWidth={1.1} />
            <Body d={body} c={c} clip={`${id}c${i}`} blur={`${id}b`} />
            {i > 0 && <path d={ghost} fill="none" stroke={c.inkSoft} strokeWidth={1.1} strokeDasharray="3 2.5" />}
            <path d={spine} fill="none" stroke={spineTone} strokeWidth={2.6} strokeLinecap="round" />
            <Body d={arm} c={c} clip={`${id}a${i}`} blur={`${id}b`} />
            <ellipse cx={round1(ear[0])} cy={ear[1]} rx={2.4} ry={3.4} fill="none" stroke={c.tissueLine} strokeWidth={1} />
            <path d={`M${round1(ear[0] + 7.5)} 24.6 q2.2 1.4 4.2 0`} fill="none" stroke={c.tissueLine} strokeWidth={1} strokeLinecap="round" />
            <line x1={x0 + 1} y1={16} x2={x0 + 1} y2={FLOOR} stroke={c.accent} strokeWidth={1} strokeDasharray="2 3" />
            <circle cx={round1(ear[0])} cy={ear[1]} r={1.5} fill={c.accent} />
            <text
              x={i * W + W / 2}
              y={LABEL_Y}
              textAnchor="middle"
              fill={on ? tone : c.ink}
              fontSize={on ? 12 : 11.5}
              fontWeight={on ? 600 : undefined}
            >
              {t.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
