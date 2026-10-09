import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import { debtPayments, debtState, emptyDebtDraft, type DebtDraft } from "./debtPayment";

const terminals = [{ id: 10, name: "POS Бакай", isDefault: true }, { id: 11, name: "POS МБанк" }];
const draft = (patch: Partial<DebtDraft> = {}): DebtDraft => ({ ...emptyDebtDraft(["cash", "card", "cashless"], terminals), ...patch });

describe("вкладка «В долг»", () => {
  it("по умолчанию — ничего не внесено, срок через две недели, терминал по умолчанию", () => {
    const value = draft();
    expect(value.paidNow).toBe("");
    expect(value.paidMethod).toBe("cash");
    expect(value.cashlessMethodId).toBe(10);
    expect(value.dueDate).toBe(dayjs().add(14, "day").format("YYYY-MM-DD"));
  });

  it("весь чек в долг: одна строка debt на всю сумму", () => {
    const state = debtState(500000, draft());
    expect(state).toEqual({ paidNow: 0, debt: 500000, ready: true, problem: null });
    const { payments, terms } = debtPayments(500000, draft({ comment: " после зарплаты " }));
    expect(payments).toEqual([{ method: "debt", amount: "5000.00" }]);
    expect(terms).toEqual({ debtDueDate: dayjs().add(14, "day").format("YYYY-MM-DD"), debtComment: "после зарплаты" });
  });

  it("часть сейчас картой через терминал, остальное — долг", () => {
    const value = draft({ paidNow: "2 000", paidMethod: "card", cashlessMethodId: 11 });
    expect(debtState(500000, value, { needTerminal: true }).debt).toBe(300000);
    expect(debtPayments(500000, value).payments).toEqual([
      { method: "card", amount: "2000.00", cashlessMethodId: 11 },
      { method: "debt", amount: "3000.00" },
    ]);
  });

  it("наличные сейчас не несут терминала", () => {
    const value = draft({ paidNow: "1000", paidMethod: "cash", cashlessMethodId: 11 });
    expect(debtPayments(500000, value).payments[0]).toEqual({ method: "cash", amount: "1000.00" });
  });

  it("вся сумма внесена — это не долг", () => {
    const state = debtState(500000, draft({ paidNow: "5000" }));
    expect(state.ready).toBe(false);
    expect(state.problem).toMatch(/обычная оплата/);
  });

  it("мусор в сумме, терминал без выбора и срок в прошлом — именованные проблемы", () => {
    expect(debtState(500000, draft({ paidNow: "abc" })).problem).toMatch(/Проверьте сумму/);
    expect(debtState(500000, draft({ paidNow: "100", paidMethod: "card", cashlessMethodId: null }), { needTerminal: true }).problem)
      .toMatch(/терминал/);
    expect(debtState(500000, draft({ dueDate: dayjs().subtract(1, "day").format("YYYY-MM-DD") })).problem).toMatch(/в прошлом/);
  });

  it("без срока — debtDueDate null", () => {
    expect(debtPayments(500000, draft({ dueDate: "" })).terms.debtDueDate).toBeNull();
  });
});
