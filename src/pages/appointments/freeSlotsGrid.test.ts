import { describe, expect, it } from "vitest";

import {
  createIdentityStamper,
  sameColumnRange,
  visibleColumnRange,
} from "./freeSlotsGrid";

describe("visibleColumnRange", () => {
  // Десктоп: 26 врачей, колонка — треть панели 1440 px.
  const desktop = { viewportWidth: 1440, columnWidth: 480, count: 26, overscan: 1, fallbackVisible: 3 };

  it("в начале ленты — три видимые колонки и одна про запас справа", () => {
    expect(visibleColumnRange({ ...desktop, scrollLeft: 0 })).toEqual({ from: 0, to: 3 });
  });

  it("запас с обеих сторон, когда лента прокручена", () => {
    expect(visibleColumnRange({ ...desktop, scrollLeft: 960 })).toEqual({ from: 1, to: 5 });
  });

  it("частично видимые колонки по краям тоже рисуются", () => {
    // 100 px: колонка 0 видна частично, колонка 3 — на 100 px.
    expect(visibleColumnRange({ ...desktop, scrollLeft: 100 })).toEqual({ from: 0, to: 4 });
  });

  it("не выходит за последнюю колонку", () => {
    const maxLeft = 26 * 480 - 1440;
    expect(visibleColumnRange({ ...desktop, scrollLeft: maxLeft })).toEqual({ from: 22, to: 25 });
  });

  it("телефон: одна колонка на экран, соседи про запас", () => {
    expect(
      visibleColumnRange({
        scrollLeft: 720,
        viewportWidth: 360,
        columnWidth: 360,
        count: 26,
        overscan: 1,
        fallbackVisible: 3,
      }),
    ).toEqual({ from: 1, to: 3 });
  });

  it("размеры ещё неизвестны — рисуем первые колонки, а не ничего", () => {
    expect(visibleColumnRange({ ...desktop, scrollLeft: 0, columnWidth: 0 })).toEqual({
      from: 0,
      to: 3,
    });
    expect(visibleColumnRange({ ...desktop, scrollLeft: 0, viewportWidth: 0 })).toEqual({
      from: 0,
      to: 3,
    });
  });

  it("врачей меньше, чем помещается, — все", () => {
    expect(visibleColumnRange({ ...desktop, count: 2, scrollLeft: 0 })).toEqual({ from: 0, to: 1 });
  });

  it("нет врачей — пустой диапазон", () => {
    const range = visibleColumnRange({ ...desktop, count: 0, scrollLeft: 0 });
    expect(range.to).toBeLessThan(range.from);
  });

  it("колонка, видная меньше чем на пиксель, видимой не считается", () => {
    // Масштаб экрана даёт дробные scrollLeft: 21929.78 при колонке 476.736 —
    // колонка 45 торчит на 0,09 px и не должна тянуть за собой запас.
    expect(
      visibleColumnRange({
        scrollLeft: 21929.78,
        viewportWidth: 1430,
        columnWidth: 476.736,
        count: 49,
        overscan: 1,
        fallbackVisible: 3,
      }),
    ).toEqual({ from: 45, to: 48 });
  });

  it("отрицательный scrollLeft (упругий скролл) считается нулём", () => {
    expect(visibleColumnRange({ ...desktop, scrollLeft: -40 })).toEqual({ from: 0, to: 3 });
  });
});

describe("sameColumnRange", () => {
  it("сравнивает границы, а не ссылки", () => {
    expect(sameColumnRange({ from: 1, to: 4 }, { from: 1, to: 4 })).toBe(true);
    expect(sameColumnRange({ from: 1, to: 4 }, { from: 1, to: 5 })).toBe(false);
  });
});

describe("createIdentityStamper", () => {
  it("тот же объект — тот же номер, другой объект — другой", () => {
    const stamp = createIdentityStamper();
    const a = { employees: [] };
    const b = { employees: [] };
    expect(stamp(a)).toBe(stamp(a));
    expect(stamp(b)).not.toBe(stamp(a));
  });

  it("нет данных — ноль", () => {
    const stamp = createIdentityStamper();
    expect(stamp(undefined)).toBe(0);
    expect(stamp(null)).toBe(0);
  });
});
