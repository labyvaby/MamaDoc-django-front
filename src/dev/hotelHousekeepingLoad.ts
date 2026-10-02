/**
 * Нагрузка горничных по графику: каждый день — сколько номеров на этажах
 * поста освобождается (уборка после выезда) и сколько занято (текущая
 * уборка), и на кого это приходится по «Графику персонала». Считается по
 * броням и графику — не по отметкам «убрано»: закрытые задачи уборки бэкенд
 * пока не отдаёт по датам (запрос — docs/hotel-backend-requests-2026-10-02.md §8).
 */
import dayjs from "dayjs";

import type { HotelReservation, HotelRoom, HotelStaffPost, HotelStaffShift } from "../api/hotel";

export interface HousekeeperLoad {
  employeeId: number | null;
  name: string;
  shifts: number;
  checkouts: number;
  stayovers: number;
  floors: string[];
}

export interface DayLoad {
  date: string;
  checkouts: number;
  stayovers: number;
  /** Номера на этажах без горничной в графике в этот день. */
  uncovered: number;
}

export interface HousekeepingLoad {
  people: HousekeeperLoad[];
  days: DayLoad[];
  totals: { checkouts: number; stayovers: number; uncovered: number };
}

const LIVE = new Set(["confirmed"]);

export function computeHousekeepingLoad(opts: {
  from: string;
  to: string;
  reservations: HotelReservation[];
  rooms: HotelRoom[];
  posts: HotelStaffPost[];
  shifts: HotelStaffShift[];
  names: Map<number, string>;
}): HousekeepingLoad {
  const floorOfRoom = new Map(opts.rooms.map((r) => [r.id, r.floor]));
  const hkPosts = opts.posts.filter((p) => p.role === "housekeeping");
  const postOfFloor = new Map<string, HotelStaffPost>();
  for (const p of hkPosts) for (const f of p.floors) if (!postOfFloor.has(f)) postOfFloor.set(f, p);
  const shiftOf = new Map(opts.shifts.map((s) => [`${s.postId}|${s.date}`, s]));

  const people = new Map<string, HousekeeperLoad>();
  const person = (employeeId: number | null, name: string) => {
    const key = employeeId == null ? "none" : String(employeeId);
    let p = people.get(key);
    if (!p) {
      p = { employeeId, name, shifts: 0, checkouts: 0, stayovers: 0, floors: [] };
      people.set(key, p);
    }
    return p;
  };
  for (const s of opts.shifts) {
    if (s.role !== "housekeeping" || s.status === "absent" || s.date < opts.from || s.date > opts.to) continue;
    const p = person(s.employeeId, opts.names.get(s.employeeId) ?? s.employeeName);
    p.shifts += 1;
    const post = hkPosts.find((x) => x.id === s.postId);
    for (const f of post?.floors ?? []) if (!p.floors.includes(f)) p.floors.push(f);
  }

  const days = new Map<string, DayLoad>();
  for (let d = dayjs(opts.from); !d.isAfter(dayjs(opts.to), "day"); d = d.add(1, "day")) {
    const key = d.format("YYYY-MM-DD");
    days.set(key, { date: key, checkouts: 0, stayovers: 0, uncovered: 0 });
  }

  const attribute = (date: string, roomId: number | null, kind: "checkouts" | "stayovers") => {
    const day = days.get(date);
    if (!day || roomId == null) return;
    day[kind] += 1;
    const floor = floorOfRoom.get(roomId);
    const post = floor != null ? postOfFloor.get(floor) : undefined;
    const shift = post ? shiftOf.get(`${post.id}|${date}`) : undefined;
    if (!shift || shift.status === "absent") {
      day.uncovered += 1;
      person(null, "Без горничной в графике")[kind] += 1;
      return;
    }
    person(shift.employeeId, opts.names.get(shift.employeeId) ?? shift.employeeName)[kind] += 1;
  };

  for (const r of opts.reservations) {
    if (!LIVE.has(r.status)) continue;
    for (const item of r.items) {
      if (item.isActive === false) continue;
      // Выезд — уборка после выезда в день выезда.
      attribute(item.checkOut, item.roomId, "checkouts");
      // Текущая уборка — каждый день проживания, кроме дня заезда и дня выезда.
      for (let d = dayjs(item.checkIn).add(1, "day"); d.isBefore(dayjs(item.checkOut), "day"); d = d.add(1, "day")) {
        attribute(d.format("YYYY-MM-DD"), item.roomId, "stayovers");
      }
    }
  }

  const list = [...people.values()]
    .map((p) => ({ ...p, floors: p.floors.sort() }))
    .sort((a, b) => (a.employeeId == null ? 1 : 0) - (b.employeeId == null ? 1 : 0) || b.checkouts + b.stayovers - (a.checkouts + a.stayovers) || a.name.localeCompare(b.name, "ru"));
  const dayList = [...days.values()];
  return {
    people: list,
    days: dayList,
    totals: dayList.reduce((t, d) => ({ checkouts: t.checkouts + d.checkouts, stayovers: t.stayovers + d.stayovers, uncovered: t.uncovered + d.uncovered }), {
      checkouts: 0,
      stayovers: 0,
      uncovered: 0,
    }),
  };
}
