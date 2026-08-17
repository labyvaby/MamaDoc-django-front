import { describe, it, expect } from "vitest";

import { ApiError } from "./client";
import {
  cashlessMethodInUseMessage,
  isCashlessMethodInUseError,
  parseCashlessMethodUsage,
  pickDefaultCashlessMethodId,
  type DjangoCashlessMethod,
} from "./cashlessMethods";

function method(
  over: Partial<DjangoCashlessMethod> & Pick<DjangoCashlessMethod, "id">,
): DjangoCashlessMethod {
  return {
    organizationId: 1,
    branchId: null,
    branchName: null,
    name: `Способ ${over.id}`,
    isActive: true,
    isDefault: false,
    createdAt: "2026-08-16T00:00:00Z",
    updatedAt: "2026-08-16T00:00:00Z",
    ...over,
  };
}

describe("pickDefaultCashlessMethodId", () => {
  it("предпочитает дефолт филиала операции общеорганизационному", () => {
    const list = [
      method({ id: 1, isDefault: true }),
      method({ id: 2, branchId: 12, branchName: "Филиал", isDefault: true }),
    ];
    expect(pickDefaultCashlessMethodId(list, 12)).toBe(2);
  });

  it("берёт общеорганизационный дефолт, когда у филиала своего нет", () => {
    const list = [
      method({ id: 1, isDefault: true }),
      method({ id: 2, branchId: 12, branchName: "Филиал" }),
    ];
    expect(pickDefaultCashlessMethodId(list, 12)).toBe(1);
  });

  it("подставляет единственный способ, даже если он не отмечен дефолтом", () => {
    expect(pickDefaultCashlessMethodId([method({ id: 7 })], 12)).toBe(7);
  });

  it("оставляет выбор кассиру, когда способов несколько и дефолта нет", () => {
    const list = [method({ id: 1 }), method({ id: 2 })];
    expect(pickDefaultCashlessMethodId(list, 12)).toBe("");
  });

  it("не подставляет скрытый способ", () => {
    const list = [method({ id: 1, isActive: false, isDefault: true })];
    expect(pickDefaultCashlessMethodId(list, 12)).toBe("");
  });

  it("работает без филиала операции: остаётся общеорганизационный дефолт", () => {
    const list = [
      method({ id: 1, isDefault: true }),
      method({ id: 2, branchId: 12, branchName: "Филиал", isDefault: true }),
    ];
    expect(pickDefaultCashlessMethodId(list, null)).toBe(1);
  });

  it("при двух дефолтах одной пары берёт последний назначенный", () => {
    // Уникальность держит бэк, но до чистки исторических данных пара
    // (организация, филиал) может прийти с двумя isDefault — выбор должен быть
    // одинаковым во всех вкладках, а не по порядку ответа.
    const list = [
      method({ id: 1, isDefault: true, updatedAt: "2026-08-01T10:00:00Z" }),
      method({ id: 2, isDefault: true, updatedAt: "2026-08-16T10:00:00Z" }),
    ];
    expect(pickDefaultCashlessMethodId(list, 12)).toBe(2);
    expect(pickDefaultCashlessMethodId([...list].reverse(), 12)).toBe(2);
  });
});

describe("isCashlessMethodInUseError", () => {
  // Форма ответа снята с тестового стенда 16.08.2026.
  const inUse = new ApiError("conflict", 409, {
    detail: [
      {
        msg: "Cashless method is used in 1 operations (0 payments, 1 expenses, 0 stock movements). It can only be deactivated.",
        type: "in_use",
      },
    ],
  });

  it("распознаёт 409 с признаком in_use", () => {
    expect(isCashlessMethodInUseError(inUse)).toBe(true);
  });

  it("распознаёт признак in_use и без статуса 409", () => {
    const asBadRequest = new ApiError("bad request", 400, {
      detail: [{ msg: "…", type: "in_use" }],
    });
    expect(isCashlessMethodInUseError(asBadRequest)).toBe(true);
  });

  it("не путает с прочими ошибками", () => {
    expect(isCashlessMethodInUseError(new ApiError("forbidden", 403, null))).toBe(false);
    expect(isCashlessMethodInUseError(new Error("offline"))).toBe(false);
  });
});

describe("cashlessMethodInUseMessage", () => {
  it("отдаёт русский текст бэка — в нём единственные счётчики операций", () => {
    const err = new ApiError("conflict", 409, {
      detail: [
        {
          msg: "Способ использован в 3 операциях (1 платёж, 2 расхода, 0 движений склада). Его можно только скрыть.",
          type: "in_use",
        },
      ],
    });
    expect(cashlessMethodInUseMessage(err)).toContain("3 операциях");
  });

  it("молчит на английском сообщении — свой текст лучше сырого чужого", () => {
    const err = new ApiError("conflict", 409, {
      detail: [{ msg: "Cashless method is used in 1 operations.", type: "in_use" }],
    });
    expect(cashlessMethodInUseMessage(err)).toBeNull();
  });

  it("понимает и строковый detail", () => {
    const err = new ApiError("conflict", 409, { detail: "Способ использован в 1 операции." });
    expect(cashlessMethodInUseMessage(err)).toBe("Способ использован в 1 операции.");
  });
});

describe("parseCashlessMethodUsage", () => {
  it("берёт счётчики и приёмы из полей ответа (бэк с 17.08.2026)", () => {
    const err = new ApiError("conflict", 409, {
      detail: [{ msg: "Cashless method is used in 2 operations", type: "in_use" }],
      usage: { payments: 1, expenses: 1, stockMovements: 0, total: 2 },
      appointmentIds: [123],
    });
    expect(parseCashlessMethodUsage(err)).toEqual({
      payments: 1,
      expenses: 1,
      movements: 0,
      total: 2,
      appointmentIds: [123],
    });
  });

  it("считает всего сам, если поле total бэк не прислал", () => {
    const err = new ApiError("conflict", 409, {
      detail: [{ msg: "in use", type: "in_use" }],
      usage: { payments: 2, expenses: 0, stockMovements: 3 },
    });
    const usage = parseCashlessMethodUsage(err);
    expect(usage?.total).toBe(5);
    expect(usage?.appointmentIds).toEqual([]);
  });

  it("достаёт счётчики из английской строки — числа от языка не зависят", () => {
    // Ровно та строка, что приходит с прода 16.08.2026.
    const err = new ApiError("conflict", 409, {
      detail: [
        {
          msg: "Cashless method is used in 1 operations (0 payments, 1 expenses, 0 stock movements). It can only be deactivated.",
          type: "in_use",
        },
      ],
    });
    expect(parseCashlessMethodUsage(err)).toEqual({
      payments: 0,
      expenses: 1,
      movements: 0,
      total: 1,
      appointmentIds: [],
    });
  });

  it("разбирает и русскую строку, когда локализация доедет", () => {
    const err = new ApiError("conflict", 409, {
      detail: "Способ использован в 3 операциях (1 платёж, 2 расхода, 0 движений склада).",
    });
    expect(parseCashlessMethodUsage(err)).toEqual({
      payments: 1,
      expenses: 2,
      movements: 0,
      total: 3,
      appointmentIds: [],
    });
  });

  it("считает всего сам, если общего числа в тексте нет", () => {
    const err = new ApiError("conflict", 409, {
      detail: [{ msg: "2 payments, 1 expenses, 3 stock movements", type: "in_use" }],
    });
    expect(parseCashlessMethodUsage(err)?.total).toBe(6);
  });

  it("молчит, когда ни одной категории не распознал", () => {
    // Иначе диалог показал бы уверенные «0 / 0 / 0» по непонятому тексту.
    const err = new ApiError("conflict", 409, { detail: "Cashless method is in use." });
    expect(parseCashlessMethodUsage(err)).toBeNull();
    expect(parseCashlessMethodUsage(new Error("offline"))).toBeNull();
  });
});
