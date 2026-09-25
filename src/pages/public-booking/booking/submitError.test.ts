import { describe, expect, it } from "vitest";

import { ApiError } from "../../../api/client";
import { submitErrorKey } from "./submitError";

/** Конверт публичного API: `error` — строка-код, не объект. */
const api = (status: number, error: string, message = "") =>
  new ApiError(message, status, { error, message, details: {} });

describe("submitErrorKey", () => {
  it("не ApiError — общий текст", () => {
    expect(submitErrorKey(new Error("boom"))).toBe("bookingFailed");
  });

  it("400 online_booking_closed — расписание изменилось, время закрыто", () => {
    expect(submitErrorKey(api(400, "online_booking_closed"))).toBe("bookingClosedForTime");
  });

  it("400 validation_error — общий «проверьте данные»", () => {
    expect(submitErrorKey(api(400, "validation_error"))).toBe("bookingFailed");
  });

  it("409 — время заняли", () => {
    expect(submitErrorKey(api(409, "slot_unavailable"))).toBe("slotTaken");
  });

  it("429 — слишком много попыток", () => {
    expect(submitErrorKey(api(429, "rate_limited"))).toBe("tooManyAttempts");
  });

  it("404 — врач/филиал/услуга исчезли", () => {
    expect(submitErrorKey(api(404, "not_found"))).toBe("bookingTargetGone");
  });

  it("405 — эндпоинта записи ещё нет", () => {
    expect(submitErrorKey(api(405, ""))).toBe("onlineBookingSoon");
  });

  it("502 payment_unavailable — банк недоступен", () => {
    expect(submitErrorKey(api(502, "payment_unavailable"))).toBe("paymentUnavailable");
  });

  it("сеть (status 0) — общий текст", () => {
    expect(submitErrorKey(new ApiError("net", 0, null))).toBe("bookingFailed");
  });
});
