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
