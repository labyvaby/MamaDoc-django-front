/**
 * Поздний выезд — правило Viva (заказчик, 08.10.2026): гость просит выехать
 * позже — до 5 часов после выезда по правилам стоит 50% цены одной ночи,
 * позже — полная ночь. Цена ночи — последняя ночь номера после скидки (что
 * гость реально платит за ночь). Без React — проверяется тестами.
 */
import type { HotelCharge, HotelReservation } from "../api/hotel";

/** До стольких часов после выезда по правилам — половина ночи. */
export const LATE_CHECKOUT_HALF_UP_TO_HOURS = 5;
/** Начало названия строки счёта: по нему находится уже начисленный поздний выезд. */
export const LATE_CHECKOUT_CHARGE_PREFIX = "Поздний выезд";

const minutesOf = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export interface LateCheckoutFee {
  /** На сколько минут позже выезда по правилам; 0 и меньше — не поздний выезд. */
  minutesLate: number;
  /** 0 — не поздний, 0.5 — половина ночи, 1 — полная ночь. */
  share: 0 | 0.5 | 1;
  /** Сумма к начислению, до копеек. */
  amount: number;
}

/** Плата за выезд в `time` при выезде по правилам в `ruleTime` и цене ночи `nightPrice`. */
export function lateCheckoutFee(ruleTime: string, time: string, nightPrice: number): LateCheckoutFee {
  const rule = minutesOf(ruleTime);
  const at = minutesOf(time);
  if (rule == null || at == null || at <= rule) return { minutesLate: rule != null && at != null ? at - rule : 0, share: 0, amount: 0 };
  const minutesLate = at - rule;
  const share = minutesLate <= LATE_CHECKOUT_HALF_UP_TO_HOURS * 60 ? 0.5 : 1;
  return { minutesLate, share, amount: Math.round(nightPrice * share * 100) / 100 };
}

/** Цена последней ночи номера после скидки; ночей нет — сумма номера, делённая на ночи. */
export function lastNightPrice(item: Pick<HotelReservation["items"][number], "nights" | "totalAmount" | "checkIn" | "checkOut">): number {
  const last = item.nights.length ? [...item.nights].sort((a, b) => a.date.localeCompare(b.date))[item.nights.length - 1] : null;
  if (last) return Number(last.price) - Number(last.discount ?? 0);
  const nights = Math.max(1, Math.round((Date.parse(item.checkOut) - Date.parse(item.checkIn)) / 86_400_000));
  return Math.round((Number(item.totalAmount) / nights) * 100) / 100;
}

export const lateCheckoutChargeName = (time: string) => `${LATE_CHECKOUT_CHARGE_PREFIX} до ${time}`;

/** Начисленный и не отменённый поздний выезд — при новом времени его заменяют, а не добавляют второй. */
export const isLateCheckoutCharge = (c: Pick<HotelCharge, "name" | "voidedAt">) => !c.voidedAt && c.name.startsWith(LATE_CHECKOUT_CHARGE_PREFIX);

/** Варианты времени: каждый час от выезда по правилам +1 ч до +6 ч — видно, где кончается половина ночи. */
export function lateCheckoutPresets(ruleTime: string): string[] {
  const rule = minutesOf(ruleTime);
  if (rule == null) return [];
  const out: string[] = [];
  for (let h = 1; h <= LATE_CHECKOUT_HALF_UP_TO_HOURS + 1; h += 1) {
    const at = rule + h * 60;
    if (at >= 24 * 60) break;
    out.push(`${String(Math.floor(at / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`);
  }
  return out;
}
