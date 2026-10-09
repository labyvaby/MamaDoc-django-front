import { describe, expect, it } from "vitest";

import { emptyRepayDraft, fillRest, repayBody, repayPlan, type RepayDraft } from "./repayPlan";

const OWED = 490000; // 4 900 с
const draft = (patch: Partial<RepayDraft> = {}): RepayDraft => ({ ...emptyRepayDraft(OWED, 10), ...patch });

describe("принять оплату долга", () => {
  it("по умолчанию — весь остаток наличными, долг закрывается", () => {
    const plan = repayPlan(OWED, draft());
    expect(plan).toMatchObject({ total: 490000, rest: 0, ready: true });
    expect(repayBody(plan, draft())).toEqual({ method: "cash", amount: "4900.00" });
  });

  it("часть долга картой — с терминалом, номером транзакции и комментарием", () => {
    const value = draft({ amount: "1 000", method: "card", reference: " T-7 ", comment: " первая часть " });
    const plan = repayPlan(OWED, value, { needTerminal: true });
    expect(plan.rest).toBe(390000);
    expect(repayBody(plan, value)).toEqual({ method: "card", amount: "1000.00", cashlessMethodId: 10, reference: "T-7", comment: "первая часть" });
  });

  it("частями: наличные + QR уходят списком parts", () => {
    const value = draft({ mode: "split", split: { cash: "2000", card: "", cashless: "900" } });
    const plan = repayPlan(OWED, value, { needTerminal: true });
    expect(plan).toMatchObject({ total: 290000, rest: 200000, ready: true });
    expect(repayBody(plan, value)).toEqual({
      parts: [
        { method: "cash", amount: "2000.00" },
        { method: "cashless", amount: "900.00", cashlessMethodId: 10 },
      ],
    });
  });

  it("«Остаток сюда» добирает до остатка долга", () => {
    const value = fillRest(OWED, draft({ mode: "split", split: { cash: "2000", card: "", cashless: "" } }), "card");
    expect(value.split.card).toBe("2900");
    expect(repayPlan(OWED, value).rest).toBe(0);
  });

  it("больше остатка, пусто, мусор и безнал без терминала — понятные причины", () => {
    expect(repayPlan(OWED, draft({ amount: "5000" })).problem).toBe("Больше остатка долга на 100 с");
    expect(repayPlan(OWED, draft({ amount: "" })).problem).toBe("Введите сумму");
    expect(repayPlan(OWED, draft({ mode: "split" })).problem).toBe("Внесите сумму хотя бы одним способом");
    expect(repayPlan(OWED, draft({ amount: "abc" })).problem).toMatch(/Проверьте сумму/);
    const noTerminal = draft({ method: "cashless", terminals: { card: null, cashless: null } });
    expect(repayPlan(OWED, noTerminal, { needTerminal: true }).problem).toBe("Выберите терминал для «QR»");
  });
});
