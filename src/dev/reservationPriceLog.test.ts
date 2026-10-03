import { describe, expect, it } from "vitest";

import { describePriceChange as raw } from "./reservationPriceLog";

// toLocaleString("ru-RU") разделяет тысячи неразрывным пробелом.
const describePriceChange = (log: Parameters<typeof raw>[0]) => raw(log).replace(/\s/g, " ");

describe("describePriceChange", () => {
  it("цена ночи и скидка номера", () => {
    const text = describePriceChange({
      field: "pricing",
      oldValue: JSON.stringify({ itemId: 12, discountPercent: null, nights: { "2026-10-01": { price: "4000.00", discount: "0.00", isManual: false } } }),
      newValue: JSON.stringify({ itemId: 12, discountPercent: "10.00", nights: { "2026-10-01": { price: "3500.00", discount: "350.00", isManual: true } } }),
    });
    expect(text).toContain("3 500");
    expect(text).toContain("4 000");
    expect(text).toContain("скидка номера: нет → 10%");
  });

  it("возврат к цене по тарифу помечается", () => {
    const text = describePriceChange({
      field: "pricing",
      oldValue: JSON.stringify({ nights: { "2026-10-02": { price: "3500.00", isManual: true } } }),
      newValue: JSON.stringify({ nights: { "2026-10-02": { price: "4000.00", isManual: false } } }),
    });
    expect(text).toContain("(по тарифу)");
  });

  it("своя сумма номера и испорченный JSON", () => {
    expect(describePriceChange({ field: "total_amount", oldValue: "5400.00", newValue: "5000.00" })).toBe("Своя сумма номера: 5 400 → 5 000");
    expect(describePriceChange({ field: "pricing", oldValue: "", newValue: "не json" })).toBe("Цены изменены");
  });
});
