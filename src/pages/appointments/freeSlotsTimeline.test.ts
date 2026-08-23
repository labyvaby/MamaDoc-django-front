import { describe, expect, it } from "vitest";

import { buildTimeline } from "./freeSlotsTimeline";
import type {
  AvailabilityAppointment,
  AvailabilityDay,
  AvailabilitySlot,
} from "../../api/scheduling";

/** Слот сетки: свободный, занятый приёмом или прошедший. */
function slot(
  start: string,
  end: string,
  {
    free = true,
    appointmentId = null as number | null,
    patientName = null as string | null,
    branchId = null as number | null,
  } = {},
): AvailabilitySlot {
  return { start, end, free, appointmentId, patientName, branchId };
}

/** Приём дня. Филиал в таймлайне не участвует — берём один и тот же. */
function appt(
  fields: Omit<AvailabilityAppointment, "branchId" | "branchName">,
): AvailabilityAppointment {
  return { branchId: 13, branchName: "Мама Доктор Плюс", ...fields };
}

function day(overrides: Partial<AvailabilityDay> = {}): AvailabilityDay {
  return {
    date: "2026-07-31",
    scheduled: true,
    dayOff: false,
    freeCount: 0,
    slots: [],
    appointments: [],
    ...overrides,
  };
}

describe("buildTimeline", () => {
  it("показывает приём 11:45 одной строкой вместо слотов 11:30 и 12:00", () => {
    // Баг: сетка режется по 30 минут от начала смены, приём 11:45–12:15
    // накрывает два слота — и оба показывали пациента с чужим временем.
    const rows = buildTimeline(
      day({
        slots: [
          slot("11:00", "11:30"),
          slot("11:30", "12:00", { free: false, appointmentId: 7, patientName: "Абдиллаева М." }),
          slot("12:00", "12:30", { free: false, appointmentId: 7, patientName: "Абдиллаева М." }),
          slot("12:30", "13:00"),
        ],
        appointments: [
          appt({
            id: 7,
            start: "11:45",
            end: "12:15",
            patientName: "Абдиллаева М.",
            status: "scheduled",
          }),
        ],
      }),
    );

    expect(rows.map((r) => [r.kind, r.start])).toEqual([
      ["slot", "11:00"],
      ["appt", "11:45"],
      ["slot", "12:30"],
    ]);
    const appointmentRow = rows[1];
    expect(appointmentRow.kind === "appt" && appointmentRow.appt.end).toBe("12:15");
  });

  it("сортирует приёмы и свободные окна по времени вперемешку", () => {
    const rows = buildTimeline(
      day({
        slots: [slot("09:00", "09:30"), slot("10:00", "10:30")],
        appointments: [
          appt({ id: 1, start: "09:40", end: "10:10", patientName: "Б", status: "arrived" }),
          appt({ id: 2, start: "08:15", end: "08:45", patientName: "А", status: "completed" }),
        ],
      }),
    );

    expect(rows.map((r) => r.start)).toEqual(["08:15", "09:00", "09:40", "10:00"]);
  });

  it("оставляет прошедшие окна сетки — у них нет приёма", () => {
    const rows = buildTimeline(
      day({
        slots: [slot("09:00", "09:30", { free: false }), slot("09:30", "10:00")],
        appointments: [],
      }),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].kind === "slot" && rows[0].slot.free).toBe(false);
  });

  it("без поля appointments (старый бэкенд) рисует сетку как есть", () => {
    // В схеме поле обязательное, но прод стоит на ветке deploy/* и может
    // отвечать по-старому — вид не должен остаться без занятых окон, пусть и
    // со временем слота. Ответ вне контракта, поэтому приведение типа.
    const rows = buildTimeline({
      ...day({
        slots: [
          slot("11:30", "12:00", { free: false, appointmentId: 7, patientName: "Абдиллаева М." }),
          slot("12:30", "13:00"),
        ],
      }),
      appointments: undefined as unknown as AvailabilityAppointment[],
    });

    expect(rows.map((r) => [r.kind, r.start])).toEqual([
      ["slot", "11:30"],
      ["slot", "12:30"],
    ]);
  });
});
