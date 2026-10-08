import { describe, expect, it } from "vitest";
import { buildProductGroups, productGroupValue, toggleGroup } from "./productGroups";

const attr = (attributeName: string, value: string, role = "generic") => ({ attributeName, value, role });

const items = [
  { id: 1, category: "Обувь", attributes: [attr("Бренд", "Nike"), attr("Сезон", "Лето 2026")] },
  { id: 2, category: "Обувь", attributes: [attr("brand", " nike ")] },
  { id: 3, category: "Сумки", attributes: [attr("Бренд", "Adidas"), attr("Цвет", "Красный", "color")] },
  { id: 4, category: "", attributes: [attr("Сезон", "лето 2026")] },
];

describe("productGroupValue", () => {
  it("reads category and generic brand/season attributes", () => {
    expect(productGroupValue(items[0], "category")).toBe("Обувь");
    expect(productGroupValue(items[0], "brand")).toBe("Nike");
    expect(productGroupValue(items[0], "season")).toBe("Лето 2026");
    expect(productGroupValue(items[3], "category")).toBeNull();
    expect(productGroupValue(items[2], "season")).toBeNull();
  });

  it("ignores non-generic attributes with the same name", () => {
    expect(productGroupValue({ id: 9, attributes: [attr("Бренд", "X", "color")] }, "brand")).toBeNull();
  });
});

describe("buildProductGroups", () => {
  it("groups case-insensitively and sorts by label", () => {
    const groups = buildProductGroups(items);
    expect(groups.category.map((g) => [g.label, g.ids])).toEqual([
      ["Обувь", [1, 2]],
      ["Сумки", [3]],
    ]);
    expect(groups.brand.map((g) => [g.label, g.ids])).toEqual([
      ["Adidas", [3]],
      ["Nike", [1, 2]],
    ]);
    expect(groups.season.map((g) => [g.label, g.ids])).toEqual([["Лето 2026", [1, 4]]]);
  });
});

describe("toggleGroup", () => {
  it("adds a partially selected group and keeps other rows", () => {
    expect([...toggleGroup(new Set([1, 9]), [1, 2])].sort()).toEqual([1, 2, 9]);
  });

  it("removes a fully selected group", () => {
    expect([...toggleGroup(new Set([1, 2, 9]), [1, 2])]).toEqual([9]);
  });
});
