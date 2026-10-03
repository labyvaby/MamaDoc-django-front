import type { CalendarSex, CalendarTemplateRow } from "../../api/vaccinations";
import { formatMonths, formatRowAge } from "./calendarRowForm";

export interface CalendarVaccineGroup {
  vaccineId: number;
  vaccineName: string;
  /** Дозы по номеру. */
  doses: CalendarTemplateRow[];
  /** «Всем» / «Девочкам» / «Мальчикам» / «Разным» — по дозам группы. */
  sexText: string;
  /** Следующий свободный номер дозы для кнопки «+ доза». */
  nextDose: number;
}

const SEX_TEXT: Record<CalendarSex, string> = { any: "Всем", female: "Девочкам", male: "Мальчикам" };

/** Возраст дозы в днях — для сортировки (дни точнее месяцев). */
export function rowAgeDays(row: Pick<CalendarTemplateRow, "ageMonths" | "ageDays">): number {
  return row.ageDays ?? Math.round(row.ageMonths * 30.4375);
}

/**
 * Строки календаря → одна группа на вакцину, дозы по номеру. Группы идут
 * по возрасту первой дозы (как в национальном календаре), затем по имени.
 */
export function groupCalendarByVaccine(rows: CalendarTemplateRow[]): CalendarVaccineGroup[] {
  const byVaccine = new Map<number, CalendarTemplateRow[]>();
  for (const r of rows) {
    const list = byVaccine.get(r.vaccineId) ?? [];
    list.push(r);
    byVaccine.set(r.vaccineId, list);
  }
  const groups = [...byVaccine.entries()].map(([vaccineId, list]) => {
    const doses = [...list].sort((a, b) => a.doseNumber - b.doseNumber);
    const sexes = new Set(doses.map((d) => d.sex ?? "any"));
    return {
      vaccineId,
      vaccineName: doses[0].vaccineName,
      doses,
      sexText: sexes.size === 1 ? SEX_TEXT[[...sexes][0]] : "Разным",
      nextDose: Math.max(...doses.map((d) => d.doseNumber)) + 1,
    };
  });
  const firstAge = (g: CalendarVaccineGroup) => Math.min(...g.doses.map(rowAgeDays));
  return groups.sort((a, b) => firstAge(a) - firstAge(b) || a.vaccineName.localeCompare(b.vaccineName, "ru"));
}

/** «При рождении», «3,5 мес.», «11 лет 6 мес.» — возраст дозы. */
export function doseAgeText(row: Pick<CalendarTemplateRow, "ageMonths" | "ageDays">): string {
  return formatRowAge(row);
}

/** «до 5 лет» — верхняя граница, если задана. */
export function doseMaxAgeText(row: Pick<CalendarTemplateRow, "maxAgeMonths">): string | null {
  return row.maxAgeMonths == null ? null : `до ${formatMonths(row.maxAgeMonths)}`;
}

export interface AgeColumn {
  /** Ключ колонки = подпись возраста («2 мес.», «105 дн.»). */
  key: string;
  label: string;
  days: number;
}

/** Возрастные точки календаря слева направо — колонки таблицы «вакцина × возраст». */
export function ageColumns(rows: CalendarTemplateRow[]): AgeColumn[] {
  const byKey = new Map<string, AgeColumn>();
  for (const r of rows) {
    const label = doseAgeText(r);
    const days = rowAgeDays(r);
    const prev = byKey.get(label);
    if (!prev || days < prev.days) byKey.set(label, { key: label, label, days });
  }
  return [...byKey.values()].sort((a, b) => a.days - b.days);
}

/** Дозы вакцины в колонке возраста (обычно одна). */
export function dosesAt(group: CalendarVaccineGroup, column: AgeColumn): CalendarTemplateRow[] {
  return group.doses.filter((d) => doseAgeText(d) === column.key);
}
