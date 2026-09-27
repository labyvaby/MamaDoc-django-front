import { describe, expect, it } from "vitest";
import type { Form5Report } from "../../api/vaccinations";
import { form5IsEmpty, form5Period, formatForm5Value, isTotalRow } from "./form5Tables";

const empty: Form5Report = {
  periodStart: "2026-07-01",
  periodEnd: "2026-07-31",
  periodLabel: "июль 2026",
  section1: [{ key: "3.1", label: "Пента – 1", values: [0, 0, 0, 0] }],
  section2: [],
  section3: [{ key: "2.0", label: "Всего", values: [0, 0, 0, 0, 0] }],
  section5: [],
  section6: [{ key: "1", label: "БЦЖ", values: [0, 0, 0, 0, null] }],
  warnings: [],
};

describe("form5Tables", () => {
  it("итоговые строки", () => {
    expect(isTotalRow("section1", { key: "11.0", label: "", values: [] })).toBe(true);
    expect(isTotalRow("section1", { key: "11.0v", label: "", values: [] })).toBe(true);
    expect(isTotalRow("section1", { key: "3.1", label: "", values: [] })).toBe(false);
    expect(isTotalRow("section3", { key: "2.0", label: "", values: [] })).toBe(true);
  });

  it("форматирование ячеек", () => {
    expect(formatForm5Value("section6", 4, null)).toBe("—");
    expect(formatForm5Value("section6", 4, 87.5)).toBe("87,5");
    expect(formatForm5Value("section5", 0, 1200)).toMatch(/^1\s200$/);
  });

  it("пустой отчёт и период", () => {
    expect(form5IsEmpty(empty)).toBe(true);
    expect(
      form5IsEmpty({ ...empty, section1: [{ key: "3.1", label: "", values: [1, 0, 0, 1] }] }),
    ).toBe(false);
    expect(form5Period("month", "2026-07")).toBe("2026-07");
    expect(form5Period("year", "2026-07")).toBe("2026");
  });
});
