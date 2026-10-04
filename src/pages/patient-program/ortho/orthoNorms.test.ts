import { describe, expect, it } from "vitest";

import {
  ageMonths,
  ageText,
  ageWeeks,
  aptaGrade,
  aptaStatus,
  atrStatus,
  beightonStatus,
  chizhinStatus,
  cobbStatus,
  flatfootPhysiological,
  flatfootStatus,
  fpiStatus,
  grafSuggest,
  grafTypeStatus,
  heelStatus,
  kyphosisStatus,
  legAxisStatus,
  lengthDiffStatus,
  postureCardStatus,
  postureTypeStatus,
  worst,
} from "./orthoNorms";

describe("возраст", () => {
  it("месяцы и недели на дату осмотра, до рождения — нет", () => {
    expect(ageMonths("2025-03-26", "2025-04-23")).toBeCloseTo(0.9, 1);
    expect(ageWeeks("2025-03-26", "2025-04-23")).toBe(4);
    expect(ageMonths("2025-03-26", "2025-03-01")).toBeNull();
    expect(ageMonths(null, "2025-03-01")).toBeNull();
  });

  it("подпись: неделями до 2 мес., дальше как в «Зрении»", () => {
    expect(ageText(0.92)).toBe("4 нед.");
    expect(ageText(18.2)).toBe("1 год 6 мес.");
    expect(ageText(72)).toBe("6 лет");
  });
});

describe("worst", () => {
  it("худший статус, «нет оценки» уступает", () => {
    expect(worst("ok", "warn", "unknown")).toBe("warn");
    expect(worst("unknown", "bad", "ok")).toBe("bad");
    expect(worst()).toBe("unknown");
  });
});

describe("тип по Графу", () => {
  it("зрелый сустав в любом возрасте", () => {
    expect(grafSuggest(63, 50, 4)).toEqual({ type: "Ia", label: "Ia", status: "ok" });
    expect(grafSuggest(61, 58, 20)).toEqual({ type: "Ib", label: "Ib", status: "ok" });
  });

  it("IIa до 6 нед, с 6 нед — плюс или минус по 55°, с 12 нед — IIb", () => {
    expect(grafSuggest(54, 60, 4)?.label).toBe("IIa");
    expect(grafSuggest(56, 60, 8)).toMatchObject({ label: "IIa(+)", status: "warn" });
    expect(grafSuggest(53, 60, 8)).toMatchObject({ label: "IIa(−)", status: "bad" });
    expect(grafSuggest(56, 60, 13)).toMatchObject({ label: "IIb", status: "bad" });
    expect(grafSuggest(56, 60, null)?.label).toBe("IIa или IIb");
  });

  it("критические и децентрированные, вывих — уточняет врач", () => {
    expect(grafSuggest(45, 70, 6)?.label).toBe("IIc");
    expect(grafSuggest(45, 80, 6)?.label).toBe("D");
    expect(grafSuggest(40, 90, 6)).toMatchObject({ label: "III или IV", status: "bad" });
    expect(grafSuggest(null, 50, 6)).toBeNull();
  });

  it("цвет типа от врача", () => {
    expect(grafTypeStatus("Ib", 20)).toBe("ok");
    expect(grafTypeStatus("IIa", 4)).toBe("warn");
    expect(grafTypeStatus("IIa", 13)).toBe("bad");
    expect(grafTypeStatus("IV", 4)).toBe("bad");
  });
});

describe("кривошея по APTA 2018", () => {
  it("степени по возрасту, разнице поворота и уплотнению", () => {
    expect(aptaGrade(2, 10, false)).toBe(1);
    expect(aptaGrade(2, 20, false)).toBe(2);
    expect(aptaGrade(2, 10, true)).toBe(3);
    expect(aptaGrade(8, 10, false)).toBe(4);
    expect(aptaGrade(11, 10, false)).toBe(5);
    expect(aptaGrade(8, 20, false)).toBe(6);
    expect(aptaGrade(11, 20, false)).toBe(6);
    expect(aptaGrade(11, 35, false)).toBe(7);
    expect(aptaGrade(8, 10, true)).toBe(7);
    expect(aptaGrade(14, 5, false)).toBe(8);
  });

  it("цвет степени", () => {
    expect(aptaStatus(2)).toBe("warn");
    expect(aptaStatus(6)).toBe("bad");
    expect(aptaStatus(null)).toBe("unknown");
  });
});

describe("стопы", () => {
  it("пятка: до 7 лет вальгус до 10° — норма, с 7 лет — до 5°", () => {
    expect(heelStatus(8, 60)).toBe("ok");
    expect(heelStatus(8, 90)).toBe("warn");
    expect(heelStatus(12, 60)).toBe("warn");
    expect(heelStatus(16, 60)).toBe("bad");
    expect(heelStatus(-4, 60)).toBe("warn");
    expect(heelStatus(-8, 60)).toBe("bad");
    expect(heelStatus(null, 60)).toBe("unknown");
  });

  it("плоскостопие: мобильное без жалоб — норма до 10 лет", () => {
    expect(flatfootStatus(["flattened", "flattened"], "mobile", false, 72)).toBe("ok");
    expect(flatfootPhysiological(["flattened", "flat"], "mobile", false, 72)).toBe(true);
    expect(flatfootStatus(["flat", "flat"], "mobile", true, 72)).toBe("warn");
    expect(flatfootStatus(["flat", "flat"], "mobile", false, 130)).toBe("warn");
    expect(flatfootStatus(["flat", null], "rigid", false, 72)).toBe("bad");
    expect(flatfootStatus(["normal", "normal"], null, false, 72)).toBe("ok");
    expect(flatfootStatus([null, null], null, false, 72)).toBe("unknown");
  });

  it("FPI-6 и индекс Чижина", () => {
    expect(fpiStatus(4)).toBe("ok");
    expect(fpiStatus(8)).toBe("warn");
    expect(fpiStatus(-3)).toBe("warn");
    expect(fpiStatus(11)).toBe("bad");
    expect(chizhinStatus(1.5, 96)).toBe("warn");
    expect(chizhinStatus(1.5, 60)).toBe("unknown");
    expect(chizhinStatus(2.4, 96)).toBe("bad");
  });
});

describe("ноги", () => {
  it("варус: до 2 лет до 5 см — норма, старше 3 лет и больше 5 см — отклонение", () => {
    expect(legAxisStatus("varus", 3, true, 14)).toBe("ok");
    expect(legAxisStatus("varus", 6, true, 14)).toBe("warn");
    expect(legAxisStatus("varus", 3, true, 30)).toBe("warn");
    expect(legAxisStatus("varus", 6, true, 40)).toBe("bad");
  });

  it("вальгус: до 7 см — норма, 7–8 — пограничное, больше 8 — отклонение", () => {
    expect(legAxisStatus("valgus", 5, true, 60)).toBe("ok");
    expect(legAxisStatus("valgus", 7.5, true, 60)).toBe("warn");
    expect(legAxisStatus("valgus", 9, true, 60)).toBe("bad");
    expect(legAxisStatus("valgus", 5, true, 100)).toBe("warn");
  });

  it("асимметрия и прямые ноги", () => {
    expect(legAxisStatus("valgus", 4, false, 60)).toBe("bad");
    expect(legAxisStatus("neutral", null, true, 60)).toBe("ok");
    expect(legAxisStatus(null, null, true, 60)).toBe("unknown");
  });

  it("разница длины", () => {
    expect(lengthDiffStatus(0.5)).toBe("ok");
    expect(lengthDiffStatus(1.5)).toBe("warn");
    expect(lengthDiffStatus(2)).toBe("bad");
  });
});

describe("позвоночник и осанка", () => {
  it("ротация, Кобб, кифоз", () => {
    expect(atrStatus(3)).toBe("ok");
    expect(atrStatus(5)).toBe("warn");
    expect(atrStatus(7)).toBe("bad");
    expect(cobbStatus(9)).toBe("ok");
    expect(cobbStatus(15)).toBe("warn");
    expect(cobbStatus(22)).toBe("bad");
    expect(kyphosisStatus(30)).toBe("ok");
    expect(kyphosisStatus(45)).toBe("warn");
    expect(kyphosisStatus(55)).toBe("bad");
  });

  it("карта осанки и тип", () => {
    expect(postureCardStatus([])).toBe("ok");
    expect(postureCardStatus([5])).toBe("warn");
    expect(postureCardStatus([5, 8])).toBe("bad");
    expect(postureCardStatus(null)).toBe("unknown");
    expect(postureTypeStatus("normal")).toBe("ok");
    expect(postureTypeStatus("stooped")).toBe("warn");
  });

  it("Бейтон: порог 6 до 12 лет, 5 после", () => {
    expect(beightonStatus(5, 72)).toBe("ok");
    expect(beightonStatus(6, 72)).toBe("warn");
    expect(beightonStatus(5, 150)).toBe("warn");
  });
});
