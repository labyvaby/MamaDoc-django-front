import React from "react";

import { type ArtColors, type ArtStatus, artSvgStyle, useArtColors } from "./artColors";
import { along, curve, pt, round1, type Point } from "./geometry";

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

/** Позвоночный столб в профиль: канал, 24 позвонка с остистыми отростками, крестец, череп. */
function column(x0: number, t: PostureShape, tone: string | null, fill: string | null, c: ArtColors): React.ReactNode {
  const pts = colPts(x0, t);
  const v = along(pts, 24);
  const bodyFill = fill ?? c.bone;
  const bodyStroke = tone ?? c.ink;
  const vertebrae = v.map((q, i) => {
    const w = i < 7 ? 6.2 : i < 19 ? 7.4 + (i - 7) * 0.16 : 10.8;
    const h = i < 7 ? 3.2 : i < 19 ? 4.3 : 5.4;
    const sp = i < 7 ? 3.4 : i < 19 ? 6.4 : 5.2;
    const ca = Math.cos(q.a);
    const sa = Math.sin(q.a);
    const fx = sa;
    const fy = -ca;
    const bx = -sa;
    const by = ca;
    const cx = q.p[0] + fx * (w / 2 + 1.3);
    const cy = q.p[1] + fy * (w / 2 + 1.3);
    const deg = (q.a * 180) / Math.PI - 90;
    // остистый отросток: от задней стенки тела назад и чуть вниз
    const root: Point = [q.p[0] + bx * 1.4, q.p[1] + by * 1.4];
    const end: Point = [q.p[0] + bx * sp + ca * sp * 0.55, q.p[1] + by * sp + sa * sp * 0.55];
    return (
      <React.Fragment key={i}>
        <rect
          x={round1(cx - w / 2)}
          y={round1(cy - h / 2)}
          width={round1(w)}
          height={round1(h)}
          rx={1.4}
          transform={`rotate(${round1(deg)} ${round1(cx)} ${round1(cy)})`}
          fill={bodyFill}
          stroke={bodyStroke}
          strokeWidth={0.9}
        />
        <path
          d={`M${pt(root)} L${pt(end)}`}
          fill="none"
          stroke={tone ?? c.ink}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </React.Fragment>
    );
  });

  // крестец и копчик продолжают последний позвонок
  const last = v[v.length - 1];
  const ca = Math.cos(last.a);
  const sa = Math.sin(last.a);
  const fx = sa;
  const fy = -ca;
  const bx = -sa;
  const by = ca;
  const base: Point = [last.p[0] + ca * 5, last.p[1] + sa * 5];
  const a1: Point = [base[0] + fx * 12, base[1] + fy * 12];
  const a2: Point = [base[0] + bx * 2, base[1] + by * 2];
  const tip: Point = [base[0] + ca * 23 + bx * 6, base[1] + sa * 23 + by * 6];
  const toTip: Point = [tip[0] + bx * 2 - ca * 4, tip[1] + by * 2 - sa * 4];
  const fromTip: Point = [a1[0] + ca * 13, a1[1] + sa * 13];
  const sacrum = `M${pt(a1)} L${pt(a2)} Q${pt(toTip)} ${pt(tip)} Q${pt(fromTip)} ${pt(a1)} Z`;

  const hx = x0 + t.h + 13;
  const hy = 20;
  return (
    <>
      <path d={curve(pts)} fill="none" stroke={tone ?? c.inkSoft} strokeWidth={1} />
      {vertebrae}
      <path d={sacrum} fill={bodyFill} stroke={bodyStroke} strokeWidth={0.9} />
      <ellipse
        cx={round1(hx)}
        cy={hy}
        rx={15.5}
        ry={12.5}
        transform={`rotate(-12 ${round1(hx)} ${hy})`}
        fill={c.bone}
        stroke={c.ink}
        strokeWidth={1}
      />
      <path d={`M${round1(hx + 9)} ${hy + 9} q4 6 -2 9`} fill="none" stroke={c.ink} strokeWidth={1.1} />
      <circle cx={round1(hx - 6)} cy={hy + 3} r={1.7} fill={c.ink} />
    </>
  );
}

/**
 * Шесть типов осанки сбоку. Выбранный — в рамке цвета оценки и с цветными
 * позвонками; у всех, кроме нормы, — пунктир нормальных изгибов для сравнения;
 * от уха — отвес.
 */
export const PostureStrip: React.FC<PostureStripProps> = ({ selected, status }) => {
  const c = useArtColors();
  const tone = c.status(status);
  const fill = c.statusFill(status);
  const chosen = POSTURES.find((t) => t.type === selected);
  const label = chosen ? `Шесть типов осанки, выбрана ${chosen.name.toLowerCase()}` : "Шесть типов осанки";
  const ghost = (x0: number) => curve(colPts(x0, POSTURES[0]));

  return (
    <svg viewBox={`0 0 ${W * 6} 238`} role="img" aria-label={label} style={artSvgStyle}>
      {POSTURES.map((t, i) => {
        const x0 = i * W + 52;
        const on = t.type === selected;
        const ear: Point = [x0 + t.h + 13 - 6, 23];
        return (
          <g key={t.type}>
            {on && (
              <rect x={i * W + 4} y={2} width={W - 8} height={232} rx={10} fill={fill} stroke={tone} strokeWidth={1} />
            )}
            {i > 0 && <path d={ghost(x0)} fill="none" stroke={c.inkSoft} strokeWidth={1.1} strokeDasharray="3.5 3" />}
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
            {column(x0, t, on ? tone : null, on ? fill : null, c)}
            <text
              x={i * W + W / 2}
              y={224}
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
