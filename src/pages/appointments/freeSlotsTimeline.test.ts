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
    branchName = null as string | null,
    busyElsewhere = false,
  } = {},
): AvailabilitySlot {
  return { start, end, free, appointmentId, patientName, branchId, branchName, busyElsewhere };
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

  it("различает слоты двух смен одного времени — ключ по паре (время, филиал)", () => {
    // Org-wide выдача сотрудника со сменами в двух филиалах: один плоский
    // список, время дублируется (ответ бэка 02.09.2026). Ключ по одному лишь
    // времени схлопывал бы такие строки в одну.
    const rows = buildTimeline(
      day({
        slots: [
          slot("10:00", "10:30", { branchId: 1, branchName: "Мама Доктор" }),
          slot("10:00", "10:30", { branchId: 13, branchName: "Мама Доктор Плюс" }),
        ],
      }),
    );

    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
  });

  it("оставляет busyElsewhere отдельной строкой, а не считает его прошедшим окном", () => {
    const rows = buildTimeline(
      day({
        slots: [
          slot("09:00", "09:30", { free: false, busyElsewhere: true, branchId: 1 }),
          slot("09:30", "10:00", { branchId: 1 }),
        ],
      }),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].kind === "slot" && rows[0].slot.busyElsewhere).toBe(true);
  });

  it("гасит busyElsewhere, если это же время уже показано приёмом", () => {
    // В org-wide режиме чужой приём виден строкой сам по себе; слот второй
    // смены, погашенный бэком тем же приёмом, дал бы вторую строку на то же
    // время — глухую, без объяснения.
    const rows = buildTimeline(
      day({
        slots: [
          slot("10:00", "10:30", { free: false, appointmentId: 5, branchId: 13 }),
          slot("10:00", "10:30", { free: false, busyElsewhere: true, branchId: 1 }),
          slot("10:30", "11:00", { free: false, busyElsewhere: true, branchId: 1 }),
        ],
        appointments: [
          appt({ id: 5, start: "10:00", end: "10:30", patientName: "А", status: "scheduled" }),
        ],
      }),
    );

    expect(rows.map((r) => [r.kind, r.start])).toEqual([
      ["appt", "10:00"],
      ["slot", "10:30"],
    ]);
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
