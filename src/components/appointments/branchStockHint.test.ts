import { describe, expect, it } from "vitest";

import type { StockElsewhere, StockElsewhereInfo } from "../../hooks/useStockElsewhere";
import { branchStockCaption, branchStockWarning } from "./branchStockHint";

/** Реальный кейс с прода 03.08.2026: 174 шт лежат на складе другого филиала. */
const info = (
  patch: Partial<{ ready: boolean; elsewhere: StockElsewhere[] }> = {},
): StockElsewhereInfo => {
  const { ready = true, elsewhere = [] } = patch;
  return { loading: false, ready, elsewhereOf: () => elsewhere };
};

/** Товар пикера: `branchStock` — остаток склада списания филиала. */
const product = (branchStock: number | null) => ({ id: 27, unit: "шт", branchStock });

const orozbekova: StockElsewhere = {
  warehouseName: "Склад (Орозбкова)",
  quantity: 174,
};

describe("branchStockCaption", () => {
  it("остаток филиала неизвестен — молчит", () => {
    expect(branchStockCaption(info(), product(null))).toBeNull();
  });

  it("остаток филиала есть — молчит (его показывает основная строка опции)", () => {
    expect(branchStockCaption(info(), product(12))).toBeNull();
  });

  it("остатка нет — говорит, где товар лежит", () => {
    expect(
      branchStockCaption(info({ elsewhere: [orozbekova] }), product(0)),
    ).toBe("На складе филиала нет · есть на «Склад (Орозбкова)»: 174");
  });

  it("остатка нет нигде — только факт отсутствия", () => {
    expect(branchStockCaption(info(), product(0))).toBe("На складе филиала нет");
  });

  it("подсказка про другой склад ждёт загрузки остатков", () => {
    expect(
      branchStockCaption(info({ ready: false, elsewhere: [orozbekova] }), product(0)),
    ).toBe("На складе филиала нет");
  });
});

describe("branchStockWarning", () => {
  it("остатка филиала хватает — молчит", () => {
    expect(branchStockWarning(info(), product(5), 5)).toBeNull();
  });

  it("остатка нет — предупреждает и подсказывает, откуда передать", () => {
    expect(
      branchStockWarning(info({ elsewhere: [orozbekova] }), product(0), 1),
    ).toBe(
      "На складе филиала остатка нет — сохранение может быть отклонено. " +
        "Есть на «Склад (Орозбкова)»: 174. " +
        "Передайте товар на склад филиала в разделе «Склады».",
    );
  });

  it("остатка меньше запрошенного — называет доступное количество", () => {
    expect(branchStockWarning(info(), product(2), 3)).toBe(
      "На складе филиала только 2 шт — сохранение может быть отклонено. " +
        "Передайте товар на склад филиала в разделе «Склады».",
    );
  });

  it("остаток неизвестен или количество не задано — молчит", () => {
    expect(branchStockWarning(info(), product(null), 1)).toBeNull();
    expect(branchStockWarning(info(), product(0), 0)).toBeNull();
  });
});
