import { describe, expect, it } from "vitest";

import { pageBreakStep, pageNumberTopMm, sheetPageCount, type MeasuredBlock } from "./sheetPagination";

// A4 с полями 15/15: рабочая область 15…282 мм, вторая страница с 312 мм.
const a4 = { pageHeightMm: 297, marginTopMm: 15, marginBottomMm: 15 };

const block = (top: number, height: number): MeasuredBlock => ({ top, bottom: top + height });

describe("pageBreakStep", () => {
  it("блок внутри первой страницы — на месте", () => {
    expect(pageBreakStep(block(100, 50), a4)).toEqual({ kind: "fits" });
    expect(pageBreakStep(block(270, 12), a4)).toEqual({ kind: "fits" });
  });

  it("блок, заходящий в нижнее поле, пересекает страницу", () => {
    // 278…290: граница рабочей области 282, следующая страница с 297 + 15.
    expect(pageBreakStep(block(278, 12), a4)).toEqual({
      kind: "cross",
      limitMm: 282,
      nextContentTopMm: 312,
      fallbackShiftMm: 34,
    });
  });

  it("длинный абзац от начала рабочей области сдвигать некуда — только резать", () => {
    const step = pageBreakStep(block(15, 400), a4);
    expect(step).toMatchObject({ kind: "cross", limitMm: 282, fallbackShiftMm: 0 });
  });

  it("блок, начавшийся в верхнем поле продолжения, опускается до рабочей области", () => {
    expect(pageBreakStep(block(300, 10), a4)).toEqual({ kind: "shift", shiftMm: 12 });
  });

  it("на первой странице верхнее поле не навязывается", () => {
    expect(pageBreakStep(block(5, 10), a4)).toEqual({ kind: "fits" });
  });

  it("считает страницы дальше второй", () => {
    expect(pageBreakStep(block(620, 10), a4)).toEqual({ kind: "fits" });
    expect(pageBreakStep(block(870, 10), a4)).toMatchObject({
      kind: "cross",
      limitMm: 876,
      nextContentTopMm: 906,
      fallbackShiftMm: 36,
    });
  });

  it("блок, стоящий ровно на границе страницы, относится к следующей", () => {
    expect(pageBreakStep(block(312, 10), a4)).toEqual({ kind: "fits" });
  });
});

describe("sheetPageCount", () => {
  it("лист на миллиметр ниже страницы — одна страница", () => {
    expect(sheetPageCount(296, 297)).toBe(1);
    expect(sheetPageCount(297, 297)).toBe(1);
  });

  it("вылез за страницу — две", () => {
    expect(sheetPageCount(385.9, 297)).toBe(2);
    expect(sheetPageCount(593, 297)).toBe(2);
  });

  it("три и больше", () => {
    expect(sheetPageCount(700, 297)).toBe(3);
  });

  it("пустой лист всё равно занимает страницу", () => {
    expect(sheetPageCount(0, 210)).toBe(1);
  });
});

describe("pageNumberTopMm", () => {
  it("номер — посередине нижнего поля каждой страницы", () => {
    // Поле 12 мм: центр в 6 мм от низа, строка 3 мм → верх на 7,5 мм выше обреза.
    expect(pageNumberTopMm(0, 297, 12)).toBeCloseTo(289.5);
    expect(pageNumberTopMm(1, 297, 12)).toBeCloseTo(586.5);
  });

  it("узкое поле не прижимает номер к обрезу", () => {
    expect(pageNumberTopMm(0, 297, 2)).toBeCloseTo(290);
  });
});
