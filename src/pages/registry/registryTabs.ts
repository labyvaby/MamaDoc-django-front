import type { RegistryTab } from "../../api/registry";

export const REGISTRY_TABS: RegistryTab[] = ["active", "onboarding", "unpaid", "expiring", "cancelled"];

export function tabLabelKey(tab: RegistryTab): `tabs.${RegistryTab}` {
  return `tabs.${tab}`;
}

/** Полные месяцы между датами без учёта времени суток. */
export function monthsBetween(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(months, 0);
}

function parseDate(value: string): Date {
  // «YYYY-MM-DD» как локальная дата: new Date(строка) читает её как UTC и
  // у западных часовых поясов сдвигает день назад.
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

/** «4 мес.», «2 г. 6 мес.», «16 л.» — возраст ребёнка без дней. */
export function formatAge(birthDate: string | null | undefined, today: Date = new Date()): string {
  if (!birthDate) return "—";
  const months = monthsBetween(parseDate(birthDate), today);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} мес.`;
  if (years < 5) return rest ? `${years} г. ${rest} мес.` : `${years} г.`;
  return `${years} л.`;
}

/** Детские блоки показываем и без даты рождения — в педиатрии это частый случай. */
export function isChild(birthDate: string | null | undefined, today: Date = new Date()): boolean {
  if (!birthDate) return true;
  return monthsBetween(parseDate(birthDate), today) < 18 * 12;
}

/** «5 000» из «5000.00»: сумма без копеек, если они нулевые. */
export function formatMoney(amount: string | number | null | undefined): string {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value)) return "0";
  const fractional = Math.round(value * 100) % 100 !== 0;
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: fractional ? 2 : 0,
    maximumFractionDigits: 2,
  });
}
