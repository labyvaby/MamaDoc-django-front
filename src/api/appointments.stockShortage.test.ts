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
});
