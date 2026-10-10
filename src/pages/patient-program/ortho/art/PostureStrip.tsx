import React from "react";

import { type ArtColors, type ArtStatus, artSvgStyle, useArtColors } from "./artColors";
import { along, curve, pt, round1, type AlongPoint, type Point } from "./geometry";

export type PostureType = "normal" | "stooped" | "round" | "roundConcave" | "flat" | "flatConcave";

export interface PostureStripProps {
  /** Выбранный тип осанки; null — все шесть без выделения. */
  selected: PostureType | null;
  /** Оценка выбранного типа: цвет рамки и позвонков. */
  status: ArtStatus;
}

interface PostureShape {
  type: PostureType;
  name: string;
  /** Голова вперёд. */
  h: number;
  /** Шейный лордоз. */
  c: number;
  /** Грудной кифоз: глубина и высота вершины. */
  k: number;
  ky: number;
  /** Поясничный лордоз. */
  l: number;
}

const POSTURES: ReadonlyArray<PostureShape> = [
  { type: "normal", name: "Норма", h: 0, c: 5, k: 9, l: 7, ky: 96 },
  { type: "stooped", name: "Сутулая", h: 9, c: 2, k: 15, l: 3, ky: 84 },
  { type: "round", name: "Круглая", h: 10, c: 1, k: 14, l: -3, ky: 106 },
  { type: "roundConcave", name: "Кругло-вогнутая", h: 5, c: 5, k: 14, l: 13, ky: 94 },
  { type: "flat", name: "Плоская", h: 0, c: 2, k: 3, l: 2, ky: 96 },
  { type: "flatConcave", name: "Плоско-вогнутая", h: 2, c: 3, k: 3, l: 13, ky: 96 },
];

/** Ширина ячейки одного типа. */
const W = 120;

/** Опорные точки столба сверху вниз; лицо смотрит вправо. */
const colPts = (x0: number, t: PostureShape): Point[] => [
  [x0 + t.h + 2, 38],
  [x0 + t.h * 0.55 + t.c, 56],
  [x0 + t.h * 0.2 - t.k, t.ky],
  [x0 + t.l, 152],
  [x0 - 2, 186],
];

/**
 * Позвонок в профиль по отделу: глубина и высота тела, вынос и наклон
 * остистого отростка (градусы вниз от горизонтали), ширина его основания и
 * конца. Шейные мелкие с короткими отростками (C7 — выступающий), грудные с
 * длинными, круто вниз, поясничные крупные с широким «топориком».
 */
interface VertebraForm {
  depth: number;
  height: number;
  spine: number;
  tilt: number;
  base: number;
  tip: number;
}

function formOf(i: number): VertebraForm {
  if (i < 6) return { depth: 5.8, height: 3.1, spine: 3.4, tilt: 20, base: 1.5, tip: 0.9 };
  if (i === 6) return { depth: 6.2, height: 3.4, spine: 5.6, tilt: 24, base: 1.7, tip: 1.1 };
  if (i < 19) return { depth: 7.2 + (i - 7) * 0.17, height: 4.2, spine: 6.6, tilt: 48, base: 1.9, tip: 0.9 };
  return { depth: 10.6, height: 5.2, spine: 5.2, tilt: 14, base: 3.4, tip: 2.8 };
}

/** Точка в рамке позвонка: u — вдоль столба вниз, v — вперёд (к телу). */
const frame =
  (q: AlongPoint) =>
  (u: number, v: number): string => {
    const ca = Math.cos(q.a);
    const sa = Math.sin(q.a);
    // вдоль столба (ca, sa), вперёд (sa, -ca)
    return pt([q.p[0] + ca * u + sa * v, q.p[1] + sa * u - ca * v]);
  };

/** Тело позвонка: замыкательные пластинки и вогнутая передняя стенка. */
function bodyPath(q: AlongPoint, f: VertebraForm): string {
  const at = frame(q);
  const h = f.height / 2;
  const v0 = 1.5;
  const v1 = v0 + f.depth;
  const r = 0.9;
  return [
    `M${at(-h, v0 + r)}`,
    `L${at(-h, v1 - r)}`,
    `Q${at(-h, v1)} ${at(-h + r, v1)}`,
    // передняя стенка слегка вогнута — «талия» тела позвонка
    `Q${at(0, v1 - 0.7)} ${at(h - r, v1)}`,
    `Q${at(h, v1)} ${at(h, v1 - r)}`,
    `L${at(h, v0 + r)}`,
    `Q${at(h, v0)} ${at(h - r, v0)}`,
    `Q${at(0, v0 + 0.35)} ${at(-h + r, v0)}`,
    `Q${at(-h, v0)} ${at(-h, v0 + r)}`,
    "Z",
  ].join(" ");
}

/** Дужка: ножка от тела назад, верхний суставной отросток и остистый отросток. */
function archPath(q: AlongPoint, f: VertebraForm): string {
  const at = frame(q);
  const h = f.height / 2;
  const tilt = (f.tilt * Math.PI) / 180;
  // от дужки (v = −2) назад и вниз
  const lamina = -2;
  const tipU = Math.sin(tilt) * f.spine;
  const tipV = lamina - Math.cos(tilt) * f.spine;
  const px = Math.cos(tilt);
  const py = Math.sin(tilt);
  return [
    `M${at(-h * 0.42, 1.6)}`,
    `L${at(-h * 0.42, -0.6)}`,
    // верхний суставной отросток торчит вверх
    `L${at(-h - 0.7, -1.2)}`,
    `L${at(-h * 0.2, lamina)}`,
    `L${at(-f.base / 2, lamina - 0.4)}`,
    `L${at(tipU - (f.tip / 2) * px, tipV + (f.tip / 2) * py)}`,
    `L${at(tipU + (f.tip / 2) * px, tipV - (f.tip / 2) * py)}`,
    `L${at(f.base / 2, lamina)}`,
    // нижний суставной отросток — вниз к следующему позвонку
    `L${at(h + 0.6, -1.4)}`,
    `L${at(h * 0.42, -0.4)}`,
    `L${at(h * 0.42, 1.6)}`,
    "Z",
  ].join(" ");
}

/** Межпозвонковый диск между двумя соседними телами. */
function discPath(a: AlongPoint, b: AlongPoint, fa: VertebraForm, fb: VertebraForm): string {
  const atA = frame(a);
  const atB = frame(b);
  const v0 = 1.7;
  return `M${atA(fa.height / 2, v0)} L${atA(fa.height / 2, v0 + fa.depth - 0.2)} L${atB(-fb.height / 2, v0 + fb.depth - 0.2)} L${atB(
    -fb.height / 2,
    v0,
  )} Z`;
}

/** Голова в профиль: свод, лоб, нос, губы, подбородок; ухо — начало отвеса. */
function headPath(ex: number, ey: number): string {
  const p = (dx: number, dy: number): Point => [ex + dx, ey + dy];
  const outline: Point[] = [
    p(-7, 9),
    p(-14, 3),
    p(-13, -10.5),
    p(-2, -19.5),
    p(9, -16.5),
    p(13, -8.5),
    p(13.5, -3.5),
    p(17.5, 2),
    p(14, 4),
    p(15, 7),
    p(13, 11),
    p(10, 12.5),
    p(1, 12.5),
  ];
  return `${curve([...outline, outline[0], outline[1]]).replace(/ C[^C]*$/, "")} Z`;
}

/** Позвоночный столб: диски, тела, дужки с отростками, крестец с копчиком. */
function column(x0: number, t: PostureShape, tone: string | null, fill: string | null, c: ArtColors): React.ReactNode {
  const pts = colPts(x0, t);
  const v = along(pts, 24);
  const bodyFill = fill ?? c.bone;
  const line = tone ?? c.ink;
  const forms = v.map((_, i) => formOf(i));

  // крестец продолжает последний позвонок: пять сросшихся сегментов и копчик
  const last = v[v.length - 1];
  const ca = Math.cos(last.a);
  const sa = Math.sin(last.a);
  const fx = sa;
  const fy = -ca;
  const bx = -sa;
  const by = ca;
  const base: Point = [last.p[0] + ca * 4.8, last.p[1] + sa * 4.8];
  const a1: Point = [base[0] + fx * 12.5, base[1] + fy * 12.5];
  const a2: Point = [base[0] + bx * 2.4, base[1] + by * 2.4];
  const tip: Point = [base[0] + ca * 21 + bx * 6, base[1] + sa * 21 + by * 6];
  const toTip: Point = [tip[0] + bx * 2.5 - ca * 4, tip[1] + by * 2.5 - sa * 4];
  const fromTip: Point = [a1[0] + ca * 13, a1[1] + sa * 13];
  const sacrum = `M${pt(a1)} L${pt(a2)} Q${pt(toTip)} ${pt(tip)} Q${pt(fromTip)} ${pt(a1)} Z`;
  const ridges = [0.22, 0.42, 0.6, 0.76].map((s) => {
    const from: Point = [a2[0] + (tip[0] - a2[0]) * s, a2[1] + (tip[1] - a2[1]) * s];
    const to: Point = [a1[0] + (fromTip[0] - a1[0]) * s * 1.05, a1[1] + (fromTip[1] - a1[1]) * s * 1.05];
    const mid: Point = [from[0] * 0.45 + to[0] * 0.55, from[1] * 0.45 + to[1] * 0.55];
    return `M${pt(from)} L${pt(mid)}`;
  });
  // копчик — сужающийся хвостик из трёх сегментов по направлению крестца
  const dirX = (tip[0] - a2[0]) / Math.hypot(tip[0] - a2[0], tip[1] - a2[1]);
  const dirY = (tip[1] - a2[1]) / Math.hypot(tip[0] - a2[0], tip[1] - a2[1]);
  const coccyxEnd: Point = [tip[0] + dirX * 6.5, tip[1] + dirY * 6.5];
  const side = (p: Point, w: number, sign: number): Point => [p[0] - dirY * w * sign, p[1] + dirX * w * sign];
  const coccyx = `M${pt(side(tip, 1.4, 1))} L${pt(side(coccyxEnd, 0.5, 1))} Q${pt([coccyxEnd[0] + dirX * 0.9, coccyxEnd[1] + dirY * 0.9])} ${pt(
    side(coccyxEnd, 0.5, -1),
  )} L${pt(side(tip, 1.4, -1))} Z`;
  const coccyxJoints = [0.36, 0.68].map((k) => {
    const p: Point = [tip[0] + dirX * 6.5 * k, tip[1] + dirY * 6.5 * k];
    const w = 1.4 - 0.9 * k;
    return `M${pt(side(p, w, 1))} L${pt(side(p, w, -1))}`;
  });

  return (
    <>
      <path d={curve(pts)} fill="none" stroke={tone ?? c.inkSoft} strokeWidth={0.9} />
      {v.slice(0, -1).map((q, i) => (
        <path key={`d${i}`} d={discPath(q, v[i + 1], forms[i], forms[i + 1])} fill={c.tissue} stroke="none" />
      ))}
      {v.map((q, i) => (
        <React.Fragment key={i}>
          <path d={archPath(q, forms[i])} fill={bodyFill} stroke={line} strokeWidth={0.75} strokeLinejoin="round" />
          <path d={bodyPath(q, forms[i])} fill={bodyFill} stroke={line} strokeWidth={0.85} strokeLinejoin="round" />
        </React.Fragment>
      ))}
      <path d={sacrum} fill={bodyFill} stroke={line} strokeWidth={0.85} strokeLinejoin="round" />
      <path d={ridges.join(" ")} fill="none" stroke={line} strokeWidth={0.6} strokeLinecap="round" />
      <path d={coccyx} fill={bodyFill} stroke={line} strokeWidth={0.7} strokeLinejoin="round" />
      <path d={coccyxJoints.join(" ")} fill="none" stroke={line} strokeWidth={0.5} />
    </>
  );
}

/**
 * Шесть типов осанки сбоку: позвоночный столб с телами позвонков, дисками и
 * отростками. Выбранный — в рамке цвета оценки и с цветными позвонками; у
 * всех, кроме нормы, — пунктир нормальных изгибов для сравнения; от уха —
 * отвес.
 */
export const PostureStrip: React.FC<PostureStripProps> = ({ selected, status }) => {
  const c = useArtColors();
  const tone = c.status(status);
  const fill = c.statusFill(status);
  const chosen = POSTURES.find((t) => t.type === selected);
  const label = chosen ? `Шесть типов осанки, выбрана ${chosen.name.toLowerCase()}` : "Шесть типов осанки";
  const ghost = (x0: number) => curve(colPts(x0, POSTURES[0]));

  return (
    <svg viewBox={`0 0 ${W * 6} 244`} role="img" aria-label={label} style={artSvgStyle}>
      {POSTURES.map((t, i) => {
        const x0 = i * W + 52;
        const on = t.type === selected;
        const ear: Point = [x0 + t.h + 7, 23];
        return (
          <g key={t.type}>
            {on && <rect x={i * W + 4} y={2} width={W - 8} height={238} rx={10} fill={fill} stroke={tone} strokeWidth={1} />}
            {i > 0 && <path d={ghost(x0)} fill="none" stroke={c.inkSoft} strokeWidth={1.1} strokeDasharray="3.5 3" />}
            <path d={headPath(ear[0], ear[1])} fill={c.surface} />
            <path d={headPath(ear[0], ear[1])} fill={c.tissue} stroke={c.tissueLine} strokeWidth={1} strokeLinejoin="round" />
            <path d={`M${round1(ear[0] + 6.5)} 19.6 q2 1.3 3.8 0`} fill="none" stroke={c.tissueLine} strokeWidth={0.9} strokeLinecap="round" />
            <ellipse cx={round1(ear[0])} cy={ear[1]} rx={2.3} ry={3.2} fill="none" stroke={c.tissueLine} strokeWidth={0.9} />
            <line
              x1={round1(ear[0])}
              y1={round1(ear[1])}
              x2={round1(ear[0])}
              y2={204}
              fill="none"
              stroke={c.accent}
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <circle cx={round1(ear[0])} cy={ear[1]} r={1.5} fill={c.accent} />
            {column(x0, t, on ? tone : null, on ? fill : null, c)}
            <text
              x={i * W + W / 2}
              y={232}
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
