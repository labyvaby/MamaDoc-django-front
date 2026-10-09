import { describe, expect, it } from "vitest";

import { saleDebtSummary } from "./saleDebt";

const receipt = (payments: Array<{ method: string; amount: string }>) => ({
  totalAmount: "26900.00",
  payments: payments.map((payment, index) => ({ id: index + 1, ...payment })),
});

describe("чек, проданный в долг", () => {
  it("сразу после продажи: долг и срок из ответа checkout", () => {
    const debt = { id: 1, clientId: 2, amount: "20000.00", outstanding: "20000.00", status: "open", dueDate: "2026-11-08", comment: "" };
    expect(saleDebtSummary(receipt([{ method: "cash", amount: "6900" }, { method: "debt", amount: "20000" }]), debt))
      .toEqual({ debt: 20000, paidNow: 6900, dueDate: "2026-11-08" });
  });

  it("из истории: сумма из строки «в долг», срок неизвестен", () => {
    expect(saleDebtSummary(receipt([{ method: "debt", amount: "26900" }]), null))
      .toEqual({ debt: 26900, paidNow: 0, dueDate: undefined });
  });

  it("обычный чек — не долг", () => {
    expect(saleDebtSummary(receipt([{ method: "cash", amount: "26900" }]), null)).toBeNull();
    expect(saleDebtSummary(null, null)).toBeNull();
  });
});
