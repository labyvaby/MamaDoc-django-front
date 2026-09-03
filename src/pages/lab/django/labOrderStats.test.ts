import { describe, it, expect } from "vitest";

import { labOrderStats } from "./labOrderStats";
import type { LabOrder } from "../../../api/lab";

const order = (over: Partial<LabOrder> = {}): LabOrder => ({
  id: 1,
  patientId: 1,
  patientName: "Иванова А.",
  branchName: "Центральный",
  status: "dispatched",
  isDispatched: true,
  totalAmount: 250,
  lisOrderCode: 55,
  titles: ["Глюкоза"],
  createdAt: "2026-09-03T09:00:00+06:00",
  ...over,
});

describe("labOrderStats", () => {
  it("считает всего и сумму", () => {
    const got = labOrderStats([order(), order({ id: 2, totalAmount: 100 })]);
    expect(got.total).toBe(2);
    expect(got.amount).toBe(350);
  });

  it("считает неотправленные отдельно", () => {
    // Эта цифра — единственный способ заметить оплаченный, но зависший
    // заказ: дровер уже закрыт, а пробирки лежат без метки.
    const got = labOrderStats([
      order(),
      order({ id: 2, isDispatched: false, status: "pending_dispatch" }),
    ]);
    expect(got.pending).toBe(1);
  });

  it("пустой список даёт нули", () => {
    expect(labOrderStats([])).toEqual({ total: 0, pending: 0, amount: 0 });
  });

  it("копейки складываются без накопления погрешности", () => {
    // Наивное суммирование 0.1 + 0.2 дало бы 0.30000000000000004, и плитка
    // «Сумма» показала бы мусор в дробной части.
    const got = labOrderStats([
      order({ totalAmount: 0.1 }),
      order({ id: 2, totalAmount: 0.2 }),
    ]);
    expect(got.amount).toBe(0.3);
  });
});
