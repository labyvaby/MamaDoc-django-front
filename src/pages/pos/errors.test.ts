import { describe, expect, it } from "vitest";

import { ApiError } from "../../api/client";
import { POS_ERROR_CATALOG, formatPosError, posError, toPosUserError } from "./errors";

const envelope = (code: string, message: string, traceId = "0f3c2a1b") => ({
  error: { code, message, details: null, trace_id: traceId },
});

describe("posError", () => {
  it("fills the catalogue text with parameters", () => {
    const error = posError("SCAN_NOT_FOUND", { code: "2000000016009" });
    expect(error.title).toBe("Товар не найден");
    expect(error.hint).toContain("2000000016009");
    expect(error.severity).toBe("warning");
  });

  it("gives every catalogue entry a title and a hint for the cashier", () => {
    for (const code of Object.keys(POS_ERROR_CATALOG) as Array<keyof typeof POS_ERROR_CATALOG>) {
      const error = posError(code, { name: "Шарф", code: "123", stock: 2, message: "текст" });
      expect(error.title, code).toBeTruthy();
      expect(error.hint, code).toBeTruthy();
    }
  });
});

describe("toPosUserError", () => {
  it("hides server internals behind a support code", () => {
    const error = toPosUserError(
      new ApiError("Ошибка на сервере.", 500, envelope("INTERNAL_ERROR", "Traceback: KeyError", "abc123"))
    );
    expect(error).toMatchObject({ code: "SERVER", traceId: "abc123" });
    expect(formatPosError(error)).not.toContain("KeyError");
  });

  it("maps connection loss, session end and missing rights", () => {
    expect(toPosUserError(new ApiError("x", 0, null)).code).toBe("NETWORK");
    expect(toPosUserError(new ApiError("x", 401, null)).code).toBe("SESSION_EXPIRED");
    expect(toPosUserError(new ApiError("x", 403, envelope("FORBIDDEN", "Нет прав"))).code).toBe("FORBIDDEN");
    expect(toPosUserError(new ApiError("x", 403, envelope("MODULE_DISABLED", "Модуль выключен"))).code).toBe(
      "MODULE_DISABLED"
    );
  });

  it("puts known business rules under a clear title and keeps the server wording as the hint", () => {
    const shift = toPosUserError(
      new ApiError("Для продажи откройте кассовую смену.", 400, envelope("VALIDATION_ERROR", "Для продажи откройте кассовую смену."))
    );
    expect(shift.code).toBe("SHIFT_CLOSED");
    const discount = toPosUserError(
      new ApiError("Скидка превышает лимит организации.", 400, envelope("VALIDATION_ERROR", "Скидка превышает лимит организации."))
    );
    expect(discount).toMatchObject({ code: "DISCOUNT_REJECTED", hint: "Скидка превышает лимит организации." });
  });

  it("does not show English exception text to the cashier", () => {
    const error = toPosUserError(new Error("Cannot read properties of undefined"));
    expect(error.code).toBe("UNKNOWN");
  });

  it("passes catalogue errors through unchanged", () => {
    const original = posError("OUT_OF_STOCK", { name: "Шарф" });
    expect(toPosUserError(original)).toBe(original);
  });
});
