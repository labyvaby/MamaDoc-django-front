import { describe, it, expect } from "vitest";

import {
  normalizeLabOrder,
  normalizeLabOrderDetail,
  testIdsQuery,
  type LabOrderDetailRaw,
  type LabOrderRaw,
} from "./lab";

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

const rawDetail = (over: Partial<LabOrderDetailRaw> = {}): LabOrderDetailRaw => ({
  id: 41,
  patientId: 9622,
  patientName: "Иванова А.",
  branchName: "Центральный",
  status: "dispatched",
  diagnosis: "Плановое обследование",
  comment: "Натощак",
  referringDoctorName: "",
  personalDataConsentAt: null,
  discountPercent: 10,
  totalAmount: "450.00",
  paidCash: "450.00",
  paidCard: "0.00",
  lisOrderId: 883,
  lisOrderCode: 55,
  dispatchedAt: "2026-09-09T09:05:00+06:00",
  dispatchError: "",
  createdAt: "2026-09-09T09:00:00+06:00",
  lines: [
    { id: 1, testId: 12, titleSnapshot: "Глюкоза", price: "150.00", countItem: 1, isExpress: false },
  ],
  instruments: [
    { id: 2, instrumentId: 3, titleSnapshot: "Пробирка EDTA", price: "50.00", count: 1 },
  ],
  answers: [],
  ...over,
});

describe("normalizeLabOrderDetail", () => {
  it("переводит отправленный заказ: суммы числами, состав и статус на месте", () => {
    expect(normalizeLabOrderDetail(rawDetail())).toEqual({
      id: 41,
      patientId: 9622,
      referringDoctorName: "",
      personalDataConsentAt: null,
      patientName: "Иванова А.",
      branchName: "Центральный",
      isDispatched: true,
      diagnosis: "Плановое обследование",
      comment: "Натощак",
      discountPercent: 10,
      totalAmount: 450,
      paidCash: 450,
      paidCard: 0,
      lisOrderId: 883,
      lisOrderCode: 55,
      dispatchedAt: "2026-09-09T09:05:00+06:00",
      dispatchError: "",
      createdAt: "2026-09-09T09:00:00+06:00",
      lines: [
        { id: 1, testId: 12, titleSnapshot: "Глюкоза", price: "150.00", countItem: 1, isExpress: false },
      ],
      instruments: [
        { id: 2, instrumentId: 3, titleSnapshot: "Пробирка EDTA", price: "50.00", count: 1 },
      ],
    });
  });

  it("неотправленный заказ несёт причину отказа и не имеет номера в ЛИС", () => {
    // Именно на этих трёх полях держится карточка неотправленного заказа —
    // перепутать null с отсутствующим полем значило бы напечатать пустой
    // штрихкод молча (см. labOrderStatus.ts).
    const detail = normalizeLabOrderDetail(
      rawDetail({
        status: "pending_dispatch",
        lisOrderId: null,
        lisOrderCode: null,
        dispatchedAt: null,
        dispatchError: "ЛИС недоступна: таймаут соединения",
      }),
    );
    expect(detail.isDispatched).toBe(false);
    expect(detail.lisOrderId).toBeNull();
    expect(detail.lisOrderCode).toBeNull();
    expect(detail.dispatchedAt).toBeNull();
    expect(detail.dispatchError).toBe("ЛИС недоступна: таймаут соединения");
  });

  it("непарсящиеся суммы дают ноль, а не NaN", () => {
    // NaN пролез бы дальше в formatKGS и сломал бы карточку оплаты.
    const detail = normalizeLabOrderDetail(
      rawDetail({ totalAmount: "", paidCash: "мусор", paidCard: "0" }),
    );
    expect(detail.totalAmount).toBe(0);
    expect(detail.paidCash).toBe(0);
    expect(detail.paidCard).toBe(0);
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
