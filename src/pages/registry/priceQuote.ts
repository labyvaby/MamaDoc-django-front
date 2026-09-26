import type { PriceQuote } from "../../api/registry";
import { formatMoney } from "./registryTabs";

export interface QuoteMessage {
  key: "wizard.program.familyDiscount" | "wizard.program.packagePrice";
  values: Record<string, string | number>;
}

/** Строка расчёта под ценой: семейная скидка или просто цена пакета. */
export function quoteMessage(quote: PriceQuote): QuoteMessage {
  if (quote.familyDiscountPercent > 0) {
    return {
      key: "wizard.program.familyDiscount",
      values: {
        percent: quote.familyDiscountPercent,
        price: formatMoney(quote.priceAmount),
        base: formatMoney(quote.basePriceAmount),
      },
    };
  }
  return { key: "wizard.program.packagePrice", values: { price: formatMoney(quote.priceAmount) } };
}
