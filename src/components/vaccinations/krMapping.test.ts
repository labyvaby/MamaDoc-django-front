import { describe, expect, it } from "vitest";
import type { KrPosition, Vaccine } from "../../api/vaccinations";
import { guessVaccine, krAntigens } from "./krMapping";

const v = (id: number, name: string, funding: "state" | "commercial" = "state") =>
  ({ id, name, funding }) as Vaccine;

describe("guessVaccine", () => {
  const cards = [
    v(1, "АКДС — адсорбированная коклюшно-дифтерийно-столбнячная вакцина"),
    v(2, "Пентавакцина — комбинированная вакцина АКДС-ВГВ-Хиб"),
    v(3, "АДС — адсорбированный дифтерийно-столбнячный анатоксин"),
    v(4, "АДС-М — анатоксин с уменьшенным содержанием антигенов"),
    v(5, "ОПВ — оральная полиомиелитная вакцина"),
    v(6, "Превенар 13", "commercial"),
    v(7, "ПКВ — пневмококковая конъюгированная вакцина"),
  ];
  it("различает АКДС, Пенту, АДС и АДС-М", () => {
    expect(guessVaccine("akds", cards)).toBe(1);
    expect(guessVaccine("penta", cards)).toBe(2);
    expect(guessVaccine("ads", cards)).toBe(3);
    expect(guessVaccine("adsm", cards)).toBe(4);
  });
  it("гос. карточка в приоритете, нет совпадения — null", () => {
    expect(guessVaccine("pcv", cards)).toBe(7);
    expect(guessVaccine("bopv", cards)).toBe(5);
    expect(guessVaccine("hpv", cards)).toBeNull();
  });
});

describe("krAntigens", () => {
  it("по одному антигену, в порядке календаря", () => {
    const p = (antigen: string) => ({ antigen, antigenLabel: antigen.toUpperCase() }) as KrPosition;
    expect(krAntigens([p("vgv"), p("penta"), p("vgv")])).toEqual([
      { antigen: "vgv", label: "VGV" },
      { antigen: "penta", label: "PENTA" },
    ]);
  });
});
