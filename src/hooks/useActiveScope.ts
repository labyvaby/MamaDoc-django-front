import { usePermissions } from "./usePermissions";

export interface ActiveScope {
  /** Отправлять в query только когда бэк не может вывести орг из сессии. */
  organizationId?: number;
  /** Активный филиал; undefined = «все филиалы» (суперадмин без филиала). */
  branchId?: number;
  /** true, когда скоуп полностью загружен — списки не фетчим (enabled: isReady). */
  isReady: boolean;
}

/**
 * Единый хук определения активного скоупа (организация + филиал) пользователя.
 *
 * Используется ВНУТРИ доменных React Query хуков (useAppointmentsList,
 * useServicesList, usePatientsList) для инжекции скоупа в queryKey и API-вызовы.
 */
export function useActiveScope(): ActiveScope {
  const { isSuperAdmin, memberships, activeOrganization, activeBranch, loading } =
    usePermissions();
  const orgRequired = isSuperAdmin() || (memberships ?? []).length > 1;
  return {
    organizationId: orgRequired ? activeOrganization?.id : undefined,
    branchId: activeBranch?.id,
    isReady: !loading,
  };
}

export default useActiveScope;
