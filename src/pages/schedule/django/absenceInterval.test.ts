import { describe, expect, it } from "vitest";
import type { ScheduleConflictAppointment } from "../../../api/scheduling";
import { appointmentHitsAbsence } from "./useAbsenceConflicts";

const appt = (start: string, end: string): ScheduleConflictAppointment => ({
  id: 1,
  startsAt: `2026-09-17T${start}:00+06:00`,
  endsAt: `2026-09-17T${end}:00+06:00`,
  status: "scheduled",
  branchId: 1,
  branchName: "Главный",
  patientId: 5,
  patientName: "Иванов Иван",
  patientPhone: "+996700000000",
  services: ["Приём педиатра"],
  paidTotal: "0.00",
  isPerformerPrimary: true,
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
