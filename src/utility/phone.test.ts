import { describe, expect, it } from "vitest";

import {
  composePhone,
  getPhoneLocalMaxLength,
  getPhoneLocalMinLength,
  isPhoneLocalComplete,
  normalizePhoneLocal,
  parsePhoneInput,
} from "./phone";

describe("phone input normalization", () => {
  it("does not count a leading zero in a Kyrgyz local number", () => {
    expect(normalizePhoneLocal("+996", "0709 789 228")).toBe("709789228");
    expect(composePhone("+996", "0709 789 228")).toBe("+996709789228");
  });

  it("moves a typed country code out of the local number", () => {
    expect(parsePhoneInput("+996", "996")).toEqual({
      countryCode: "+996",
      local: "",
    });
  });

  it("does not mistake the start of a local number for another country", () => {
    expect(parsePhoneInput("+996", "998")).toEqual({
      countryCode: "+996",
      local: "998",
    });
  });

  it("switches to another country when its code is explicitly typed with plus", () => {
    expect(parsePhoneInput("+996", "+998")).toEqual({
      countryCode: "+998",
      local: "",
    });
  });

  it("splits a full number entered in one change event", () => {
    expect(parsePhoneInput("+996", "998901234567")).toEqual({
      countryCode: "+998",
      local: "901234567",
    });
  });

  it.each(["992123456", "993123456", "994123456", "995123456", "998123456"])(
    "keeps %s as a nine-digit Kyrgyz local number",
    (local) => {
      expect(parsePhoneInput("+996", local)).toEqual({
        countryCode: "+996",
        local,
      });
    },
  );

  it("ignores repeated leading zeroes without losing a significant digit", () => {
    expect(normalizePhoneLocal("+996", "000709789228")).toBe("709789228");
  });

  it("removes the Russian trunk prefix without shortening the number", () => {
    expect(normalizePhoneLocal("+7", "8 916 123 45 67")).toBe("9161234567");
    expect(composePhone("+7", "8 916 123 45 67")).toBe("+79161234567");
  });

  it("uses the remaining E.164 length for countries with variable numbers", () => {
    expect(getPhoneLocalMinLength("+358")).toBe(5);
    expect(getPhoneLocalMaxLength("+358")).toBe(12);
    expect(isPhoneLocalComplete("+358", "12345")).toBe(true);
    expect(isPhoneLocalComplete("+358", "1234")).toBe(false);
    expect(isPhoneLocalComplete("+358", "123456789012")).toBe(true);
    expect(isPhoneLocalComplete("+358", "1234567890123")).toBe(false);
  });

  it("never composes more than fifteen E.164 digits for a variable country", () => {
    const phone = composePhone("+358", "1234567890123456");
    expect(phone).toBe("+358123456789012");
    expect(phone?.replace(/\D/g, "")).toHaveLength(15);
  });
});
