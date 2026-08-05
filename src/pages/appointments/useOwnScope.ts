/**
 * useSeesOwnAppointmentsOnly — сужать ли рабочий список/реестр приёмов
 * до приёмов текущего сотрудника.
 *
 * Та же формула, что в AppointmentsPage (кабинет врача / процедурный): доступ к
 * общему списку определяется правом управления приёмами, а не названием роли.
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
  const canManageAppointments =
    can("appointments.update") || can("appointments.manage");
  return !isSuperAdmin() && !canManageAppointments;
}

export default useSeesOwnAppointmentsOnly;
