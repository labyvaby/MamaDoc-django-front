/**
 * Своя цена ночей в демо-режиме (пока бэкенд не принимает PATCH …/pricing/ и
 * manualTotal — контракт §4): правка цен в карточке брони и своя сумма новой
 * брони сохраняются на этом устройстве (hotelDemoStore) и показываются в
 * «Проживании» с пометкой «демо». Счёт и баланс на сервере при этом прежние —
 * это честно написано рядом. Без React — проверяется тестами.
 */
import type { HotelReservationNight } from "../api/hotel";
import { DEMO_KEYS, readDemo, writeDemo } from "./hotelDemoStore";

export interface DemoItemPricing {
  /** Своя цена по датам; дат без своей цены здесь нет. */
  nights: Record<string, number>;
  discountPercent: number | null;
  reason: string;
  at: string;
}

/** reservationId → itemId → своя цена. */
export type DemoPrices = Record<string, Record<string, DemoItemPricing>>;

export const demoPricingFor = (all: DemoPrices, reservationId: number, itemId: number): DemoItemPricing | undefined =>
  all[String(reservationId)]?.[String(itemId)];

export function saveDemoPricing(reservationId: number, itemId: number, pricing: DemoItemPricing | null) {
  const all = readDemo<DemoPrices>(DEMO_KEYS.prices, {});
  const r = { ...(all[String(reservationId)] ?? {}) };
  if (pricing && (Object.keys(pricing.nights).length > 0 || pricing.discountPercent)) r[String(itemId)] = pricing;
  else delete r[String(itemId)];
  const next = { ...all, [String(reservationId)]: r };
  if (Object.keys(r).length === 0) delete next[String(reservationId)];
  writeDemo(DEMO_KEYS.prices, next);
}

/** Своя сумма за номер — поровну по ночам, остаток (до копеек) — на последнюю ночь. */
export function distributeTotal(total: number, dates: string[]): Record<string, number> {
  if (dates.length === 0) return {};
  const per = Math.floor((total / dates.length) * 100) / 100;
  const result: Record<string, number> = {};
  dates.forEach((d, i) => {
    result[d] = i === dates.length - 1 ? Math.round((total - per * (dates.length - 1)) * 100) / 100 : per;
  });
  return result;
}

export interface ShownNight extends HotelReservationNight {
  demo?: boolean;
}

/** Ночи брони с демо-ценой поверх серверной: price — своя, basePrice — как было, discount — по проценту. */
export function applyDemoPricing(nights: HotelReservationNight[], pricing: DemoItemPricing | undefined): ShownNight[] {
  if (!pricing) return nights;
  return nights.map((n) => {
    const own = pricing.nights[n.date];
    const price = own != null ? own : Number(n.price);
    const discount = pricing.discountPercent ? Math.round(price * pricing.discountPercent) / 100 : Number(n.discount ?? 0);
    return {
      ...n,
      price: String(price),
      basePrice: own != null ? (n.basePrice ?? n.price) : n.basePrice,
      isManual: own != null ? true : n.isManual,
      discount: discount ? String(discount) : n.discount,
      demo: own != null || Boolean(pricing.discountPercent),
    };
  });
}
