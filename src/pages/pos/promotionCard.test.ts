import { describe, expect, it } from "vitest";

import type { PosQuote } from "../../api/pos";
import { activePromotionsLabel, appliedPromotionsLabel, promotionCardView } from "./promotionCard";

const quote = (extra: Partial<PosQuote> = {}): PosQuote => ({
  subtotal: "5000.00",
  discount: "0.00",
  total: "5000.00",
  bonuses: "0.00",
  certificateAmount: "0.00",
  due: "5000.00",
  lines: [],
  ...extra,
});
const base = { count: 2, enabled: false, quote: quote(), busy: false, frozen: false, manualDiscount: false, clientDiscount: false };
const plain = (text: string) => text.replace(/\u00a0/g, " ");

describe("promotionCardView", () => {
  it("disables the button when the organization has no active promotions", () => {
    const view = promotionCardView({ ...base, count: 0 });
    expect(view).toMatchObject({ hint: "Нет активных акций", disabled: true, applied: false, buttonLabel: null });
  });

  it("still lets a stale switch be turned off when promotions are gone", () => {
    const view = promotionCardView({ ...base, count: 0, enabled: true });
    expect(view).toMatchObject({ disabled: false, buttonLabel: "Отменить" });
  });

  it("keeps the old behaviour when the backend does not send the count", () => {
    const view = promotionCardView({ ...base, count: undefined });
    expect(view).toMatchObject({ hint: "автоматические скидки по акциям", disabled: false });
  });

  it("names how many promotions are active before applying", () => {
    expect(promotionCardView(base).hint).toBe("2 активные акции — скидка сама подберётся к чеку");
    expect(activePromotionsLabel(1)).toBe("1 активная акция");
    expect(activePromotionsLabel(5)).toBe("5 активных акций");
    expect(activePromotionsLabel(11)).toBe("11 активных акций");
    expect(activePromotionsLabel(22)).toBe("22 активные акции");
  });

  it("says plainly that no promotion fits the receipt", () => {
    const view = promotionCardView({ ...base, enabled: true, quote: quote({ promotionApplied: false }) });
    expect(view).toMatchObject({ hint: "Ни одна акция не подходит к этому чеку", tone: "warning", buttonLabel: "Отменить", applied: false });
  });

  it("explains that a manual discount blocks promotions", () => {
    const view = promotionCardView({ ...base, enabled: true, manualDiscount: true, quote: quote({ promotionApplied: false }) });
    expect(view.hint).toMatch(/не сочетаются с ручной скидкой/);
  });

  it("explains a client discount that is bigger than any promotion", () => {
    const view = promotionCardView({ ...base, enabled: true, clientDiscount: true, quote: quote({ promotionApplied: false }) });
    expect(view.hint).toBe("Ни одна акция не даёт скидку больше скидки клиента");
  });

  it("waits for the server while the receipt is recalculated", () => {
    expect(promotionCardView({ ...base, enabled: true, busy: true }).hint).toBe("Проверяем подходящие акции…");
  });

  it("shows which promotion applied and by how much", () => {
    const applied = quote({
      promotionApplied: true,
      discount: "1500.00",
      appliedPromotions: [
        { id: 1, name: "Осень −10%", amount: "500.00" },
        { id: 2, name: "Пятница", amount: "1000.00" },
      ],
    });
    const view = promotionCardView({ ...base, enabled: true, quote: applied });
    expect(view).toMatchObject({ tone: "applied", applied: true });
    expect(plain(view.hint)).toBe("«Осень −10%» −500 с, «Пятница» −1 000 с");
  });

  it("falls back to the discount total without promotion names", () => {
    expect(plain(appliedPromotionsLabel(quote({ promotionApplied: true, discount: "250.00" })))).toBe("Скидка по акции −250 с");
  });
});
