import { describe, expect, it } from "vitest";

import { ApiError } from "./client";
import { parseBackendError } from "./appointments";

/**
 * `parseBackendError` — текст ошибки для дроверов приёма. Старые формы он
 * чистит от технических префиксов сам; у нового конверта чистить нечего
 * (имя поля приезжает отдельно), но подсказка про невыбранный филиал должна
 * пережить смену формы — раньше её признаком был текст `$.parsed_body.branchId`.
 */
describe("parseBackendError", () => {
  it("узнаёт невыбранный филиал в старой форме (текст msgspec)", () => {
    const err = new ApiError("x", 400, {
      detail: [{ msg: "Object missing required field `branchId` - at `$.parsed_body.branchId`" }],
    });
    expect(parseBackendError(err)).toContain("Не выбран филиал");
  });

  it("узнаёт невыбранный филиал в конверте — по ключу details.fields", () => {
    const err = new ApiError("Обязательное поле.", 400, {
      error: {
        code: "VALIDATION_ERROR",
        message: "Обязательное поле.",
        details: { fields: { branchId: "Обязательное поле." } },
        trace_id: "abc",
      },
    });
    expect(parseBackendError(err)).toContain("Не выбран филиал");
  });

  it("для прочих ошибок конверта отдаёт готовое сообщение", () => {
    const err = new ApiError("Услуга уже добавлена.", 409, {
      error: { code: "CONFLICT", message: "Услуга уже добавлена.", details: null, trace_id: "a" },
    });
    expect(parseBackendError(err)).toBe("Услуга уже добавлена.");
  });

  it("чистит технический префикс поля в старой форме", () => {
    const err = new ApiError("x", 400, { error: "startsAt: Укажите время приёма" });
    expect(parseBackendError(err)).toBe("Укажите время приёма");
  });
});
