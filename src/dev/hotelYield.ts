/**
 * «Доходность и загрузка» — как одноимённый отчёт Exely: доход за
 * проживание, продано номероночей, заезды гостей и номеров, ADR, RevPAR,
 * доступно номероночей и % загрузки — по дням, неделям или месяцам, итого,
 * по категориям и средние по дням недели. Считается по броням периода (цены
 * ночей) и номерам фонда; без React — проверяется тестами (hotelYield.test.ts).
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

export function computeYield(opts: {
  reservations: HotelReservation[];
  rooms: YieldRoom[];
  from: string;
  to: string;
  group: YieldGroup;
  roomTypeIds?: Set<number> | null;
  sources?: Set<string> | null;
}): YieldResult {
  const inCats = (id: number) => !opts.roomTypeIds || opts.roomTypeIds.size === 0 || opts.roomTypeIds.has(id);
  const inSources = (s: string) => !opts.sources || opts.sources.size === 0 || opts.sources.has(s || "other");
  const rooms = opts.rooms.filter((r) => r.active && inCats(r.roomTypeId));
  const roomsByType = new Map<number, { name: string; count: number }>();
  for (const r of rooms) {
    const t = roomsByType.get(r.roomTypeId) ?? { name: r.roomTypeName, count: 0 };
    t.count += 1;
    roomsByType.set(r.roomTypeId, t);
  }

  const dayMap = new Map<string, ReturnType<typeof empty>>();
  const catMap = new Map<number, ReturnType<typeof empty>>();
  const dates: string[] = [];
  for (let d = dayjs(opts.from); !d.isAfter(dayjs(opts.to), "day"); d = d.add(1, "day")) {
    const key = d.format("YYYY-MM-DD");
    dates.push(key);
    dayMap.set(key, { ...empty(), available: rooms.length });
  }
  for (const [id, t] of roomsByType) catMap.set(id, { ...empty(), available: t.count * dates.length });

  for (const r of opts.reservations) {
    if (r.status !== "confirmed" || !inSources(r.source)) continue;
    for (const item of r.items) {
      if (item.isActive === false || !inCats(item.roomTypeId)) continue;
      const cat = catMap.get(item.roomTypeId) ?? (() => {
        const c = { ...empty() };
        catMap.set(item.roomTypeId, c);
        return c;
      })();
      const arrival = dayMap.get(item.checkIn);
      if (arrival) {
        arrival.roomsArrived += 1;
        arrival.guestsArrived += item.adults + item.children;
        cat.roomsArrived += 1;
        cat.guestsArrived += item.adults + item.children;
      }
      for (const night of item.nights ?? []) {
        const day = dayMap.get(night.date);
        if (!day) continue;
        const price = (Number(night.price) || 0) - (Number(night.discount) || 0);
        day.sold += 1;
        day.revenue += price;
        cat.sold += 1;
        cat.revenue += price;
      }
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
    .map(([roomTypeId, m]) => ({ roomTypeId, name: roomsByType.get(roomTypeId)?.name ?? `Категория ${roomTypeId}`, ...finish(m) }))
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
