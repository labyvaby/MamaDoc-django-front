import { describe, expect, it } from "vitest";

import { ageTick, ageTicks, formatNumber } from "./growthUi";

describe("growth ui helpers", () => {
  it("labels the age axis without repeats", () => {
    expect(ageTick(8)).toBe("8 мес.");
    expect(ageTick(60)).toBe("5 лет");
    expect(ageTick(24)).toBe("2 года");
    expect(ageTick(54)).toBe("4,5 г.");
    expect(ageTicks(42, 70)).toEqual([42, 48, 54, 60, 66]);
    expect(ageTicks(0, 12)).toEqual([0, 3, 6, 9, 12]);
    expect(ageTicks(40, 130)).toEqual([48, 60, 72, 84, 96, 108, 120]);
  });

  it("prints numbers the Russian way", () => {
    expect(formatNumber(24, 1)).toBe("24");
    expect(formatNumber(24.5, 1)).toBe("24,5");
    expect(formatNumber(15.86, 1)).toBe("15,9");
  });
});
