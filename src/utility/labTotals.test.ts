import { describe, it, expect } from "vitest";

import { basketTotals, type BasketLineInput, type BasketTubeInput } from "./labTotals";

const test = (over: Partial<BasketLineInput> = {}): BasketLineInput => ({
  testId: 1,
  priceStandard: "250.00",
  priceExpress: "0",
  count: 1,
  express: false,
  ...over,
});

const tube = (over: Partial<BasketTubeInput> = {}): BasketTubeInput => ({
  instrumentId: 1,
  price: "15.00",
  count: 1,
  ...over,
});

describe("basketTotals", () => {
  it("складывает обычные цены", () => {
    const got = basketTotals({
      lines: [test(), test({ testId: 2, priceStandard: "100.50" })],
      tubes: [],
      discountPercent: 0,
      chargeTubes: false,
    });
    expect(got.testsTotal).toBe(350.5);
    expect(got.total).toBe(350.5);
  });

  it("экспресс берёт свою цену", () => {
    const got = basketTotals({
      lines: [test({ priceExpress: "400.00", express: true })],
      tubes: [],
      discountPercent: 0,
      chargeTubes: false,
    });
    expect(got.total).toBe(400);
  });

  it("экспресс без своей цены падает на обычную", () => {
    // Бэкенд ведёт себя так же: нулевая экспресс-цена означает, что ЛИС её
    // не задала, и продавать экспресс бесплатно нельзя.
    const got = basketTotals({
      lines: [test({ priceExpress: "0", express: true })],
      tubes: [],
      discountPercent: 0,
      chargeTubes: false,
    });
    expect(got.total).toBe(250);
  });

  it("количество умножает строку", () => {
    const got = basketTotals({
      lines: [test({ priceStandard: "120.00", count: 3 })],
      tubes: [],
      discountPercent: 0,
      chargeTubes: false,
    });
    expect(got.total).toBe(360);
  });

  it("пробирки не входят в сумму по умолчанию", () => {
    const got = basketTotals({
      lines: [test({ priceStandard: "100.00" })],
      tubes: [tube({ price: "15.00", count: 2 })],
      discountPercent: 0,
      chargeTubes: false,
    });
    expect(got.tubesTotal).toBe(30);
    expect(got.total).toBe(100);
  });

  it("пробирки входят в сумму при включённой плате", () => {
    const got = basketTotals({
      lines: [test({ priceStandard: "100.00" })],
      tubes: [tube({ price: "15.00", count: 2 })],
      discountPercent: 0,
      chargeTubes: true,
    });
    expect(got.total).toBe(130);
  });

  it("скидка применяется только к анализам", () => {
    // Пробирки — расходник по цене ЛИС; скидка клиники на них не
    // распространяется. Бэкенд считает так же, и расхождение дало бы 422.
    const got = basketTotals({
      lines: [test({ priceStandard: "200.00" })],
      tubes: [tube({ price: "100.00", count: 1 })],
      discountPercent: 50,
      chargeTubes: true,
    });
    expect(got.testsTotal).toBe(100);
    expect(got.tubesTotal).toBe(100);
    expect(got.total).toBe(200);
  });

  it("на ровной половине копейки округляет так же, как бэкенд", () => {
    // 100.05 минус 50 % — это скидка ровно 50.025. Округляем СКИДКУ (→ 50.03)
    // и вычитаем, получая 50.02. Округли мы вместо этого итог, вышло бы 50.03,
    // и бэкенд с его ROUND_HALF_UP отверг бы оплату: он требует точного
    // равенства, а регистратор платит ту сумму, что видит здесь.
    const got = basketTotals({
      lines: [test({ priceStandard: "100.05" })],
      tubes: [],
      discountPercent: 50,
      chargeTubes: false,
    });
    expect(got.testsTotal).toBe(50.02);
    expect(got.total).toBe(50.02);
  });

  it("пустая корзина даёт нули, а не NaN", () => {
    const got = basketTotals({
      lines: [],
      tubes: [],
      discountPercent: 0,
      chargeTubes: false,
    });
    expect(got).toEqual({ testsTotal: 0, tubesTotal: 0, total: 0 });
  });
});
