import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  accessEndedMessage,
  clearAccessEnded,
  peekAccessEnded,
  rememberAccessEnded,
} from "./accessEnded";

const TEXT = "У вас больше нет доступа к системе. Обратитесь к руководителю.";

// Тесты идут в node — хранилища браузера там нет, даём простое в памяти.
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
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
    expect(accessEndedMessage(401, { error: TEXT, reason: "no_access" })).toBe(TEXT);
  });

  it("обычный 401 (сессия протухла) — не увольнение", () => {
    expect(accessEndedMessage(401, { error: "Authentication required" })).toBeNull();
  });

  it("403 и мусор — не увольнение", () => {
    expect(accessEndedMessage(403, { error: TEXT, reason: "no_access" })).toBeNull();
    expect(accessEndedMessage(401, null)).toBeNull();
    expect(accessEndedMessage(401, "text")).toBeNull();
  });
});

describe("записка для страницы входа", () => {
  it("видна всем вкладкам и читается без удаления, пока её не сняли", () => {
    rememberAccessEnded(TEXT);
    expect(peekAccessEnded()).toBe(TEXT);
    expect(peekAccessEnded()).toBe(TEXT);
    clearAccessEnded();
    expect(peekAccessEnded()).toBeNull();
  });

  it("устаревает — не всплывёт у следующего, кто войдёт с этого компьютера", () => {
    rememberAccessEnded(TEXT, 1_000);
    expect(peekAccessEnded(1_000 + 14 * 60 * 1000)).toBe(TEXT);
    expect(peekAccessEnded(1_000 + 16 * 60 * 1000)).toBeNull();
  });

  it("битая запись — просто нет записки", () => {
    localStorage.setItem("mamadoc:access-ended", "{not json");
    expect(peekAccessEnded()).toBeNull();
  });
});

describe("без хранилища (приватный режим)", () => {
  it("не падает, просто без записки", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => rememberAccessEnded(TEXT)).not.toThrow();
    expect(peekAccessEnded()).toBeNull();
    expect(() => clearAccessEnded()).not.toThrow();
  });
});
