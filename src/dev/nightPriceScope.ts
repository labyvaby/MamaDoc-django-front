/**
 * Охват новой цены ночи — как в Exely: «К выбранной дате», «К выбранной и
 * последующим датам», «Ко всем датам». Без React — проверяется тестами.
 */

export type NightPriceScope = "date" | "fromDate" | "all";

export const NIGHT_PRICE_SCOPE_LABELS: Record<NightPriceScope, string> = {
  date: "К выбранной дате",
  fromDate: "К выбранной и последующим датам",
  all: "Ко всем датам",
};

export const NIGHT_PRICE_SCOPES: NightPriceScope[] = ["date", "fromDate", "all"];

interface NightLike {
  date: string;
  price: string;
}

/** Даты (YYYY-MM-DD) ночей номера, к которым применяется цена. «Последующие» — самой выбранной и позже в этом номере. */
export function nightDatesForScope(nights: NightLike[], date: string, scope: NightPriceScope): string[] {
  if (scope === "all") return nights.map((n) => n.date);
  if (scope === "fromDate") return nights.filter((n) => n.date >= date).map((n) => n.date);
  return nights.filter((n) => n.date === date).map((n) => n.date);
}

/**
 * Ночи, которые реально меняются: у кого цена уже такая, не трогаем — иначе
 * тарифная ночь без нужды стала бы «вручную» и попала в историю.
 */
export function nightsToChange(nights: NightLike[], date: string, scope: NightPriceScope, price: number): string[] {
  const dates = new Set(nightDatesForScope(nights, date, scope));
  return nights.filter((n) => dates.has(n.date) && Math.abs(Number(n.price) - price) > 0.004).map((n) => n.date);
}

/** Значение из поля: «3 150,5» → 3150.5; пусто, мусор и отрицательные — null. */
export function parsePriceInput(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
