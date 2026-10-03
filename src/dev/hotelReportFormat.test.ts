import { describe, expect, it } from "vitest";

import { axisMoney, niceTicks } from "./hotelReportFormat";

describe("niceTicks", () => {
  it("ровные шаги от нуля", () => {
    expect(niceTicks(2500)).toEqual([0, 1000, 2000, 3000]);
    expect(niceTicks(6100)).toEqual([0, 2000, 4000, 6000, 8000]);
    expect(niceTicks(4000)).toEqual([0, 1000, 2000, 3000, 4000]);
    expect(niceTicks(0)).toEqual([0]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
  });
});

describe("axisMoney", () => {
  it("тысячи и миллионы с дробной частью, а не округлением", () => {
    expect(axisMoney(1500).replace(/\s/g, " ")).toBe("1,5 тыс.");
    expect(axisMoney(6000).replace(/\s/g, " ")).toBe("6 тыс.");
    expect(axisMoney(2_500_000).replace(/\s/g, " ")).toBe("2,5 млн");
    expect(axisMoney(650)).toBe("650");
  });
});
