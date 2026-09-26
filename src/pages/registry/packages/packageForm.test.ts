import { describe, expect, it } from "vitest";

import { formToPayload, packageToForm, validatePackageForm } from "./packageForm";

describe("package form", () => {
  it("starts a new package with a year and no discounts", () => {
    expect(packageToForm(null)).toMatchObject({ termMonths: "12", familyDiscount: "0", visitDiscount: "0", isActive: true });
  });

  it("checks the money, the term and the percents", () => {
    const form = {
      ...packageToForm(null),
      name: "Премиум",
      price: "60000",
      listPrice: "50000",
      termMonths: "61",
      familyDiscount: "25",
      visitDiscount: "120",
    };
    expect(validatePackageForm(form)).toEqual({
      listPrice: "packages.errors.listPrice",
      termMonths: "packages.errors.term",
      visitDiscount: "packages.errors.percent",
    });
    expect(validatePackageForm({ ...form, listPrice: "96000", termMonths: "12", visitDiscount: "20" })).toEqual({});
    expect(validatePackageForm({ ...form, name: " ", price: "12,345" })).toMatchObject({
      name: "packages.errors.name",
      price: "packages.errors.price",
    });
  });

  it("sends decimals with a dot and an empty official price as null", () => {
    const payload = formToPayload({ ...packageToForm(null), name: " Карта ", price: "24000,5", listPrice: "" });
    expect(payload).toMatchObject({ name: "Карта", priceAmount: "24000.5", listPriceAmount: null, termMonths: 12 });
  });
});
