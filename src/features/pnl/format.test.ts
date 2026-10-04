import { describe, expect, it } from "vitest";

import { compactSom, formatShare, formatSom } from "./format";

describe("format", () => {
  it("formatSom — целые сомы с разрядами и минусом", () => {
    expect(formatSom(16495000).replace(/\s/g, " ")).toBe("16 495 000");
    expect(formatSom(-1062000).replace(/\s/g, " ")).toBe("−1 062 000");
    expect(formatSom(0)).toBe("0");
  });

  it("compactSom — млн / тыс", () => {
    expect(compactSom(16495000)).toBe("16,5 млн");
    expect(compactSom(-1062000)).toBe("−1,06 млн");
    expect(compactSom(-6000)).toBe("−6 тыс");
    expect(compactSom(512)).toBe("512");
  });

  it("formatShare", () => {
    expect(formatShare(48.4)).toBe("48%");
    expect(formatShare(0.3)).toBe("<1%");
  });
});
