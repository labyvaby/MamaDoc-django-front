/**
 * Геометрия рисунков опорно-двигательной системы: гладкая кривая через точки
 * (Катмулл-Ром → кубические Безье), точки на равных расстояниях вдоль кривой,
 * дуги углов. Числа в атрибутах округляются до 0,1.
 */

/** Точка [x, y] в координатах viewBox. */
export type Point = readonly [number, number];

/** Кубический сегмент Безье: начало, две опорные точки, конец. */
export type BezierSegment = readonly [Point, Point, Point, Point];

/** Точка на кривой и угол касательной в радианах. */
export interface AlongPoint {
  p: Point;
  a: number;
}

/** Округление до 0,1 — для всех чисел в атрибутах. */
export const round1 = (n: number): number => Math.round(n * 10) / 10;

/** «x y» для команд пути. */
export const pt = (p: Point): string => `${round1(p[0])} ${round1(p[1])}`;

/** Число для подписи: до 0,1 и с запятой — «0,7», «12». */
export const fmt = (n: number): string => String(round1(n)).replace(".", ",");

/** Катмулл-Ром → кривые Безье: по сегменту на каждую пару соседних точек. */
export function segs(pts: ReadonlyArray<Point>): BezierSegment[] {
  const out: BezierSegment[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p0 = i > 0 ? pts[i - 1] : p1;
    const p3 = i + 2 < pts.length ? pts[i + 2] : p2;
    out.push([
      p1,
      [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
      p2,
    ]);
  }
  return out;
}

/** Гладкий путь через точки: «M…» и по «C…» на сегмент. */
export function curve(pts: ReadonlyArray<Point>): string {
  const s = segs(pts);
  if (s.length === 0) return pts.length > 0 ? `M${pt(pts[0])}` : "";
  return `M${pt(s[0][0])}` + s.map((g) => ` C${pt(g[1])} ${pt(g[2])} ${pt(g[3])}`).join("");
}

/** Та же кривая без начального «M» — для продолжения контура. */
export function tail(pts: ReadonlyArray<Point>): string {
  return curve(pts).replace(/^M[^C]*/, "");
}

function bez(g: BezierSegment, t: number): Point {
  const u = 1 - t;
  const at = (k: 0 | 1): number =>
    u * u * u * g[0][k] + 3 * u * u * t * g[1][k] + 3 * u * t * t * g[2][k] + t * t * t * g[3][k];
  return [at(0), at(1)];
}

/** n точек на равных расстояниях вдоль кривой (середины n равных отрезков), с углом касательной. */
export function along(pts: ReadonlyArray<Point>, n: number): AlongPoint[] {
  const fine: Point[] = [];
  segs(pts).forEach((g, gi) => {
    for (let i = gi ? 1 : 0; i <= 48; i++) fine.push(bez(g, i / 48));
  });
  if (fine.length < 2) return [];
  const L = [0];
  for (let i = 1; i < fine.length; i++) {
    L.push(L[i - 1] + Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]));
  }
  const T = L[L.length - 1];
  const out: AlongPoint[] = [];
  for (let k = 0; k < n; k++) {
    const tg = (T * (k + 0.5)) / n;
    let j = 1;
    while (j < L.length - 1 && L[j] < tg) j++;
    const a = fine[j - 1];
    const b = fine[j];
    const t = (tg - L[j - 1]) / (L[j] - L[j - 1] || 1);
    out.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], a: Math.atan2(b[1] - a[1], b[0] - a[0]) });
  }
  return out;
}

/**
 * Дуга окружности от угла a0 до a1 (градусы, экранные координаты: 0° — вправо,
 * 90° — вниз): «M…» в начале дуги и команда «A…».
 */
export function arc(cx: number, cy: number, rad: number, a0: number, a1: number): string {
  const x0 = cx + rad * Math.cos((a0 * Math.PI) / 180);
  const y0 = cy + rad * Math.sin((a0 * Math.PI) / 180);
  const x1 = cx + rad * Math.cos((a1 * Math.PI) / 180);
  const y1 = cy + rad * Math.sin((a1 * Math.PI) / 180);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M${round1(x0)} ${round1(y0)} A${round1(rad)} ${round1(rad)} 0 ${large} ${sweep} ${round1(x1)} ${round1(y1)}`;
}
