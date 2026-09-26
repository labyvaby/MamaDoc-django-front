import { describe, expect, it } from "vitest";

import { quoteMessage } from "./priceQuote";
import { formatMoney } from "./registryTabs";

describe("price quote line", () => {
  it("names the family discount or just the package price", () => {
    const base = { packageId: 3, basePriceAmount: "24000.00", siblingsCount: 0 };
    expect(
      quoteMessage({ ...base, familyDiscountPercent: 25, priceAmount: "18000.00", siblingsCount: 1 }),
    ).toEqual({
      key: "wizard.program.familyDiscount",
      values: { percent: 25, price: formatMoney("18000.00"), base: formatMoney("24000.00") },
    });
    expect(quoteMessage({ ...base, familyDiscountPercent: 0, priceAmount: "24000.00" })).toEqual({
      key: "wizard.program.packagePrice",
      values: { price: formatMoney("24000.00") },
    });
  });
});
