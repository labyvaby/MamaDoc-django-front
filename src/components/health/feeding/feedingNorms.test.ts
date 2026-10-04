import { describe, expect, it } from "vitest";

import { calendarAge } from "./feedingAdvice";
import { productByCode } from "./feedingCatalog";
import { NORM_ROWS, afterYearNorm, howToFeed, normAmount, normCell, normColumn, normRowOf } from "./feedingNorms";

const months = (birth: string, on: string): number => calendarAge(birth, on)!.months;

describe("feeding norms (табл. 5.1)", () => {
  it("picks the column by full months", () => {
    expect(normColumn(months("2026-01-01", "2026-04-30"))).toBeNull(); // 3 мес 29 дн
    expect(normColumn(months("2026-01-01", "2026-05-01"))).toBe("4-5"); // 4 мес
    expect(normColumn(5)).toBe("4-5");
    expect(normColumn(months("2026-01-01", "2026-09-21"))).toBe("8"); // 8 мес 20 дн
    expect(normColumn(months("2025-01-01", "2025-12-30"))).toBe("9-12"); // 11 мес 29 дн
    expect(normColumn(months("2025-01-01", "2026-01-01"))).toBe("after"); // 12 мес
    expect(normColumn(null)).toBeNull();
  });

  it("matches the mockup for 8 months", () => {
    const cell = (key: string) => normCell(NORM_ROWS.find((row) => row.key === key)!, "8");
    expect(cell("vegetables")).toBe("150");
    expect(cell("cereals")).toBe("180");
    expect(cell("meat")).toBe("60–70 / 30–35");
    expect(cell("fruits")).toBe("80");
    expect(cell("yolk")).toBe("½ шт.");
    expect(cell("cottage")).toBe("10–40");
    expect(cell("kefir")).toBe("200");
    expect(cell("fish")).toBe("5–30");
    expect(cell("bread")).toBe("5");
    expect(cell("oil")).toBe("6");
    expect(cell("butter")).toBe("5");
    expect(cell("biscuit")).toBe("5");
    expect(NORM_ROWS.map((row) => row.key)).not.toContain("juice");
  });

  it("finds the row of a product and its amount", () => {
    expect(normRowOf(productByCode("cottage_cheese")!)?.key).toBe("cottage");
    expect(normRowOf(productByCode("liver")!)?.key).toBe("meat");
    expect(normRowOf(productByCode("yogurt")!)?.key).toBe("kefir");
    expect(normRowOf(productByCode("lentils")!)).toBeNull();
    expect(normAmount(normRowOf(productByCode("cottage_cheese")!)!, "8")).toBe("10–40 г");
    expect(normAmount(normRowOf(productByCode("egg_yolk")!)!, "7")).toBe("¼ желтка");
    expect(normAmount(normRowOf(productByCode("horse")!)!, "7")).toBe("40–50 г (отварного мяса — 20–30 г)");
    expect(normAmount(normRowOf(productByCode("cod")!)!, "7")).toBeNull();
  });

  it("gives an after-year guide", () => {
    expect(afterYearNorm(13)).toContain("1000–1200 г");
    expect(afterYearNorm(18)).toContain("Граммов на день в программах нет");
  });
});

describe("how to feed (§3.5)", () => {
  it("follows age and feeding type", () => {
    expect(howToFeed(3, "breast", false)).toBeNull();
    expect(howToFeed(24, "general", true)).toBeNull();

    const early = howToFeed(4, "breast", false)!;
    expect(early.column).toBe("4-5");
    expect(early.caption).toContain("только программа РФ");
    expect(early.readiness).toContain("Признаки готовности");
    expect(early.always).toHaveLength(0);
    expect(early.items.map((item) => item.key)).toEqual(["meals", "portion", "texture", "breast"]);

    const breast = howToFeed(8, "breast", true)!;
    expect(breast.column).toBe("6-8");
    expect(breast.items.map((item) => item.key)).toEqual(["meals", "portion", "texture", "breast", "water"]);
    expect(breast.always.map((item) => item.key)).toEqual(["interval", "signals", "variety"]);
    expect(breast.readiness).toBeNull();

    const mixed = howToFeed(10, "mixed", true)!;
    expect(mixed.items.map((item) => item.key)).toEqual(["meals", "portion", "texture", "breast", "formula", "water"]);
    expect(mixed.items.find((item) => item.key === "texture")?.alert).toContain("пора кусочки");

    const formula = howToFeed(7, "formula", true)!;
    expect(formula.items.map((item) => item.key)).not.toContain("breast");
    expect(formula.items.find((item) => item.key === "formula")?.text).toContain("600 мл");

    const table = howToFeed(18, "general", true)!;
    expect(table.column).toBe("12-23");
    expect(table.items.map((item) => item.key)).toEqual(["meals", "portion", "texture", "milk"]);

    // Вид не отмечен — показываем и грудь, и смесь.
    expect(howToFeed(13, null, true)!.items.map((item) => item.key)).toEqual(["meals", "portion", "texture", "breast", "formula"]);
  });
});
