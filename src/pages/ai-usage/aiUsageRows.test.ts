import { describe, expect, it } from "vitest";

import { avgTokensPerRequest, fillUsageDays, formatTokensShort, sharePct } from "./aiUsageRows";

describe("fillUsageDays", () => {
  it("дополняет пропущенные дни нулями и сохраняет порядок", () => {
    const days = fillUsageDays("2026-10-05", "2026-10-08", [
      { date: "2026-10-06", requests: 3, totalTokens: 900 },
      { date: "2026-10-08", requests: 1, totalTokens: 100 },
    ]);
    expect(days.map((d) => d.date)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]);
    expect(days.map((d) => d.totalTokens)).toEqual([0, 900, 0, 100]);
  });

  it("один день и перевёрнутый период", () => {
    expect(fillUsageDays("2026-10-09", "2026-10-09", [])).toHaveLength(1);
    expect(fillUsageDays("2026-10-09", "2026-10-01", [])).toEqual([]);
  });

  it("через границу месяца", () => {
    expect(fillUsageDays("2026-09-29", "2026-10-02", [])).toHaveLength(4);
  });
});

describe("formatters", () => {
  it("formatTokensShort", () => {
    expect(formatTokensShort(950)).toBe("950");
    expect(formatTokensShort(12_500)).toBe("12,5 тыс.");
    expect(formatTokensShort(1_200_000)).toBe("1,2 млн");
  });

  it("sharePct", () => {
    expect(sharePct(50, 200)).toBe("25%");
    expect(sharePct(1, 1000)).toBe("<1%");
    expect(sharePct(0, 0)).toBe("—");
  });

  it("avgTokensPerRequest не делит токены на неуспешные обращения", () => {
    expect(avgTokensPerRequest(59846, 18, 2)).toBe(3740);
    expect(avgTokensPerRequest(0, 2, 2)).toBeNull();
  });
});
