import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  accessEndedMessage,
  clearAccessEnded,
  peekAccessEnded,
  rememberAccessEnded,
} from "./accessEnded";
import { ApiError } from "./client";

const TEXT = "У вас больше нет доступа к системе. Обратитесь к руководителю.";

// Тесты идут в node — хранилища вкладки там нет, даём простое в памяти.
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

afterEach(() => {
  clearAccessEnded();
  vi.unstubAllGlobals();
});

/**
 * Уволенный с открытой вкладкой: бэк закрывает сессию на /auth/me (401 +
 * reason no_access), а страница входа должна объяснить почему — иначе он
 * снова запрашивает код, который не придёт.
 */
describe("accessEndedMessage — отличить увольнение от протухшей сессии", () => {
  it("401 с reason no_access — это увольнение", () => {
    const err = new ApiError(TEXT, 401, { error: TEXT, reason: "no_access" });
    expect(accessEndedMessage(err)).toBe(TEXT);
  });

  it("обычный 401 (сессия протухла) — не увольнение", () => {
    const err = new ApiError("Требуется вход", 401, { error: "Authentication required" });
    expect(accessEndedMessage(err)).toBeNull();
  });

  it("403 и чужие ошибки — не увольнение", () => {
    expect(accessEndedMessage(new ApiError(TEXT, 403, { reason: "no_access" }))).toBeNull();
    expect(accessEndedMessage(new Error(TEXT))).toBeNull();
  });
});

describe("записка для страницы входа", () => {
  it("переживает переход и читается без удаления, пока её не сняли", () => {
    rememberAccessEnded(TEXT);
    expect(peekAccessEnded()).toBe(TEXT);
    expect(peekAccessEnded()).toBe(TEXT);
    clearAccessEnded();
    expect(peekAccessEnded()).toBeNull();
  });
});

describe("без хранилища вкладки (приватный режим)", () => {
  it("не падает, просто без записки", () => {
    vi.stubGlobal("sessionStorage", undefined);
    expect(() => rememberAccessEnded(TEXT)).not.toThrow();
    expect(peekAccessEnded()).toBeNull();
    expect(() => clearAccessEnded()).not.toThrow();
  });
});
