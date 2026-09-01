import { describe, it, expect, vi, afterEach } from "vitest";

import { ApiError, isAbortError } from "./client";
import { getList, getItem } from "./publicBooking";

/**
 * Обрыв запроса приходит из `response.json()`, а не из `fetch`: заголовки уже
 * получены, тело — ещё нет. Пока AbortError глушился в `.catch(() => null)`,
 * прерванный запрос выглядел как успешный ответ с пустым телом, и страница
 * показывала «Cannot read properties of null (reading 'data')» вместо тихого
 * выхода по `isAbortError` (витрина /book/doctors: справочник специализаций
 * догружается и перезапускает эффект, отменяя первый запрос списка).
 */
function respondWith(json: () => Promise<unknown>): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("публичный API: прерванный запрос", () => {
  it("getList пробрасывает AbortError, когда обрыв случился на чтении тела", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respondWith(async () => {
          throw new DOMException("The user aborted a request.", "AbortError");
        }),
      ),
    );

    const err = await getList("/professionals/").catch((e) => e);
    expect(isAbortError(err)).toBe(true);
  });

  it("getItem даёт понятную ApiError, если 200 пришёл без JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respondWith(async () => {
          throw new SyntaxError("Unexpected token < in JSON");
        }),
      ),
    );

    const err = await getItem("/organizations/mama-doktor/").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(String((err as ApiError).message)).toMatch(/Нет связи с сервером/);
  });
});
