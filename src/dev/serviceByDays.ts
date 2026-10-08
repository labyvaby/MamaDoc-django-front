/**
 * «Услуга по дням» — как «Услуга в номере» в Exely: завтрак (или другая
 * услуга справочника) по каждому дню проживания, день можно включить или
 * выключить, поменять цену и количество. На сервере это обычные строки счёта
 * (POST …/charges/, одна на день); правки — отмена старой строки и новая
 * строка (у начислений нет PATCH). Без React — проверяется тестами.
 */
import dayjs from "dayjs";

import type { HotelCharge, HotelReservation } from "../api/hotel";

/** Как считать количество по умолчанию: на каждого гостя или на номер. */
export type ServicePace = "perGuest" | "perRoom";

export const SERVICE_PACE_LABELS: Record<ServicePace, string> = {
  perGuest: "За гостя в сутки",
  perRoom: "За номер в сутки",
};

type Item = Pick<HotelReservation["items"][number], "checkIn" | "checkOut" | "adults" | "children">;

/** Завтрак — утром после ночи: день заезда без него, день выезда с ним (так же считают кухня и «Отчёт смены»). */
export const isBreakfastName = (name: string) => /завтрак|breakfast/i.test(name);

/** Все даты проживания брони, от первого заезда до последнего выезда включительно. */
export function stayDates(items: Item[]): string[] {
  if (items.length === 0) return [];
  const from = items.map((i) => i.checkIn).sort()[0];
  const to = items.map((i) => i.checkOut).sort().slice(-1)[0];
  const out: string[] = [];
  for (let d = dayjs(from); !d.isAfter(dayjs(to), "day"); d = d.add(1, "day")) out.push(d.format("YYYY-MM-DD"));
  return out;
}

/** Номер «живёт» в этот день для услуги: завтрак — утро после ночи, остальное — дни ночёвки. */
const covers = (item: Item, date: string, breakfast: boolean) =>
  breakfast ? item.checkIn < date && date <= item.checkOut : item.checkIn <= date && date < item.checkOut;

/** Количество по умолчанию на день: гостей (взрослые + дети) или номеров, у кого этот день есть. */
export function defaultQuantity(items: Item[], date: string, breakfast: boolean, pace: ServicePace): number {
  const living = items.filter((i) => covers(i, date, breakfast));
  return pace === "perRoom" ? living.length : living.reduce((s, i) => s + i.adults + i.children, 0);
}

export interface DayRow {
  date: string;
  enabled: boolean;
  /** Поля ввода — строками, как в форме. */
  price: string;
  quantity: string;
  /** Уже начисленные строки этой услуги на этот день (не отменённые). */
  chargeIds: number[];
  /** Что начислено сейчас — чтобы понять, изменилось ли. null — ничего. */
  existing: { price: number; quantity: number } | null;
}

/** Строки счёта этой услуги: по справочнику (serviceId), а старые без него — по названию. */
export const chargesOfService = (charges: HotelCharge[], service: { id: number; name: string }) =>
  charges.filter((c) => !c.voidedAt && c.kind !== "penalty" && (c.serviceId === service.id || (c.serviceId == null && c.name === service.name)));

/**
 * Дни для окна: уже начисленные — включены со своей ценой и количеством, остальные —
 * по умолчанию (завтрак — со второго дня по день выезда, прочее — дни ночёвки).
 */
export function buildDayRows(
  items: Item[],
  existing: HotelCharge[],
  opts: { breakfast: boolean; pace: ServicePace; price: number },
): DayRow[] {
  const charged = existing.length > 0;
  return stayDates(items).map((date) => {
    const mine = existing.filter((c) => c.date === date);
    if (mine.length > 0) {
      const quantity = mine.reduce((s, c) => s + Number(c.quantity), 0);
      // Несколько строк на день сводим в одну: цена — средняя за единицу.
      const total = mine.reduce((s, c) => s + Number(c.totalAmount), 0);
      const price = quantity > 0 ? Math.round((total / quantity) * 100) / 100 : Number(mine[0].price);
      return { date, enabled: true, price: String(price), quantity: String(quantity), chargeIds: mine.map((c) => c.id), existing: { price, quantity } };
    }
    const qty = defaultQuantity(items, date, opts.breakfast, opts.pace);
    // Услуга уже есть в счёте — недостающие дни не включаем сами: их убрали намеренно.
    return { date, enabled: !charged && qty > 0, price: String(opts.price), quantity: String(Math.max(qty, 1)), chargeIds: [], existing: null };
  });
}

const num = (v: string) => Number(v.replace(",", "."));

/** Строка годится: цена ≥ 0, количество > 0, до трёх знаков. */
export const rowValid = (r: DayRow) =>
  !r.enabled || (Number.isFinite(num(r.price)) && num(r.price) >= 0 && Number.isFinite(num(r.quantity)) && num(r.quantity) > 0);

export interface DayPlan {
  /** Отменить эти строки счёта. */
  voidIds: number[];
  /** Добавить строку на день. */
  add: { date: string; price: number; quantity: number }[];
}

/** Что отправить на сервер: выключенный день — отмена, изменённый — отмена и новая строка, новый — строка. */
export function planDayChanges(rows: DayRow[]): DayPlan {
  const plan: DayPlan = { voidIds: [], add: [] };
  for (const r of rows) {
    const price = num(r.price);
    const quantity = num(r.quantity);
    if (!r.enabled) {
      plan.voidIds.push(...r.chargeIds);
      continue;
    }
    const same = r.existing != null && r.chargeIds.length === 1 && Math.abs(r.existing.price - price) < 0.005 && Math.abs(r.existing.quantity - quantity) < 0.0005;
    if (same) continue;
    plan.voidIds.push(...r.chargeIds);
    plan.add.push({ date: r.date, price, quantity });
  }
  return plan;
}

/** Сумма включённых дней. */
export const rowsTotal = (rows: DayRow[]) =>
  Math.round(rows.filter((r) => r.enabled).reduce((s, r) => s + (num(r.price) || 0) * (num(r.quantity) || 0), 0) * 100) / 100;
