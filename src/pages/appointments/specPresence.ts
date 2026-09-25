import type { EmployeeAvailability } from "../../api/scheduling";

/**
 * Специальности, у которых в филиале есть смены с `fromDate` до конца
 * загруженного диапазона окон.
 *
 * Рельс «Специальности» во «Окнах» показывает весь справочник организации,
 * и у большого филиала большинство строк пустые: в «Авиценна Бакаева» из 51
 * специальности врачи есть у 15. Бейдж «0/0» пустоту не выдаёт: он про
 * «сегодня», и в выходной «0/0» стоит и у специальностей, чьи врачи работают
 * с понедельника. Поэтому пустоту считаем по сменам на весь горизонт, а не
 * по бейджу.
 *
 * Приёмы вне графика специальность не открывают: записать к такому врачу
 * через окна всё равно нельзя, а сам приём виден во «Всех специалистах».
 *
 * `null` — состав неизвестен: у врача есть смена, а в справочнике сотрудников
 * его нет (не дали прав, справочник урезан по филиалу иначе). Тогда прятать
 * нельзя ничего.
 */
export function specializationsOnShift(
  employees: readonly EmployeeAvailability[],
  specsByEmployee: ReadonlyMap<number, readonly number[]>,
  fromDate: string,
): Set<number> | null {
  const result = new Set<number>();
  for (const employee of employees) {
    const onShift = employee.days.some(
      (day) => day.date >= fromDate && day.scheduled && !day.dayOff,
    );
    if (!onShift) continue;
    const specs = specsByEmployee.get(employee.employeeId);
    if (!specs) return null;
    specs.forEach((id) => result.add(id));
  }
  return result;
}

/**
 * Состав специальностей для рельса: набор — прятать остальные, `null` —
 * состав неизвестен (показать весь справочник), `undefined` — ещё считается.
 */
export type SpecsPresence = ReadonlySet<number> | null | undefined;

export interface SpecsPresenceInput {
  /** Выбрана специальность: выдача окон урезана ею, считать по ней нельзя. */
  specSelected: boolean;
  /** Права ещё загружаются — неизвестно, дадут ли справочник сотрудников. */
  permissionsLoading: boolean;
  /** Право `staff.view`: без него справочник сотрудников не запрашиваем. */
  canViewStaff: boolean;
  staffLoading: boolean;
  /** Справочник недоступен и данных нет (ошибка фоновой перезагрузки — не в счёт). */
  staffFailed: boolean;
  /** Окна с сегодняшнего дня уже пришли. */
  todayLoaded: boolean;
  /** Окна с сегодняшнего дня недоступны и данных нет. */
  todayFailed: boolean;
  compute: () => ReadonlySet<number> | null;
}

/**
 * Посчитать состав сейчас. Без права на справочник — сразу «неизвестно»:
 * рельс показывает весь справочник, как раньше, и не ждёт отказа от бэка.
 * Ошибка при уже полученных данных (фоновая перезагрузка, 502 на выкладке)
 * состав не сбрасывает — иначе рельс прыгал бы с 15 строк на 51.
 */
export function computeSpecsPresence(input: SpecsPresenceInput): SpecsPresence {
  if (input.specSelected || input.permissionsLoading) return undefined;
  if (!input.canViewStaff || input.staffFailed || input.todayFailed) return null;
  if (input.staffLoading || !input.todayLoaded) return undefined;
  return input.compute();
}

/**
 * Действующий состав: только что посчитанный, иначе запомненный для этого
 * филиала. Специальность выбрана, а запомнить было нечего — «неизвестно».
 */
export function resolveSpecsPresence(
  computed: SpecsPresence,
  remembered: SpecsPresence,
  specSelected: boolean,
): SpecsPresence {
  if (computed !== undefined) return computed;
  if (remembered !== undefined) return remembered;
  return specSelected ? null : undefined;
}

/**
 * Строки рельса. Кроме специальностей со сменами видны выбранная и те, у кого
 * по свежему бейджу кто-то сегодня есть: справочник сотрудников живёт в кэше,
 * и новая специальность врача иначе пропала бы из рельса до перезагрузки.
 */
export function railSpecializations<T extends { id: number }>(
  specs: readonly T[],
  presence: ReadonlySet<number> | null,
  selectedId: number | null,
  presentToday: (specId: number) => boolean,
): readonly T[] {
  if (!presence) return specs;
  return specs.filter((s) => presence.has(s.id) || s.id === selectedId || presentToday(s.id));
}
