import { describe, it, expect } from "vitest";

import { normalizeLabOrder, testIdsQuery, type LabOrderRaw } from "./lab";

const raw = (over: Partial<LabOrderRaw> = {}): LabOrderRaw => ({
  id: 7,
  patientId: 9622,
  patientName: "Иванова А.",
  branchName: "Центральный",
  status: "dispatched",
  totalAmount: "250.00",
  lisOrderCode: 55,
  titles: ["Глюкоза", "Железо"],
  createdAt: "2026-09-03T09:00:00+06:00",
  ...over,
});

describe("normalizeLabOrder", () => {
  it("раскладывает состав и сумму", () => {
    const order = normalizeLabOrder(raw());
    expect(order.titles).toEqual(["Глюкоза", "Железо"]);
    expect(order.totalAmount).toBe(250);
    expect(order.isDispatched).toBe(true);
  });

  it("не отправленный заказ помечается флагом", () => {
    // На этом флаге держится плитка «Не отправлены» и кнопка повтора;
    // спутать его со статусом-строкой означает потерять зависшие заказы.
    const order = normalizeLabOrder(
      raw({ status: "pending_dispatch", lisOrderCode: null }),
    );
    expect(order.isDispatched).toBe(false);
    expect(order.lisOrderCode).toBeNull();
  });

  it("пустой состав не ломает нормализацию", () => {
    const order = normalizeLabOrder(raw({ titles: undefined, totalAmount: "0" }));
    expect(order.titles).toEqual([]);
    expect(order.totalAmount).toBe(0);
  });

  it("непарсящаяся сумма даёт ноль, а не NaN", () => {
    // NaN пролез бы в плитку «Сумма» и обнулил бы её целиком через reduce.
    const order = normalizeLabOrder(raw({ totalAmount: "" }));
    expect(order.totalAmount).toBe(0);
  });
});

describe("testIdsQuery", () => {
  it("склеивает идентификаторы через запятую по возрастанию", () => {
    expect(testIdsQuery([3, 1, 2])).toBe("1,2,3");
  });

  it("убирает дубли", () => {
    expect(testIdsQuery([1, 1, 2])).toBe("1,2");
  });

  it("пустой список даёт пустую строку", () => {
    // Пустая строка — сигнал вызывающему коду не делать запрос вовсе:
    // `?tests=` без значений вернул бы весь справочник.
    expect(testIdsQuery([])).toBe("");
  });
});
