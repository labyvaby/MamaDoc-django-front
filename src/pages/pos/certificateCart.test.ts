import { describe, expect, it } from "vitest";

import type { PosClientCertificate, PosSavedReceipt } from "../../api/pos";
import type { GiftCertificateDetail } from "../../api/promotions";
import {
  MAX_CERTIFICATE_CODE_LENGTH,
  certificateCodeErrors,
  certificateCodesUnsupported,
  certificateCoverage,
  certificateDraftsTotalCents,
  formatIsoDay,
  giftCardAmountLabel,
  giftCardCodeSize,
  giftCardExpiryLabel,
  giftCardHolderName,
  normalizeCertificateCode,
  normalizeCheckoutResult,
  payableCertificates,
  resolveCertificateCodeStatus,
  toCertificateInputs,
  validateCertificateCode,
  validateCertificateForm,
  type PosCertificateDraft,
} from "./certificateCart";
import type { PosClient } from "./types";

const client: PosClient = {
  id: "55",
  name: "Айгерим Токтосунова",
  phone: "+996 700 000 000",
  tier: "",
  discountPercent: 0,
  bonuses: 0,
  cashback: 0,
  tierProgress: 0,
  nextTier: "",
  nextTierAmount: 0,
};

const draft = (patch: Partial<PosCertificateDraft> = {}): PosCertificateDraft => ({
  key: "a",
  client,
  nominalCents: 500_000,
  expiresOn: "2027-10-07",
  noExpiry: false,
  comment: "  на день рождения ",
  ...patch,
});

describe("certificate lines of the receipt", () => {
  it("sums nominals in kopecks", () => {
    expect(certificateDraftsTotalCents([])).toBe(0);
    expect(certificateDraftsTotalCents([draft(), draft({ key: "b", nominalCents: 150_050 })])).toBe(650_050);
  });

  it("maps lines to the quote/checkout contract", () => {
    expect(toCertificateInputs([draft(), draft({ key: "b", noExpiry: true, comment: "" })])).toEqual([
      { clientId: 55, nominal: "5000.00", expiresOn: "2027-10-07", noExpiry: false, comment: "на день рождения" },
      { clientId: 55, nominal: "5000.00", expiresOn: null, noExpiry: true, comment: "" },
    ]);
  });
});

describe("card number typed at the till", () => {
  it("normalizes like the server: no spaces, upper case, scanner tails dropped", () => {
    expect(normalizeCertificateCode(" mng 0001 ")).toBe("MNG0001");
    expect(normalizeCertificateCode("mng-0001")).toBe("MNG-0001");
    expect(normalizeCertificateCode("\tmng\u001d0001\r\n")).toBe("MNG0001");
    expect(normalizeCertificateCode("сертификат-7")).toBe("СЕРТИФИКАТ-7");
    expect(normalizeCertificateCode(null)).toBe("");
    expect(normalizeCertificateCode("   ")).toBe("");
  });

  it("sends the number only when it was typed", () => {
    expect(toCertificateInputs([draft({ code: " mng-0001 " }), draft({ key: "b", code: "" }), draft({ key: "c" })])).toEqual([
      {
        clientId: 55,
        nominal: "5000.00",
        expiresOn: "2027-10-07",
        noExpiry: false,
        comment: "на день рождения",
        code: "MNG-0001",
      },
      { clientId: 55, nominal: "5000.00", expiresOn: "2027-10-07", noExpiry: false, comment: "на день рождения" },
      { clientId: 55, nominal: "5000.00", expiresOn: "2027-10-07", noExpiry: false, comment: "на день рождения" },
    ]);
  });

  it("checks length and duplicates in the receipt", () => {
    expect(validateCertificateCode("")).toBeUndefined();
    expect(validateCertificateCode("A".repeat(MAX_CERTIFICATE_CODE_LENGTH))).toBeUndefined();
    expect(validateCertificateCode("A".repeat(MAX_CERTIFICATE_CODE_LENGTH + 1))).toMatch(/80/);
    expect(validateCertificateCode("mng-1", ["MNG-1"])).toMatch(/чеке/);
    const form = { buyer: client, nominal: "5000", expiresOn: "", noExpiry: true };
    expect(validateCertificateForm({ ...form, code: "MNG-1", codesInCart: ["mng-1"] }).code).toMatch(/чеке/);
    expect(validateCertificateForm({ ...form, code: "MNG-2", codesInCart: ["mng-1"] })).toEqual({});
  });

  it("tells free, taken and still-checking numbers apart", () => {
    const base = { code: "MNG-1", checkedCode: "MNG-1" };
    expect(resolveCertificateCodeStatus({ ...base, code: "", lookup: "pending" })).toBe("empty");
    expect(resolveCertificateCodeStatus({ ...base, checkedCode: "MNG-", lookup: "missing" })).toBe("checking");
    expect(resolveCertificateCodeStatus({ ...base, lookup: "pending" })).toBe("checking");
    expect(resolveCertificateCodeStatus({ ...base, lookup: "missing" })).toBe("free");
    expect(resolveCertificateCodeStatus({ ...base, lookup: "found" })).toBe("taken");
    expect(resolveCertificateCodeStatus({ ...base, lookup: "error" })).toBe("unknown");
    expect(resolveCertificateCodeStatus({ ...base, lookup: "found", inCart: true })).toBe("inCart");
    expect(resolveCertificateCodeStatus({ ...base, lookup: "missing", localError: "long" })).toBe("invalid");
  });

  it("maps server field errors to receipt rows", () => {
    expect(
      certificateCodeErrors({
        "certificates.1.code": "Сертификат под этим номером уже есть.",
        "certificates.0.nominal": "x",
        payments: "y",
      }),
    ).toEqual({ 1: "Сертификат под этим номером уже есть." });
    expect(certificateCodeErrors(null)).toEqual({});
  });

  it("notices a backend that drops the typed number", () => {
    const typed = [draft({ code: "MNG-1" })];
    expect(certificateCodesUnsupported(typed, [{}])).toBe(true);
    expect(certificateCodesUnsupported(typed, [{ code: "MNG-1" }])).toBe(false);
    expect(certificateCodesUnsupported([draft()], [{}])).toBe(false);
    expect(certificateCodesUnsupported(typed, undefined)).toBe(false);
  });

  it("shrinks long numbers on the card", () => {
    expect(giftCardCodeSize(9).fontSize).toBe("3.6cqw");
    expect(giftCardCodeSize(20).fontSize).toBe("3cqw");
    expect(giftCardCodeSize(80).fontSize).toBe("2.5cqw");
  });
});

describe("sell form validation", () => {
  const today = "2026-10-07";
  const valid = { buyer: client, nominal: "5 000", expiresOn: "2027-10-07", noExpiry: false };

  it("accepts a filled form", () => {
    expect(validateCertificateForm(valid, today)).toEqual({});
    expect(validateCertificateForm({ ...valid, expiresOn: "", noExpiry: true }, today)).toEqual({});
    expect(validateCertificateForm({ ...valid, expiresOn: today }, today)).toEqual({});
  });

  it("requires a buyer", () => {
    expect(validateCertificateForm({ ...valid, buyer: null }, today).buyer).toMatch(/покупател/);
  });

  it("rejects empty, zero, garbage and absurd nominals", () => {
    expect(validateCertificateForm({ ...valid, nominal: "" }, today).nominal).toBeTruthy();
    expect(validateCertificateForm({ ...valid, nominal: "0" }, today).nominal).toBeTruthy();
    expect(validateCertificateForm({ ...valid, nominal: "abc" }, today).nominal).toBeTruthy();
    expect(validateCertificateForm({ ...valid, nominal: "500000000" }, today).nominal).toBeTruthy();
    expect(validateCertificateForm({ ...valid, nominal: "1500,50" }, today).nominal).toBeUndefined();
  });

  it("rejects past, missing and impossible dates unless the card never expires", () => {
    expect(validateCertificateForm({ ...valid, expiresOn: "2026-10-06" }, today).expiresOn).toMatch(/прошлом/);
    expect(validateCertificateForm({ ...valid, expiresOn: "" }, today).expiresOn).toBeTruthy();
    expect(validateCertificateForm({ ...valid, expiresOn: "2027-02-31" }, today).expiresOn).toBeTruthy();
    expect(validateCertificateForm({ ...valid, expiresOn: "2026-10-06", noExpiry: true }, today).expiresOn).toBeUndefined();
  });
});

describe("gift card labels", () => {
  it("formats the amount with thin groups and no currency", () => {
    expect(giftCardAmountLabel(500_000)).toBe("5 000");
    expect(giftCardAmountLabel(150_050)).toBe("1 500,5");
    expect(giftCardAmountLabel(Number.NaN)).toBe("0");
    expect(giftCardAmountLabel(0)).toBe("0");
  });

  it("shows the last valid day or «бессрочно»", () => {
    expect(formatIsoDay("2027-10-07")).toBe("07.10.2027");
    expect(formatIsoDay("2027-13-01")).toBeNull();
    expect(giftCardExpiryLabel(false, "2027-10-07")).toBe("до 07.10.2027");
    expect(giftCardExpiryLabel(true, "2027-10-07")).toBe("бессрочно");
    expect(giftCardExpiryLabel(false, null)).toBe("срок не указан");
  });

  it("keeps one line for the holder", () => {
    expect(giftCardHolderName("айгерим  токтосунова кайратовна")).toBe("АЙГЕРИМ ТОКТОСУНОВА");
    expect(giftCardHolderName("  ")).toBe("");
    expect(giftCardHolderName(null)).toBe("");
  });
});

describe("paying with a certificate", () => {
  const cert = (patch: Partial<PosClientCertificate>): PosClientCertificate => ({
    id: 1,
    code: "AAAA-BBBB",
    nominal: "5000.00",
    balance: "1200.00",
    status: "active",
    usable: true,
    expiresAt: "2027-10-08T00:00:00+06:00",
    soldAt: null,
    soldBranchName: "ЦУМ",
    ...patch,
  });

  it("lists only usable cards, the soonest to expire first", () => {
    const list = [
      cert({ id: 1, expiresAt: null }),
      cert({ id: 2, expiresAt: "2027-01-01T00:00:00+06:00" }),
      cert({ id: 3, balance: "0.00" }),
      cert({ id: 4, usable: false }),
      cert({ id: 5, status: "expired" }),
      cert({ id: 6, expiresAt: "2026-12-01T00:00:00+06:00" }),
    ];
    expect(payableCertificates(list).map((item) => item.id)).toEqual([6, 2, 1]);
    expect(payableCertificates(undefined)).toEqual([]);
  });

  it("covers goods only up to the balance", () => {
    expect(certificateCoverage(1200, 3000)).toEqual({ covered: 1200, rest: 1800 });
    expect(certificateCoverage(5000, 3000)).toEqual({ covered: 3000, rest: 0 });
    expect(certificateCoverage(5000, 0)).toEqual({ covered: 0, rest: 0 });
  });
});

describe("checkout response", () => {
  const sold = { id: 17, code: "7Q4K-92XC", nominal: "5000.00" } as GiftCertificateDetail;
  const receipt = { id: 9, number: "abc", lines: [], payments: [] } as unknown as PosSavedReceipt;

  it("keeps the receipt and the sold certificates", () => {
    expect(normalizeCheckoutResult({ ...receipt, soldCertificates: [sold] })).toEqual({
      receipt: { ...receipt, soldCertificates: [sold] },
      certificates: [sold],
    });
  });

  it("treats a response without a receipt id as certificates only", () => {
    expect(normalizeCheckoutResult({ id: null, lines: [], soldCertificates: [sold] })).toEqual({
      receipt: null,
      certificates: [sold],
    });
    expect(normalizeCheckoutResult({ receipt: null, soldCertificates: [sold] })).toEqual({
      receipt: null,
      certificates: [sold],
    });
  });

  it("accepts a nested receipt and an old backend without soldCertificates", () => {
    expect(normalizeCheckoutResult({ receipt, soldCertificates: [] }).receipt).toBe(receipt);
    expect(normalizeCheckoutResult(receipt)).toEqual({ receipt, certificates: [] });
  });

  it("carries the debt a sale on credit opened, and omits it otherwise", () => {
    const debt = { id: 12, clientId: 14, amount: "3000.00", outstanding: "3000.00", status: "open", dueDate: "2026-10-23", comment: "" };
    expect(normalizeCheckoutResult({ receipt, soldCertificates: [], debt })).toEqual({ receipt, certificates: [], debt });
    expect(normalizeCheckoutResult({ receipt, soldCertificates: [], debt: null })).toEqual({ receipt, certificates: [] });
  });
});
