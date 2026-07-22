import { describe, expect, it } from "vitest";

import { isIpInCidr, parseIpList } from "./network";

describe("parseIpList", () => {
  it("splits comma-separated entries and trims whitespace", () => {
    expect(parseIpList("1.2.3.4, 5.6.7.0/24 , 8.8.8.8")).toEqual([
      "1.2.3.4",
      "5.6.7.0/24",
      "8.8.8.8",
    ]);
  });

  it("splits newline-separated entries (pasted multi-line list)", () => {
    expect(parseIpList("1.2.3.4\n5.6.7.0/24\n8.8.8.8")).toEqual([
      "1.2.3.4",
      "5.6.7.0/24",
      "8.8.8.8",
    ]);
  });

  it("handles mixed commas and newlines", () => {
    expect(parseIpList("1.2.3.4,\n5.6.7.0/24, \n8.8.8.8")).toEqual([
      "1.2.3.4",
      "5.6.7.0/24",
      "8.8.8.8",
    ]);
  });

  it("drops empty segments from trailing/duplicate separators", () => {
    expect(parseIpList("1.2.3.4,,  ,\n\n5.6.7.8")).toEqual([
      "1.2.3.4",
      "5.6.7.8",
    ]);
  });

  it("returns an empty array for blank input", () => {
    expect(parseIpList("")).toEqual([]);
    expect(parseIpList("   ")).toEqual([]);
  });

  it("each parsed entry still matches via isIpInCidr", () => {
    const allowed = parseIpList("178.125.0.0/16, 89.1.2.3");
    expect(allowed.some((cidr) => isIpInCidr("178.125.10.84", cidr))).toBe(true);
    expect(allowed.some((cidr) => isIpInCidr("89.1.2.3", cidr))).toBe(true);
    expect(allowed.some((cidr) => isIpInCidr("1.1.1.1", cidr))).toBe(false);
  });
});
