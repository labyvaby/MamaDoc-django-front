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

import type { HotelReservation } from "../api/hotel";
import { fetchAllReservations } from "./hotelReportData";

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
  /** "14:30" со слов гостя или null. */
  expectedArrivalTime: string | null;
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

/** 5 × 200 броней на видимые даты шахматки — с запасом. */
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
    expectedArrivalTime: r.expectedArrivalTime ? r.expectedArrivalTime.slice(0, 5) : null,
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
      const { rows } = await fetchAllReservations({ propertyId: propertyId!, from: from!, to: to! }, signal, MAX_PAGES);
      for (const r of rows) {
        map.set(r.id, {
          total: Number(r.totalAmount),
          paid: Number(r.paidAmount),
          balance: Number(r.balanceDue),
          currency: r.currency,
          details: detailsOf(r),
        });
      }
      return map;
    },
  });
}
