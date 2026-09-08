import { describe, expect, it } from "vitest";

import { ApiError } from "./client";
import { chatwootUnavailableReason } from "./chatwoot";

/**
 * Три причины отказа приводят к трём разным экранам, поэтому важно, что они не
 * схлопываются: «запросите доступ» — действие пользователя, «недоступно» —
 * наша проблема.
 */
/** Конверт ошибок бэкенда — ветвиться разрешено только по `code`. */
function envelope(code: string, message: string) {
  return { error: { code, message, details: null, trace_id: "t-1" } };
}

describe("chatwootUnavailableReason", () => {
  it("404 — интеграция выключена", () => {
    const error = new ApiError("not found", 404, null);

    expect(chatwootUnavailableReason(error)).toBe("disabled");
  });

  it("403 с кодом CHATWOOT_NO_ACCOUNT — нет учётки в Чат-центре", () => {
    const error = new ApiError(
      "Доступ к чатам не настроен.",
      403,
      envelope("CHATWOOT_NO_ACCOUNT", "Доступ к чатам не настроен."),
    );

    expect(chatwootUnavailableReason(error)).toBe("no_account");
  });

  it("403 с обычным FORBIDDEN — отказ по правам, не заглушка про доступ", () => {
    const error = new ApiError(
      "Недостаточно прав",
      403,
      envelope("FORBIDDEN", "Недостаточно прав"),
    );

    expect(chatwootUnavailableReason(error)).toBe("disabled");
  });

  it("403 старой формой с маркером — пока прод не на конверте, это заглушка", () => {
    const error = new ApiError("chatwoot_no_account", 403, {
      detail: [{ msg: "chatwoot_no_account" }],
    });

    expect(chatwootUnavailableReason(error)).toBe("no_account");
  });

  it("403 старой формой без маркера — отказ по правам", () => {
    const error = new ApiError("Недостаточно прав", 403, null);

    expect(chatwootUnavailableReason(error)).toBe("disabled");
  });

  it("502 — сбой на стороне Chatwoot", () => {
    const error = new ApiError("bad gateway", 502, null);

    expect(chatwootUnavailableReason(error)).toBe("unavailable");
  });

  it("не-ApiError (обрыв сети) — тоже недоступность", () => {
    expect(chatwootUnavailableReason(new Error("network"))).toBe("unavailable");
  });
});
