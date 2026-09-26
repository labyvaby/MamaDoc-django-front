import { describe, expect, it } from "vitest";

import { isIpInCidr, parseIpList, toSubnet24 } from "./network";

describe("toSubnet24", () => {
  it("зануляет последний октет IPv4 и ставит маску /24", () => {
    expect(toSubnet24("178.125.10.84")).toBe("178.125.10.0/24");
    expect(toSubnet24(" 10.0.0.1 ")).toBe("10.0.0.0/24");
  });

  it("подсеть покрывает исходный адрес", () => {
    expect(isIpInCidr("178.125.10.84", toSubnet24("178.125.10.84"))).toBe(true);
  });

  it("IPv6 и мусор возвращает как есть", () => {
    expect(toSubnet24("2001:db8::1")).toBe("2001:db8::1");
    expect(toSubnet24("300.1.1.1")).toBe("300.1.1.1");
    expect(toSubnet24("")).toBe("");
  });
});

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
