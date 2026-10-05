import dayjs from "dayjs";

import type { BookingListItem } from "../../../api/bookings";
import { DEFAULT_DURATION_MINS, type BusyInterval } from "./slotAvailability";

/**
 * Онлайн-брони с предоплатой, которые держат время специалиста, но приёма в
 * регистратуре ещё нет.
 *
 * Приём появляется, только когда администратор подтвердит бронь, а после
 * оплаты бронь ещё ждёт администратора (`pending` + предоплата `paid`).
 * Регистратура в это время видела «Есть окно на HH:mm» и могла записать
 * второго пациента поверх оплаченной брони.
 *
 * Показываем только внесённую предоплату (решение 05.10.2026): бронь, которая
 * ещё ждёт оплаты, в регистратуре не видна и время не держит — за 15 минут
 * ссылка банка чаще сгорает, чем оплачивается.
 */
export interface PrepaidHold {
  bookingId: number;
  /** Специалист CRM (doctorId брони). */
  employeeId: number;
  doctorName: string;
  patientName: string;
  /** Начало и конец интервала, мс. */
  start: number;
  end: number;
  timeStr: string;
  /** Сумма предоплаты, decimal-строка. */
  prepaymentAmount: string | null;
}

const HOLDING_STATUSES = new Set(["pending", "confirmed"]);

/** Отбор броней дня с внесённой предоплатой, которые держат время в регистратуре. */
export function prepaidHoldsFromBookings(
  bookings: BookingListItem[],
  date: string,
): PrepaidHold[] {
  const holds: PrepaidHold[] = [];
  for (const b of bookings) {
    if (b.date !== date || b.appointmentId != null || b.doctorId == null) continue;
    if (!HOLDING_STATUSES.has(b.status)) continue;
    if (b.prepaymentStatus !== "paid") continue;
    const start = dayjs(`${b.date}T${b.time}`);
    if (!start.isValid()) continue;
    const duration = b.totalDurationMin > 0 ? b.totalDurationMin : DEFAULT_DURATION_MINS;
    holds.push({
      bookingId: b.id,
      employeeId: b.doctorId,
      doctorName: b.doctorName,
      patientName: b.patientName,
      start: start.valueOf(),
      end: start.add(duration, "minute").valueOf(),
      timeStr: start.format("HH:mm"),
      prepaymentAmount: b.prepaymentAmount ?? null,
    });
  }
  return holds.sort((a, b) => a.start - b.start);
}

/** Добавляет интервалы броней к занятости сотрудников (исходную карту не трогает). */
export function withHoldIntervals(
  occupancy: Map<number, BusyInterval[]>,
  holds: PrepaidHold[],
): Map<number, BusyInterval[]> {
  if (holds.length === 0) return occupancy;
  const merged = new Map(occupancy);
  for (const hold of holds) {
    merged.set(hold.employeeId, [
      ...(merged.get(hold.employeeId) ?? []),
      { start: hold.start, end: hold.end },
    ]);
  }
  return merged;
}
