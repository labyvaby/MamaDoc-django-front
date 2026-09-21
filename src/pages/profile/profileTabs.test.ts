import { describe, expect, it } from "vitest";

import { isProfileTabKey, resolveTabIndex } from "./profileTabs";

/**
 * Вкладки профиля строятся условно («Документы» появляются после загрузки
 * employee), поэтому активную вкладку нельзя хранить индексом — он съезжает.
 */
const base = [{ key: "main" }, { key: "security" }];
const withDocs = [{ key: "main" }, { key: "documents" }, { key: "security" }];

describe("resolveTabIndex — вкладка профиля по ключу", () => {
  it("находит вкладку среди отрисованных", () => {
    expect(resolveTabIndex(base, "security")).toBe(1);
  });

  it("индекс не съезжает, когда «Документы» подгрузились", () => {
    expect(resolveTabIndex(withDocs, "security")).toBe(2);
  });

  it("неизвестный ключ и пустое значение — первая вкладка", () => {
    expect(resolveTabIndex(base, "bogus")).toBe(0);
    expect(resolveTabIndex(base, null)).toBe(0);
    expect(resolveTabIndex(base, undefined)).toBe(0);
  });
});

describe("isProfileTabKey — параметр ?tab=", () => {
  it("принимает только известные ключи", () => {
    expect(isProfileTabKey("security")).toBe(true);
    expect(isProfileTabKey("main")).toBe(true);
    expect(isProfileTabKey("bogus")).toBe(false);
    expect(isProfileTabKey(null)).toBe(false);
  });
});
