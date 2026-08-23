import { useQuery } from "@tanstack/react-query";

import { CASHLESS_METHODS_ENABLED } from "../api/cashlessMethods";
import { DJANGO_REFERENCE_STALE_TIME_MS } from "../api/queryKeys";
import { getSales, saleHasCashlessMethodField } from "../api/sales";
import { useActiveScope } from "./useActiveScope";

/**
 * Хранит ли бэк способ безнала у продаж товаров.
 *
 * Проверяется одной записью, а не флагом в коде: доработка (тикет
 * `backend_ticket_sales_cashless_method.md`) может выйти в любой день, и фронт
 * не должен ждать своего релиза. Пока поля нет, страница продаж ведёт себя как
 * раньше — без селекта способа, без фильтра и без разреза.
 *
 * ⚠ Судить по значению нельзя: `null` — законный ответ для наличной продажи.
 * Смотрим наличие самого ключа в ответе.
 *
 * Пустой список (в организации ещё нет ни одной продажи) читается как «не
 * поддерживается» — безопасная сторона: селект, который никуда не сохранится,
 * хуже отсутствующего.
 */
export function useSalesCashlessSupport(enabled = true): boolean {
  const { organizationId, orgReady } = useActiveScope();

  const { data } = useQuery({
    queryKey: ["django", "sales", "cashless-support", organizationId] as const,
    queryFn: ({ signal }) =>
      getSales({ organizationId: organizationId ?? null, limit: 1 }, signal),
    enabled: CASHLESS_METHODS_ENABLED && enabled && orgReady,
    staleTime: DJANGO_REFERENCE_STALE_TIME_MS,
    retry: false,
  });

  return Boolean(data && data.length > 0 && saleHasCashlessMethodField(data[0]));
}

export default useSalesCashlessSupport;
