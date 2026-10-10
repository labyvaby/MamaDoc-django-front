import React from "react";

import { type ArtColors, type ArtStatus, US, artSvgStyle, useArtColors } from "./artColors";
import { arc, fmt, pt, round1, type Point } from "./geometry";

export interface HipInput {
  /** Угол костной крыши α, градусы. */
  alpha: number | null;
  /** Угол хрящевой крыши β, градусы. */
  beta: number | null;
  status: ArtStatus;
  /** Тип сустава по Графу: «Ia», «IIa»… */
  type?: string | null;
}

export interface HipUltrasoundProps {
  left: HipInput;
  right: HipInput;
}

/** Сектор датчика: вершина над снимком, раскрыв 62°…118°. */
const AP: Point = [70, -30];
const RAD = 140;
const A0 = (62 * Math.PI) / 180;
const A1 = (118 * Math.PI) / 180;
const S0: Point = [AP[0] + RAD * Math.cos(A0), AP[1] + RAD * Math.sin(A0)];
const S1: Point = [AP[0] + RAD * Math.cos(A1), AP[1] + RAD * Math.sin(A1)];
const SECTOR = `M${pt(AP)} L${pt(S0)} A${RAD} ${RAD} 0 0 1 ${pt(S1)} Z`;

/** Нижний край подвздошной кости — вершина угла α. */
const PX = 50;
const PY = 82;

/** Радиусы дуг α и β: малые, чтобы обе подписи влезли в треугольник между крышами и базовой линией. */
const ARC_A = 9;
const ARC_B = 8;

/** Габариты подписи (10px) от её точки: в стороны, вверх, вниз; у β есть выносные элементы. */
interface Glyph {
  w: number;
  up: number;
  down: number;
}
const GLYPH_A: Glyph = { w: 3.2, up: 2.6, down: 3.2 };
const GLYPH_B: Glyph = { w: 2.6, up: 4.5, down: 5.4 };

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
const boxAt = (p: Point, g: Glyph): Box => ({ x0: p[0] - g.w, x1: p[0] + g.w, y0: p[1] - g.up, y1: p[1] + g.down });

/** Расстояние между прямоугольниками; отрицательное — глубина пересечения. */
function boxGap(a: Box, b: Box): number {
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1, 0);
  const dy = Math.max(a.y0 - b.y1, b.y0 - a.y1, 0);
  if (dx > 0 || dy > 0) return Math.hypot(dx, dy);
  return -Math.min(a.x1 - b.x0, b.x1 - a.x0, a.y1 - b.y0, b.y1 - a.y0);
}

/** Линия, по которой меряется зазор: точки через ~1,5 px и полутолщина штриха. */
interface Obstacle {
  pts: Point[];
  half: number;
}
function segment(a: Point, b: Point, half: number): Obstacle {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5));
  const pts = Array.from(
    { length: n + 1 },
    (_, i): Point => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n],
  );
  return { pts, half };
}
function arcLine(c: Point, r: number, a0: number, a1: number, half: number): Obstacle {
  const n = Math.max(2, Math.ceil((r * Math.abs(a1 - a0) * Math.PI) / 180 / 1.5));
  const pts = Array.from({ length: n + 1 }, (_, i): Point => {
    const t = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)];
  });
  return { pts, half };
}
/** Квадратичная кривая — эхо крыши. */
function curveLine(a: Point, ctl: Point, b: Point, half: number): Obstacle {
  const pts = Array.from({ length: 25 }, (_, i): Point => {
    const t = i / 24;
    const s = 1 - t;
    return [s * s * a[0] + 2 * s * t * ctl[0] + t * t * b[0], s * s * a[1] + 2 * s * t * ctl[1] + t * t * b[1]];
  });
  return { pts, half };
}
/** Наименьший зазор от прямоугольника до линий с учётом толщины штриха. */
function clearance(box: Box, obstacles: Obstacle[]): number {
  let min = Infinity;
  for (const { pts, half } of obstacles) {
    for (const p of pts) {
      const d = Math.hypot(Math.max(box.x0 - p[0], 0, p[0] - box.x1), Math.max(box.y0 - p[1], 0, p[1] - box.y1));
      min = Math.min(min, d - half);
    }
  }
  return min;
}

/** Где искать подпись: доля угла от базовой линии к своей линии (0,2…0,8) и отступ от дуги (2,5…14 px). */
const SHARES = Array.from({ length: 13 }, (_, i) => 0.2 + i * 0.05);
const OFFSETS = [2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 14];

interface LabelSpot {
  p: Point;
  box: Box;
  /** Наименьший зазор до линий и дуг. */
  clear: number;
  /** Удаление от дуги и от биссектрисы: из подходящих мест берётся ближайшее к ним. */
  shift: number;
}

/** Места для подписи внутри угла с вершиной c: от направления from на span градусов, за дугой радиуса r. */
function spots(c: Point, from: number, span: number, r: number, glyph: Glyph, obstacles: Obstacle[]): LabelSpot[] {
  return SHARES.flatMap((k) =>
    OFFSETS.map((o) => {
      const t = ((from + k * span) * Math.PI) / 180;
      const p: Point = [c[0] + (r + o) * Math.cos(t), c[1] + (r + o) * Math.sin(t)];
      const box = boxAt(p, glyph);
      return { p, box, clear: clearance(box, obstacles), shift: 0.05 * o + 0.3 * Math.abs(k - 0.5) };
    }),
  );
}

/**
 * Запасные места для β — под хрящевой крышей сразу за точкой перегиба R (тоже внутри
 * угла β). Нужны, когда у вершины тесно: при малом α и большом β треугольник между
 * крышами и базовой линией низкий (около 25 px при 45°/80°) и двух подписей не вмещает.
 */
function spotsPastRim(R: Point, d: Point, obstacles: Obstacle[]): LabelSpot[] {
  const n: Point = [-d[1], d[0]]; // поперёк хрящевой крыши, под неё
  return [3, 5, 7, 9, 11, 13].flatMap((s) =>
    [5, 6, 7, 8].map((h) => {
      const p: Point = [R[0] + d[0] * s + n[0] * h, R[1] + d[1] * s + n[1] * h];
      const box = boxAt(p, GLYPH_B);
      return { p, box, clear: clearance(box, obstacles), shift: 1.5 + 0.05 * s };
    }),
  );
}

/**
 * Пара мест для α и β: подписи не ближе 2 px друг к другу и 0,5 px к линиям, а из
 * таких — ближе всего к своим дугам. Если так не выходит, — пара с наименьшим нарушением.
 */
function pickLabels(as: LabelSpot[], bs: LabelSpot[] | null): { a: Point; b: Point | null } {
  let best = { v: -Infinity, a: as[0].p, b: bs ? bs[0].p : null };
  for (const a of as) {
    for (const b of bs ?? [null]) {
      const worst = Math.min(a.clear - 0.5, b ? b.clear - 0.5 : Infinity, b ? boxGap(a.box, b.box) - 2 : Infinity);
      const v = (worst >= 0 ? 10 : worst * 10) - a.shift - (b ? b.shift : 0);
      if (v > best.v) best = { v, a: a.p, b: b ? b.p : null };
    }
  }
  return { a: best.a, b: best.b };
}

/** Снимок одного сустава по Графу: подвздошная кость, костная и хрящевая крыши, головка бедра. */
function hipImage(
  id: string,
  seed: number,
  x: number,
  side: "L" | "R",
  input: HipInput,
  c: ArtColors,
): React.ReactNode {
  const mir = side === "L";
  const transform = mir ? `translate(${x + 140},0) scale(-1,1)` : `translate(${x},0)`;
  const page = (p: Point): Point => [mir ? x + 140 - p[0] : x + p[0], p[1]];

  if (input.alpha == null) {
    return (
      <>
        <g transform={transform}>
          <path d={SECTOR} fill={US.bg} stroke={c.ruleStrong} strokeWidth={1} />
        </g>
        <text x={x + 70} y={58} textAnchor="middle" fill={US.mid} fontSize={10}>
          нет данных
        </text>
      </>
    );
  }

  const { alpha, beta } = input;
  const col = US[input.status];
  const ar = (alpha * Math.PI) / 180;
  const dir: Point = [Math.sin(ar), -Math.cos(ar)];
  const R: Point = [PX + dir[0] * 30, PY + dir[1] * 30];
  const head: Point = alpha >= 60 ? [PX + 20, PY + 7] : [PX + 22, PY + 10];
  const aDir = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;

  // хрящевая крыша: от пересечения с базовой линией (Q) через край (R) к лимбусу (Lb)
  let cartilage: { d: Point; Q: Point; Lb: Point; beta: number } | null = null;
  if (beta != null && beta > 0) {
    const br = (beta * Math.PI) / 180;
    const d: Point = [Math.sin(br), Math.cos(br)];
    const Q: Point = [PX, R[1] + ((PX - R[0]) / d[0]) * d[1]];
    const Lb: Point = [R[0] + d[0] * 24, R[1] + d[1] * 24];
    cartilage = { d, Q, Lb, beta };
  }

  // подписи α и β — внутри своих углов, не налезая друг на друга, на линии, дуги и головку
  const P: Point = [PX, PY];
  const roofCtl: Point = [(PX + R[0]) / 2, (PY + R[1]) / 2 + 4];
  const cartCtl: Point = [R[0] + 10, R[1] + 4];
  const obstacles: Obstacle[] = [
    segment([PX, 0], [PX, 108], 1.6),
    segment(P, [PX + dir[0] * 44, PY + dir[1] * 44], 0.8),
    curveLine(P, roofCtl, R, 1.3),
    arcLine(P, ARC_A, aDir, -90, 0.7),
    arcLine(head, 17, 0, 360, 0.5),
  ];
  if (cartilage) {
    const { d, Q, Lb } = cartilage;
    obstacles.push(
      segment(Q, [Lb[0] + d[0] * 6, Lb[1] + d[1] * 6], 0.55),
      curveLine(R, cartCtl, Lb, 1),
      arcLine(Q, ARC_B, 90 - cartilage.beta, 90, 0.55),
    );
  }
  const labels = pickLabels(
    spots(P, -90, alpha, ARC_A, GLYPH_A, obstacles),
    cartilage
      ? [
          ...spots(cartilage.Q, 90, -cartilage.beta, ARC_B, GLYPH_B, obstacles),
          ...spotsPastRim(R, cartilage.d, obstacles),
        ]
      : null,
  );
  const ta = page(labels.a);
  const tb = labels.b ? page(labels.b) : null;

  return (
    <>
      <defs>
        <clipPath id={`${id}c`}>
          <path d={SECTOR} />
        </clipPath>
        <filter id={`${id}n`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves={2} seed={seed} />
          <feColorMatrix values="0 0 0 0 .9  0 0 0 0 .95  0 0 0 0 .96  0 0 0 .9 -.25" />
        </filter>
        <radialGradient id={`${id}v`} cx={70} cy={40} r={100} gradientUnits="userSpaceOnUse">
          <stop offset={0.55} stopColor="#000" stopOpacity={0} />
          <stop offset={1} stopColor="#000" stopOpacity={0.75} />
        </radialGradient>
      </defs>
      <g transform={transform}>
        <g clipPath={`url(#${id}c)`}>
          <rect x={-40} y={-40} width={220} height={190} fill={US.bg} />
          <rect x={-40} y={-40} width={220} height={190} filter={`url(#${id}n)`} opacity={0.42} />
          <path d="M-20 12 C40 6 100 6 160 12" fill="none" stroke={US.mid} strokeWidth={3} opacity={0.5} />
          <path d="M-20 20 C40 15 100 15 160 21" fill="none" stroke={US.mid} strokeWidth={1.5} opacity={0.35} />
          <path d={`M${PX - 6} 6 L${PX - 6} ${PY}`} fill="none" stroke="#000" strokeWidth={8} opacity={0.35} />
          <path d={`M${PX} 6 L${PX} ${PY}`} fill="none" stroke={US.echo} strokeWidth={3.2} />
          <path d={`M${PX} ${PY} Q${pt(roofCtl)} ${pt(R)}`} fill="none" stroke={US.echo} strokeWidth={2.6} />
          {cartilage && (
            <path d={`M${pt(R)} Q${pt(cartCtl)} ${pt(cartilage.Lb)}`} fill="none" stroke={US.mid} strokeWidth={2} />
          )}
          <circle
            cx={head[0]}
            cy={head[1]}
            r={17}
            fill="#05080a"
            stroke="#9fb1b4"
            strokeOpacity={0.35}
            strokeWidth={1}
          />
          <circle cx={head[0]} cy={head[1]} r={17} filter={`url(#${id}n)`} opacity={0.18} />
          <rect x={-40} y={-40} width={220} height={190} fill={`url(#${id}v)`} />
        </g>
        <path d={SECTOR} fill="none" stroke={c.ruleStrong} strokeWidth={1} />
        <line x1={PX} y1={0} x2={PX} y2={108} stroke={US.echo} strokeWidth={0.9} strokeDasharray="3 2" opacity={0.85} />
        <line
          x1={PX}
          y1={PY}
          x2={round1(PX + dir[0] * 44)}
          y2={round1(PY + dir[1] * 44)}
          stroke={col}
          strokeWidth={1.6}
        />
        {cartilage && (
          <line
            x1={round1(cartilage.Q[0])}
            y1={round1(cartilage.Q[1])}
            x2={round1(cartilage.Lb[0] + cartilage.d[0] * 6)}
            y2={round1(cartilage.Lb[1] + cartilage.d[1] * 6)}
            stroke={US.mid}
            strokeWidth={1.1}
          />
        )}
        <path d={arc(PX, PY, ARC_A, aDir, -90)} stroke={col} fill="none" strokeWidth={1.4} />
        {cartilage && (
          <path
            d={arc(PX, cartilage.Q[1], ARC_B, 90 - cartilage.beta, 90)}
            stroke={US.mid}
            fill="none"
            strokeWidth={1.1}
          />
        )}
      </g>
      <text x={round1(ta[0])} y={round1(ta[1] + 3)} textAnchor="middle" fill={col} fontSize={10} fontWeight={600}>
        α
      </text>
      {tb && (
        <text x={round1(tb[0])} y={round1(tb[1] + 3)} textAnchor="middle" fill={US.mid} fontSize={10} fontWeight={500}>
          β
        </text>
      )}
    </>
  );
}

const angle = (v: number | null): string => (v != null ? `${fmt(v)}°` : "—");

const hipText = (h: HipInput): string =>
  h.alpha == null && h.beta == null
    ? `${h.type ? `${h.type}, ` : ""}нет данных`
    : `${h.type ? `${h.type}, ` : ""}α ${angle(h.alpha)}, β ${angle(h.beta)}`;

/**
 * УЗИ тазобедренных суставов по Графу: два снимка, левый — зеркально. Снимок
 * всегда тёмный; линия и дуга α — цветом оценки, хрящевая крыша и β — серым.
 */
export const HipUltrasound: React.FC<HipUltrasoundProps> = ({ left, right }) => {
  const c = useArtColors();
  const id = React.useId().replace(/:/g, "");
  const caption = (x: number, side: string, h: HipInput) => (
    <>
      <text x={x} y={125} textAnchor="middle" fill={c.muted} fontSize={10.5}>
        {h.type ? `${side} · ${h.type}` : side}
      </text>
      {(h.alpha != null || h.beta != null) && (
        <text x={x} y={137} textAnchor="middle" fill={c.ink} fontSize={10.5} fontWeight={500}>
          {`α ${angle(h.alpha)} · β ${angle(h.beta)}`}
        </text>
      )}
    </>
  );

  return (
    <svg
      viewBox="0 0 296 140"
      role="img"
      aria-label={`УЗИ тазобедренных суставов по Графу: левый — ${hipText(left)}; правый — ${hipText(right)}`}
      style={artSvgStyle}
    >
      {hipImage(`${id}L`, 7, 4, "L", left, c)}
      {hipImage(`${id}R`, 14, 152, "R", right, c)}
      {caption(74, "Левый", left)}
      {caption(222, "Правый", right)}
    </svg>
  );
};
