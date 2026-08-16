import { useQuery } from "@tanstack/react-query";

import {
  CASHLESS_METHODS_ENABLED,
  getCashlessMethods,
  pickDefaultCashlessMethodId,
  type DjangoCashlessMethod,
} from "../api/cashlessMethods";
import { djangoQueryKeys, DJANGO_REFERENCE_STALE_TIME_MS } from "../api/queryKeys";
import { ApiError } from "../api/client";
import { useActiveScope } from "./useActiveScope";

/** Скоуп операции, для которой выбирается способ безнала. */
export interface CashlessMethodsScope {
  /**
   * Организация операции (приёма, расхода, склада) — не активной сессии.
   * Суперпользователь может смотреть чужую организацию, и подстановка активной
   * дала бы чужой список.
   */
  organizationId?: number | null;
  /**
   * Филиал операции. Бэк отдаёт общеорганизационные способы плюс способы этого
   * филиала, поэтому терминал соседней кассы в выбор не попадёт.
   */
  branchId?: number | null;
}

export interface CashlessMethodsState {
  methods: DjangoCashlessMethod[];
  isLoading: boolean;
  isError: boolean;
  /** Справочник загружен и непуст — только тогда форма требует выбор. */
  isRequired: boolean;
  /**
   * Способ, который форма подставляет сама: дефолт филиала операции, иначе
   * общий дефолт организации, иначе единственный способ. Пусто — кассир
   * выбирает вручную.
   */
  defaultMethodId: number | "";
  /**
   * Сохранение блокируется: справочник ещё не загружен (грузится, упал или
   * ждёт орг-контекст). Пустой список из-за ошибки нельзя трактовать как
   * «способ не нужен» — иначе ошибка бэка превращается в разрешение сохранить
   * операцию без способа.
   */
  blocksSubmit: boolean;
}

/**
 * Активные способы безналичной оплаты для форм (оплата приёма, расход, приход
 * на склад). Пока флаг выключен, запрос не уходит, список пуст и формы ведут
 * себя как раньше — без выбора способа и без блокировки сохранения.
 *
 * @param enabled — включать запрос только когда форма открыта (справочник не
 *   нужен закрытому дроверу).
 * @param scope — организация и филиал самой операции.
 */
export function useCashlessMethods(
  enabled: boolean,
  scope?: CashlessMethodsScope,
): CashlessMethodsState {
  const { organizationId: activeOrgId, isReady, orgReady } = useActiveScope();
  const orgId = scope?.organizationId ?? activeOrgId ?? null;
  const branchId = scope?.branchId ?? null;

  /**
   * Явный орг-контекст операции самодостаточен. Иначе ждём сессию: при
   * перезагрузке `loading` успевает стать false раньше, чем приедет
   * activeOrganization, и запрос ушёл бы без organizationId — суперпользователю
   * бэк на это отвечает 400 (см. useActiveScope.orgReady).
   */
  const scopeReady = scope?.organizationId != null || (isReady && orgReady);
  const active = CASHLESS_METHODS_ENABLED && enabled;

  const query = useQuery({
    queryKey: djangoQueryKeys.cashlessMethods.list(orgId, branchId),
    queryFn: ({ signal }) =>
      getCashlessMethods(signal, { organizationId: orgId, branchId }),
    enabled: active && scopeReady,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: (count, err) => {
      if ([400, 403, 404, 429].includes((err as ApiError)?.status)) return false;
      return count < 1;
    },
  });

  const loaded = active && query.isSuccess;
  const methods = loaded ? query.data ?? [] : [];

  return {
    methods,
    isLoading: active && !loaded && !query.isError,
    isError: active && query.isError,
    isRequired: loaded && methods.length > 0,
    defaultMethodId: pickDefaultCashlessMethodId(methods, branchId),
    blocksSubmit: active && !loaded,
  };
}

export default useCashlessMethods;
