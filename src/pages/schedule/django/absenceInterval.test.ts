import { describe, expect, it } from "vitest";
import type { ScheduleConflictAppointment } from "../../../api/scheduling";
import { appointmentHitsAbsence } from "./useAbsenceConflicts";

const appt = (
  start: string,
  end: string,
  branchId: number | null = 1,
): ScheduleConflictAppointment => ({
  id: 1,
  startsAt: `2026-09-17T${start}:00+06:00`,
  endsAt: `2026-09-17T${end}:00+06:00`,
  status: "scheduled",
  branchId,
  branchName: "Главный",
  patientId: 5,
  patientName: "Иванов Иван",
  patientPhone: "+996700000000",
  services: ["Приём педиатра"],
  paidTotal: "0.00",
  isPerformerPrimary: true,
  absenceReviewedAt: null,
  absenceReviewedBy: null,
});

const FROM_14_TO_16 = { startTime: "14:00", endTime: "16:00" };

describe("appointmentHitsAbsence", () => {
  it("целодневное отсутствие забирает любой приём", () => {
    expect(appointmentHitsAbsence(appt("09:00", "09:30"), { startTime: null, endTime: null })).toBe(
      true,
    );
  });

  it("приём внутри интервала попадает", () => {
    expect(appointmentHitsAbsence(appt("14:30", "15:00"), FROM_14_TO_16)).toBe(true);
  });

  it("приём до интервала не попадает", () => {
    expect(appointmentHitsAbsence(appt("09:00", "09:30"), FROM_14_TO_16)).toBe(false);
  });

  it("приём после интервала не попадает", () => {
    expect(appointmentHitsAbsence(appt("16:00", "16:30"), FROM_14_TO_16)).toBe(false);
  });

  it("приём, заезжающий началом в интервал, попадает", () => {
    expect(appointmentHitsAbsence(appt("13:30", "14:30"), FROM_14_TO_16)).toBe(true);
  });

  it("приём, заканчивающийся ровно в начале интервала, не попадает", () => {
    expect(appointmentHitsAbsence(appt("13:00", "14:00"), FROM_14_TO_16)).toBe(false);
  });

  it("приём накрывает интервал целиком", () => {
    expect(appointmentHitsAbsence(appt("13:00", "18:00"), FROM_14_TO_16)).toBe(true);
  });

  it("приём без длительности считается точкой", () => {
    expect(appointmentHitsAbsence(appt("14:00", "14:00"), FROM_14_TO_16)).toBe(true);
    expect(appointmentHitsAbsence(appt("16:00", "16:00"), FROM_14_TO_16)).toBe(false);
  });

  it("битый интервал не сужает разбор", () => {
    const broken = { startTime: "16:00", endTime: "14:00" };
    expect(appointmentHitsAbsence(appt("09:00", "09:30"), broken)).toBe(true);
  });
});

describe("appointmentHitsAbsence — филиал отсутствия", () => {
  const ALL_DAY_IN_13 = { startTime: null, endTime: null, branchId: 13 };

  it("выходной в одном филиале не задевает приём в другом", () => {
    // Прод 19.09.2026: выходной в «Мама Доктор Плюс» (13), приёмы в смене
    // «Мама Доктор» (1) — врач на месте, разбирать нечего.
    expect(appointmentHitsAbsence(appt("14:30", "15:00", 1), ALL_DAY_IN_13)).toBe(false);
  });

  it("выходной филиала забирает приём того же филиала", () => {
    expect(appointmentHitsAbsence(appt("14:30", "15:00", 13), ALL_DAY_IN_13)).toBe(true);
  });

  it("отсутствие без филиала забирает приём любого филиала", () => {
    expect(
      appointmentHitsAbsence(appt("14:30", "15:00", 1), { startTime: null, endTime: null, branchId: null }),
    ).toBe(true);
    expect(appointmentHitsAbsence(appt("14:30", "15:00", 1), { startTime: null, endTime: null })).toBe(
      true,
    );
  });

  it("частичное отсутствие в чужом филиале не задевает приём внутри интервала", () => {
    expect(
      appointmentHitsAbsence(appt("14:30", "15:00", 1), { ...FROM_14_TO_16, branchId: 13 }),
    ).toBe(false);
  });

  it("приём без филиала считаем задетым — отнести его к другому филиалу нельзя", () => {
    expect(appointmentHitsAbsence(appt("14:30", "15:00", null), ALL_DAY_IN_13)).toBe(true);
  });
});
