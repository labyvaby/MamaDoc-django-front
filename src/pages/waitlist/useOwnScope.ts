/**
 * useSeesOwnWaitlistOnly — сужать ли лист ожидания до «ожиданий к себе».
 *
 * Та же формула, что у приёмов (`useSeesOwnAppointmentsOnly`): область чтения
 * определяет отдельное право `waitlist.view_all`, а НЕ право постановки в
 * очередь. `waitlist.create` разрешает вести доступную тебе запись и никогда
 * не расширяет READ.
 *
 * ⚠ Это подсказка для UI (прячем фильтр «Сотрудник», в форме оставляем только
 * себя), а не граница безопасности: список сужает сам API
 * (`visible_entries(own_scope=…)`), и чужой `employeeId` он отклоняет.
 *
 * ⚠ Условие зеркалит бэкенд: сужаем только тех, у кого есть карточка
 * сотрудника. У суперпользователя и управляющих ролей её нет — их бэк не
 * сужает, и UI не должен прятать от них фильтр.
 */
import { useCanChecker } from "../../hooks/useCan";
import { usePermissions } from "../../hooks/usePermissions";

export interface OwnWaitlistScopeInput {
  isSuperAdmin: boolean;
  canViewAll: boolean;
  hasEmployee: boolean;
}

/** Чистая формула — отдельно от хуков, чтобы её можно было проверить тестом. */
export function seesOwnWaitlistOnly({ isSuperAdmin, canViewAll, hasEmployee }: OwnWaitlistScopeInput): boolean {
  if (isSuperAdmin) return false;
  return !canViewAll && hasEmployee;
}

export function useSeesOwnWaitlistOnly(): boolean {
  const { can } = useCanChecker();
  const { isSuperAdmin, activeEmployee } = usePermissions();
  return seesOwnWaitlistOnly({
    isSuperAdmin: isSuperAdmin(),
    canViewAll: can("waitlist.view_all"),
    hasEmployee: activeEmployee != null,
  });
}

export default useSeesOwnWaitlistOnly;
