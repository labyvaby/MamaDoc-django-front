/**
 * Массовое изменение цен в годовом «Календаре цен»: из выделенных ночей и
 * настроек панели («своя цена» по категориям, ±%, ±сумма, авторасчёт,
 * стоп-продажа, минимум ночей, дни недели) строим минимальный набор вызовов
 * PUT /rate-plans/{id}/daily-rates/ — по одному на непрерывный диапазон ночей
 * категории с одинаковым изменением. Без React — проверяется тестами
 * (priceBulkPlan.test.ts).
 */
import dayjs from "dayjs";

import type { HotelDailyRateChange, HotelPriceNight } from "../api/hotel";

export type PriceMode =
  | { mode: "keep" }
  | { mode: "set"; byRoomType: Record<number, number> }
  | { mode: "percent"; value: number; round: number }
  | { mode: "amount"; value: number; round: number }
  | { mode: "auto" };

export type TriState = "keep" | "on" | "off";

export interface BulkSettings {
  roomTypeIds: number[];
  /** Пн…Вс: какие дни недели менять. */
  weekdays: boolean[];
  price: PriceMode;
  stopSell: TriState;
  minNights: { mode: "keep" } | { mode: "set"; value: number } | { mode: "clear" };
  closedToArrival: TriState;
  closedToDeparture: TriState;
  reason: string;
}

export interface BulkPlan {
  changes: HotelDailyRateChange[];
  /** Ночей, которые изменятся. */
  nights: number;
  /** Средняя цена затронутых ночей до и после (только если меняется цена). */
  avgBefore: number | null;
  avgAfter: number | null;
}

export const cellKey = (roomTypeId: number, date: string) => `${roomTypeId}|${date}`;

/** 0 = понедельник … 6 = воскресенье. */
export const weekdayIndex = (date: string) => (dayjs(date).day() + 6) % 7;

const roundTo = (v: number, step: number) => (step > 1 ? Math.round(v / step) * step : Math.round(v * 100) / 100);

function nextPrice(current: number, roomTypeId: number, price: PriceMode): number | "auto" | null {
  switch (price.mode) {
    case "set":
      return price.byRoomType[roomTypeId] != null ? price.byRoomType[roomTypeId] : null;
    case "percent":
      return Math.max(1, roundTo(current * (1 + price.value / 100), price.round));
    case "amount":
      return Math.max(1, roundTo(current + price.value, price.round));
    case "auto":
      return "auto";
    default:
      return null;
  }
}

export function planBulkChanges(opts: {
  selection: Iterable<string>;
  nights: Map<string, HotelPriceNight>;
  settings: BulkSettings;
  /** Распространить выбранные даты на все отмеченные категории. */
  allCategories: boolean;
  today: string;
}): BulkPlan {
  const { settings } = opts;
  const targetRoomTypes = new Set(settings.roomTypeIds);
  const byRoomType = new Map<number, Set<string>>();
  const selectedDates = new Set<string>();
  for (const key of opts.selection) {
    const [rt, date] = key.split("|");
    selectedDates.add(date);
    if (!opts.allCategories) {
      const id = Number(rt);
      if (!targetRoomTypes.has(id)) continue;
      const set = byRoomType.get(id) ?? new Set<string>();
      set.add(date);
      byRoomType.set(id, set);
    }
  }
  if (opts.allCategories) for (const id of targetRoomTypes) byRoomType.set(id, new Set(selectedDates));

  const changes: HotelDailyRateChange[] = [];
  let nights = 0;
  let sumBefore = 0;
  let sumAfter = 0;
  let priced = 0;
  const priceChanges = settings.price.mode !== "keep";
  const restrictions: Partial<HotelDailyRateChange> = {
    ...(settings.stopSell !== "keep" ? { stopSell: settings.stopSell === "on" } : {}),
    ...(settings.closedToArrival !== "keep" ? { closedToArrival: settings.closedToArrival === "on" } : {}),
    ...(settings.closedToDeparture !== "keep" ? { closedToDeparture: settings.closedToDeparture === "on" } : {}),
    ...(settings.minNights.mode === "set" ? { minNights: settings.minNights.value } : settings.minNights.mode === "clear" ? { clearMinNights: true } : {}),
  };
  const hasRestrictions = Object.keys(restrictions).length > 0;
  if (!priceChanges && !hasRestrictions) return { changes: [], nights: 0, avgBefore: null, avgAfter: null };
  const reason = settings.reason.trim() || undefined;

  for (const [roomTypeId, dates] of [...byRoomType.entries()].sort((a, b) => a[0] - b[0])) {
    const list = [...dates]
      .filter((d) => d >= opts.today && settings.weekdays[weekdayIndex(d)])
      .sort();
    let run: { from: string; last: string; price: number | "auto" | null } | null = null;
    const flush = () => {
      if (!run) return;
      const price = run.price;
      if (priceChanges && price == null && !hasRestrictions) {
        run = null;
        return;
      }
      changes.push({
        roomTypeId,
        dateFrom: run.from,
        dateTo: dayjs(run.last).add(1, "day").format("YYYY-MM-DD"),
        ...(price === "auto" ? { clearPrice: true } : price != null ? { price: price.toFixed(2) } : {}),
        ...restrictions,
        ...(reason ? { reason } : {}),
      });
      run = null;
    };
    for (const date of list) {
      const night = opts.nights.get(cellKey(roomTypeId, date));
      if (!night) continue;
      const current = Number(night.price);
      const price = priceChanges ? nextPrice(current, roomTypeId, settings.price) : null;
      if (priceChanges && price == null && !hasRestrictions) continue;
      nights += 1;
      if (priceChanges && price != null) {
        priced += 1;
        sumBefore += current;
        sumAfter += price === "auto" ? Number(night.barPrice || night.basePrice) : price;
      }
      const contiguous = run != null && dayjs(run.last).add(1, "day").format("YYYY-MM-DD") === date;
      if (run && contiguous && run.price === price) {
        run.last = date;
      } else {
        flush();
        run = { from: date, last: date, price };
      }
    }
    flush();
  }
  return {
    changes,
    nights,
    avgBefore: priced ? Math.round(sumBefore / priced) : null,
    avgAfter: priced ? Math.round(sumAfter / priced) : null,
  };
}
