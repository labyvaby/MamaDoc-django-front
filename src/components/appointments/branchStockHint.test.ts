import { describe, expect, it } from "vitest";

import type { BranchStockInfo, StockElsewhere } from "../../hooks/useBranchStock";
import { branchStockCaption, branchStockWarning } from "./branchStockHint";

/** Реальный кейс с прода 03.08.2026: 174 шт лежат на складе другого филиала. */
const info = (
  patch: Partial<{
    ready: boolean;
    inBranch: number;
    elsewhere: StockElsewhere[];
  }> = {},
): BranchStockInfo => {
  const { ready = true, inBranch = 0, elsewhere = [] } = patch;
  return {
    loading: false,
    ready,
    quantityOf: () => inBranch,
    elsewhereOf: () => elsewhere,
  };
};

const product = { id: 27, unit: "шт" };
const orozbekova: StockElsewhere = {
  warehouseName: "Склад (Орозбкова)",
  quantity: 174,
};

describe("branchStockCaption", () => {
  it("не показывает подпись, пока остатки филиала не загружены", () => {
    expect(branchStockCaption(info({ ready: false }), product)).toBeNull();
  });

  it("остаток филиала есть — показывает его", () => {
    expect(branchStockCaption(info({ inBranch: 12 }), product)).toBe(
      "На складе филиала: 12 шт",
    );
  });

  it("остатка нет — говорит, где товар лежит", () => {
    expect(branchStockCaption(info({ elsewhere: [orozbekova] }), product)).toBe(
      "На складе филиала нет · есть на «Склад (Орозбкова)»: 174",
    );
  });

  it("остатка нет нигде — только факт отсутствия", () => {
    expect(branchStockCaption(info({}), product)).toBe("На складе филиала нет");
  });
});

describe("branchStockWarning", () => {
  it("остатка филиала хватает — молчит", () => {
    expect(branchStockWarning(info({ inBranch: 5 }), product, 5)).toBeNull();
  });

  it("остатка нет — предупреждает и подсказывает, откуда передать", () => {
    expect(branchStockWarning(info({ elsewhere: [orozbekova] }), product, 1)).toBe(
      "На складе филиала остатка нет — сохранение может быть отклонено. " +
        "Есть на «Склад (Орозбкова)»: 174. " +
        "Передайте товар на склад филиала в разделе «Склады».",
    );
  });

  it("остатка меньше запрошенного — называет доступное количество", () => {
    expect(branchStockWarning(info({ inBranch: 2 }), product, 3)).toBe(
      "На складе филиала только 2 шт — сохранение может быть отклонено. " +
        "Передайте товар на склад филиала в разделе «Склады».",
    );
  });

  it("данные не загружены или количество не задано — молчит", () => {
    expect(branchStockWarning(info({ ready: false }), product, 1)).toBeNull();
    expect(branchStockWarning(info({}), product, 0)).toBeNull();
  });
});
