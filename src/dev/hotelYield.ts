/**
 * «Доходность и загрузка» — как одноимённый отчёт Exely: доход за
 * проживание, продано номероночей, заезды гостей и номеров, ADR, RevPAR,
 * доступно номероночей и % загрузки — по дням, неделям или месяцам, итого,
 * по категориям и средние по дням недели. Два шага: факты «дата × категория ×
 * канал» (их отдаёт сервер — GET /hotel/reports/yield/, контракт
 * docs/hotel-backend-tasks.md §9, — а пока его нет, собираем из броней
 * периода) и сводка по ним. Без React — проверяется тестами (hotelYield.test.ts).
 */
import dayjs from "dayjs";

import type { HotelReservation } from "../api/hotel";

export type YieldGroup = "day" | "week" | "month";

export interface YieldMetrics {
  revenue: number;
  sold: number;
  guestsArrived: number;
  roomsArrived: number;
  available: number;
  adr: number;
  revpar: number;
  /** Процент, 0–100+ (овербукинг может дать больше 100, как у Exely). */
  occupancy: number;
}

export interface YieldRow extends YieldMetrics {
  key: string;
  from: string;
  to: string;
}

export interface YieldCategoryRow extends YieldMetrics {
  roomTypeId: number;
  name: string;
}

export interface YieldWeekdayRow extends YieldMetrics {
  /** 0 = понедельник … 6 = воскресенье. */
  weekday: number;
  days: number;
}

export interface YieldResult {
  days: YieldRow[];
  rows: YieldRow[];
  total: YieldRow;
  byCategory: YieldCategoryRow[];
  byWeekday: YieldWeekdayRow[];
}

export interface YieldRoom {
  id: number;
  roomTypeId: number;
  roomTypeName: string;
  active: boolean;
}

const empty = (): Omit<YieldMetrics, "adr" | "revpar" | "occupancy"> => ({ revenue: 0, sold: 0, guestsArrived: 0, roomsArrived: 0, available: 0 });

function finish<T extends Omit<YieldMetrics, "adr" | "revpar" | "occupancy">>(m: T): T & YieldMetrics {
  return {
    ...m,
    revenue: Math.round(m.revenue * 100) / 100,
    adr: m.sold ? Math.round((m.revenue / m.sold) * 100) / 100 : 0,
    revpar: m.available ? Math.round((m.revenue / m.available) * 100) / 100 : 0,
    occupancy: m.available ? Math.round((m.sold / m.available) * 10000) / 100 : 0,
  };
}

const add = (a: Omit<YieldMetrics, "adr" | "revpar" | "occupancy">, b: Omit<YieldMetrics, "adr" | "revpar" | "occupancy">) => {
  a.revenue += b.revenue;
  a.sold += b.sold;
  a.guestsArrived += b.guestsArrived;
  a.roomsArrived += b.roomsArrived;
  a.available += b.available;
};

const groupKey = (date: string, group: YieldGroup) => {
  if (group === "day") return date;
  if (group === "month") return date.slice(0, 7);
  const d = dayjs(date);
  return d.subtract((d.day() + 6) % 7, "day").format("YYYY-MM-DD");
};

/** Продажи одной категории за одну ночь из одного канала. */
export interface YieldFact {
  date: string;
  roomTypeId: number;
  /** Канал брони; пустой — "other". */
  source: string;
  sold: number;
  revenue: number;
  roomsArrived: number;
  guestsArrived: number;
}

/** Номеров в продаже: категория × дата. */
export interface YieldInventory {
  date: string;
  roomTypeId: number;
  available: number;
}

const eachDate = (from: string, to: string): string[] => {
  const dates: string[] = [];
  for (let d = dayjs(from); !d.isAfter(dayjs(to), "day"); d = d.add(1, "day")) dates.push(d.format("YYYY-MM-DD"));
  return dates;
};

/** Брони → факты: только подтверждённые брони и действующие позиции; доход — цена ночи минус скидка. */
export function factsFromReservations(reservations: HotelReservation[], from: string, to: string): YieldFact[] {
  const map = new Map<string, YieldFact>();
  const fact = (date: string, roomTypeId: number, source: string) => {
    const key = `${date}|${roomTypeId}|${source}`;
    let f = map.get(key);
    if (!f) {
      f = { date, roomTypeId, source, sold: 0, revenue: 0, roomsArrived: 0, guestsArrived: 0 };
      map.set(key, f);
    }
    return f;
  };
  const inRange = (d: string) => d >= from && d <= to;
  for (const r of reservations) {
    if (r.status !== "confirmed") continue;
    const source = r.source || "other";
    for (const item of r.items) {
      if (item.isActive === false) continue;
      if (inRange(item.checkIn)) {
        const f = fact(item.checkIn, item.roomTypeId, source);
        f.roomsArrived += 1;
        f.guestsArrived += item.adults + item.children;
      }
      for (const night of item.nights ?? []) {
        if (!inRange(night.date)) continue;
        const f = fact(night.date, item.roomTypeId, source);
        f.sold += 1;
        f.revenue += (Number(night.price) || 0) - (Number(night.discount) || 0);
      }
    }
  }
  return [...map.values()];
}

/** Фонд → доступно: действующие номера категории в каждый день периода. */
export function inventoryFromRooms(rooms: YieldRoom[], from: string, to: string): YieldInventory[] {
  const byType = new Map<number, number>();
  for (const r of rooms) if (r.active) byType.set(r.roomTypeId, (byType.get(r.roomTypeId) ?? 0) + 1);
  return eachDate(from, to).flatMap((date) => [...byType].map(([roomTypeId, available]) => ({ date, roomTypeId, available })));
}

export function summarizeYield(opts: {
  facts: YieldFact[];
  inventory: YieldInventory[];
  /** Названия категорий; нет в списке — «Категория N». */
  names: Map<number, string>;
  from: string;
  to: string;
  group: YieldGroup;
  roomTypeIds?: Set<number> | null;
  sources?: Set<string> | null;
}): YieldResult {
  const inCats = (id: number) => !opts.roomTypeIds || opts.roomTypeIds.size === 0 || opts.roomTypeIds.has(id);
  const inSources = (s: string) => !opts.sources || opts.sources.size === 0 || opts.sources.has(s || "other");

  const dates = eachDate(opts.from, opts.to);
  const dayMap = new Map<string, ReturnType<typeof empty>>(dates.map((d) => [d, empty()]));
  const catMap = new Map<number, ReturnType<typeof empty>>();
  const cat = (id: number) => {
    let c = catMap.get(id);
    if (!c) {
      c = empty();
      catMap.set(id, c);
    }
    return c;
  };
  for (const inv of opts.inventory) {
    const day = dayMap.get(inv.date);
    if (!day || !inCats(inv.roomTypeId)) continue;
    day.available += inv.available;
    cat(inv.roomTypeId).available += inv.available;
  }
  for (const f of opts.facts) {
    const day = dayMap.get(f.date);
    if (!day || !inCats(f.roomTypeId) || !inSources(f.source)) continue;
    const c = cat(f.roomTypeId);
    for (const m of [day, c]) {
      m.sold += f.sold;
      m.revenue += f.revenue;
      m.roomsArrived += f.roomsArrived;
      m.guestsArrived += f.guestsArrived;
    }
  }

  const days: YieldRow[] = dates.map((d) => ({ key: d, from: d, to: d, ...finish(dayMap.get(d)!) }));
  const groups = new Map<string, { from: string; to: string; m: ReturnType<typeof empty> }>();
  for (const d of dates) {
    const key = groupKey(d, opts.group);
    const g = groups.get(key) ?? { from: d, to: d, m: empty() };
    g.to = d;
    add(g.m, dayMap.get(d)!);
    groups.set(key, g);
  }
  const rows: YieldRow[] = [...groups.entries()].map(([key, g]) => ({ key, from: g.from, to: g.to, ...finish(g.m) }));
  const totalM = empty();
  for (const d of dates) add(totalM, dayMap.get(d)!);
  const total: YieldRow = { key: "total", from: opts.from, to: opts.to, ...finish(totalM) };

  const byCategory: YieldCategoryRow[] = [...catMap.entries()]
    .map(([roomTypeId, m]) => ({ roomTypeId, name: opts.names.get(roomTypeId) ?? `Категория ${roomTypeId}`, ...finish(m) }))
    .sort((a, b) => b.revenue - a.revenue);

  const weekdayM = Array.from({ length: 7 }, () => ({ m: empty(), days: 0 }));
  for (const d of dates) {
    const w = (dayjs(d).day() + 6) % 7;
    add(weekdayM[w].m, dayMap.get(d)!);
    weekdayM[w].days += 1;
  }
  const byWeekday: YieldWeekdayRow[] = weekdayM.map((x, weekday) => ({ weekday, days: x.days, ...finish(x.m) }));

  return { days, rows, total, byCategory, byWeekday };
}

/** Всё сразу по броням и фонду — то же, что сервер + summarizeYield. */
export function computeYield(opts: {
  reservations: HotelReservation[];
  rooms: YieldRoom[];
  from: string;
  to: string;
  group: YieldGroup;
  roomTypeIds?: Set<number> | null;
  sources?: Set<string> | null;
}): YieldResult {
  return summarizeYield({
    facts: factsFromReservations(opts.reservations, opts.from, opts.to),
    inventory: inventoryFromRooms(opts.rooms, opts.from, opts.to),
    names: new Map(opts.rooms.map((r) => [r.roomTypeId, r.roomTypeName])),
    from: opts.from,
    to: opts.to,
    group: opts.group,
    roomTypeIds: opts.roomTypeIds,
    sources: opts.sources,
  });
}

/** Тот же по длине период непосредственно перед выбранным. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const len = dayjs(to).diff(dayjs(from), "day") + 1;
  const prevTo = dayjs(from).subtract(1, "day");
  return { from: prevTo.subtract(len - 1, "day").format("YYYY-MM-DD"), to: prevTo.format("YYYY-MM-DD") };
}

/** Те же даты год назад. */
export function lastYearPeriod(from: string, to: string): { from: string; to: string } {
  return { from: dayjs(from).subtract(1, "year").format("YYYY-MM-DD"), to: dayjs(to).subtract(1, "year").format("YYYY-MM-DD") };
}
