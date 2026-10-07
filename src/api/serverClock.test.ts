import { afterEach, describe, expect, it, vi } from "vitest";

import { computeSkewMs, getServerSkewMs, noteServerClock, resetServerClockForTests, subscribeServerSkew } from "./serverClock";

const responseWithDate = (date: string | null) => ({ headers: new Headers(date ? { date } : {}) });

afterEach(() => resetServerClockForTests());

describe("computeSkewMs", () => {
  it("сравнивает время сервера с серединой запроса", () => {
    const started = Date.parse("2026-10-05T07:46:00.000Z");
    // Компьютер думает, что сейчас 07:46 UTC, сервер отвечает 04:46 UTC.
    const skew = computeSkewMs("Mon, 05 Oct 2026 04:46:00 GMT", started, started + 400);
    // +500 мс — заголовок обрезан до секунды; −200 мс — середина запроса.
    expect(skew).toBe(-3 * 60 * 60_000 + 300);
  });

  it("отбрасывает пустой и битый заголовок", () => {
    expect(computeSkewMs(null, 0, 10)).toBeNull();
    expect(computeSkewMs("application/json", 0, 10)).toBeNull();
  });

  it("отбрасывает слишком долгие и «отрицательные» запросы (часы перевели посреди запроса)", () => {
    const started = Date.parse("2026-10-05T04:46:00.000Z");
    expect(computeSkewMs("Mon, 05 Oct 2026 04:46:00 GMT", started, started + 31_000)).toBeNull();
    expect(computeSkewMs("Mon, 05 Oct 2026 04:46:00 GMT", started, started - 1)).toBeNull();
  });
});

describe("noteServerClock", () => {
  it("запоминает расхождение и сообщает подписчикам", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeServerSkew(listener);
    const started = Date.parse("2026-10-05T07:46:00.000Z");
    noteServerClock(responseWithDate("Mon, 05 Oct 2026 04:46:00 GMT"), started, started);
    expect(getServerSkewMs()).toBe(-3 * 60 * 60_000 + 500);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("мелкие колебания между запросами не перерисовывают плашку", () => {
    const listener = vi.fn();
    subscribeServerSkew(listener);
    const started = Date.parse("2026-10-05T04:46:00.000Z");
    noteServerClock(responseWithDate("Mon, 05 Oct 2026 04:46:00 GMT"), started, started);
    noteServerClock(responseWithDate("Mon, 05 Oct 2026 04:46:02 GMT"), started, started);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getServerSkewMs()).toBe(500);
  });

  it("часы поправили — новое значение доходит до подписчиков", () => {
    const listener = vi.fn();
    subscribeServerSkew(listener);
    const wrong = Date.parse("2026-10-05T07:46:00.000Z");
    noteServerClock(responseWithDate("Mon, 05 Oct 2026 04:46:00 GMT"), wrong, wrong);
    const fixed = Date.parse("2026-10-05T04:50:00.000Z");
    noteServerClock(responseWithDate("Mon, 05 Oct 2026 04:50:00 GMT"), fixed, fixed);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getServerSkewMs()).toBe(500);
  });

  it("ответ без заголовков (моки в тестах) не роняет запрос", () => {
    expect(() => noteServerClock({} as Response, 0, 10)).not.toThrow();
    expect(() => noteServerClock({ headers: { get: () => "application/json" } } as unknown as Response, 0, 10)).not.toThrow();
    expect(getServerSkewMs()).toBeNull();
  });
});
