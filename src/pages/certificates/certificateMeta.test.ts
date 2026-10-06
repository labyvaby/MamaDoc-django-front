import { describe, expect, it } from "vitest";

import {
  amountToCents,
  certificateExpiryLabel,
  certificateLastDay,
  certificateLookupMessage,
  certificateStatusMeta,
  cleanCertificateCode,
  redeemedBranchesLabel,
} from "./certificateMeta";

const lookup = {
  id: 17,
  code: "GC-0001",
  nominal: "5000.00",
  balance: "1200.00",
  status: "active",
  usable: true,
  reason: "",
  expiresAt: "2027-10-07T00:00:00+06:00",
  soldBranchName: "ЦУМ",
};

describe("certificate expiry", () => {
  it("shows the last valid day, not the moment the card stops working", () => {
    // A second before midnight in Bishkek is still the 6th in Bishkek and in
    // any zone west of it — and the 6th is exactly what «действует до» means.
    expect(certificateLastDay("2027-10-07T00:00:00+06:00")).toBe("06.10.2027");
    expect(certificateLastDay(null)).toBeNull();
    expect(certificateExpiryLabel(null)).toBe("бессрочный");
  });
});

describe("certificateLookupMessage", () => {
  it("names the balance and the last day of a usable card", () => {
    const message = certificateLookupMessage({ ...lookup, expiresAt: null });
    expect(message.tone).toBe("ok");
    expect(message.text).toBe("Остаток: 1 200 сом, бессрочный");
  });

  it("passes the server reason through when the card cannot pay", () => {
    const message = certificateLookupMessage({ ...lookup, usable: false, reason: "Сертификат аннулирован." });
    expect(message).toEqual({ tone: "error", text: "Сертификат аннулирован." });
  });
});

describe("registry labels", () => {
  it("lists branches by the amount spent there", () => {
    expect(
      redeemedBranchesLabel([
        { branchId: 1, branchName: "ЦУМ", amount: "800.00" },
        { branchId: 2, branchName: "Дордой", amount: "3000.00" },
        { branchId: 3, branchName: "Азия", amount: "0.00" },
      ]),
    ).toBe("Дордой 3 000, ЦУМ 800");
  });

  it("keeps unknown statuses readable", () => {
    expect(certificateStatusMeta("void").label).toBe("Аннулирован");
    expect(certificateStatusMeta("weird").label).toBe("weird");
  });
});

describe("input helpers", () => {
  it("parses cashier amounts", () => {
    expect(amountToCents("5 000")).toBe(500000);
    expect(amountToCents("12,5")).toBe(1250);
    expect(Number.isNaN(amountToCents("abc"))).toBe(true);
  });

  it("drops spaces from a card number", () => {
    expect(cleanCertificateCode(" GC 0001 ")).toBe("GC0001");
  });
});
