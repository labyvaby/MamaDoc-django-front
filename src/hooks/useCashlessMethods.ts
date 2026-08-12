import { useQuery } from "@tanstack/react-query";

import {
  CASHLESS_METHODS_ENABLED,
  getCashlessMethods,
  type DjangoCashlessMethod,
} from "../api/cashlessMethods";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../api/queryKeys";
import { ApiError } from "../api/client";
import { useApiOrgId } from "./useApiOrgId";

/**
 * Активные способы безналичной оплаты для форм (оплата приёма, расход, приход
 * на склад). Пока флаг выключен, запрос не уходит и список пуст — формы в этом
 * случае ведут себя как раньше, без выбора способа.
 *
 * @param enabled — включать запрос только когда форма открыта (справочник не
 *   нужен закрытому дроверу).
 * @param organizationId — явный орг-контекст; по умолчанию активная организация.
 */
export function useCashlessMethods(
  enabled: boolean,
  organizationId?: number | null,
): {
  methods: DjangoCashlessMethod[];
  isLoading: boolean;
  /** Справочник доступен и непуст — только тогда форма требует выбор. */
  isRequired: boolean;
} {
  const activeOrgId = useApiOrgId();
  const orgId = organizationId ?? activeOrgId ?? null;

  const query = useQuery({
    queryKey: djangoQueryKeys.cashlessMethods.list(orgId),
    queryFn: ({ signal }) =>
      getCashlessMethods(signal, { organizationId: orgId }),
    enabled: CASHLESS_METHODS_ENABLED && enabled,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: (count, err) => {
      if ([403, 404, 429].includes((err as ApiError)?.status)) return false;
      return count < 1;
    },
  });

  const methods = CASHLESS_METHODS_ENABLED ? query.data ?? [] : [];

  return {
    methods,
    isLoading: query.isLoading,
    isRequired: methods.length > 0,
  };
}

export default useCashlessMethods;
