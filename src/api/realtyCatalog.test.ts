import { describe, expect, it } from "vitest";

import { catalogQuery, fromRawCatalogProject } from "./realtyCatalog";

describe("catalogQuery", () => {
  it("пустые фильтры и сортировка по умолчанию в адрес не попадают", () => {
    expect(catalogQuery({ sort: "popular" })).toBe("");
    expect(catalogQuery({ rooms: 0, priceMax: 6_000_000, feature: "terrace", sort: "price", projectId: null })).toBe("?rooms=0&priceMax=6000000&feature=terrace&sort=price");
  });
});

describe("fromRawCatalogProject", () => {
  it("деньги строками → числа, без фильтров matching = null", () => {
    const p = fromRawCatalogProject({ id: 1, priceFrom: "4072000.00", pricePerSqm: "102000.00", free: 48, matching: null, available: 48, sections: [], roomStats: [] });
    expect(p.priceFrom).toBe(4_072_000);
    expect(p.matching).toBeNull();
    expect(p.available).toBe(48);
  });
});
