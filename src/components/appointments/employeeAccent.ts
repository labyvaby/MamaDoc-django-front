// Палитра сотрудников общая с календарём расписания: один и тот же
// специалист узнаётся по цвету и там, и в приёме.
import { EMPLOYEE_PALETTE } from "../../pages/schedule/django/employeeColors";

/**
 * Цвет специалиста по порядку его появления в приёме (а не по id, как в
 * календаре): в одном приёме специалистов единицы, и соседние строки/группы
 * гарантированно получают разные оттенки.
 *
 * Возвращает Map: employeeId → hex под текущую тему. Строки без исполнителя
 * (`null`) в карту не попадают — им отдаётся нейтральный цвет на месте вызова.
 */
export function buildEmployeeAccentMap(
  employeeIds: (number | null)[],
  mode: "light" | "dark",
): Map<number, string> {
  const map = new Map<number, string>();
  let i = 0;
  for (const id of employeeIds) {
    if (id === null || map.has(id)) continue;
    const slot = EMPLOYEE_PALETTE[i % EMPLOYEE_PALETTE.length];
    map.set(id, mode === "dark" ? slot.dark : slot.light);
    i += 1;
  }
  return map;
}

/** Инициалы для аватара: «Иванов Иван» → «ИИ». */
export function employeeInitials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
