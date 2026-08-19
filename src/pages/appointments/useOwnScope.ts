/**
 * useSeesOwnAppointmentsOnly — сужать ли рабочий список/реестр приёмов
 * до приёмов текущего сотрудника.
 *
 * Та же формула, что в AppointmentsPage: область чтения определяет отдельное
 * право `appointments.view_all`, а НЕ право редактирования. `appointments.update`
 * разрешает править доступный тебе приём и никогда не расширяет READ — иначе
 * врач, которому дали править свой приём, начинает видеть приёмы коллег.
 *
 * Сужение зависит от права, а не от страницы: клиницист без `view_all` видит
 * только свои приёмы и в кабинете, и в Регистратуре.
 *
 * ⚠ Это подсказка для UI, а не граница безопасности: список сужает сам API
 * (`get_scoped_appointments_for_user`), даже если позвать его без
 * `employeeId=me`.
 *
 * ⚠ Условие зеркалит бэкенд (`user_is_clinician`): сужаем только тех, у кого
 * есть карточка сотрудника. У суперпользователя и управляющих ролей её нет,
 * поэтому `employeeId=me` вернул бы им пустой список (так реестры «Все приёмы»
 * / «Все процедуры» уже пустели после 2e6c847).
 */
import { useCanChecker } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";

export function useSeesOwnAppointmentsOnly(): boolean {
  const { can } = useCanChecker();
  const { isSuperAdmin, activeEmployee } = usePermissions();
  if (isSuperAdmin()) return false;
  return !can("appointments.view_all") && activeEmployee != null;
}

export default useSeesOwnAppointmentsOnly;
