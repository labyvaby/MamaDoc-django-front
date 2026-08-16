import type { EmployeeDailyDetailRow } from "../../../api/payroll";

/**
 * Сколько дней сотрудник работал в месяце — для колонки «Рабочих дней» в
 * платёжной ведомости.
 *
 * Отдельного поля у бэка нет: `/payroll/employees/<id>/details/` отдаёт строки
 * только за дни с активностью, но среди них попадаются «пустые» (например,
 * день с расходом и без часов и приёмов). Поэтому считаем день рабочим, если в
 * нём есть хоть что-то из отработанного: часы СКУД, свои приёмы, доля
 * распределённых приёмов или созданные записи.
 */
export function countWorkDays(details: EmployeeDailyDetailRow[]): number {
  return details.filter((day) => {
    const hours = Number(day.hoursSum ?? 0);
    const distributed = Number(day.distributedAppointments ?? 0);
    return (
      (Number.isFinite(hours) && hours > 0) ||
      (day.appointmentsCount ?? 0) > 0 ||
      (day.createdByCount ?? 0) > 0 ||
      (Number.isFinite(distributed) && distributed > 0)
    );
  }).length;
}
