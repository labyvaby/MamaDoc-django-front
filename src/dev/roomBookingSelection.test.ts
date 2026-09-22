import { describe, expect, it } from "vitest";

import { clampSelectionEnd, selectionBounds } from "./roomBookingSelection";

// true — ночь свободна, false — занята чужой бронью.
const row = (s: string): boolean[] => [...s].map((c) => c === ".");

describe("clampSelectionEnd", () => {
  it("простой клик (наведение на ту же ячейку) — выделена одна ночь", () => {
    expect(clampSelectionEnd(row("....."), 2, 2)).toBe(2);
  });

  it("тянет вправо и влево до ячейки под курсором, если путь свободен", () => {
    expect(clampSelectionEnd(row("....."), 1, 3)).toBe(3);
    expect(clampSelectionEnd(row("....."), 3, 1)).toBe(1);
  });

  it("не тянется через чужую бронь — останавливается перед первой занятой ночью", () => {
    // ночи 3–4 заняты: из 1 в сторону 6 выделение упирается в 2
    expect(clampSelectionEnd(row("...##.."), 1, 6)).toBe(2);
    // и то же влево: из 6 в сторону 0 — упирается в 5
    expect(clampSelectionEnd(row("...##.."), 6, 0)).toBe(5);
  });

  it("если сосед сразу занят — остаётся на стартовой ночи", () => {
    expect(clampSelectionEnd(row(".#."), 0, 2)).toBe(0);
  });

  it("курсор за занятой ночью, но до неё путь свободен — длину задаёт препятствие, а не курсор", () => {
    expect(clampSelectionEnd(row("..#..."), 0, 5)).toBe(1);
  });
});

describe("selectionBounds", () => {
  it("упорядочивает концы: тянули вправо или влево — нижняя граница всегда первая", () => {
    expect(selectionBounds(2, 5)).toEqual([2, 5]);
    expect(selectionBounds(5, 2)).toEqual([2, 5]);
    expect(selectionBounds(3, 3)).toEqual([3, 3]);
  });
});
