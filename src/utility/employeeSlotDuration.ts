import type { DjangoEmployee, DjangoEmployeeListItem } from "../api/staff";

/**
 * Шаг сетки окон сотрудника, пока поля нет на бэкенде.
 *
 * Источник правды — `employee.slotDurationMinutes` (бэк-тикет
 * `MamaDoc/backend_ticket_employee_slot_duration.md`). Поле опциональное:
 * `undefined` означает окружение, где его ещё не выложили, и на таком стенде
 * настройка держится в браузере — иначе фича лежала бы мёртвой до релиза бэка.
 * Хранилище локальное и временное: другому регистратору шаг не виден, при
 * смене браузера пропадает, и об этом честно написано в самой форме.
 *
 * Когда бэк выложит поле, этот модуль удаляется целиком: `readOverrides`
 * перестанет вызываться, потому что `supportsSlotDuration` станет `true`.
 */

const KEY = "mamadoc:employeeSlotMinutes";

type Overrides = Record<string, number>;

/** Отдаёт ли бэк поле шага (иначе работаем на локальном фолбэке). */
export function supportsSlotDuration(
  employee: Pick<DjangoEmployee | DjangoEmployeeListItem, "slotDurationMinutes"> | null | undefined,
): boolean {
  return employee?.slotDurationMinutes !== undefined;
}

function readOverrides(): Overrides {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const result: Overrides = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && value > 0) result[id] = value;
    }
    return result;
  } catch {
    // Приватный режим и заполненное хранилище не должны ронять список окон.
    return {};
  }
}

/** Локальный шаг сотрудника: `null` — не задан. */
export function getLocalSlotMinutes(employeeId: number): number | null {
  return readOverrides()[String(employeeId)] ?? null;
}

/** Сохранить (`minutes`) или снять (`null`) локальный шаг сотрудника. */
export function setLocalSlotMinutes(employeeId: number, minutes: number | null): void {
  try {
    const overrides = readOverrides();
    if (minutes && minutes > 0) overrides[String(employeeId)] = minutes;
    else delete overrides[String(employeeId)];
    localStorage.setItem(KEY, JSON.stringify(overrides));
  } catch {
    // Не сохранилось — шаг просто останется прежним.
  }
}

/**
 * Шаг сотрудника с учётом фолбэка: поле бэка, если оно есть, иначе локальное
 * значение. `null` — своего шага нет, действует общий шаг сетки.
 */
export function resolveSlotMinutes(
  employee: Pick<DjangoEmployee | DjangoEmployeeListItem, "id" | "slotDurationMinutes">,
): number | null {
  if (employee.slotDurationMinutes !== undefined) return employee.slotDurationMinutes ?? null;
  return getLocalSlotMinutes(employee.id);
}
