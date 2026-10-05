import React from "react";

import { type ArtColors, type ArtStatus, artSvgStyle, useArtColors } from "./artColors";
import { along, curve, pt, round1, tail, type Point } from "./geometry";

export type PostureType = "normal" | "stooped" | "round" | "roundConcave" | "flat" | "flatConcave";

export interface PostureStripProps {
  /** Выбранный тип осанки; null — все шесть без выделения. */
  selected: PostureType | null;
  /** Оценка выбранного типа: цвет рамки и позвоночника. */
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

/** Ширина ячейки одного типа, низ силуэта (уходит в прозрачность), подпись. */
const W = 120;
const BOTTOM = 246;
const LABEL_Y = 264;
const HEIGHT = 274;

/** Позвоночник сверху вниз (C1 — S1); лицо смотрит вправо, спина — влево. */
const spinePts = (x0: number, t: PostureShape): Point[] => [
  [x0 + t.h + 3, 46],
  [x0 + t.h * 0.55 + t.c, 64],
  [x0 + t.h * 0.2 - t.k, t.ky + 8],
  [x0 + t.l, 162],
  [x0 - 2, 194],
];

/** Значение по доле длины позвоночника: кусочно-линейно по опорным [доля, значение]. */
const lerp = (rows: ReadonlyArray<readonly [number, number]>, u: number): number => {
  for (let i = 1; i < rows.length; i++) {
    const [u0, v0] = rows[i - 1];
    const [u1, v1] = rows[i];
    if (u <= u1) return v0 + ((v1 - v0) * (u - u0)) / (u1 - u0 || 1);
  }
  return rows[rows.length - 1][1];
};

/** Толщина тела за позвоночником: грудной отдел у самой спины, поясничный — глубже, под мышцами. */
const BACK: ReadonlyArray<readonly [number, number]> = [
  [0, 6],
  [0.12, 7],
  [0.26, 9],
  [0.5, 9.5],
  [0.7, 13.5],
  [0.88, 13],
  [1, 10],
];
/** Толщина тела перед позвоночником: горло, грудь, талия, живот. */
const FRONT: ReadonlyArray<readonly [number, number]> = [
  [0, 10],
  [0.1, 12],
  [0.22, 25],
  [0.36, 30],
  [0.5, 27],
  [0.64, 20.5],
  [0.8, 20],
  [0.92, 20.5],
  [1, 21.5],
];

/** Силуэт ребёнка в профиль вокруг позвоночника: от шеи до бёдер. */
function bodyPath(spine: ReadonlyArray<Point>, t: PostureShape): string {
  const samples = along(spine, 36);
  // при поясничном лордозе живот выдаётся вперёд
  const belly = Math.max(0, t.l) * 0.45;
  const back: Point[] = [];
  const front: Point[] = [];
  samples.forEach((s, i) => {
    const u = (i + 0.5) / samples.length;
    const nx = -Math.sin(s.a);
    const ny = Math.cos(s.a);
    const b = lerp(BACK, u);
    const f = lerp(FRONT, u) + (u > 0.68 && u < 0.95 ? belly * Math.sin(((u - 0.68) / 0.27) * Math.PI) : 0);
    back.push([s.p[0] + nx * b, s.p[1] + ny * b]);
    front.push([s.p[0] - nx * f, s.p[1] - ny * f]);
  });
  // шея уходит под голову, чтобы срез не торчал из-под подбородка
  front.unshift([spine[0][0] + 10, 34]);
  back.unshift([spine[0][0] - 6, 34]);
  const s1 = spine[spine.length - 1];
  // ягодица и задняя поверхность бедра; спереди — пах и бедро
  back.push([s1[0] - 13, 206], [s1[0] - 13.5, 216], [s1[0] - 10, 228], [s1[0] - 8.5, BOTTOM]);
  front.push([s1[0] + 23, 206], [s1[0] + 21, 224], [s1[0] + 19.5, BOTTOM]);
  return `${curve(front)} L${pt(back[back.length - 1])} ${tail([...back].reverse())} Z`;
}

/** Голова в профиль: центр, ухо (от него отвес). */
const headOf = (spine: ReadonlyArray<Point>): { cx: number; cy: number; ear: Point } => {
  const cx = spine[0][0] + 8;
  const cy = 28;
  return { cx, cy, ear: [cx - 3, cy + 3] };
};

/** Силуэт: подложка, заливка тканей, мягкая тень по краю — объём. */
const Body: React.FC<{ d: string; c: ArtColors; clip: string; blur: string }> = ({ d, c, clip, blur }) => (
  <>
    <path d={d} fill={c.surface} />
    <path d={d} fill={c.tissue} stroke={c.tissueLine} strokeWidth={1.1} strokeLinejoin="round" />
    <g clipPath={`url(#${clip})`}>
      <path d={d} fill="none" stroke={c.shade} strokeWidth={9} filter={`url(#${blur})`} />
    </g>
  </>
);

/** Тела позвонков вдоль изгиба: шейные мельче, поясничные крупнее. */
function vertebrae(spine: ReadonlyArray<Point>, color: string): React.ReactNode {
  return along(spine, 24).map((q, i) => {
    const across = i < 7 ? 4.2 : i < 19 ? 5 + (i - 7) * 0.08 : 6.4;
    const len = i < 7 ? 3.2 : i < 19 ? 4.3 : 5;
    const deg = round1((q.a * 180) / Math.PI);
    return (
      <rect
        key={i}
        x={round1(q.p[0] - len / 2)}
        y={round1(q.p[1] - across / 2)}
        width={len}
        height={round1(across)}
        rx={1.3}
        transform={`rotate(${deg} ${round1(q.p[0])} ${round1(q.p[1])})`}
        fill={color}
      />
    );
  });
}

/** Голова: круг, нос, ухо. */
function head(cx: number, cy: number, c: ArtColors): React.ReactNode {
  const d = `M${round1(cx)} ${round1(cy - 15)} C${round1(cx + 9)} ${round1(cy - 15)} ${round1(cx + 15)} ${round1(cy - 8)} ${round1(
    cx + 15,
  )} ${round1(cy - 1)} L${round1(cx + 17.2)} ${round1(cy + 3)} L${round1(cx + 14.6)} ${round1(cy + 4.4)} C${round1(cx + 13)} ${round1(
    cy + 11,
  )} ${round1(cx + 7)} ${round1(cy + 15)} ${round1(cx)} ${round1(cy + 15)} C${round1(cx - 9)} ${round1(cy + 15)} ${round1(cx - 15)} ${round1(
    cy + 8,
  )} ${round1(cx - 15)} ${round1(cy)} C${round1(cx - 15)} ${round1(cy - 8)} ${round1(cx - 9)} ${round1(cy - 15)} ${round1(cx)} ${round1(cy - 15)} Z`;
  return (
    <>
      <path d={d} fill={c.surface} />
      <path d={d} fill={c.tissue} stroke={c.tissueLine} strokeWidth={1.1} strokeLinejoin="round" />
      <ellipse cx={round1(cx - 3)} cy={round1(cy + 3)} rx={2.6} ry={3.6} fill="none" stroke={c.tissueLine} strokeWidth={1} />
    </>
  );
}

/**
 * Шесть типов осанки сбоку: силуэт ребёнка, внутри — позвоночник. Выбранный
 * тип — в рамке цвета оценки, позвоночник того же цвета; у всех, кроме нормы,
 * — пунктир нормальных изгибов для сравнения; от уха — отвес.
 */
export const PostureStrip: React.FC<PostureStripProps> = ({ selected, status }) => {
  const c = useArtColors();
  const id = React.useId().replace(/:/g, "");
  const tone = c.status(status);
  const fill = c.statusFill(status);
  const chosen = POSTURES.find((t) => t.type === selected);
  const label = chosen ? `Шесть типов осанки, выбрана ${chosen.name.toLowerCase()}` : "Шесть типов осанки";

  return (
    <svg viewBox={`0 0 ${W * 6} ${HEIGHT}`} role="img" aria-label={label} style={artSvgStyle}>
      <defs>
        <linearGradient id={`${id}g`} x1={0} y1={BOTTOM - 26} x2={0} y2={BOTTOM} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor="#fff" stopOpacity={1} />
          <stop offset={1} stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x={0} y={0} width={W * 6} height={HEIGHT}>
          <rect x={0} y={0} width={W * 6} height={HEIGHT} fill={`url(#${id}g)`} />
        </mask>
        <filter id={`${id}b`} x="-30%" y="-10%" width="160%" height="120%">
          <feGaussianBlur stdDeviation={2.4} />
        </filter>
        {POSTURES.map((t, i) => (
          <clipPath key={t.type} id={`${id}c${i}`}>
            <path d={bodyPath(spinePts(i * W + 52, t), t)} />
          </clipPath>
        ))}
      </defs>
      {POSTURES.map((t, i) => {
        const x0 = i * W + 52;
        const on = t.type === selected;
        const spine = spinePts(x0, t);
        const { cx, cy, ear } = headOf(spine);
        const s1 = spine[spine.length - 1];
        const sacrum = `M${round1(s1[0] - 3.2)} ${s1[1] - 2} L${round1(s1[0] + 3.4)} ${s1[1] + 2} L${round1(s1[0] - 7.5)} ${s1[1] + 20} Z`;
        const spineTone = on ? tone : c.inkSoft;
        return (
          <g key={t.type}>
            {on && <rect x={i * W + 4} y={2} width={W - 8} height={HEIGHT - 4} rx={10} fill={fill} stroke={tone} strokeWidth={1} />}
            <g mask={`url(#${id}m)`}>
              <Body d={bodyPath(spine, t)} c={c} clip={`${id}c${i}`} blur={`${id}b`} />
              {i > 0 && <path d={curve(spinePts(x0, POSTURES[0]))} fill="none" stroke={c.inkSoft} strokeWidth={1.1} strokeDasharray="3.5 3" />}
              {vertebrae(spine, spineTone)}
              <path d={sacrum} fill={spineTone} strokeLinejoin="round" />
            </g>
            {head(cx, cy, c)}
            <line
              x1={round1(ear[0])}
              y1={round1(ear[1])}
              x2={round1(ear[0])}
              y2={BOTTOM - 6}
              mask={`url(#${id}m)`}
              stroke={c.accent}
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <circle cx={round1(ear[0])} cy={round1(ear[1])} r={1.6} fill={c.accent} />
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
