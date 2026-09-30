import { describe, expect, it } from "vitest";

import type { DjangoProductAttribute, DjangoProductCategoryNode, DjangoUnitOfMeasure } from "../../api/warehouse";
import {
  brandOptions,
  buildCategoryOptions,
  draftFromRecognized,
  draftProblem,
  draftProductName,
  emptyDraft,
  isVariantDraft,
  matchUnit,
  newProductInput,
  type CategoryOption,
} from "./newProductDraft";

const node = (id: number, name: string, parentId: number | null, attributeIds: number[] = [], isActive = true): DjangoProductCategoryNode => ({
  id,
  organizationId: 1,
  name,
  parentId,
  attributeIds,
  isActive,
  productCount: 0,
  createdAt: "",
  updatedAt: "",
  markupMultiplier: null,
  markupRoundingStep: 100,
});

const attribute = (id: number, role: DjangoProductAttribute["role"], values: Array<[string, number, boolean?]>): DjangoProductAttribute => ({
  id,
  organizationId: 1,
  name: role,
  role,
  isOrdered: role === "size",
  isActive: true,
  values: values.map(([value, position, isActive = true], index) => ({
    id: id * 100 + index,
    attributeId: id,
    value,
    code: "",
    position,
    isActive,
  })),
});

const unit = (id: number, name: string, shortName: string): DjangoUnitOfMeasure => ({
  id,
  organizationId: 1,
  name,
  shortName,
  decimalPlaces: 0,
  isFractional: false,
  isActive: true,
  productCount: 0,
  createdAt: "",
  updatedAt: "",
});

const matrix: CategoryOption = { id: 7, label: "Одежда / Платья", matrix: true, colors: [], sizes: [] };
const flat: CategoryOption = { id: 8, label: "Аксессуары", matrix: false, colors: [], sizes: [] };

describe("buildCategoryOptions", () => {
  const attributes = [
    attribute(1, "color", [["Чёрный", 10], ["Старый", 5, false]]),
    attribute(2, "size", [["L", 30], ["S", 10], ["M", 20]]),
    attribute(3, "generic", [["Хлопок", 10]]),
  ];

  it("пишет путь в дереве и прячет выключенные категории", () => {
    const options = buildCategoryOptions(
      [node(1, "Одежда", null), node(2, "Платья", 1, [1, 2]), node(3, "Архив", null, [], false)],
      attributes,
    );
    expect(options.map((o) => o.label)).toEqual(["Одежда", "Одежда / Платья"]);
  });

  it("вариантная категория — с цветом и размером; значения осей по порядку, без выключенных", () => {
    const [dresses] = buildCategoryOptions([node(2, "Платья", null, [1, 2, 3])], attributes);
    expect(dresses.matrix).toBe(true);
    expect(dresses.colors).toEqual(["Чёрный"]);
    expect(dresses.sizes).toEqual(["S", "M", "L"]);
  });

  it("одного цвета без размера для вариантов мало", () => {
    const [bags] = buildCategoryOptions([node(4, "Сумки", null, [1, 3])], attributes);
    expect(bags.matrix).toBe(false);
  });
});

describe("draftProductName", () => {
  it("дописывает цвет и размер, как генератор матрицы", () => {
    expect(draftProductName({ ...emptyDraft("Платье миди"), color: "чёрный", size: "M" })).toBe("Платье миди, чёрный, M");
  });

  it("не повторяет уже названное в имени", () => {
    expect(draftProductName({ ...emptyDraft("Платье миди чёрное M"), color: "чёрн", size: "M" })).toBe("Платье миди чёрное M");
    // «S» внутри слова — не размер.
    expect(draftProductName({ ...emptyDraft("Sneakers"), size: "S" })).toBe("Sneakers, S");
  });
});

describe("newProductInput", () => {
  const draft = { ...emptyDraft("Платье миди"), categoryId: 7, color: "чёрный", size: "M", price: "5 900", sku: "A-1", barcode: " 4601 " };

  it("вариант уходит осями, без артикула", () => {
    expect(newProductInput(draft, matrix)).toEqual({
      name: "Платье миди",
      categoryId: 7,
      price: "5900",
      barcode: "4601",
      color: "чёрный",
      size: "M",
    });
  });

  it("обычный товар — готовым именем и своим артикулом", () => {
    expect(newProductInput({ ...draft, categoryId: 8 }, flat)).toEqual({
      name: "Платье миди, чёрный, M",
      categoryId: 8,
      price: "5900",
      barcode: "4601",
      sku: "A-1",
    });
  });

  it("свободная категория и пустая цена", () => {
    expect(newProductInput({ ...emptyDraft("Бахилы"), category: " Расходники ", price: "" }, null)).toEqual({
      name: "Бахилы",
      category: "Расходники",
      price: "0",
    });
  });

  it("одна ось в вариантной категории — ещё не вариант", () => {
    expect(isVariantDraft({ ...draft, size: " " }, matrix)).toBe(false);
  });

  it("бренд уходит свойством, пустой — не отправляется (бэк возьмёт бренд поставщика)", () => {
    expect(newProductInput({ ...emptyDraft("Шарф"), brand: " Zara " }, null)).toMatchObject({ brand: "Zara" });
    expect(newProductInput({ ...emptyDraft("Шарф"), brand: "  " }, null)).not.toHaveProperty("brand");
  });
});

describe("brandOptions", () => {
  it("значения свойства «Бренд» по алфавиту, без неактивных и без других свойств", () => {
    const brand = { ...attribute(5, "generic", [["Zara", 0], ["Mango", 1], ["Old", 2, false]]), name: "Бренд" };
    const material = { ...attribute(6, "generic", [["Хлопок", 0]]), name: "Материал" };
    expect(brandOptions([material, brand])).toEqual(["Mango", "Zara"]);
    expect(brandOptions([material])).toEqual([]);
  });
});

describe("draftFromRecognized", () => {
  const units = [unit(1, "Штука", "шт"), unit(2, "Упаковка", "уп")];
  const line = { name: " Платье миди ", color: "чёрный", size: "M", barcode: "4601234567893", sku: "A-1", unit: "Шт." };

  it("переносит поля документа и находит единицу", () => {
    expect(draftFromRecognized(line, { units, skuIsUnique: true })).toEqual({
      ...emptyDraft("Платье миди"),
      color: "чёрный",
      size: "M",
      barcode: "4601234567893",
      sku: "A-1",
      unitId: 1,
    });
  });

  it("общий у нескольких строк артикул не берёт", () => {
    expect(draftFromRecognized(line, { units, skuIsUnique: false }).sku).toBe("");
  });

  it("бренд документа берёт уже заведённое написание, новый — как есть", () => {
    const brands = ["Mango", "Zara"];
    expect(draftFromRecognized({ ...line, brand: "ZARA" }, { units, skuIsUnique: false, brands }).brand).toBe("Zara");
    expect(draftFromRecognized({ ...line, brand: " Bershka " }, { units, skuIsUnique: false, brands }).brand).toBe("Bershka");
    expect(draftFromRecognized(line, { units, skuIsUnique: false, brands }).brand).toBe("");
  });

  it("название модели сохраняет бренд и код, а цвет с размером остаются осями", () => {
    const recognized = { ...line, name: "NORTH TEST · Linen jacket · DOLIE-GZ · LIGHT BLUE · 42", productName: "NORTH TEST · Linen jacket · DOLIE-GZ", color: "LIGHT BLUE", size: "42" };
    const draft = draftFromRecognized(recognized, { units, skuIsUnique: false });
    expect(newProductInput({ ...draft, categoryId: 7 }, matrix)).toMatchObject({ name: "NORTH TEST · Linen jacket · DOLIE-GZ", color: "LIGHT BLUE", size: "42" });
    expect(newProductInput({ ...draft, categoryId: 8 }, flat).name).toBe("NORTH TEST · Linen jacket · DOLIE-GZ, LIGHT BLUE, 42");
  });

  it("незнакомая единица остаётся пустой", () => {
    expect(matchUnit(units, "pcs")).toBeNull();
    expect(matchUnit(units, "УП")).toEqual(units[1]);
  });
});

describe("draftProblem", () => {
  it("без названия и без категории, где она обязательна", () => {
    expect(draftProblem(emptyDraft(" "), { categoryRequired: false, category: null })).toBe("Укажите название товара");
    expect(draftProblem(emptyDraft("Шарф"), { categoryRequired: true, category: null })).toBe("Выберите категорию");
    expect(draftProblem({ ...emptyDraft("Шарф"), categoryId: 8 }, { categoryRequired: true, category: flat })).toBeNull();
  });

  it("в вариантной категории — обе оси или ни одной", () => {
    const base = { ...emptyDraft("Платье"), categoryId: 7 };
    expect(draftProblem({ ...base, color: "чёрный" }, { categoryRequired: true, category: matrix })).toBe(
      "Для варианта нужны и цвет, и размер",
    );
    expect(draftProblem(base, { categoryRequired: true, category: matrix })).toBeNull();
  });
});
