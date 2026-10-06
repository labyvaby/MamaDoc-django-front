/**
 * Возвраты для журнала реестров — из ленты кассы, пока бэк не отдаёт
 * `refundedTotal` в списке приёмов (тикет
 * `docs/backend_ticket_appointments_list_refunds.md`). На test поле есть с
 * 06.10.2026, и журнал этот запрос не включает; на проде — ещё нет. Когда
 * поле доедет до прода, хук удалить целиком.
 *
 * Почему касса: в списке /appointments/ после возврата `paidTotal` остаётся
 * суммой ДО возврата, а частичный возврат не меняет статус — по списку его не
 * видно вовсе. Лента кассы (`entryType=refund`) отдаёт каждый возврат с
 * `appointmentId` и суммой, в том числе частичный, одним запросом на период,
 * а не платёжной сводкой на каждый приём.
 *
 * Окно дат — по дате возврата, а журнал — по дате приёма, поэтому берём шире:
 * от начала периода минус месяц (возврат предоплаты бывает до визита) и до
 * сегодня (возврат делают и через неделю после приёма). Лишние возвраты
 * чужих периодов безвредны: сопоставляем по id загруженных приёмов.
 *
 * Права: касса — `finance.view`, те же, что у денег журнала; без права запрос
 * не делаем и журнал считает по статусу `refunded`, как раньше.
 */
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { getCashboxEntries } from "../../../../api/cashbox";
import { DJANGO_LIST_STALE_TIME_MS } from "../../../../api/queryKeys";
import { useApiOrgId } from "../../../../hooks/useApiOrgId";

const PAGE_SIZE = 200;
/** Страховка от бесконечной догрузки: 4 000 возвратов — далеко за пределами реального. */
const MAX_PAGES = 20;

export type RefundsByAppointment = Map<number, number>;

export function useRegistryRefunds(params: {
  periodFrom: dayjs.Dayjs;
  enabled: boolean;
}): RefundsByAppointment | null {
  const organizationId = useApiOrgId();
  const dateFrom = params.periodFrom.subtract(31, "day").format("YYYY-MM-DD");
  const dateTo = dayjs().format("YYYY-MM-DD");

  const query = useQuery({
    queryKey: ["registry", "refunds", organizationId ?? null, dateFrom, dateTo],
    enabled: params.enabled,
    staleTime: DJANGO_LIST_STALE_TIME_MS,
    queryFn: async ({ signal }) => {
      const byAppointment: RefundsByAppointment = new Map();
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const res = await getCashboxEntries(
          { entryType: "refund", dateFrom, dateTo, organizationId, page, pageSize: PAGE_SIZE },
          signal,
        );
        for (const entry of res.results) {
          if (entry.appointmentId == null) continue;
          const amount = parseFloat(entry.amount) || 0;
          if (amount <= 0) continue;
          byAppointment.set(entry.appointmentId, (byAppointment.get(entry.appointmentId) ?? 0) + amount);
        }
        if (!res.next) break;
      }
      return byAppointment;
    },
  });

  // Ошибка кассы журнал не ломает: деньги считаются по статусу, как до кассы.
  return query.data ?? null;
}
