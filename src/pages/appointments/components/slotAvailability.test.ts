import { describe, expect, it } from "vitest";

import type { DjangoAppointment } from "../../../api/appointments";
import {
  appointmentEnd,
  busyIntervals,
  busyIntervalsByEmployee,
  isSlotCovered,
} from "./slotAvailability";

const at = (hhmm: string) => `2026-07-17T${hhmm}:00`;
const ms = (hhmm: string) => new Date(at(hhmm)).valueOf();

function appt(
  scheduledAt: string,
  endsAt: string,
  status: string = "scheduled",
): DjangoAppointment {
  return { scheduledAt: at(scheduledAt), endsAt: at(endsAt), status } as
    unknown as DjangoAppointment;
}

describe("appointmentEnd", () => {
  it("takes the real end from the backend, not start + 30 min", () => {
    // Приём с несколькими услугами: бэк вернул конец через 2 часа.
    expect(appointmentEnd(appt("12:30", "14:30")).valueOf()).toBe(ms("14:30"));
  });

  it("falls back to 30 min only when endsAt is absent", () => {
    const legacy = { scheduledAt: at("12:30") } as unknown as DjangoAppointment;
    expect(appointmentEnd(legacy).valueOf()).toBe(ms("13:00"));
  });
});

describe("isSlotCovered", () => {
  it("blocks a slot inside a long appointment (the 14:00 / 12:30 bug)", () => {
    // Регистратура видела 14:00 свободным, потому что сравнивались только
    // времена начала: приём стоит в 12:30, но тянется до 14:30 и накрывает 14:00.
    const intervals = busyIntervals([appt("12:30", "14:30")]);
    expect(isSlotCovered(intervals, ms("14:00"))).toBe(true);
  });

  it("keeps the slot free once the appointment has ended", () => {
    const intervals = busyIntervals([appt("12:30", "14:30")]);
    expect(isSlotCovered(intervals, ms("14:30"))).toBe(false);
    expect(isSlotCovered(intervals, ms("15:00"))).toBe(false);
  });

  it("does not block before the appointment starts", () => {
    const intervals = busyIntervals([appt("12:30", "14:30")]);
    expect(isSlotCovered(intervals, ms("12:00"))).toBe(false);
  });

  it("ignores cancelled and no-show appointments — they free the slot", () => {
    for (const status of ["canceled", "cancelled", "no_show"]) {
      const intervals = busyIntervals([appt("12:30", "14:30", status)]);
      expect(isSlotCovered(intervals, ms("13:00"))).toBe(false);
    }
  });

  it("blocks a slot covered by any one of several appointments", () => {
    const intervals = busyIntervals([
      appt("09:00", "09:30"),
      appt("12:30", "14:30"),
    ]);
    expect(isSlotCovered(intervals, ms("14:00"))).toBe(true);
    expect(isSlotCovered(intervals, ms("11:00"))).toBe(false);
  });
});

/** Приём со строками услуг: занятость считается по исполнителям строк. */
function apptWithLines(
  scheduledAt: string,
  endsAt: string,
  employeeIds: (number | null)[],
  status: string = "confirmed",
): DjangoAppointment {
  return {
    scheduledAt: at(scheduledAt),
    endsAt: at(endsAt),
    status,
    services: employeeIds.map((id, i) => ({
      id: i + 1,
      employee: id == null ? null : { id, fullName: `Сотрудник ${id}` },
    })),
  } as unknown as DjangoAppointment;
}

describe("busyIntervalsByEmployee", () => {
  it("закрывает слот сотруднику, даже если приём пришёл в списке один раз", () => {
    // Случай с прода: график врача с 09:00 и подтверждённый приём 09:00–09:30,
    // а регистратура предлагала «Есть окно на 09:00».
    const map = busyIntervalsByEmployee([apptWithLines("09:00", "09:30", [12])]);

    expect(isSlotCovered(map.get(12) ?? [], ms("09:00"))).toBe(true);
    // Конец полуоткрыт: на 09:30 записывать уже можно.
    expect(isSlotCovered(map.get(12) ?? [], ms("09:30"))).toBe(false);
  });

  it("занимает время каждому исполнителю совместного приёма", () => {
    const map = busyIntervalsByEmployee([apptWithLines("10:00", "11:00", [12, 21])]);

    expect(isSlotCovered(map.get(12) ?? [], ms("10:30"))).toBe(true);
    expect(isSlotCovered(map.get(21) ?? [], ms("10:30"))).toBe(true);
    // Чужая занятость не должна прятать окна у третьего сотрудника.
    expect(map.has(33)).toBe(false);
  });

  it("не считает занятыми отменённые приёмы и строки без исполнителя", () => {
    const map = busyIntervalsByEmployee([
      apptWithLines("09:00", "09:30", [12], "canceled"),
      apptWithLines("10:00", "10:30", [null]),
    ]);

    expect(map.size).toBe(0);
  });
});
