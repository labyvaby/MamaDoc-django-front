import type {
  SalesMoney,
  SalesRow,
  SalesVariant,
} from "../../../api/retailAnalytics";
import { num } from "../retailAnalyticsModel";

/** Сезон «без сезона» в запросе отчёта о продажах. */
export const SALES_NO_SEASON = "__none__";

export type SalesSort =
  | "revenue"
  | "quantity"
  | "discount"
  | "returned"
  | "name";

export const SALES_SORTS: Array<{ key: SalesSort; label: string }> = [
  { key: "revenue", label: "По выручке" },
  { key: "quantity", label: "По количеству" },
  { key: "discount", label: "По скидке" },
  { key: "returned", label: "По возвратам" },
  { key: "name", label: "По названию" },
];

const sortValue = (
  money: SalesMoney,
  sort: Exclude<SalesSort, "name">
): number => {
  switch (sort) {
    case "quantity":
      return num(money.quantity);
    case "discount":
      return num(money.discount);
    case "returned":
      return num(money.returnedAmount);
    default:
      return num(money.revenue);
  }
};

/** Строки по убыванию выбранной величины; равные — по названию. */
export function sortSalesRows(
  rows: readonly SalesRow[],
  sort: SalesSort
): SalesRow[] {
  const byName = (a: SalesRow, b: SalesRow) =>
    a.name.localeCompare(b.name, "ru");
  if (sort === "name") return [...rows].sort(byName);
  return [...rows].sort(
    (a, b) =>
      sortValue(b.money, sort) - sortValue(a.money, sort) || byName(a, b)
  );
}

/** «Чёрный · 42»; у варианта без осей — его название. */
export function variantLabel(
  variant: Pick<SalesVariant, "color" | "size" | "name">
): string {
  const axes = [variant.color, variant.size].filter(Boolean);
  return axes.length ? axes.join(" · ") : variant.name;
}

/** Доля скидки от суммы без скидки, в процентах; без продаж — null. */
export function discountPercent(
  money: Pick<SalesMoney, "gross" | "discount">
): number | null {
  const gross = num(money.gross);
  return gross > 0 ? (num(money.discount) / gross) * 100 : null;
}

/** Есть ли в отчёте деньги «прочим» способом — иначе колонку не показываем. */
export const hasOtherMoney = (
  money: Pick<SalesMoney, "other" | "returnedOther">
): boolean => num(money.other) !== 0 || num(money.returnedOther) !== 0;

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
  cashless: "Безнал",
  bonus: "Бонусы",
  certificate: "Сертификат",
  voucher: "Ваучер",
  debt: "Долг",
};

export const salesPaymentLabel = (method: string): string =>
  PAYMENT_LABELS[method] ?? method;
