import { describe, expect, it } from "vitest";

import { pageNumberTopMm, planPageBreaks, sheetPageCount, type MeasuredBlock } from "./sheetPagination";

// A4 с полями 15/15: рабочая область 15…282 мм, вторая страница с 312 мм.
const a4 = { pageHeightMm: 297, marginTopMm: 15, marginBottomMm: 15 };

const block = (top: number, height: number): MeasuredBlock => ({ top, bottom: top + height });

describe("planPageBreaks", () => {
  it("блоки внутри первой страницы не трогает", () => {
    expect(planPageBreaks([block(20, 10), block(100, 50), block(270, 12)], a4)).toEqual([0, 0, 0]);
  });

  it("блок, рвущийся границей страницы, уезжает за верхнее поле второй", () => {
    // 290…300: пересекает 297 → должен начаться с 297 + 15 = 312.
    expect(planPageBreaks([block(290, 10)], a4)).toEqual([22]);
  });

  it("блок, заходящий в нижнее поле, тоже переносится", () => {
    // 278…290: не рвётся, но лезет в поле (граница 282).
    expect(planPageBreaks([block(278, 12)], a4)).toEqual([34]);
  });

  it("перенос сдвигает и всё, что идёт следом", () => {
    const shifts = planPageBreaks([block(290, 10), block(302, 10)], a4);
    // Второй после сдвига первого стоит на 324…334 — внутри страницы, свой сдвиг 0.
    expect(shifts).toEqual([22, 0]);
  });

  it("блок, начавшийся в верхнем поле продолжения, опускается до рабочей области", () => {
    // Предыдущий закончился ровно у нижнего поля, следующий стартует с 300.
    expect(planPageBreaks([block(270, 12), block(300, 10)], a4)).toEqual([0, 12]);
  });

  it("соседи одной строки сетки двигаются вместе", () => {
    const shifts = planPageBreaks([block(290, 10), block(290, 6)], a4);
    expect(shifts).toEqual([22, 22]);
  });

  it("блок выше рабочей области остаётся на месте", () => {
    expect(planPageBreaks([block(100, 300)], a4)).toEqual([0]);
  });

  it("на первой странице верхнее поле не навязывается: шапка лежит там, где её сверстал бланк", () => {
    expect(planPageBreaks([block(5, 10)], a4)).toEqual([0]);
  });

  it("считает страницы дальше второй", () => {
    // 620…630 → третья страница (594…891), рабочая область 609…876: внутри.
    expect(planPageBreaks([block(620, 10)], a4)).toEqual([0]);
    // 870…880 заходит за 876 → на четвёртую: 891 + 15 = 906.
    expect(planPageBreaks([block(870, 10)], a4)).toEqual([36]);
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
