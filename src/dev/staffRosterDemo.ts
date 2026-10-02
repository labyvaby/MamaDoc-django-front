/**
 * Пример «Графика персонала» по таблице Viva за сентябрь (Google Sheets
 * «График персонала»): посты 1–3 этаж (горничные), Кухня, Ресепшн (сутки),
 * ставки 2000 / 2000 / 3000 и авансы. Показывается, пока бэкенд отвечает 404
 * на /v2/hotel/staff-posts/ (контракт — docs/hotel-backend-tasks.md §1). Правки живут в памяти вкладки и честно помечены как пример.
 */
import dayjs from "dayjs";

import type { HotelStaffPost, HotelStaffPostData, HotelStaffShift, HotelStaffShiftInput } from "../api/hotel";

export interface RosterEmployee {
  id: number;
  fullName: string;
}

export const DEMO_EMPLOYEES: RosterEmployee[] = [
  { id: -1, fullName: "Мунара" },
  { id: -2, fullName: "Айзат" },
  { id: -3, fullName: "Жылдыз" },
  { id: -4, fullName: "Жанара" },
  { id: -5, fullName: "Ольга" },
  { id: -6, fullName: "Биймырза" },
  { id: -7, fullName: "Байэл" },
  { id: -8, fullName: "Чынара" },
  { id: -9, fullName: "Мухаммед" },
];

const byName = new Map(DEMO_EMPLOYEES.map((e) => [e.fullName, e.id]));

let posts: HotelStaffPost[] = [
  { id: -101, propertyId: 0, name: "1 этаж", role: "housekeeping", floors: ["1"], startTime: "09:00", hours: 12, rate: "2000.00", sortOrder: 10, isActive: true },
  { id: -102, propertyId: 0, name: "2 этаж", role: "housekeeping", floors: ["2"], startTime: "09:00", hours: 12, rate: "2000.00", sortOrder: 20, isActive: true },
  { id: -103, propertyId: 0, name: "3 этаж", role: "housekeeping", floors: ["3"], startTime: "09:00", hours: 12, rate: "2000.00", sortOrder: 30, isActive: true },
  { id: -104, propertyId: 0, name: "Кухня", role: "kitchen", floors: [], startTime: "07:00", hours: 12, rate: "2000.00", sortOrder: 40, isActive: true },
  { id: -105, propertyId: 0, name: "Ресепшн", role: "reception", floors: [], startTime: "09:00", hours: 24, rate: "3000.00", sortOrder: 50, isActive: true },
];

/** Сентябрь из таблицы: [1 этаж, 2 этаж, 3 этаж, Кухня, Ресепшн] по дням. */
const SHEET: string[][] = [
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Биймырза"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Байэл"],
  ["Мунара", "Айзат", "Мунара", "Ольга", "Чынара"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Биймырза"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Чынара"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Байэл"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Мухаммед"],
  ["Мунара", "Айзат", "Жылдыз", "Мунара", "Чынара"],
  ["Мунара", "Айзат", "Жылдыз", "Жылдыз", "Байэл"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Биймырза"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Чынара"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Байэл"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Биймырза"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Чынара"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Биймырза"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Чынара"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Биймырза"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Чынара"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Биймырза"],
  ["Мунара", "Айзат", "Жанара", "Ольга", "Мухаммед"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Чынара"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Мухаммед"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Чынара"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Биймырза"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Байэл"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Чынара"],
  ["Жанара", "Айзат", "Жылдыз", "Ольга", "Байэл"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Биймырза"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Байэл"],
  ["Мунара", "Айзат", "Жылдыз", "Ольга", "Чынара"],
];

/** Авансы за месяц из той же таблицы (колонка «Аванс»). */
const advances = new Map<number, number>([
  [-1, 19000],
  [-2, 11000],
  [-3, 9000],
  [-4, 4000],
  [-5, 20500],
  [-6, 17620],
  [-8, 17500],
  [-9, 45660],
]);

/** Правки ячеек в примере: `${postId}|${date}` → сотрудник или null (снята). */
const overrides = new Map<string, number | null>();

const delay = <T,>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 120));

export const listDemoPosts = () => delay(posts.filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder));

export function saveDemoPost(id: number | null, data: HotelStaffPostData): Promise<HotelStaffPost> {
  if (id == null) {
    const created: HotelStaffPost = {
      id: -200 - posts.length,
      propertyId: 0,
      name: data.name ?? "Новый пост",
      role: data.role ?? "other",
      floors: data.floors ?? [],
      startTime: data.startTime ?? "09:00",
      hours: data.hours ?? 12,
      rate: data.rate ?? "0",
      sortOrder: data.sortOrder ?? (posts.length + 1) * 10,
      isActive: true,
    };
    posts = [...posts, created];
    return delay(created);
  }
  posts = posts.map((p) => (p.id === id ? { ...p, ...data } : p));
  return delay(posts.find((p) => p.id === id)!);
}

export function archiveDemoPost(id: number): Promise<void> {
  posts = posts.map((p) => (p.id === id ? { ...p, isActive: false } : p));
  return delay(undefined);
}

function defaultEmployee(post: HotelStaffPost, date: string): number | null {
  const column = posts.filter((p) => p.id >= -105 && p.id <= -101).sort((a, b) => a.sortOrder - b.sortOrder).findIndex((p) => p.id === post.id);
  if (column < 0) return null;
  const row = SHEET[(dayjs(date).date() - 1) % SHEET.length];
  return byName.get(row[column]) ?? null;
}

export function listDemoShifts(from: string, to: string): Promise<HotelStaffShift[]> {
  const result: HotelStaffShift[] = [];
  const active = posts.filter((p) => p.isActive);
  for (let d = dayjs(from); !d.isAfter(dayjs(to), "day"); d = d.add(1, "day")) {
    const date = d.format("YYYY-MM-DD");
    for (const post of active) {
      const key = `${post.id}|${date}`;
      const employeeId = overrides.has(key) ? overrides.get(key)! : defaultEmployee(post, date);
      if (employeeId == null) continue;
      const startsAt = dayjs(`${date}T${post.startTime}`);
      result.push({
        id: -Number(`${Math.abs(post.id)}${d.format("YYYYMMDD")}`),
        propertyId: 0,
        postId: post.id,
        postName: post.name,
        role: post.role,
        date,
        employeeId,
        employeeName: DEMO_EMPLOYEES.find((e) => e.id === employeeId)?.fullName ?? "",
        startsAt: startsAt.format(),
        endsAt: startsAt.add(post.hours, "hour").format(),
        rate: post.rate,
        status: "planned",
        note: "",
      });
    }
  }
  return delay(result);
}

export function saveDemoShifts(shifts: HotelStaffShiftInput[]): Promise<void> {
  for (const s of shifts) overrides.set(`${s.postId}|${s.date}`, s.employeeId);
  return delay(undefined);
}

export const demoAdvances = (): Map<number, number> => new Map(advances);

export function addDemoAdvance(employeeId: number, amount: number) {
  advances.set(employeeId, (advances.get(employeeId) ?? 0) + amount);
}
