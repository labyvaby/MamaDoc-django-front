import { describe, expect, it } from "vitest";

import { tubeAppearance } from "./labTubes";

/**
 * Цвет крышки — единственный признак, по которому пробирки различают у стола
 * забора. В каталоге ЛИС он живёт не полем, а словом внутри названия
 * («вакутейнер (ОАК фиолетовый)») или внутри инструкции («Вакутейнер с ЖЕЛТОЙ
 * крышкой…»), причём в разном регистре, роде и с «е» вместо «ё».
 */
describe("tubeAppearance", () => {
  it("берёт цвет из названия", () => {
    const tube = tubeAppearance("вакутейнер (ОАК фиолетовый)", "");

    expect(tube.color).toBe("violet");
    expect(tube.label).toBe("Фиолетовая крышка");
  });

  it("берёт цвет из инструкции, если в названии его нет", () => {
    const tube = tubeAppearance(
      "вакутейнер Д",
      "Вакутейнер с ЖЕЛТОЙ крышкой для сыворотки",
    );

    expect(tube.color).toBe("yellow");
  });

  it("название важнее инструкции", () => {
    // Инструкция часто пересказывает соседние пробирки («…в отличие от
    // красной…»), поэтому первым читается название.
    const tube = tubeAppearance(
      "вакутейнер (ОАК фиолетовый)",
      "в отличие от пробирки с КРАСНОЙ крышкой",
    );

    expect(tube.color).toBe("violet");
  });

  it("«ё» и регистр не мешают", () => {
    expect(tubeAppearance("Вакутейнер ЗЕЛЁНЫЙ", "").color).toBe("green");
    expect(tubeAppearance("вакутейнер зеленый", "").color).toBe("green");
  });

  it("пробирка без цвета остаётся нейтральной", () => {
    const tube = tubeAppearance("Взятие крови", "КРОВЬ из вены");

    expect(tube.color).toBe("neutral");
    expect(tube.label).toBe("Без цветовой маркировки");
  });

  it("у каждого цвета есть свой оттенок крышки", () => {
    const violet = tubeAppearance("фиолетовый", "");
    const yellow = tubeAppearance("желтый", "");

    expect(violet.cap).not.toBe(yellow.cap);
    expect(violet.cap).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
