import { describe, expect, it } from "vitest";

import { ApiError } from "./client";
import { parseInsufficientStock } from "./appointments";

/** Реальная форма ответа из контракта бэка 03.08.2026 (BACKEND_FIXES). */
const payload = {
  detail: [
    {
      // Префикс поля «products: » приходит живьём (прод, 03.08.2026).
      msg: "products: Недостаточно товара «Стрептатест A и B» на складе: нужно 1, в наличии 0.",
      type: "insufficient_stock",
      code: "insufficient_stock",
      productId: 27,
      warehouseId: 7,
      warehouseName: "Склад (Сейтек)",
      required: 1,
      available: "0.000",
    },
  ],
};

const apiError = (body: unknown, status = 400) =>
  new ApiError("boom", status, body);

describe("parseInsufficientStock", () => {
  it("разбирает нехватку остатка в машинные поля", () => {
    expect(parseInsufficientStock(apiError(payload))).toEqual({
      productId: 27,
      // старая форма товар не называла — имя берётся из формы приёма
      productName: null,
      warehouseId: 7,
      warehouseName: "Склад (Сейтек)",
      required: "1",
      available: "0.000",
      msg: "Недостаточно товара «Стрептатест A и B» на складе: нужно 1, в наличии 0.",
    });
  });

  it("находит нехватку не только в первом элементе detail", () => {
    const mixed = { detail: [{ msg: "Проверьте дату" }, payload.detail[0]] };
    expect(parseInsufficientStock(apiError(mixed))?.productId).toBe(27);
  });

  it("матчит по type, если code не пришёл", () => {
    const onlyType = {
      detail: [{ msg: "нет остатка", type: "INSUFFICIENT_STOCK", productId: 5 }],
    };
    expect(parseInsufficientStock(apiError(onlyType))).toMatchObject({
      productId: 5,
      warehouseName: null,
      required: null,
    });
  });

  it("игнорирует другие ошибки формы и не-400", () => {
    expect(parseInsufficientStock(apiError({ detail: [{ msg: "Выберите филиал" }] }))).toBeNull();
    expect(parseInsufficientStock(apiError({ error: "Недостаточно товара" }))).toBeNull();
    expect(parseInsufficientStock(apiError(payload, 409))).toBeNull();
    expect(parseInsufficientStock(new Error("network"))).toBeNull();
  });

  // Форма из ответа бэка 25.08.2026: конверт, обе величины строками-decimal.
  describe("новый конверт", () => {
    const envelopePayload = {
      error: {
        code: "INSUFFICIENT_STOCK",
        message: "Недостаточно товара «Гель» на складе: нужно 5, в наличии 0.",
        details: {
          code: "insufficient_stock",
          productId: 41,
          productName: "Гель",
          warehouseId: 7,
          warehouseName: "Основной склад",
          required: "5.000",
          available: "0.000",
        },
        trace_id: "3f2b1c",
      },
    };

    it("разбирает details и берёт название товара из ответа", () => {
      expect(parseInsufficientStock(apiError(envelopePayload))).toEqual({
        productId: 41,
        productName: "Гель",
        warehouseId: 7,
        warehouseName: "Основной склад",
        required: "5.000",
        available: "0.000",
        msg: "Недостаточно товара «Гель» на складе: нужно 5, в наличии 0.",
      });
    });

    it("не срабатывает на другой код в конверте", () => {
      const other = {
        error: { code: "VALIDATION_ERROR", message: "Проверьте поля", details: { fields: {} } },
      };
      expect(parseInsufficientStock(apiError(other))).toBeNull();
    });
  });
});
