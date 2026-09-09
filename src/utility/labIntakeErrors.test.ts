import { describe, it, expect } from "vitest";

import { ApiError } from "../api/client";
import { describeLabIntakeOrderError } from "./labIntakeErrors";

describe("describeLabIntakeOrderError", () => {
  it("422 — отказ данных, в БД ничего не создано", () => {
    const err = new ApiError("ИНН: Обязательное поле.", 422, {
      error: {
        code: "VALIDATION_ERROR",
        message: "ИНН: Обязательное поле.",
        details: { fields: { inn: "Обязательное поле." } },
        trace_id: "trace-1",
      },
    });
    expect(describeLabIntakeOrderError(err)).toEqual({
      kind: "validation",
      message: "ИНН: Обязательное поле.",
    });
  });

  it("502 с номером заказа — ЛИС недоступна, заказ создан и оплачен", () => {
    const err = new ApiError("ЛИС недоступна: таймаут соединения.", 502, {
      error: {
        code: "LAB_UNAVAILABLE",
        message: "ЛИС недоступна: таймаут соединения.",
        details: { orderId: 501 },
        trace_id: "trace-2",
      },
    });
    expect(describeLabIntakeOrderError(err)).toEqual({
      kind: "lisUnavailable",
      message: "ЛИС недоступна: таймаут соединения.",
      orderId: 501,
    });
  });

  it("502 без orderId в теле — не наш опознанный сбой ЛИС, общая ошибка", () => {
    // Контракт (docs/lab-intake-design.md) обещает orderId в details при 502
    // на приёме всегда. Если его нет — это может быть сырой 502 от прокси
    // (сервер не отвечал, JSON не распарсился), а не ответ бэкенда приёма.
    // Утверждать «оплачено, не отправлено» без доказательства (orderId)
    // опаснее, чем показать общую ошибку: регистратор не должен думать, что
    // деньги приняты, если это не подтверждено.
    const err = new ApiError("Ошибка на сервере. Попробуйте позже.", 502, null);
    expect(describeLabIntakeOrderError(err)).toEqual({
      kind: "other",
      message: "Ошибка на сервере. Попробуйте позже.",
    });
  });

  it("502 с нечисловым orderId — тоже общая ошибка, а не мнимый номер заказа", () => {
    const err = new ApiError("ЛИС недоступна.", 502, {
      error: {
        code: "LAB_UNAVAILABLE",
        message: "ЛИС недоступна.",
        details: { orderId: "не число" },
        trace_id: null,
      },
    });
    expect(describeLabIntakeOrderError(err)).toEqual({
      kind: "other",
      message: "ЛИС недоступна.",
    });
  });

  it("прочий статус (500) — общая ошибка", () => {
    const err = new ApiError("Ошибка на сервере. Попробуйте позже.", 500, null);
    expect(describeLabIntakeOrderError(err)).toEqual({
      kind: "other",
      message: "Ошибка на сервере. Попробуйте позже.",
    });
  });

  it("403 (модуль/права) — тоже общая ошибка на этом уровне", () => {
    // Раздел скрыт при отсутствии lab.view/lab.accept — по дизайну 403 «не
    // должен случаться», отдельной обработки ему design не отводит.
    const err = new ApiError("Недостаточно прав для этого действия.", 403, null);
    expect(describeLabIntakeOrderError(err)).toEqual({
      kind: "other",
      message: "Недостаточно прав для этого действия.",
    });
  });

  it("не ApiError (сетевой сбой без обёртки) — сообщение через getErrorMessage", () => {
    expect(describeLabIntakeOrderError(new Error("Failed to fetch"))).toEqual({
      kind: "other",
      message: "Failed to fetch",
    });
  });

  it("совсем не Error — запасное сообщение", () => {
    expect(describeLabIntakeOrderError("строка вместо ошибки")).toEqual({
      kind: "other",
      message: "Неизвестная ошибка",
    });
  });
});
