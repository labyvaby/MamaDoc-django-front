/**
 * useSeesOwnAppointmentsOnly — сужать ли рабочий список/реестр приёмов
 * до приёмов текущего сотрудника.
 *
 * Та же формула, что в AppointmentsPage (кабинет врача / процедурный): область
 * чтения определяется отдельным правом `appointments.view_all`, а НЕ правом
 * редактирования. `appointments.update` разрешает править доступный тебе приём
 * и никогда не расширяет READ — иначе врач, которому дали править свой приём,
 * начинает видеть приёмы коллег.
 *
 * ⚠ Это подсказка для UI, а не граница безопасности: список сужает сам API
 * (`get_scoped_appointments_for_user`), даже если позвать его без
 * `employeeId=me`.
 *
 * ⚠ Суперпользователь и управляющие роли не имеют employee-профиля, поэтому
 * `employeeId=me` для них возвращает пустой список — сужать их нельзя (иначе
 * реестры «Все приёмы»/«Все процедуры» пусты, как было после 2e6c847).
 */
import { useCanChecker } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";

export function useSeesOwnAppointmentsOnly(): boolean {
  const { can } = useCanChecker();
  const { isSuperAdmin } = usePermissions();
  return !isSuperAdmin() && !can("appointments.view_all");
}

export default useSeesOwnAppointmentsOnly;
