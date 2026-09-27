import { describe, expect, it } from "vitest";

import {
  fillBlank,
  formatBlankValue,
  hasBrokenBraces,
  SAMPLE_CONTRACT_TEXT,
  unknownPlaceholders,
} from "./blankText";

const data = {
  today: "2026-09-26",
  child: { fullName: "Иванов Али", age: "1 год 3 месяца", birthDate: "2025-06-26" },
  branch: { phones: ["+996 1", "+996 2"] },
  representative: null,
};

describe("blank text", () => {
  it("fills placeholders by path and formats ISO dates", () => {
    expect(fillBlank("{child.fullName}, {child.age}, род. {child.birthDate}, {today}", data)).toBe(
      "Иванов Али, 1 год 3 месяца, род. 26.06.2025, 26.09.2026",
    );
  });

  it("prints empty for missing values and joins lists", () => {
    expect(fillBlank("[{representative.fullName}] {branch.phones}", data)).toBe("[] +996 1, +996 2");
    expect(formatBlankValue({ a: 1 })).toBe("");
  });

  it("prints money like people write it", () => {
    expect(formatBlankValue("24000.00")).toBe("24 000");
    expect(formatBlankValue("1250.50")).toBe("1 250,50");
    expect(formatBlankValue("0.00")).toBe("0");
    expect(formatBlankValue("1101")).toBe("1101");
  });

  it("uses only known placeholders in the contract sample", () => {
    expect(hasBrokenBraces(SAMPLE_CONTRACT_TEXT)).toBe(false);
    expect(unknownPlaceholders(SAMPLE_CONTRACT_TEXT)).toEqual([]);
  });

  it("finds broken braces and unknown placeholders", () => {
    expect(hasBrokenBraces("Ребёнок {child.fullName")).toBe(true);
    expect(hasBrokenBraces("Ребёнок {child.fullName}")).toBe(false);
    expect(unknownPlaceholders("{child.fullName} {child.shoeSize} {child.shoeSize}")).toEqual(["child.shoeSize"]);
  });
});
