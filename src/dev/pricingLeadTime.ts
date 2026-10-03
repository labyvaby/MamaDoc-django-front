/**
 * Правила цены «по приближению даты заезда» (условие leadTimeFrom..leadTimeTo —
 * дней от дня брони до заезда, обе границы включительно). Босс: «при
 * приближении даты цена тоже должна меняться» — скидка горящих номеров или,
 * наоборот, дорожание в последние дни, и раннее бронирование.
 *
 * Сервер применяет такие правила в момент брони (этап брони, pricing.py):
 * цена в форме брони и на сайте меняется, а в «Календаре цен» — нет, там цена
 * даты без правил брони.
 */
import type { PricingRulePrefill } from "./HotelPricingRuleFormPage";

const days = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "день" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "дня" : "дней");

/** «за 3 дня до заезда и ближе», «за 60 дней до заезда и раньше», «за 7–14 дней до заезда», «в день заезда». */
export function leadTimeLabel(from: number | null | undefined, to: number | null | undefined): string {
  const lo = from ?? 0;
  if (to == null) return lo <= 0 ? "в любой срок до заезда" : `за ${lo} ${days(lo)} до заезда и раньше`;
  if (lo <= 0) return to === 0 ? "в день заезда" : `за ${to} ${days(to)} до заезда и ближе`;
  if (lo === to) return `ровно за ${lo} ${days(lo)} до заезда`;
  return `за ${lo}–${to} ${days(to)} до заезда`;
}

export type LeadTimeMode = "near" | "ahead" | "range";

/** Какой из трёх вариантов показать для сохранённых границ. */
export function leadTimeModeOf(from: string, to: string): LeadTimeMode {
  const lo = from.trim() === "" ? 0 : Number(from);
  if (lo === 0 && to.trim() !== "") return "near";
  if (lo > 0 && to.trim() === "") return "ahead";
  if (lo === 0 && to.trim() === "") return "near";
  return "range";
}

/** Готовые правила: открываются в форме заполненными — поправить числа и сохранить. */
export const LEAD_TIME_TEMPLATES: { key: string; label: string; hint: string; prefill: PricingRulePrefill }[] = [
  {
    key: "last-minute",
    label: "Горящие номера",
    hint: "−15%, когда до заезда 3 дня и меньше — продать то, что иначе простоит",
    prefill: { name: "Горящие номера: −15% за 3 дня до заезда", category: "last_minute", adjustmentType: "percent", amount: "-15", leadTimeFrom: 0, leadTimeTo: 3 },
  },
  {
    key: "close-in-markup",
    label: "Дорожание у даты",
    hint: "+10%, когда до заезда 2 дня и меньше — последние номера дороже",
    prefill: { name: "Дорожание: +10% за 2 дня до заезда", category: "last_minute", adjustmentType: "percent", amount: "10", leadTimeFrom: 0, leadTimeTo: 2 },
  },
  {
    key: "early-bird",
    label: "Раннее бронирование",
    hint: "−10%, когда бронируют за 60 дней и раньше",
    prefill: { name: "Раннее бронирование: −10% за 60 дней", category: "early_bird", adjustmentType: "percent", amount: "-10", leadTimeFrom: 60, leadTimeTo: null },
  },
];
