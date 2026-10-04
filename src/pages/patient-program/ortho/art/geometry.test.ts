import { describe, expect, it } from "vitest";

import { along, arc, curve, fmt, pt, round1, segs, tail } from "./geometry";

describe("ortho art geometry", () => {
  it("curve: из трёх точек — «M» и две кривые «C»", () => {
    const d = curve([
      [0, 0],
      [10, 10],
      [20, 0],
    ]);
    expect(d.startsWith("M0 0 ")).toBe(true);
    expect(d.match(/C/g)).toHaveLength(2);
    expect(d.endsWith(" 20 0")).toBe(true);
  });

  it("curve: опорные точки по Катмуллу-Рому, концы совпадают с точками", () => {
    const s = segs([
      [0, 0],
      [60, 0],
      [120, 60],
    ]);
    expect(s).toHaveLength(2);
    expect(s[0][1]).toEqual([10, 0]);
    expect(s[0][3]).toEqual([60, 0]);
    expect(s[1][0]).toEqual([60, 0]);
  });

  it("tail: та же кривая без начального «M»", () => {
    const pts = [
      [0, 0],
      [10, 10],
      [20, 0],
    ] as const;
    expect(tail(pts).startsWith("C")).toBe(true);
    expect(curve(pts).endsWith(tail(pts))).toBe(true);
  });

  it("along: n точек на равных расстояниях и с углом касательной", () => {
    const out = along(
      [
        [0, 0],
        [50, 0],
        [100, 0],
      ],
      4,
    );
    expect(out).toHaveLength(4);
    out.forEach((q, i) => {
      expect(q.p[0]).toBeCloseTo(12.5 + i * 25, 6);
      expect(q.p[1]).toBeCloseTo(0, 6);
      expect(q.a).toBeCloseTo(0, 6);
    });
    const down = along(
      [
        [0, 0],
        [0, 40],
      ],
      3,
    );
    expect(down).toHaveLength(3);
    down.forEach((q) => expect(q.a).toBeCloseTo(Math.PI / 2, 6));
  });

  it("arc: «M» в начале дуги и команда «A»", () => {
    expect(arc(40, 100, 22, 84, 90)).toBe("M42.3 121.9 A22 22 0 0 1 40 122");
    expect(arc(50, 82, 13, -27, -90)).toMatch(/^M\S+ \S+ A13 13 0 0 0 50 69$/);
  });

  it("числа: до 0,1, в подписях — с запятой", () => {
    expect(round1(12.345)).toBe(12.3);
    expect(pt([1.26, -3.04])).toBe("1.3 -3");
    expect(fmt(0.66)).toBe("0,7");
    expect(fmt(5)).toBe("5");
  });
});
