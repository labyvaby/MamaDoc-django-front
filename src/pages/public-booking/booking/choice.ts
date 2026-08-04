import { formatServicesCount } from "../format";
import type { PickableService } from "./ServicesCard";

/** Что уже выбрал гость — общая форма для итоговой строки и диалогов. */
export interface BookingChoice {
  date: string | null;
  time: string | null;
  services: PickableService[];
}

/** Сумма и суммарная длительность выбранных услуг. */
export function choiceTotals(services: PickableService[]) {
  return {
    price: services.reduce((sum, s) => sum + Number(s.basePrice ?? 0), 0),
    duration: services.reduce((sum, s) => sum + s.durationMinutes, 0),
  };
}

/** «3 августа, пн» — для диалога данных гостя и подтверждения записи. */
export function formatFullDate(date: string): string {
  const value = new Date(`${date}T00:00:00`);
  const main = value.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  const weekday = value.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "");
  return `${main}, ${weekday}`;
}

/** Строка выбора: «5 августа, ср · 12:00 · Вакцинация». */
export function choiceLine(
  choice: BookingChoice,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const parts = [
    choice.date ? formatFullDate(choice.date) : null,
    choice.time,
    choice.services.length === 1
      ? choice.services[0].name
      : choice.services.length > 1
        ? formatServicesCount(choice.services.length)
        : null,
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : t("summaryEmpty");
}
