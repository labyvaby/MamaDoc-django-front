import { describe, expect, it } from "vitest";

import { ALLERGEN_PRESETS } from "../healthMeta";
import {
  FOOD_GROUPS,
  FOOD_PRODUCTS,
  NO_GIVE,
  PRODUCT_CODE_RE,
  activeNoGive,
  isSuggestible,
  productAllergen,
  productByCode,
  productByName,
} from "./feedingCatalog";

describe("feeding catalog", () => {
  it("has unique codes in the server format and known groups", () => {
    const codes = FOOD_PRODUCTS.map((product) => product.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(PRODUCT_CODE_RE);
      expect(code.length).toBeLessThanOrEqual(40);
    }
    const groups = new Set(FOOD_GROUPS.map((group) => group.code));
    expect(groups.size).toBe(8);
    for (const product of FOOD_PRODUCTS) expect(groups.has(product.group)).toBe(true);
  });

  it("gives every product a term and every group products", () => {
    for (const product of FOOD_PRODUCTS) {
      expect(Number.isFinite(product.from)).toBe(true);
      expect(product.from).toBeGreaterThanOrEqual(6);
      expect(product.name.trim()).toBe(product.name);
    }
    for (const group of FOOD_GROUPS) expect(FOOD_PRODUCTS.some((product) => product.group === group.code)).toBe(true);
  });

  it("uses allergens (А:) that the allergy window offers", () => {
    const presets = new Set(ALLERGEN_PRESETS.food);
    const explicit = FOOD_PRODUCTS.filter((product) => product.allergen).map((product) => product.allergen as string);
    expect(explicit.length).toBeGreaterThan(20);
    for (const allergen of explicit) expect(presets.has(allergen)).toBe(true);
    // Без «А:» аллерген — название продукта.
    expect(productAllergen(productByCode("zucchini")!)).toBe("Кабачок");
    expect(productAllergen(productByCode("egg_yolk")!)).toBe("Куриное яйцо");
    expect(productAllergen(productByCode("butter")!)).toBe("Белок коровьего молока");
  });

  it("keeps the marks of §3.2", () => {
    expect(productByCode("zucchini")?.lowAllergen).toBe(true);
    expect(productByCode("pork")).toMatchObject({ lowAllergen: true, noSuggest: true });
    expect(productByCode("talkan")).toMatchObject({ local: true, after: "glutenCereal", allergen: "Глютен" });
    expect(productByCode("kymyz")).toMatchObject({ local: true, noSuggest: true, forbiddenUntil: 24 });
    expect(productByCode("citrus")).toMatchObject({ riskFrom: 12, noSuggest: true });
    expect(productByCode("egg_whole")?.from).toBe(12);
    expect(productByCode("liver")?.from).toBe(8);
    expect(productByCode("lentils")?.from).toBe(9);
    expect(isSuggestible(productByCode("ayran")!)).toBe(false);
    expect(isSuggestible(productByCode("cod")!)).toBe(true);
    expect(productByName("свекла")?.code).toBe("beetroot");
  });

  it("lists «Не давать» by age: first chips at 18 months as in the demo", () => {
    expect(NO_GIVE).toHaveLength(16);
    const at18 = activeNoGive(18).map((item) => item.key);
    expect(at18.slice(0, 7)).toEqual(["juice", "nuts", "localDrinks", "sweet", "tea", "round", "raw"]);
    expect(at18.slice(7)).toEqual(["mercury", "riceDrinks", "fastFood"]);
    expect(activeNoGive(18)[0].chip).toBe("Сок — не больше 120 мл в день");
    expect(activeNoGive(8).map((item) => item.key).slice(0, 7)).toEqual([
      "honey",
      "milk",
      "salt",
      "juice",
      "nuts",
      "localDry",
      "localDrinks",
    ]);
    // С 5 лет остаётся только «всегда».
    expect(activeNoGive(60).map((item) => item.key)).toEqual(["raw", "mercury", "fastFood"]);
    expect(activeNoGive(30).map((item) => item.key)).toContain("sweet");
  });
});
