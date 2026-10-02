/**
 * Долг и подробности броней для шахматки: календарь (GET /hotel/calendar/)
 * отдаёт сумму позиции, но не оплаты, телефон, номер брони канала и заметки,
 * поэтому берём их из списка броней за видимые даты (GET /hotel/reservations/
 * ?from&to — пересечение периода). Когда бэк начнёт отдавать paidAmount/
 * balanceDue прямо в позициях календаря, долг шахматка возьмёт оттуда, а этот
 * запрос останется только ради подробностей в карточке при наведении.
 *
 * Ключ начинается с ["hotel","reservations"] — оплата и правка брони уже
 * инвалидируют этот префикс, и долг на баре обновляется сам.
 */
import { useQuery } from "@tanstack/react-query";

import { listReservations, type HotelReservation } from "../api/hotel";

/** То, что карточка при наведении показывает сверх календаря. */
export interface StayDetails {
  externalId: string;
  phone: string;
  createdAt: string;
  createdByName: string;
  guaranteeMethod: string;
  corporateName: string;
  internalNote: string;
  guestComment: string;
  /** По позициям брони: взрослые/дети, тариф, время фактического заезда и выезда. */
  items: Record<number, { adults: number; children: number; ratePlanName: string | null; checkedInAt: string | null; checkedOutAt: string | null }>;
}

export interface StayBalance {
  total: number;
  paid: number;
  balance: number;
  currency: string;
  details?: StayDetails;
}

const PAGE = 200;
const MAX_PAGES = 5;

const detailsOf = (r: HotelReservation): StayDetails => {
  const primary = r.items.flatMap((i) => i.guests).find((g) => g.isPrimary) ?? r.items[0]?.guests[0];
  return {
    externalId: r.externalId,
    phone: primary?.phone ?? "",
    createdAt: r.createdAt,
    createdByName: r.createdByName,
    guaranteeMethod: r.guaranteeMethod,
    corporateName: r.corporateName ?? "",
    internalNote: r.internalNote,
    guestComment: r.guestComment,
    items: Object.fromEntries(
      r.items.map((i) => [i.id, { adults: i.adults, children: i.children, ratePlanName: i.ratePlanName, checkedInAt: i.checkedInAt, checkedOutAt: i.checkedOutAt }]),
    ),
  };
};

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
            details: detailsOf(r),
          });
        }
        if ((page + 1) * PAGE >= res.count) break;
      }
      return map;
    },
  });
}
