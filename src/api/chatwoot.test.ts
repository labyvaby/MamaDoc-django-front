import { describe, expect, it } from "vitest";

import { ApiError } from "./client";
import { chatwootUnavailableReason } from "./chatwoot";

/**
 * Три причины отказа приводят к трём разным экранам, поэтому важно, что они не
 * схлопываются: «запросите доступ» — действие пользователя, «недоступно» —
 * наша проблема.
 */
describe("chatwootUnavailableReason", () => {
  it("404 — интеграция выключена", () => {
    const error = new ApiError("not found", 404, null);

    expect(chatwootUnavailableReason(error)).toBe("disabled");
  });

  it("403 с маркером — нет учётки в Chatwoot", () => {
    const error = new ApiError("chatwoot_no_account", 403, null);

    expect(chatwootUnavailableReason(error)).toBe("no_account");
  });

  it("403 без маркера — отказ по правам, не заглушка про доступ", () => {
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
