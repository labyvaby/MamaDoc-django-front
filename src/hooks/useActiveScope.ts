import { usePermissions } from "./usePermissions";

export interface ActiveScope {
  /** Отправлять в query только когда бэк не может вывести орг из сессии. */
  organizationId?: number;
  /** Активный филиал; undefined = «все филиалы» (суперадмин без филиала). */
  branchId?: number;
  /** true, когда скоуп полностью загружен — списки не фетчим (enabled: isReady). */
  isReady: boolean;
  /**
   * Известен ли organizationId в тех случаях, когда бэк его требует.
   *
   * `isReady` говорит лишь о том, что /auth/me отработал. Этого мало: при
   * перезагрузке сессии `loading` успевает стать false раньше, чем приедет
   * activeOrganization, и запрос уходит без organizationId — а такому
   * суперпользователю бэк отвечает 400 («Суперпользователю необходимо указать
   * organizationId»). Гейтить фетчи нужно этим флагом, иначе пользователь
   * видит ошибку загрузки на ровном месте.
   */
  orgReady: boolean;
}

/** Входные данные для расчёта скоупа — то, что отдаёт usePermissions. */
export interface ActiveScopeInput {
  isSuperAdmin: boolean;
  membershipCount: number;
  organizationId?: number | null;
  branchId?: number | null;
  loading: boolean;
}

/**
 * Чистый расчёт скоупа — вынесен из хука, чтобы правила можно было покрыть
 * тестами (render-библиотек в проекте нет, только vitest).
 */
export function deriveActiveScope(input: ActiveScopeInput): ActiveScope {
  const orgRequired = input.isSuperAdmin || input.membershipCount > 1;
  const organizationId = orgRequired ? input.organizationId ?? undefined : undefined;
  return {
    organizationId,
    branchId: input.branchId ?? undefined,
    isReady: !input.loading,
    orgReady: !orgRequired || organizationId != null,
  };
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
  return deriveActiveScope({
    isSuperAdmin: isSuperAdmin(),
    membershipCount: (memberships ?? []).length,
    organizationId: activeOrganization?.id,
    branchId: activeBranch?.id,
    loading,
  });
}

export default useActiveScope;
