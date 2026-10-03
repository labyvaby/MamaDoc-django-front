/**
 * График работы поста (StaffPost.rotation): кто выходит и как. «По очереди» —
 * сотрудники сменяют друг друга по N дней подряд (двое по 2 дня — «2 через 2»,
 * трое по суткам — «сутки через двое»); «по дням недели» — у каждого свои дни.
 * График заполняет только пустые клетки с даты начала; с «Повторять» — и
 * следующие месяцы. Без React — проверяется тестами (staffRotation.test.ts).
 */
import dayjs from "dayjs";

import type { HotelStaffRotation } from "../api/hotel";

const D = (d: dayjs.Dayjs) => d.format("YYYY-MM-DD");
/** День недели по ISO: 1 — понедельник … 7 — воскресенье. */
export const isoWeekday = (date: string): number => dayjs(date).day() || 7;
export const WEEKDAY_SHORT = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];

/** Кто выходит на пост в этот день по графику; null — никто (до начала или день не занят). */
export function rotationEmployeeOn(rotation: HotelStaffRotation, date: string): number | null {
  if (rotation.members.length === 0 || date < rotation.startDate) return null;
  if (rotation.mode === "weekdays") {
    const weekday = isoWeekday(date);
    return rotation.members.find((m) => m.weekdays.includes(weekday))?.employeeId ?? null;
  }
  const dayIndex = dayjs(date).diff(dayjs(rotation.startDate), "day");
  const turn = Math.floor(dayIndex / Math.max(1, rotation.daysPerTurn)) % rotation.members.length;
  return rotation.members[turn].employeeId;
}

/** Смены по графику на пустые дни [from, to]; taken — даты, где смена уже стоит. */
export function rotationFill(rotation: HotelStaffRotation, from: string, to: string, taken: Set<string>): { date: string; employeeId: number }[] {
  const out: { date: string; employeeId: number }[] = [];
  for (let d = dayjs(from); !d.isAfter(dayjs(to), "day"); d = d.add(1, "day")) {
    const date = D(d);
    if (taken.has(date)) continue;
    const employeeId = rotationEmployeeOn(rotation, date);
    if (employeeId != null) out.push({ date, employeeId });
  }
  return out;
}

const dayWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "день" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "дня" : "дней");

/** «2 через 2 · Асель, Бакыт», «сутки через двое · …», «по дням недели: Асель — пн, вт; Бакыт — чт–вс». */
export function rotationLabel(rotation: HotelStaffRotation, nameOf: (employeeId: number) => string): string {
  const names = rotation.members.map((m) => nameOf(m.employeeId));
  if (rotation.mode === "weekdays") {
    return `по дням недели: ${rotation.members.map((m) => `${nameOf(m.employeeId)} — ${weekdaysLabel(m.weekdays)}`).join("; ")}`;
  }
  const n = rotation.members.length;
  const k = rotation.daysPerTurn;
  let pattern: string;
  if (n === 1) pattern = "каждый день";
  else if (k === 1) {
    const rest = n - 1;
    pattern = `сутки через ${rest === 1 ? "сутки" : rest === 2 ? "двое" : rest === 3 ? "трое" : rest}`;
  } else pattern = `${k} через ${k * (n - 1)}`;
  return `${pattern} · ${names.join(", ")}`;
}

/** «пн, вт, ср» → «пн–ср»; подряд идущие дни сворачиваются. */
export function weekdaysLabel(weekdays: number[]): string {
  const days = [...new Set(weekdays)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < days.length; ) {
    let j = i;
    while (j + 1 < days.length && days[j + 1] === days[j] + 1) j += 1;
    parts.push(j - i >= 2 ? `${WEEKDAY_SHORT[days[i]]}–${WEEKDAY_SHORT[days[j]]}` : days.slice(i, j + 1).map((d) => WEEKDAY_SHORT[d]).join(", "));
    i = j + 1;
  }
  return parts.join(", ");
}

/** Склонение для сообщений: «12 смен». */
export const shiftsWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "смена" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "смены" : "смен");
export { dayWord };

/** Снекбар после заполнения: «12 смен по графику: 2 через 2 · Асель, Бакыт». */
export const rotationAppliedMessage = (count: number, label: string) => `${count} ${shiftsWord(count)} по графику: ${label}`;
