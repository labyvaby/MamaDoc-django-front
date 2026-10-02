/**
 * Долг по броням для шахматки: календарь (GET /hotel/calendar/) отдаёт сумму
 * позиции, но не оплаты, поэтому «к оплате» берём из списка броней за видимые
 * даты (GET /hotel/reservations/?from&to — пересечение периода). Когда бэк
 * начнёт отдавать paidAmount/balanceDue прямо в позициях календаря, этот
 * запрос не нужен — шахматка возьмёт поля оттуда (см. RoomBookingGrid).
 *
 * Ключ начинается с ["hotel","reservations"] — оплата и правка брони уже
 * инвалидируют этот префикс, и долг на баре обновляется сам.
 */
import { useQuery } from "@tanstack/react-query";

import { listReservations } from "../api/hotel";

export interface StayBalance {
  total: number;
  paid: number;
  balance: number;
  currency: string;
}

const PAGE = 200;
const MAX_PAGES = 5;

export function useStayBalances(propertyId: number | undefined, from: string | null, to: string | null, enabled = true) {
  return useQuery({
    queryKey: ["hotel", "reservations", "stayBalances", propertyId, from, to],
    enabled: enabled && propertyId != null && from != null && to != null && from < to,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const map = new Map<number, StayBalance>();
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await listReservations({ propertyId: propertyId!, from: from!, to: to!, limit: PAGE, offset: page * PAGE }, signal);
        for (const r of res.results) {
          map.set(r.id, {
            total: Number(r.totalAmount),
            paid: Number(r.paidAmount),
            balance: Number(r.balanceDue),
            currency: r.currency,
          });
        }
        if ((page + 1) * PAGE >= res.count) break;
      }
      return map;
    },
  });
}
